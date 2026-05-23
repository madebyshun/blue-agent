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
 * Tools: 22 — 5 console commands + 15 Hub tools + blue_score + blue_new
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
  const res = await fetch(`${BASE}/api/${toolId}`, {
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
  const res = await fetch(`https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/builder-score?handle=${encodeURIComponent(handle)}`);
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
