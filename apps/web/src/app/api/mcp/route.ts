/**
 * Blue Agent — MCP HTTP Server
 *
 * Remote MCP endpoint — agents and IDEs can connect without installing anything.
 *
 * Config (claude_desktop_config.json / .claude.json):
 *   {
 *     "mcpServers": {
 *       "blue-agent": { "url": "https://blueagent.dev/api/mcp" }
 *     }
 *   }
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Tools: 50 — 5 console commands + 43 Hub tools + blue_score + blue_new
 * Docs: https://blueagent.dev/api-docs
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── Console commands ──────────────────────────────────────────────────────
  {
    name: "blue_idea",
    description: "Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Your idea or concept" } }, required: ["prompt"] },
  },
  {
    name: "blue_build",
    description: "Architecture, stack, folder structure, integrations, and test plan for a Base project.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What to build — brief or requirements" } }, required: ["prompt"] },
  },
  {
    name: "blue_audit",
    description: "Security review — 500+ checks, 13 categories. Critical issues, suggested fixes, go/no-go.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Code, contract, or system to audit" } }, required: ["prompt"] },
  },
  {
    name: "blue_ship",
    description: "Deployment checklist, verification steps, release notes, and monitoring plan.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What you're shipping" } }, required: ["prompt"] },
  },
  {
    name: "blue_raise",
    description: "Pitch narrative — market framing, why this wins, traction, ask, target investors.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Project and raise context" } }, required: ["prompt"] },
  },
  // ── Builder & Research Hub tools ─────────────────────────────────────────
  {
    name: "hub_builder_score",
    description: "Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100).",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X handle without @" } }, required: ["handle"] },
  },
  {
    name: "hub_agent_score",
    description: "Agent Score for AI agents on Base — XP system tracking interactions, signals, uptime.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Agent handle or name" } }, required: ["handle"] },
  },
  {
    name: "hub_market_fit",
    description: "Market fit analysis — problem clarity, timing, competition, demand signals for a Base project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        url: { type: "string", description: "Project URL (optional)" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_token_pick",
    description: "AI token pick — falsifiable thesis, entry, sizing, kill criterion. Returns NO_PICK when nothing clears the bar.",
    inputSchema: { type: "object", properties: { context: { type: "string", description: "Market context (optional)" } } },
  },
  {
    name: "hub_narrative",
    description: "Narrative map — mindshare scores, velocity, phase (Emerging/Rising/Peak/Fading), position calls.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Narratives to focus on (optional)" } } },
  },
  {
    name: "hub_ecosystem",
    description: "Daily Base ecosystem digest — top launches, protocol updates, builder activity.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Area to focus on (optional)" } } },
  },
  {
    name: "hub_competitor_scan",
    description: "Competitor analysis — direct/indirect competitors and defensible edge for your project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Your project description" },
        category: { type: "string", description: "Category e.g. DeFi lending, AI agent" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_investor_memo",
    description: "Full investor memo — thesis, market, moat, risks, ask. Ready to send.",
    inputSchema: {
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
    name: "hub_repo_health",
    description: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "GitHub repository URL" } }, required: ["url"] },
  },
  {
    name: "hub_base_grant",
    description: "Find active grants and funding opportunities for your Base project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "idea | build | live" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_risk_gate",
    description: "Screen any transaction before execution — rug check, AML, malicious contract patterns.",
    inputSchema: {
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
    name: "hub_honeypot",
    description: "Detect honeypot tokens that cannot be sold after purchase.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address on Base" } }, required: ["token"] },
  },
  {
    name: "hub_deep_analysis",
    description: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address" } }, required: ["token"] },
  },
  {
    name: "hub_whale_signal",
    description: "Whale wallet copy-trade signals — track large moves for a token on Base.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token address to track" },
        min_usd: { type: "number", description: "Min trade size in USD (default: 10000)" },
      },
      required: ["token"],
    },
  },
  {
    name: "hub_fundraise_timing",
    description: "Is now the right time to raise? Market conditions, stage readiness, investor appetite.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "Stage and key metrics" },
      },
      required: ["project"],
    },
  },
  // ── Security (extended) ──────────────────────────────────────────────────
  {
    name: "hub_contract_trust",
    description: "Trust score for any smart contract — code quality, upgrade risk, ownership, audit history.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_aml_screen",
    description: "AML screening for a wallet address — sanctions, mixer exposure, illicit flow patterns.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_allowance_audit",
    description: "Audit dangerous token approvals for a wallet — find unlimited allowances and revoke recommendations.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_phishing_scan",
    description: "Scan a URL or domain for phishing patterns targeting crypto users.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "URL or domain to scan" } }, required: ["url"] },
  },
  {
    name: "hub_key_exposure",
    description: "Check if a wallet's public key is exposed on-chain (quantum vulnerability risk).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  // ── Research (extended) ───────────────────────────────────────────────────
  {
    name: "hub_token_momentum",
    description: "Token momentum scanner — price velocity, volume spikes, social acceleration for Base tokens.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token address or symbol" }, limit: { type: "number", description: "Number of tokens to scan (default 10)" } } },
  },
  {
    name: "hub_whale_tracker",
    description: "Smart money flow analysis — track top wallet moves across Base in real time.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Sector or token to focus on (optional)" } } },
  },
  {
    name: "hub_community_sentiment",
    description: "Community sentiment for a token or project — CT mindshare, Farcaster buzz, Telegram signals.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Token symbol, project name, or contract address" } }, required: ["target"] },
  },
  // ── Builder (extended) ────────────────────────────────────────────────────
  {
    name: "hub_launch_simulator",
    description: "Simulate a token or product launch — model price action, liquidity, community growth scenarios.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project/token description" }, supply: { type: "string", description: "Token supply (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_token_launch",
    description: "Token launch readiness score (0-100) — narrative fit, liquidity, community, timing. Returns GO/WAIT + action items.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, description: { type: "string" } }, required: ["name", "ticker", "description"] },
  },
  {
    name: "hub_builder_dd",
    description: "Deep due diligence on a builder — onchain history, shipped projects, GitHub activity, reputation signals.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X handle, GitHub handle, or wallet" } }, required: ["handle"] },
  },
  {
    name: "hub_brand_score",
    description: "Brand score for a Base project — visibility, narrative alignment, community resonance.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project name or URL" } }, required: ["project"] },
  },
  {
    name: "hub_roadmap",
    description: "Validate a product roadmap — feasibility, sequencing, market timing, missing milestones.",
    inputSchema: { type: "object", properties: { roadmap: { type: "string", description: "Roadmap or milestones" }, stage: { type: "string" } }, required: ["roadmap"] },
  },
  {
    name: "hub_gtm",
    description: "Go-to-market brief — distribution channels, launch sequence, community strategy for a Base project.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, target: { type: "string", description: "Target audience (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_pitch_intel",
    description: "Pitch intelligence — analyze and strengthen a pitch deck or fundraising narrative with investor-lens feedback.",
    inputSchema: { type: "object", properties: { pitch: { type: "string", description: "Pitch text or deck outline" } }, required: ["pitch"] },
  },
  // ── Premium ───────────────────────────────────────────────────────────────
  {
    name: "hub_wallet_pnl",
    description: "Full PnL report for a wallet — realized/unrealized gains, win rate, best/worst trades on Base.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_wallet_strategy",
    description: "Analyze a wallet's trading strategy — pattern recognition, risk profile, alpha sources.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_portfolio",
    description: "Portfolio rebalancer — optimal allocation across Base DeFi positions based on risk tolerance.",
    inputSchema: { type: "object", properties: { address: { type: "string" }, risk: { type: "string", description: "conservative | moderate | aggressive" } }, required: ["address"] },
  },
  {
    name: "hub_defi_opportunity",
    description: "Best DeFi yield opportunities on Base — APY rankings, risk-adjusted returns, protocol safety.",
    inputSchema: { type: "object", properties: { amount: { type: "string", description: "Amount in USD (optional)" }, risk: { type: "string" } } },
  },
  {
    name: "hub_protocol_risk",
    description: "Real-time risk monitor for a Base DeFi protocol — TVL changes, exploit signals, governance risks.",
    inputSchema: { type: "object", properties: { protocol: { type: "string", description: "Protocol name or contract address" } }, required: ["protocol"] },
  },
  // ── Multi-agent ───────────────────────────────────────────────────────────
  {
    name: "hub_multi_agent",
    description: "Orchestrate a multi-agent workflow — route tasks across Blue Agent + Aeon + MiroShark for complex analysis.",
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Task for the agent collective" } }, required: ["task"] },
  },
  {
    name: "hub_agent_match",
    description: "Find the best collaborator agent for a task — match your project with Base agents by capability.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  {
    name: "hub_agent_perf",
    description: "Performance analytics for an AI agent — response quality, task success rate, user satisfaction.",
    inputSchema: { type: "object", properties: { agent: { type: "string", description: "Agent handle or name" } }, required: ["agent"] },
  },
  {
    name: "hub_agent_revenue",
    description: "Revenue optimizer for an AI agent — pricing strategy, tool monetization, x402 fee recommendations.",
    inputSchema: { type: "object", properties: { agent: { type: "string" }, tools: { type: "string", description: "Tools offered (optional)" } }, required: ["agent"] },
  },
  {
    name: "hub_agent_token",
    description: "Token strategy for an AI agent — should you launch, how to structure it, timing on Base.",
    inputSchema: { type: "object", properties: { agent: { type: "string", description: "Agent description and traction" } }, required: ["agent"] },
  },
  // ── Community ─────────────────────────────────────────────────────────────
  {
    name: "hub_community_growth",
    description: "Community growth playbook — channels, content strategy, retention loops, milestones for a Base project.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, current_size: { type: "string", description: "Current size (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_thread_intel",
    description: "Thread intelligence — analyze a CT thread or topic for signal vs noise, key takes, actionable insights.",
    inputSchema: { type: "object", properties: { thread: { type: "string", description: "Thread URL or topic" } }, required: ["thread"] },
  },
  {
    name: "hub_narrative_pulse",
    description: "Real-time narrative pulse — what's being talked about right now on Base CT, velocity and sentiment.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Topic or token to focus on (optional)" } } },
  },
  // ── Utility ───────────────────────────────────────────────────────────────
  {
    name: "blue_score",
    description: "Builder Score for a GitHub/Farcaster handle or wallet address on Base (0-100).",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Handle or wallet address" } }, required: ["handle"] },
  },
  {
    name: "blue_new",
    description: "Scaffold a new Base project. Templates: base-agent | base-x402 | base-token.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project directory name" },
        type: { type: "string", enum: ["base-agent", "base-x402", "base-token"] },
      },
      required: ["name", "type"],
    },
  },
];

// ─── Tool → hub ID map ────────────────────────────────────────────────────────

const HUB_MAP: Record<string, string> = {
  hub_builder_score:    "builder-score",
  hub_agent_score:      "agent-score",
  hub_market_fit:       "market-fit",
  hub_token_pick:       "token-pick-signal",
  hub_narrative:        "narrative-position",
  hub_ecosystem:        "ecosystem-digest",
  hub_competitor_scan:  "competitor-scan",
  hub_investor_memo:    "investor-memo",
  hub_repo_health:      "repo-health",
  hub_base_grant:       "base-grant-finder",
  hub_risk_gate:        "risk-gate",
  hub_honeypot:         "honeypot-check",
  hub_deep_analysis:    "deep-analysis",
  hub_whale_signal:     "whale-copy-signal",
  hub_fundraise_timing: "fundraise-timing",
  // Security (extended)
  hub_contract_trust:       "contract-trust",
  hub_aml_screen:           "aml-screen",
  hub_allowance_audit:      "allowance-audit",
  hub_phishing_scan:        "phishing-scan",
  hub_key_exposure:         "key-exposure",
  // Research (extended)
  hub_token_momentum:       "token-momentum-scanner",
  hub_whale_tracker:        "whale-tracker",
  hub_community_sentiment:  "community-sentiment",
  // Builder (extended)
  hub_launch_simulator:     "launch-simulator",
  hub_token_launch:         "token-launch-readiness",
  hub_builder_dd:           "builder-deep-dd",
  hub_brand_score:          "builder-brand-score",
  hub_roadmap:              "roadmap-validator",
  hub_gtm:                  "gtm-brief",
  hub_pitch_intel:          "pitch-intelligence",
  // Premium
  hub_wallet_pnl:           "wallet-pnl",
  hub_wallet_strategy:      "wallet-strategy-analyzer",
  hub_portfolio:            "portfolio-rebalancer",
  hub_defi_opportunity:     "defi-opportunity",
  hub_protocol_risk:        "protocol-risk-monitor",
  // Multi-agent
  hub_multi_agent:          "multi-agent-workflow",
  hub_agent_match:          "agent-collab-match",
  hub_agent_perf:           "agent-performance",
  hub_agent_revenue:        "agent-revenue-optimizer",
  hub_agent_token:          "agent-token-strategy",
  // Community
  hub_community_growth:     "community-growth-playbook",
  hub_thread_intel:         "thread-intelligence",
  hub_narrative_pulse:      "narrative-pulse",
};

const CONSOLE_MAP: Record<string, string> = {
  blue_idea:  "idea",
  blue_build: "build",
  blue_audit: "audit",
  blue_ship:  "ship",
  blue_raise: "raise",
};

// ─── Internal API callers ─────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

async function callHubTool(toolId: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/api/x402/${toolId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (res.status === 402) return `Payment required for ${toolId}. Visit https://blueagent.dev/hub to run with USDC payment.`;
  if (!res.ok) throw new Error(`${toolId} returned ${res.status}`);
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

async function callConsole(command: string, prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/console`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, prompt }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`console/${command} returned ${res.status}`);
  const data = await res.json() as { result?: string; text?: string };
  return data.result ?? data.text ?? JSON.stringify(data);
}

async function callBuilderScore(handle: string): Promise<string> {
  const res = await fetch(`https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-score?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`Builder Score API: ${res.status}`);
  return JSON.stringify(await res.json(), null, 2);
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

function err(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try { body = await req.json(); }
  catch { return err(null, -32700, "Parse error"); }

  const { id, method, params } = body;
  const p = (params ?? {}) as Record<string, unknown>;

  // ── initialize ──────────────────────────────────────────────────────────────
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "blue-agent", version: "1.0.0" },
      instructions: `Blue Agent MCP server — ${TOOLS.length} tools for Base builders. Docs: https://blueagent.dev/api-docs`,
    });
  }

  if (method === "notifications/initialized") {
    return NextResponse.json({}, { status: 200 });
  }

  // ── ping ────────────────────────────────────────────────────────────────────
  if (method === "ping") {
    return ok(id, {});
  }

  // ── tools/list ──────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  // ── tools/call ──────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const name = p.name as string;
    const args = (p.arguments ?? {}) as Record<string, unknown>;

    if (!name) return err(id, -32602, "tools/call requires name");

    try {
      // Console tools
      const consoleCmd = CONSOLE_MAP[name];
      if (consoleCmd) {
        const prompt = args.prompt as string;
        if (!prompt) return err(id, -32602, "prompt is required");
        const text = await callConsole(consoleCmd, prompt);
        return ok(id, { content: [{ type: "text", text }] });
      }

      // Hub tools
      const hubId = HUB_MAP[name];
      if (hubId) {
        const text = await callHubTool(hubId, args);
        return ok(id, { content: [{ type: "text", text }] });
      }

      // blue_score
      if (name === "blue_score") {
        const handle = args.handle as string;
        if (!handle) return err(id, -32602, "handle is required");
        const text = await callBuilderScore(handle);
        return ok(id, { content: [{ type: "text", text }] });
      }

      // blue_new — can't scaffold files server-side, explain how to use locally
      if (name === "blue_new") {
        const projectName = args.name as string;
        const type = args.type as string;
        return ok(id, {
          content: [{
            type: "text",
            text: [
              `To scaffold a ${type} project named "${projectName}", run locally:`,
              ``,
              `  npx @blueagent/skill`,
              `  # Then use blue_new tool in your local MCP session`,
              ``,
              `Or use the CLI:`,
              `  npm install -g @blueagent/cli`,
              `  blue new ${projectName} --template ${type}`,
            ].join("\n"),
          }],
        });
      }

      return err(id, -32601, `Unknown tool: ${name}`);

    } catch (e) {
      const msg = (e as Error).message;
      return ok(id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true });
    }
  }

  return err(id, -32601, `Method not found: ${method}`);
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// GET — discovery
export async function GET() {
  return NextResponse.json({
    name:        "Blue Agent MCP Server",
    version:     "1.0.0",
    protocol:    "MCP JSON-RPC 2.0",
    tools:       TOOLS.length,
    tool_names:  TOOLS.map((t) => t.name),
    config: {
      claude_desktop: {
        mcpServers: {
          "blue-agent": { url: "https://blueagent.dev/api/mcp" },
        },
      },
      claude_code: "claude mcp add blue-agent --transport http https://blueagent.dev/api/mcp",
    },
    docs: "https://blueagent.dev/api-docs",
  }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
