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

const BANKR_LLM       = "https://llm.bankr.bot/v1/messages";
const VENICE_API      = "https://api.venice.ai/api/v1/chat/completions";
const BASE_URL        = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
const INTERNAL_KEY    = process.env.INTERNAL_SERVICE_KEY ?? "";

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS: Record<string, { id: string; maxTokens: number }> = {
  fast: { id: "claude-haiku-4-5",  maxTokens: 1024 },
  pro:  { id: "claude-sonnet-4-6", maxTokens: 2048 },
  max:  { id: "claude-sonnet-4-6", maxTokens: 4096 },
};

// ─── Model display names ──────────────────────────────────────────────────────

const VENICE_DISPLAY: Record<string, string> = {
  "deepseek-v4-flash":                  "DeepSeek V4 Flash (Venice)",
  "deepseek-v4-pro":                    "DeepSeek V4 Pro (Venice)",
  "kimi-k2-6":                          "Kimi K2 (Venice)",
  "claude-opus-4-7":                    "Claude Opus 4 (Venice)",
  "grok-4-3":                           "Grok 4 (Venice)",
  "qwen3-235b-a22b-instruct-2507":      "Qwen3 235B (Venice)",
  "mistral-small-3-2-24b-instruct":     "Mistral Small 3.2 (Venice)",
  "venice-uncensored-1-2":              "Venice Uncensored 1.2 (Venice)",
  "e2ee-venice-uncensored-24b-p":       "Venice Uncensored 24B · E2EE (Venice Privacy)",
  "e2ee-gemma-3-27b-p":                 "Gemma 3 27B · E2EE (Venice Privacy)",
  "e2ee-qwen3-6-35b-a3b":               "Qwen3 35B · E2EE (Venice Privacy)",
};

const BANKR_DISPLAY: Record<string, string> = {
  fast: "Claude Haiku 4.5 (Bankr · Fast)",
  pro:  "Claude Sonnet 4.6 (Bankr · Pro)",
  max:  "Claude Sonnet 4.6 (Bankr · Max)",
};

function getModelLabel(tier: string, modelId?: string, provider?: string): string {
  if (provider === "venice" && modelId) {
    return VENICE_DISPLAY[modelId] ?? `${modelId} (Venice)`;
  }
  return BANKR_DISPLAY[tier] ?? `${tier}`;
}

// ─── Per-model max_tokens ─────────────────────────────────────────────────────

const VENICE_MAX_TOKENS: Record<string, number> = {
  "deepseek-v4-flash":                 4096,
  "deepseek-v4-pro":                   8192,
  "kimi-k2-6":                         4096,
  "claude-opus-4-7":                   4096,
  "grok-4-3":                          4096,
  "qwen3-235b-a22b-instruct-2507":     8192,
  "mistral-small-3-2-24b-instruct":    4096,
  "venice-uncensored-1-2":             4096,
  // E2EE — smaller models, conservative limit
  "e2ee-venice-uncensored-24b-p":      2048,
  "e2ee-gemma-3-27b-p":                2048,
  "e2ee-qwen3-6-35b-a3b":              2048,
};

function veniceMaxTokens(modelId: string): number {
  return VENICE_MAX_TOKENS[modelId] ?? 4096;
}

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
- Live onchain data: balance, tx, block, gas, contract calls → hub_crypto_rpc (21 chains: base, ethereum, arbitrum, optimism, polygon, etc.)

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
  {
    name: "hub_crypto_rpc",
    description: `Make a live onchain JSON-RPC call via Venice Crypto RPC. Use this when the user asks for:
- wallet balance of an address on any chain
- token balance (ERC-20 balanceOf)
- transaction details or receipt (by hash)
- block number, gas price, or fee data
- contract call (eth_call) results
- ENS lookup or any other live onchain data
Supported networks: base, ethereum, arbitrum, optimism, polygon, avalanche, bsc, fantom, gnosis, zksync, linea, scroll, mantle, blast, mode, zora, celo, moonbeam, cronos, kava, metis.
Default to "base" for Base-related queries. Always use the correct network for the user's request.`,
    input_schema: {
      type: "object",
      properties: {
        network: {
          type: "string",
          description: "Network name: base | ethereum | arbitrum | optimism | polygon | avalanche | bsc | fantom | gnosis | zksync | linea | scroll | mantle | blast | mode | zora | celo | moonbeam | cronos | kava | metis. Default: base",
        },
        method: {
          type: "string",
          description: "JSON-RPC method: eth_getBalance | eth_call | eth_getTransactionByHash | eth_getTransactionReceipt | eth_blockNumber | eth_gasPrice | eth_estimateGas | eth_getLogs | eth_getCode | eth_getStorageAt",
        },
        params: {
          type: "array",
          description: "JSON-RPC params array. Examples: eth_getBalance → [\"0xAddress\", \"latest\"], eth_call → [{to: \"0xContract\", data: \"0xCalldata\"}, \"latest\"]",
          items: {},
        },
      },
      required: ["method"],
    },
  },
];

// ─── Venice tools (OpenAI function-calling format) ───────────────────────────
// Mirrors HUB_TOOLS but wrapped in { type: "function", function: {...} }
const VENICE_TOOLS = HUB_TOOLS.map(t => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

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
  hub_crypto_rpc:       "crypto-rpc",
};

// ─── Internal Hub tool caller ─────────────────────────────────────────────────

async function callHubTool(toolName: string, args: Record<string, unknown>): Promise<{ text: string; result?: unknown }> {
  const endpoint = TOOL_ENDPOINT[toolName];
  if (!endpoint) return { text: `[Unknown tool: ${toolName}]` };

  // Internal bypass: call /api/x402/<id> directly with X-Blue-Internal header
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_KEY) headers["X-Blue-Internal"] = INTERNAL_KEY;

  // crypto-rpc routes directly to /api/crypto-rpc (not x402 — no payment gate)
  const apiPath = toolName === "hub_crypto_rpc"
    ? `${BASE_URL}/api/crypto-rpc`
    : `${BASE_URL}/api/x402/${endpoint}`;

  try {
    const res = await fetch(apiPath, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 402) {
      return { text: `[${toolName}: payment required — set INTERNAL_SERVICE_KEY env var to enable]` };
    }
    if (!res.ok) {
      return { text: `[${toolName}: service returned ${res.status} — answering from knowledge]` };
    }

    const data = await res.json().catch(() => null);
    // Unwrap nested { result: ... } if present
    const payload = (data as Record<string, unknown>)?.result ?? data;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { text, result: payload };
  } catch (e) {
    return { text: `[${toolName}: unavailable (${(e as Error).message}) — answering from knowledge]` };
  }
}

// ─── Venice Phase 1: non-streaming tool detection ────────────────────────────

interface VeniceToolCall {
  id: string; type: "function";
  function: { name: string; arguments: string };
}
interface VenicePhase1Resp {
  choices: Array<{ message: { tool_calls?: VeniceToolCall[] }; finish_reason: string }>;
}

async function callVenicePhase1(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  maxTokens:       number,
  enableWebSearch: boolean,
): Promise<VenicePhase1Resp | null> {
  try {
    const res = await fetch(VENICE_API, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:       modelId,
        messages:    openaiMsgs,
        tools:       VENICE_TOOLS,
        tool_choice: "auto",
        stream:      false,
        max_tokens:  Math.min(maxTokens, 1024), // intent only — keep short
        venice_parameters: {
          include_venice_system_prompt: false,
          ...(enableWebSearch ? { enable_web_search: "on" } : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return await res.json() as VenicePhase1Resp;
  } catch { return null; }
}

// ─── Venice Phase 2: tool synthesis stream ────────────────────────────────────

async function veniceToolStream(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  toolCalls:       VeniceToolCall[],
  maxTokens:       number,
  enableWebSearch: boolean,
): Promise<Response> {
  const enc = new TextEncoder();

  // Shared <think> parser (same logic as callVeniceStream)
  function makeThinkParser(controller: ReadableStreamDefaultController) {
    let textBuf = ""; let inThink = false;
    const emit = (obj: object) =>
      controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    function flush(isFinal = false) {
      let guard = 0;
      while (textBuf.length > 0 && guard++ < 200) {
        if (!inThink) {
          const si = textBuf.indexOf("<think>");
          if (si === -1) {
            const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 6));
            if (safe) { emit({ delta: { text: safe } }); textBuf = textBuf.slice(safe.length); }
            break;
          }
          if (si > 0) emit({ delta: { text: textBuf.slice(0, si) } });
          textBuf = textBuf.slice(si + 7); inThink = true; emit({ type: "thinking_start" });
        } else {
          const ei = textBuf.indexOf("</think>");
          if (ei === -1) {
            const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 7));
            if (safe) { emit({ type: "thinking_delta", text: safe }); textBuf = textBuf.slice(safe.length); }
            break;
          }
          if (ei > 0) emit({ type: "thinking_delta", text: textBuf.slice(0, ei) });
          textBuf = textBuf.slice(ei + 8); inThink = false; emit({ type: "thinking_end" });
        }
      }
    }
    return { push: (chunk: string) => { textBuf += chunk; flush(); }, end: () => flush(true) };
  }

  const merged = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        // 1. tool_start events
        for (const tc of toolCalls)
          emit({ type: "tool_start", tool: tc.function.name });

        // 2. Execute tools in parallel
        const t0 = Date.now();
        const veniceOutputs = await Promise.all(toolCalls.map(async tc => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          const out = await callHubTool(tc.function.name, args);
          return { tc, out };
        }));
        const elapsed = Date.now() - t0;

        const toolResults = veniceOutputs.map(({ tc, out }) => ({
          role: "tool" as const, tool_call_id: tc.id, content: out.text,
        }));

        // 3. tool_done events (include raw result for card rendering)
        for (const { tc, out } of veniceOutputs)
          emit({ type: "tool_done", tool: tc.function.name, ms: elapsed, result: out.result });

        // 4. Phase 2 streaming synthesis
        const phase2Msgs = [
          ...openaiMsgs,
          { role: "assistant", content: null, tool_calls: toolCalls },
          ...toolResults,
        ];

        let streamRes: Response;
        try {
          streamRes = await fetch(VENICE_API, {
            method:  "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId, messages: phase2Msgs, stream: true, max_tokens: maxTokens,
              venice_parameters: { include_venice_system_prompt: false,
                ...(enableWebSearch ? { enable_web_search: "on" } : {}) },
            }),
            signal: AbortSignal.timeout(60_000),
          });
        } catch (e) {
          emit({ delta: { text: `[Venice tool synthesis failed: ${(e as Error).message}]` } });
          controller.enqueue(enc.encode("data: [DONE]\n\n")); controller.close(); return;
        }
        if (!streamRes.ok) {
          const err = await streamRes.text();
          emit({ delta: { text: `[Venice error ${streamRes.status}: ${err.slice(0, 100)}]` } });
          controller.enqueue(enc.encode("data: [DONE]\n\n")); controller.close(); return;
        }

        // Pipe with <think> parsing
        const think = makeThinkParser(controller);
        const reader = streamRes.body!.getReader(); const dec = new TextDecoder(); let rawBuf = "";
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            rawBuf += dec.decode(value, { stream: true });
            const lines = rawBuf.split("\n"); rawBuf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") { think.end(); controller.enqueue(enc.encode("data: [DONE]\n\n")); continue; }
              try {
                const p = JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] };
                const chunk = p?.choices?.[0]?.delta?.content ?? "";
                if (chunk) think.push(chunk);
              } catch {}
            }
          }
          think.end();
        } finally { controller.close(); }
      } catch (e) { controller.error(e); }
    },
  });

  return new Response(merged, { headers: SSE_HEADERS });
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

// ─── Venice direct stream (no tools) ─────────────────────────────────────────

async function callVeniceStream(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  maxTokens:       number,
  enableWebSearch: boolean = false,
): Promise<Response> {
  let veniceRes: Response;
  try {
    veniceRes = await fetch(VENICE_API, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:      modelId,
        messages:   openaiMsgs,
        stream:     true,
        max_tokens: maxTokens,
        venice_parameters: {
          include_venice_system_prompt: false,
          ...(enableWebSearch ? { enable_web_search: "on" } : {}),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return textToSSE(`[Venice request failed: ${(e as Error).message}]`);
  }

  if (!veniceRes.ok) {
    const err = await veniceRes.text();
    const hint = veniceRes.status === 401
      ? "Venice API key is invalid or expired — please contact support."
      : veniceRes.status === 429
      ? "Venice rate limit hit. Try again in a moment."
      : `Venice error ${veniceRes.status}: ${err.slice(0, 120)}`;
    return textToSSE(`[${hint}]`);
  }

  // Transform OpenAI SSE → Blue SSE with <think> block extraction
  //   data: { type: "thinking_start" }
  //   data: { type: "thinking_delta", text: "..." }
  //   data: { type: "thinking_end" }
  //   data: { delta: { text: "..." } }     ← normal content
  const encoder = new TextEncoder();
  const transformed = new ReadableStream({
    async start(controller) {
      const reader  = veniceRes.body!.getReader();
      const decoder = new TextDecoder();
      let rawBuf  = "";
      let textBuf = "";
      let inThink = false;

      const emit = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Flush textBuf through state machine — routes text to thinking vs content
      function flush(isFinal = false) {
        let guard = 0;
        while (textBuf.length > 0 && guard++ < 200) {
          if (!inThink) {
            const si = textBuf.indexOf("<think>");
            if (si === -1) {
              // Keep last 6 chars buffered in case "<think>" spans chunks
              const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 6));
              if (safe) { emit({ delta: { text: safe } }); textBuf = textBuf.slice(safe.length); }
              break;
            }
            if (si > 0) emit({ delta: { text: textBuf.slice(0, si) } });
            textBuf = textBuf.slice(si + 7);
            inThink = true;
            emit({ type: "thinking_start" });
          } else {
            const ei = textBuf.indexOf("</think>");
            if (ei === -1) {
              const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 7));
              if (safe) { emit({ type: "thinking_delta", text: safe }); textBuf = textBuf.slice(safe.length); }
              break;
            }
            if (ei > 0) emit({ type: "thinking_delta", text: textBuf.slice(0, ei) });
            textBuf = textBuf.slice(ei + 8);
            inThink = false;
            emit({ type: "thinking_end" });
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawBuf += decoder.decode(value, { stream: true });
          const lines = rawBuf.split("\n");
          rawBuf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              flush(true);
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] };
              const chunk  = parsed?.choices?.[0]?.delta?.content ?? "";
              if (chunk) { textBuf += chunk; flush(); }
            } catch {}
          }
        }
        flush(true); // drain on stream end
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

interface Attachment {
  name:     string;
  mimeType: string;
  size:     number;
  data:     string;
  isText:   boolean;
}

// ─── Inject file attachments into last user message ───────────────────────────

function injectAttachments(messages: LLMMessage[], attachments: Attachment[], provider: string): LLMMessage[] {
  if (!attachments.length) return messages;
  const msgs = [...messages];
  const last  = msgs[msgs.length - 1];
  if (!last || last.role !== "user") return msgs;

  const textFiles  = attachments.filter(a => a.isText);
  const imageFiles = attachments.filter(a => !a.isText && a.mimeType.startsWith("image/"));
  const pdfFiles   = attachments.filter(a => !a.isText && a.mimeType === "application/pdf");

  const baseText = typeof last.content === "string" ? last.content : "";

  // Always prepend text/code file contents inline
  const textBlocks = textFiles.map(f =>
    `\n\n--- File: ${f.name} ---\n${f.data}\n--- End of ${f.name} ---`
  ).join("");

  if (provider === "venice") {
    // OpenAI multimodal format
    const contentParts: unknown[] = [];
    if (baseText || textBlocks) {
      contentParts.push({ type: "text", text: (baseText + textBlocks).trim() });
    }
    for (const img of imageFiles) {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      });
    }
    for (const pdf of pdfFiles) {
      // Venice supports PDF as base64 image_url with application/pdf
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${pdf.data}` },
      });
    }
    msgs[msgs.length - 1] = { role: "user", content: contentParts.length ? contentParts : baseText + textBlocks };
  } else {
    // Anthropic multimodal format
    const contentParts: unknown[] = [];
    if (baseText || textBlocks) {
      contentParts.push({ type: "text", text: (baseText + textBlocks).trim() });
    }
    for (const img of imageFiles) {
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      });
    }
    for (const pdf of pdfFiles) {
      contentParts.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.data },
      });
    }
    msgs[msgs.length - 1] = { role: "user", content: contentParts.length ? contentParts : baseText + textBlocks };
  }

  return msgs;
}

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
    messages?:    LLMMessage[];
    tier?:        string;
    memoryContext?: string;
    provider?:    string;
    modelId?:     string;
    webSearch?:   boolean;
    attachments?: Attachment[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, tier = "pro", memoryContext, provider, modelId, webSearch = false, attachments = [] } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  // ── Command injection ─────────────────────────────────────────────────────
  const detectedCmd = extractCommand(messages as LLMMessage[]);
  const cmdPrompt = detectedCmd ? COMMAND_PROMPTS[detectedCmd.cmd] : null;
  const modelLabel = getModelLabel(tier, modelId, provider);
  const modelLine = `## Active model\nYou are currently running as: **${modelLabel}**. When asked "what model are you?", "which AI are you?", "what are you running on?", or similar — answer precisely with this model name.`;
  const system = [
    BASE_SYSTEM,
    modelLine,
    memoryContext ?? "",
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

  // ── Venice provider ───────────────────────────────────────────────────────
  if (provider === "venice" && modelId) {
    const apiKey = process.env.VENICE_INFERENCE_KEY ?? process.env.VENICE_API_KEY;
    if (!apiKey) {
      return textToSSE("[Venice is not configured on this server. Please use a Bankr model (Fast / Pro / Max).]");
    }

    const veniceMessages = injectAttachments(cleanMessages, attachments, "venice");
    const maxTok     = veniceMaxTokens(modelId);
    // Grok 4 always uses web search (internet-native model)
    const autoSearch = webSearch || modelId.startsWith("grok-");
    // E2EE models skip tool use — smaller models, tool calling unreliable
    const isE2EE     = modelId.startsWith("e2ee-");

    const openaiMsgs = [
      { role: "system", content: system },
      ...veniceMessages.map((m) => ({
        role:    m.role as string,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    ];

    if (!isE2EE) {
      // Phase 1: detect tool intent
      const phase1    = await callVenicePhase1(apiKey, modelId, openaiMsgs, maxTok, autoSearch);
      const toolCalls = phase1?.choices?.[0]?.message?.tool_calls;
      if (toolCalls?.length) {
        return veniceToolStream(apiKey, modelId, openaiMsgs, toolCalls, maxTok, autoSearch);
      }
    }

    // No tools (or E2EE): direct stream
    return callVeniceStream(apiKey, modelId, openaiMsgs, maxTok, autoSearch);
  }

  // ── Inject attachments for Bankr (Anthropic) ──────────────────────────────
  cleanMessages = injectAttachments(cleanMessages, attachments, "bankr") as LLMMessage[];

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
        const toolOutputs = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const out = await callHubTool(block.name!, block.input ?? {});
            return { block, out };
          })
        );
        const elapsed = Date.now() - t0;

        const toolResults = toolOutputs.map(({ block, out }) => ({
          type:        "tool_result" as const,
          tool_use_id: block.id!,
          content:     out.text,
        }));

        // 3. tool_done events (include raw result for card rendering)
        for (const { block, out } of toolOutputs) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: "tool_done", tool: block.name, ms: elapsed, result: out.result })}\n\n`
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
