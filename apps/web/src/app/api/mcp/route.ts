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
 * Docs: https://api.blueagent.dev/docs
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";
// Console commands (blue_idea/build/audit/ship/raise) wait on Bankr LLM which
// can take 30-50s. Without explicit maxDuration, Vercel's default cuts the
// function before Bankr replies → 504 to Claude Desktop. 120s leaves headroom
// for the longest case (blue_audit on a complex contract).
export const maxDuration = 120;

// Free-tier internal bypass — MCP calls don't require x402 payment.
// Set INTERNAL_SERVICE_KEY in Vercel; the /api/x402/[tool] route accepts it
// via X-Blue-Internal and skips the USDC settlement step.
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

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
    description: "Builder Score (0-100) — anchored in REAL GitHub repo activity and/or on-chain wallet activity when supplied; the X/CT community part is a labelled estimate.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X handle without @" }, repo: { type: "string", description: "GitHub repo (owner/name or URL) for real shipping signal" }, address: { type: "string", description: "Base wallet 0x... for real on-chain activity" } }, required: ["handle"] },
  },
  {
    name: "hub_agent_score",
    description: "Agent Score (0-100) — anchored in REAL GitHub repo activity and/or on-chain wallet activity when supplied; XP/community is a labelled estimate.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Agent handle or name" }, repo: { type: "string", description: "GitHub repo for real dev-activity signal" }, address: { type: "string", description: "Base wallet 0x... for real on-chain activity" } }, required: ["handle"] },
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
    description: "Competitor analysis — named competitors are grounded in REAL DefiLlama Base TVL/change when they match a protocol; reasons about defensible edge on top.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Your project description" },
        competitors: { type: "array", items: { type: "string" }, description: "Competitor names (resolved against DefiLlama Base protocols for live TVL)" },
        description: { type: "string", description: "What your project does" },
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
    description: "Whale/large-transfer tracker for a Base token or wallet — real Basescan transfer data. Pass a 0x address.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Base token or wallet address (0x…) to track" } }, required: ["address"] },
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
    description: "Token launch readiness — market TIMING grounded in REAL Base data (live chain TVL + trending pools); if a token address is given its live DexScreener market grounds momentum. Returns GO/WAIT + action items.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, description: { type: "string" }, address: { type: "string", description: "Optional: existing token contract 0x... to ground in live market data" } }, required: ["name", "ticker", "description"] },
  },
  {
    name: "hub_builder_dd",
    description: "Deep due diligence on a builder — onchain history, shipped projects, GitHub activity, reputation signals.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X handle, GitHub handle, or wallet" } }, required: ["handle"] },
  },
  {
    name: "hub_brand_score",
    description: "Brand score for a Base project — visibility/narrative/community (AI estimate, no live social feed); credibility is anchored in REAL GitHub activity when a repo is supplied.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project name or URL" }, repo: { type: "string", description: "GitHub repo for real credibility signal" } }, required: ["project"] },
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
    description: "Decode a Base wallet's trading strategy from REAL on-chain activity (live ETH balance, tx count, ERC-20 transfer patterns, current priced holdings).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Base wallet address 0x..." }, focus: { type: "string", description: "Optional analysis focus (e.g. 'defi', 'memecoins')" } }, required: ["address"] },
  },
  {
    name: "hub_portfolio",
    description: "Portfolio rebalancer — grounds in a wallet's REAL current holdings (live balances + USD prices) when an address is given; recommends target allocation by risk + goal.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Base wallet address 0x... for live holdings" }, holdings: { type: "string", description: "Or describe holdings as text if no address" }, risk: { type: "string", description: "conservative | moderate | aggressive" }, goal: { type: "string", description: "e.g. growth, income, preservation" } }, required: ["address"] },
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
    description: "Performance report for an AI agent — grounded in REAL GitHub activity (stars/commits/recency) when a repo is supplied; otherwise a labelled estimate.",
    inputSchema: { type: "object", properties: { agent: { type: "string", description: "Agent handle or name" }, repo: { type: "string", description: "GitHub repo (owner/name or URL) to ground the report in real activity" } }, required: ["agent"] },
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
  {
    name: "blue_monitor",
    description: "On-demand health + risk snapshot for a Base token/contract — live price, liquidity, Basescan verification, risk signals + a watch plan with alert thresholds.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token/contract address (0x…) or a protocol/token name" }, focus: { type: "string", description: "Optional focus, e.g. liquidity or exit risk" } }, required: ["target"] },
  },
  {
    name: "blue_registry",
    description: "Discover the Blue Hub tool catalog — every callable x402 tool (first-party + community), filterable by query/category, with prices and how-to-call.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional search term" }, category: { type: "string", description: "Optional category filter" } } },
  },
  {
    name: "blue_research",
    description: "Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Grounds in live DexScreener data when a token address is given.",
    inputSchema: { type: "object", properties: { topic: { type: "string", description: "Project, narrative, or token to research" }, target: { type: "string", description: "Optional 0x token address to ground in live market data" } }, required: ["topic"] },
  },
  {
    name: "blue_compose",
    description: "Turn a goal into a runnable chain of Blue Hub tools — picks from the real catalog, orders the steps, suggests inputs, and estimates cost.",
    inputSchema: { type: "object", properties: { goal: { type: "string", description: "What you want to accomplish on Base" } }, required: ["goal"] },
  },
  {
    name: "blue_deploy",
    description: "Technical deploy mechanics for Base mainnet — deploy scripts, Basescan verify commands, env vars, gas notes, post-deploy checks. Never invents addresses.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "What you're deploying (contract/app + stack)" }, stack: { type: "string", description: "Optional: Foundry, Hardhat, viem…" } }, required: ["project"] },
  },
  {
    name: "blue_analytics",
    description: "Performance/metrics read on a Base token — live price, momentum, liquidity health, volume/liquidity ratio, growth signals. Real DexScreener data.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token contract address (0x…)" }, focus: { type: "string", description: "Optional focus" } }, required: ["target"] },
  },
  {
    name: "blue_simulate",
    description: "Bull/base/bear scenario modeling for a Base decision — tokenomics, fee model, growth, runway — with assumptions, projections, and sensitivities.",
    inputSchema: { type: "object", properties: { scenario: { type: "string", description: "The decision/model to simulate" }, params: { type: "string", description: "Optional parameters/values" } }, required: ["scenario"] },
  },
  {
    name: "blue_stream",
    description: "Live snapshot feed of Base onchain activity — trending & new pools, TVL, real price/volume/liquidity. Pure real data; poll for a near-real-time feed.",
    inputSchema: { type: "object", properties: { feed: { type: "string", description: "movers | new | all (default movers)" } } },
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
  hub_narrative_pulse:      "narrative-position",
  // Blue first-party (extended)
  blue_monitor:             "blue-monitor",
  blue_registry:            "blue-registry",
  blue_research:            "blue-research",
  blue_compose:             "blue-compose",
  blue_deploy:              "blue-deploy",
  blue_analytics:           "blue-analytics",
  blue_simulate:            "blue-simulate",
  blue_stream:              "blue-stream",
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

// Some MCP tool schemas use agent-friendly field names (task, agent, pitch,
// target, handle) that differ from the handler's expected body fields. Map them
// here, keyed by handler id, so the MCP path doesn't 400. The Hub-UI path
// already sends the correct fields, so this only touches MCP calls.
const ARG_REMAP: Record<string, (a: Record<string, unknown>) => Record<string, unknown>> = {
  "repo-health":          (a) => ({ ...a, repo: a.repo ?? a.url }),
  "community-sentiment":  (a) => ({ ...a, project: a.project ?? a.target }),
  "builder-deep-dd":      (a) => ({ ...a, target: a.target ?? a.handle }),
  "builder-brand-score":  (a) => ({ ...a, builder: a.builder ?? a.project, handle: a.handle ?? a.project }),
  "roadmap-validator":    (a) => ({ ...a, project: a.project ?? "this project", roadmap: a.roadmap }),
  "gtm-brief":            (a) => ({ ...a, project: a.project, description: a.description ?? a.target ?? a.project }),
  "pitch-intelligence":   (a) => ({ ...a, project: a.project ?? a.pitch, description: a.description ?? a.pitch }),
  "multi-agent-workflow": (a) => ({ ...a, goal: a.goal ?? a.task }),
  "agent-collab-match":   (a) => ({ ...a, agent_a: a.agent_a ?? a.task, agent_b: a.agent_b ?? "best-fit Base ecosystem agent", collab_goal: a.collab_goal ?? a.task }),
  "agent-performance":    (a) => ({ ...a, handle: a.handle ?? a.agent }),
  "portfolio-rebalancer": (a) => ({ ...a, risk_profile: a.risk_profile ?? a.risk }),
};

async function callHubTool(toolId: string, rawArgs: Record<string, unknown>): Promise<string> {
  const args = ARG_REMAP[toolId] ? ARG_REMAP[toolId](rawArgs) : rawArgs;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Server-to-server: bypass x402 payment for MCP free-tier calls
  if (INTERNAL_KEY) headers["X-Blue-Internal"] = INTERNAL_KEY;

  const res = await fetch(`${BASE}/api/x402/${toolId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (res.status === 402) {
    return `Tool "${toolId}" requires payment but MCP free-tier bypass is not configured. Set INTERNAL_SERVICE_KEY env var, or pay via https://blueagent.dev/hub.`;
  }
  if (!res.ok) throw new Error(`${toolId} returned ${res.status}`);
  // Track MCP usage (paid path tracks via x402 route; internal path doesn't, so track here)
  try { await kv.incr(`usage:${toolId}`); } catch {}
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

const JSON_HEADERS = {
  "Content-Type":                 "application/json",
  "Access-Control-Allow-Origin":  "*",
  "Cache-Control":                "no-store",
};

const SSE_HEADERS = {
  "Content-Type":                 "text/event-stream",
  "Cache-Control":                "no-cache, no-transform",
  "Connection":                   "keep-alive",
  "Access-Control-Allow-Origin":  "*",
  "X-Accel-Buffering":            "no", // disable nginx buffering
};

/** Wrap a JSON-RPC envelope as a single SSE `message` event. */
function sseEnvelope(envelope: object): string {
  return `event: message\ndata: ${JSON.stringify(envelope)}\n\n`;
}

/** True if the client prefers SSE (Streamable HTTP per MCP 2025-03-26). */
function wantsSse(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/event-stream");
}

function respond(envelope: object, useSse: boolean): NextResponse {
  if (useSse) {
    return new NextResponse(sseEnvelope(envelope), { headers: SSE_HEADERS });
  }
  return new NextResponse(JSON.stringify(envelope), { headers: JSON_HEADERS });
}

function ok(id: unknown, result: unknown, useSse = false) {
  return respond({ jsonrpc: "2.0", id, result }, useSse);
}

function err(id: unknown, code: number, message: string, useSse = false) {
  return respond({ jsonrpc: "2.0", id, error: { code, message } }, useSse);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const useSse = wantsSse(req);

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try { body = await req.json(); }
  catch { return err(null, -32700, "Parse error", useSse); }

  const { id, method, params } = body;
  const p = (params ?? {}) as Record<string, unknown>;

  // ── initialize ──────────────────────────────────────────────────────────────
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "blue-agent", version: "1.0.0" },
      instructions: `Blue Agent MCP server — ${TOOLS.length} tools for Base builders. Docs: https://api.blueagent.dev/docs`,
    }, useSse);
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // ── ping ────────────────────────────────────────────────────────────────────
  if (method === "ping") {
    return ok(id, {}, useSse);
  }

  // ── tools/list ──────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS }, useSse);
  }

  // ── tools/call ──────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const name = p.name as string;
    const args = (p.arguments ?? {}) as Record<string, unknown>;

    if (!name) return err(id, -32602, "tools/call requires name", useSse);

    try {
      // Console tools
      const consoleCmd = CONSOLE_MAP[name];
      if (consoleCmd) {
        const prompt = args.prompt as string;
        if (!prompt) return err(id, -32602, "prompt is required", useSse);
        const text = await callConsole(consoleCmd, prompt);
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // Hub tools
      const hubId = HUB_MAP[name];
      if (hubId) {
        const text = await callHubTool(hubId, args);
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // blue_score
      if (name === "blue_score") {
        const handle = args.handle as string;
        if (!handle) return err(id, -32602, "handle is required", useSse);
        const text = await callBuilderScore(handle);
        return ok(id, { content: [{ type: "text", text }] }, useSse);
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
        }, useSse);
      }

      return err(id, -32601, `Unknown tool: ${name}`, useSse);

    } catch (e) {
      const msg = (e as Error).message;
      return ok(id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true }, useSse);
    }
  }

  return err(id, -32601, `Method not found: ${method}`, useSse);
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    },
  });
}

// GET — discovery + Streamable HTTP server→client stream
//
// When invoked by a browser / curl with `Accept: application/json`, returns
// discovery JSON for humans.
//
// When invoked with `Accept: text/event-stream` (MCP 2025-03-26 Streamable
// HTTP), returns an empty SSE stream so clients that probe a GET endpoint
// for server-initiated messages (notifications, sampling) don't error out.
export async function GET(req: NextRequest) {
  if (wantsSse(req)) {
    // Empty heartbeat stream. We don't emit server-initiated messages yet, but
    // mcp-remote pings this endpoint and disconnects cleanly when it gets SSE.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(": blue-agent mcp stream\n\n"));
      },
      cancel() {},
    });
    return new NextResponse(stream, { headers: SSE_HEADERS });
  }

  return NextResponse.json({
    name:        "Blue Agent MCP Server",
    version:     "1.0.0",
    protocol:    "MCP JSON-RPC 2.0 (Streamable HTTP, spec 2025-03-26)",
    tools:       TOOLS.length,
    tool_names:  TOOLS.map((t) => t.name),
    config: {
      claude_desktop: {
        mcpServers: {
          "blue-agent": { url: "https://blueagent.dev/api/mcp" },
        },
      },
      claude_code: "claude mcp add blue-agent --transport http https://blueagent.dev/api/mcp",
      mcp_remote: {
        mcpServers: {
          "blue-agent": {
            command: "npx",
            args:    ["-y", "mcp-remote", "https://blueagent.dev/api/mcp"],
          },
        },
      },
      cursor: "https://blueagent.dev/api/mcp",
    },
    docs: "https://api.blueagent.dev/docs",
  }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
