/**
 * Blue Agent — Chat API with Hub Tool Routing
 *
 * Flow:
 *   1. Non-streaming LLM call with tool definitions → detect intent
 *   2a. Tool use detected → execute Hub tool → streaming LLM call to format result
 *   2b. No tool use → convert response to SSE stream
 *
 * When Bankr is down: tool calls gracefully return an error message,
 * LLM falls back to answering from knowledge. Nothing breaks.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BANKR_LLM  = "https://llm.bankr.bot/v1/messages";
const VENICE_API = "https://api.venice.ai/api/v1/chat/completions";
const BASE_URL   = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS: Record<string, { id: string; maxTokens: number }> = {
  fast: { id: "claude-haiku-4-5",  maxTokens: 1024 },
  pro:  { id: "claude-sonnet-4-6", maxTokens: 2048 },
  max:  { id: "claude-sonnet-4-6", maxTokens: 4096 },
};

// ─── System prompt ────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are Blue Agent — the Base-native AI assistant for builders.
You help founders and developers on Base with idea generation, smart contract architecture, DeFi design, agent development, and launch strategy.
Be direct, technical, and actionable. Prefer Base, USDC, Coinbase tools, and the Bankr ecosystem.

## Credit system (IMPORTANT — know this)
Blue Agent uses a credit system based on $BLUEAGENT token balance:
- Guest (no wallet): 30 credits/day
- Starter (hold 500K BLUE): 500 credits/day (~$0.50)
- Pro (hold 2M BLUE): 2,000 credits/day + 20% discount (~$2)
- Max (hold 10M BLUE): unlimited credits/day + 40% discount (~$10)
Credits refresh automatically every 24h. To get more credits: buy $BLUEAGENT on Uniswap Base, or click "Buy $BLUEAGENT" in the sidebar. No USDC purchase needed — just hold BLUE.
If a user asks about buying credits, getting more credits, or topping up — explain the tier system and tell them to use the "Buy $BLUEAGENT" button in the sidebar.

## Hub tools
You have access to real-time Hub tools. Use them when the user asks about:
- Token picks, market signals, whale activity → hub_token_pick, hub_whale_signal, hub_narrative
- Market fit, competitor analysis, investor memos → hub_market_fit, hub_competitor_scan, hub_investor_memo
- Security checks, honeypots, risk screening → hub_risk_gate, hub_honeypot, hub_deep_analysis
- Builder scores, repo health, grants → hub_builder_score, hub_repo_health, hub_base_grant
- Fundraising timing, ecosystem digest → hub_fundraise_timing, hub_ecosystem

If a tool is unavailable, answer from your own knowledge and note that live data is unavailable.
If the user has memory context below, use it to personalize responses — reference their project, remember what they're building.`;

// ─── Hub tool definitions (Anthropic tool format) ─────────────────────────────

const HUB_TOOLS = [
  {
    name: "hub_token_pick",
    description: "Get an AI token pick on Base — falsifiable thesis, entry point, sizing, and kill criterion. Use when user asks: 'what should I buy', 'token pick', 'best token today', 'what's a good trade'.",
    input_schema: {
      type: "object",
      properties: { context: { type: "string", description: "Optional market context or narrative to consider" } },
    },
  },
  {
    name: "hub_narrative",
    description: "Get the current narrative map — mindshare scores, velocity, phase (Emerging/Rising/Peak/Fading), and position calls (FRONT-RUN/RIDE/FADE/WATCH). Use when user asks about narratives, trends, what's running on CT.",
    input_schema: {
      type: "object",
      properties: { focus: { type: "string", description: "Specific narratives to focus on (optional)" } },
    },
  },
  {
    name: "hub_whale_signal",
    description: "Get whale copy-trade signals for a specific token — track large wallet moves. Use when user asks about whale activity, smart money, what whales are buying.",
    input_schema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract address on Base" },
        min_usd: { type: "number", description: "Minimum trade size in USD (default 10000)" },
      },
      required: ["token"],
    },
  },
  {
    name: "hub_deep_analysis",
    description: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals. Use when user asks for DD, due diligence, or deep analysis on a token.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address" } },
      required: ["token"],
    },
  },
  {
    name: "hub_honeypot",
    description: "Detect honeypot tokens that cannot be sold after purchase. Use when user asks if a token is safe, is a honeypot, or wants to verify a contract before buying.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address on Base" } },
      required: ["token"],
    },
  },
  {
    name: "hub_risk_gate",
    description: "Screen any transaction before execution — rug check, AML, malicious contract patterns. Use when user wants to verify a transaction, address, or contract is safe.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "transfer | swap | approve | call" },
        to: { type: "string", description: "Target address 0x..." },
        value: { type: "string", description: "Amount in Wei (optional)" },
      },
      required: ["action", "to"],
    },
  },
  {
    name: "hub_market_fit",
    description: "Market fit analysis for a project — problem clarity, timing, competition, demand signals. Use when user describes a project and wants to validate it.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        url: { type: "string", description: "Project URL (optional)" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_competitor_scan",
    description: "Competitor analysis — direct/indirect competitors and defensible edge. Use when user asks about competition for their project.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        category: { type: "string", description: "Category e.g. DeFi lending, AI agent" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_investor_memo",
    description: "Generate a full investor memo — thesis, market, moat, risks, ask. Use when user wants to write a pitch, investor memo, or fundraising doc.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name" },
        description: { type: "string", description: "Description and traction" },
        ask: { type: "string", description: "Raise ask e.g. $500k pre-seed" },
      },
      required: ["project", "description"],
    },
  },
  {
    name: "hub_fundraise_timing",
    description: "Assess if now is the right time to raise — market conditions, stage readiness, investor appetite. Use when user asks about fundraising timing.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "Stage and key metrics" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_base_grant",
    description: "Find active grants and funding for Base projects. Use when user asks about grants, funding opportunities, or how to get funded on Base.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "idea | build | live" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_builder_score",
    description: "Get Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100). Use when user asks about builder score or their reputation.",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "X/Twitter handle without @" } },
      required: ["handle"],
    },
  },
  {
    name: "hub_repo_health",
    description: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor. Use when user asks about code quality or repo metrics.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "GitHub repository URL" } },
      required: ["url"],
    },
  },
  {
    name: "hub_ecosystem",
    description: "Daily Base ecosystem digest — top launches, protocol updates, builder activity. Use when user asks what's happening on Base today, latest news, or ecosystem updates.",
    input_schema: {
      type: "object",
      properties: { focus: { type: "string", description: "Focus area e.g. DeFi, AI agents, NFT (optional)" } },
    },
  },
  {
    name: "hub_agent_score",
    description: "Agent Score for AI agents on Base — XP, interactions, uptime. Use when user asks about an AI agent's score or performance.",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "Agent handle or name" } },
      required: ["handle"],
    },
  },
];

// ─── Tool → internal API mapping ──────────────────────────────────────────────

const TOOL_ENDPOINT: Record<string, string> = {
  hub_token_pick:       "token-pick-signal",
  hub_narrative:        "narrative-position",
  hub_whale_signal:     "whale-copy-signal",
  hub_deep_analysis:    "deep-analysis",
  hub_honeypot:         "honeypot-check",
  hub_risk_gate:        "risk-gate",
  hub_market_fit:       "market-fit",
  hub_competitor_scan:  "competitor-scan",
  hub_investor_memo:    "investor-memo",
  hub_fundraise_timing: "fundraise-timing",
  hub_base_grant:       "base-grant-finder",
  hub_builder_score:    "builder-score",
  hub_repo_health:      "repo-health",
  hub_ecosystem:        "ecosystem-digest",
  hub_agent_score:      "agent-score",
};

// ─── Internal Hub tool caller ─────────────────────────────────────────────────

async function callHubTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  const endpoint = TOOL_ENDPOINT[toolName];
  if (!endpoint) return `[Unknown tool: ${toolName}]`;

  try {
    const res = await fetch(`${BASE_URL}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 402) {
      return `[${toolName}: requires x402 payment — data unavailable in free chat]`;
    }
    if (!res.ok) {
      return `[${toolName}: service returned ${res.status} — using knowledge base instead]`;
    }

    const text = await res.text();
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  } catch (e) {
    return `[${toolName}: unavailable (${(e as Error).message}) — answering from knowledge]`;
  }
}

// ─── Slash command → system prompt injection ─────────────────────────────────

function extractCommand(messages: LLMMessage[]): { cmd: string; args: string } | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return null;
  const match = last.content.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { cmd: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}

const COMMAND_PROMPTS: Record<string, string> = {
  idea: `## COMMAND: /idea
Generate a FUNDABLE BRIEF in this exact format:
**Problem** — 1 crisp sentence
**Why Now** — the timing catalyst that makes this urgent
**Why Base** — specific Base advantage (onchain UX, USDC, Coinbase ecosystem, etc.)
**MVP Scope** — 3 bullet points, each shippable in ≤2 weeks
**Risks** — top 2 risks and how to mitigate
**24h Plan** — the first 3 concrete actions to take today
Be direct and opinionated. Avoid filler.`,

  build: `## COMMAND: /build
Generate a TECHNICAL ARCHITECTURE:
**Stack** — exact packages, versions, why each
**Folder Structure** — show key files as a tree
**Key Integrations** — APIs, contracts, SDKs with setup notes
**Critical Snippets** — 1-2 key code pieces
**Test Plan** — what to write tests for first
Optimize for Base + TypeScript + Next.js 15 + Vercel stack.`,

  audit: `## COMMAND: /audit
Perform a SECURITY + PRODUCT RISK REVIEW:
**🔴 Critical** — blockers that must be fixed before launch
**🟡 Medium** — important issues to address
**🟢 Suggestions** — nice-to-have improvements
**Verdict** — GO / NO-GO / GO WITH FIXES (bold, one line)
Be specific. Cite exact attack vectors and severity.`,

  ship: `## COMMAND: /ship
Generate a DEPLOYMENT CHECKLIST for Base Mainnet:
**Pre-Deploy** — env vars, contract verification, security scan
**Deploy Steps** — ordered actions with commands
**Verify** — post-deploy checks (contract on Basescan, x402 pricing, health endpoint)
**Monitor** — first 24h metrics to watch
**Release Note** — 2-sentence announcement ready to post
Be precise, include exact CLI commands where relevant.`,

  raise: `## COMMAND: /raise
Write a PITCH NARRATIVE:
**Framing** — market thesis in 1 punchy sentence
**Why This Wins** — 3 specific unfair advantages
**Traction** — key metrics in bullet form (fill with what user provides)
**Ask** — raise amount + use of funds breakdown
**Target Investors** — 5 specific Base/crypto funds or angels with why they fit
Be bold. Think like a founder who knows they're going to win.`,

  help: `## COMMAND: /help
List all available Blue Chat slash commands in a clean format.
Commands to document:
/idea <concept> — Turn a rough idea into a fundable brief
/build <project> — Get architecture, stack, folder structure
/audit <code/plan> — Security + product risk review
/ship <project> — Deployment checklist for Base Mainnet
/raise <project> — Pitch narrative + investor targets
/pick — AI token pick on Base
/scan <token_address> — Honeypot + risk check for a token
/wallet <address> — Wallet strategy analysis
/clear — Clear conversation (handled locally)
/help — Show this command list
Format as a clean reference. Group by category.`,
};

// ─── Venice streaming proxy (OpenAI → Blue SSE) ──────────────────────────────

async function callVeniceStream(
  modelId:   string,
  system:    string,
  messages:  LLMMessage[],
  maxTokens: number,
): Promise<Response> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Venice is not configured on this server. Please use a Bankr model (Fast/Pro/Max)." },
      { status: 503 }
    );
  }

  // Convert Anthropic-style messages → OpenAI format (system as first message)
  const openaiMsgs = [
    { role: "system", content: system },
    ...messages.map((m) => ({
      role: m.role as string,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  ];

  let veniceRes: Response;
  try {
    veniceRes = await fetch(VENICE_API, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, messages: openaiMsgs, stream: true, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return NextResponse.json({ error: `Venice request failed: ${(e as Error).message}` }, { status: 502 });
  }

  if (!veniceRes.ok) {
    const err = await veniceRes.text();
    const hint = veniceRes.status === 401
      ? "Venice API key is invalid or expired. Please update VENICE_API_KEY."
      : veniceRes.status === 429
      ? "Venice rate limit hit. Try again in a moment."
      : `Venice error ${veniceRes.status}`;
    return NextResponse.json({ error: hint, detail: err }, { status: veniceRes.status });
  }

  // Transform OpenAI SSE → Blue's SSE format: data: {"delta":{"text":"..."}}
  const encoder = new TextEncoder();
  const transformed = new ReadableStream({
    async start(controller) {
      const reader  = veniceRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] };
              const text   = parsed?.choices?.[0]?.delta?.content ?? "";
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text } })}\n\n`));
              }
            } catch {}
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(transformed, { headers: SSE_HEADERS });
}

// ─── Text → SSE stream ────────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type":      "text/event-stream",
  "Cache-Control":     "no-cache",
  "X-Accel-Buffering": "no",
};

function textToSSE(text: string): Response {
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      // Chunk into ~40-char pieces for a natural stream feel
      const size = 40;
      for (let i = 0; i < text.length; i += size) {
        const chunk = text.slice(i, i + size);
        const line  = `data: ${JSON.stringify({ delta: { text: chunk } })}\n\n`;
        controller.enqueue(encoder.encode(line));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LLMMessage = { role: string; content: string | unknown[] };

interface LLMResponse {
  stop_reason: string;
  content: Array<{
    type:  string;
    text?: string;
    id?:   string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { success, remaining } = await rateLimit(getIdentifier(req), "chat");
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
    );
  }
  void remaining;

  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BANKR_API_KEY not configured." }, { status: 500 });
  }

  let body: {
    messages?: LLMMessage[];
    tier?: string;
    memoryContext?: string;
    provider?: string;
    modelId?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, tier = "pro", memoryContext, provider, modelId } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  // ── Command injection ─────────────────────────────────────────────────────
  const detectedCmd = extractCommand(messages as LLMMessage[]);
  const cmdPrompt = detectedCmd ? COMMAND_PROMPTS[detectedCmd.cmd] : null;
  const system = [
    memoryContext ? `${BASE_SYSTEM}\n\n${memoryContext}` : BASE_SYSTEM,
    cmdPrompt ?? "",
  ].filter(Boolean).join("\n\n");

  // Strip the /command prefix from last message so LLM only sees args
  let cleanMessages = messages as LLMMessage[];
  if (detectedCmd?.args !== undefined && detectedCmd.cmd !== "pick" && detectedCmd.cmd !== "scan" && detectedCmd.cmd !== "wallet") {
    cleanMessages = [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: detectedCmd.args || `Run the /${detectedCmd.cmd} command — no specific input provided, give a general example.`,
      },
    ] as LLMMessage[];
  }

  // ── Venice provider: skip Bankr, call Venice directly ─────────────────────
  if (provider === "venice" && modelId) {
    return callVeniceStream(modelId, system, cleanMessages, 2048);
  }

  const model  = MODELS[tier as string] ?? MODELS.pro;

  const lmHeaders = {
    "x-api-key":           apiKey,
    "Content-Type":        "application/json",
    "anthropic-version":   "2023-06-01",
  };

  // ── Phase 1: intent detection (non-streaming + tools) ─────────────────────
  let firstData: LLMResponse;
  try {
    const firstRes = await fetch(BANKR_LLM, {
      method:  "POST",
      headers: lmHeaders,
      body: JSON.stringify({
        model:      model.id,
        system,
        messages:   cleanMessages,
        tools:      HUB_TOOLS,
        max_tokens: model.maxTokens,
      }),
    });

    if (!firstRes.ok) {
      const err = await firstRes.text();
      return NextResponse.json(
        { error: `Bankr LLM error: ${firstRes.status}`, detail: err },
        { status: firstRes.status }
      );
    }

    firstData = await firstRes.json() as LLMResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `LLM request failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // ── No tool use: return text as SSE directly ───────────────────────────────
  if (firstData.stop_reason !== "tool_use") {
    const text = firstData.content.find((b) => b.type === "text")?.text ?? "";
    return textToSSE(text);
  }

  // ── Tool use: merged stream (tool events → Phase 2 stream) ───────────────
  const toolUseBlocks = firstData.content.filter((b) => b.type === "tool_use");
  const enc = new TextEncoder();

  const mergedStream = new ReadableStream({
    async start(controller) {
      try {
        // 1. tool_start events
        for (const block of toolUseBlocks) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: "tool_start", tool: block.name })}\n\n`
          ));
        }

        // 2. Execute tools in parallel
        const t0 = Date.now();
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => ({
            type:        "tool_result" as const,
            tool_use_id: block.id!,
            content:     await callHubTool(block.name!, block.input ?? {}),
          }))
        );
        const elapsed = Date.now() - t0;

        // 3. tool_done events
        for (const block of toolUseBlocks) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: "tool_done", tool: block.name, ms: elapsed })}\n\n`
          ));
        }

        // 4. Phase 2 — streaming synthesis
        const secondMessages: LLMMessage[] = [
          ...cleanMessages,
          { role: "assistant", content: firstData.content },
          { role: "user",      content: toolResults },
        ];

        let streamRes: Response;
        try {
          streamRes = await fetch(BANKR_LLM, {
            method:  "POST",
            headers: lmHeaders,
            body: JSON.stringify({
              model:      model.id,
              system,
              messages:   secondMessages,
              max_tokens: model.maxTokens,
              stream:     true,
            }),
          });
        } catch (e) {
          const msg = `[LLM stream failed: ${(e as Error).message}]`;
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: msg } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        if (!streamRes.ok) {
          const err = await streamRes.text();
          const msg = `[Stream error ${streamRes.status}: ${err.slice(0, 120)}]`;
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: msg } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // Pipe Phase 2 into merged stream
        const reader = streamRes.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(mergedStream, { headers: SSE_HEADERS });
}
