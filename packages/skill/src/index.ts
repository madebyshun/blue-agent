#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callWithGrounding, BLUE_AGENT_PRICING } from "@blueagent/core";
import fs from "fs";
import path from "path";

const server = new Server(
  { name: "blueagent-skill", version: "0.3.0" },
  { capabilities: { tools: {} } }
);

const BLUEAGENT_API = process.env.BLUEAGENT_API_URL ?? "https://blueagent.dev";

// ─── Hub tool caller ──────────────────────────────────────────────────────────

async function callHubTool(toolId: string, body: Record<string, unknown>): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BLUEAGENT_API}/api/v1/${toolId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new Error(`Network error calling ${toolId}: ${(e as Error).message}`);
  }

  const text = await res.text();

  if (res.status === 402) {
    return `Payment required for ${toolId}.\nConnect a wallet and set up x402 to use this tool.\nSee: https://blueagent.dev/api-docs#auth`;
  }
  if (!res.ok) {
    throw new Error(`${toolId} returned ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ─── Builder Score ────────────────────────────────────────────────────────────

async function fetchBuilderScore(handle: string): Promise<string> {
  const url = `https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/builder-score?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Builder Score API error: ${res.status}`);
  return JSON.stringify(await res.json(), null, 2);
}

// ─── Template scaffolding ─────────────────────────────────────────────────────

type TemplateType = "base-agent" | "base-x402" | "base-token";

const TEMPLATES: Record<TemplateType, Record<string, string>> = {
  "base-agent": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "start": "tsx src/index.ts" },
  "dependencies": { "@blue-agent/bankr": "latest", "x402-fetch": "latest" },
  "devDependencies": { "typescript": "^5.3.0", "@types/node": "^20.0.0", "tsx": "^4.0.0" }
}`,
    ".env.example": `BANKR_API_KEY=your_bankr_api_key_here\nWALLET_PRIVATE_KEY=your_private_key_here`,
    "src/index.ts": `import { callBankrLLM } from "@blue-agent/bankr";
async function main() {
  const result = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: "You are {{PROJECT_NAME}}, an AI agent on Base (chain 8453).",
    messages: [{ role: "user", content: "Hello from Base!" }],
  });
  console.log(result);
}
main().catch(console.error);`,
    "README.md": `# {{PROJECT_NAME}}\n\nBuilt with [Blue Agent](https://blueagent.dev).`,
  },
  "base-x402": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts" },
  "dependencies": { "@blue-agent/bankr": "latest" },
  "devDependencies": { "typescript": "^5.3.0", "@types/node": "^20.0.0", "tsx": "^4.0.0" }
}`,
    ".env.example": `BANKR_API_KEY=your_bankr_api_key_here\nPORT=3000`,
    "src/index.ts": `import http from "node:http";
const PORT = Number(process.env.PORT ?? 3000);
http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200); res.end(JSON.stringify({ status: "ok" })); return; }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log("{{PROJECT_NAME}} on http://localhost:" + PORT));`,
    "README.md": `# {{PROJECT_NAME}}\n\nBuilt with [Blue Agent](https://blueagent.dev).`,
  },
  "base-token": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "scripts": { "build": "forge build", "test": "forge test" },
  "devDependencies": { "ethers": "^6.0.0", "typescript": "^5.3.0", "tsx": "^4.0.0" }
}`,
    ".env.example": `BASE_RPC_URL=https://mainnet.base.org\nDEPLOYER_PRIVATE_KEY=your_private_key`,
    "contracts/Token.sol": `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract {{PROJECT_NAME}}Token is ERC20 {
    constructor() ERC20("{{PROJECT_NAME}}", "TKN") { _mint(msg.sender, 1_000_000_000 * 10**18); }
}`,
    "README.md": `# {{PROJECT_NAME}}\n\nERC-20 on Base. Built with [Blue Agent](https://blueagent.dev).`,
  },
};

function scaffoldProject(type: TemplateType, name: string): string {
  const files = TEMPLATES[type];
  const projectDir = path.join(process.cwd(), name);
  const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, "-");
  if (fs.existsSync(projectDir)) throw new Error(`Directory "${name}" already exists`);
  const created: string[] = [];
  for (const [filePath, rawContent] of Object.entries(files)) {
    const content = rawContent.replace(/\{\{PROJECT_NAME\}\}/g, sanitized);
    const fullPath = path.join(projectDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    created.push(filePath);
  }
  return [`✅ Scaffolded ${type}: ${name}/`, `Files: ${created.join(", ")}`, `Next: cd ${name} && cp .env.example .env && npm install`].join("\n");
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const CONSOLE_TOOLS = [
  {
    name: "blue_idea",
    description: `Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan. $${BLUE_AGENT_PRICING.idea}`,
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Your concept or idea" } }, required: ["prompt"] },
    task: "idea" as const,
  },
  {
    name: "blue_build",
    description: `Architecture, stack, folder structure, integrations, test plan for a Base project. $${BLUE_AGENT_PRICING.build}`,
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What to build — brief, spec, or requirements" } }, required: ["prompt"] },
    task: "build" as const,
  },
  {
    name: "blue_audit",
    description: `Security review — critical issues, suggested fixes, go/no-go. 500+ checks, 13 categories. $${BLUE_AGENT_PRICING.audit}`,
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Code, contract, or system to audit" } }, required: ["prompt"] },
    task: "audit" as const,
  },
  {
    name: "blue_ship",
    description: `Deployment checklist, verification steps, release notes, monitoring plan. $${BLUE_AGENT_PRICING.ship}`,
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What you're shipping" } }, required: ["prompt"] },
    task: "ship" as const,
  },
  {
    name: "blue_raise",
    description: `Pitch narrative — market framing, why this wins, traction, ask, target investors. $${BLUE_AGENT_PRICING.raise}`,
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Your project and what you're raising for" } }, required: ["prompt"] },
    task: "raise" as const,
  },
];

// Hub tools — call blueagent.dev/api/v1/{id}
const HUB_TOOLS = [
  {
    name: "hub_builder_score",
    toolId: "builder-score",
    description: "Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100).",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X/Twitter handle without @" } }, required: ["handle"] },
  },
  {
    name: "hub_agent_score",
    toolId: "agent-score",
    description: "Agent Score — XP system for AI agents on Base. Tracks interactions, signals, uptime.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Agent handle or name" } }, required: ["handle"] },
  },
  {
    name: "hub_market_fit",
    toolId: "market-fit",
    description: "Market fit analysis for a Base project — problem clarity, timing, competition, demand signals.",
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
    toolId: "token-pick-signal",
    description: "AI token pick — falsifiable thesis, entry, sizing, kill criterion. Returns NO_PICK when nothing clears the bar.",
    inputSchema: {
      type: "object",
      properties: { context: { type: "string", description: "Market context or narrative to consider (optional)" } },
    },
  },
  {
    name: "hub_narrative",
    toolId: "narrative-position",
    description: "Narrative map — mindshare scores, velocity arrows, phase labels (Emerging/Rising/Peak/Fading), position calls.",
    inputSchema: {
      type: "object",
      properties: { focus: { type: "string", description: "Specific narratives to track (optional)" } },
    },
  },
  {
    name: "hub_ecosystem",
    toolId: "ecosystem-digest",
    description: "Daily Base ecosystem digest — top launches, protocol updates, builder activity.",
    inputSchema: {
      type: "object",
      properties: { focus: { type: "string", description: "Focus area e.g. DeFi, AI agents, NFT (optional)" } },
    },
  },
  {
    name: "hub_competitor_scan",
    toolId: "competitor-scan",
    description: "Competitor analysis — direct/indirect competitors and your defensible edge.",
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
    toolId: "investor-memo",
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
    toolId: "repo-health",
    description: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "GitHub repository URL" } },
      required: ["url"],
    },
  },
  {
    name: "hub_base_grant",
    toolId: "base-grant-finder",
    description: "Find active grants and funding for your Base project.",
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
    toolId: "risk-gate",
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
    toolId: "honeypot-check",
    description: "Detect honeypot tokens that cannot be sold after purchase.",
    inputSchema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address on Base" } },
      required: ["token"],
    },
  },
  {
    name: "hub_deep_analysis",
    toolId: "deep-analysis",
    description: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals.",
    inputSchema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address" } },
      required: ["token"],
    },
  },
  {
    name: "hub_whale_signal",
    toolId: "whale-copy-signal",
    description: "Track whale wallet movements and generate copy-trade signals for a token.",
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
    toolId: "fundraise-timing",
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
  // ── Security (extended) ────────────────────────────────────────────────────
  {
    name: "hub_contract_trust",
    toolId: "contract-trust",
    description: "Trust score for any smart contract — code quality, upgrade risk, ownership, audit history.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_aml_screen",
    toolId: "aml-screen",
    description: "AML screening for a wallet — sanctions, mixer exposure, illicit flow patterns.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_key_exposure",
    toolId: "key-exposure",
    description: "Check if a wallet's public key is exposed on-chain (quantum vulnerability risk).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  // ── Research (extended) ────────────────────────────────────────────────────
  {
    name: "hub_token_momentum",
    toolId: "token-momentum-scanner",
    description: "Token momentum scanner — price velocity, volume spikes, social acceleration for Base tokens.",
    inputSchema: { type: "object", properties: { token: { type: "string" }, limit: { type: "number" } } },
  },
  {
    name: "hub_whale_tracker",
    toolId: "whale-tracker",
    description: "Smart money flow analysis — track top wallet moves across Base in real time.",
    inputSchema: { type: "object", properties: { focus: { type: "string" } } },
  },
  {
    name: "hub_community_sentiment",
    toolId: "community-sentiment",
    description: "Community sentiment for a token or project — CT mindshare, Farcaster buzz, Telegram signals.",
    inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] },
  },
  // ── Builder (extended) ─────────────────────────────────────────────────────
  {
    name: "hub_launch_simulator",
    toolId: "launch-simulator",
    description: "Simulate a token or product launch — model price action, liquidity, community growth scenarios.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, supply: { type: "string" } }, required: ["project"] },
  },
  {
    name: "hub_token_launch",
    toolId: "token-launch-readiness",
    description: "Token launch readiness score (0-100) — narrative fit, liquidity, community, timing. GO/WAIT + action items.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, description: { type: "string" } }, required: ["name", "ticker", "description"] },
  },
  {
    name: "hub_builder_dd",
    toolId: "builder-deep-dd",
    description: "Deep due diligence on a builder — onchain history, shipped projects, GitHub activity, reputation.",
    inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] },
  },
  {
    name: "hub_brand_score",
    toolId: "builder-brand-score",
    description: "Brand score for a Base project — visibility, narrative alignment, community resonance.",
    inputSchema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] },
  },
  {
    name: "hub_roadmap",
    toolId: "roadmap-validator",
    description: "Validate a product roadmap — feasibility, sequencing, market timing, missing milestones.",
    inputSchema: { type: "object", properties: { roadmap: { type: "string" }, stage: { type: "string" } }, required: ["roadmap"] },
  },
  {
    name: "hub_gtm",
    toolId: "gtm-brief",
    description: "Go-to-market brief — distribution channels, launch sequence, community strategy for a Base project.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, target: { type: "string" } }, required: ["project"] },
  },
  {
    name: "hub_pitch_intel",
    toolId: "pitch-intelligence",
    description: "Pitch intelligence — analyze and strengthen a pitch deck or fundraising narrative.",
    inputSchema: { type: "object", properties: { pitch: { type: "string" } }, required: ["pitch"] },
  },
  // ── Premium ────────────────────────────────────────────────────────────────
  {
    name: "hub_wallet_pnl",
    toolId: "wallet-pnl",
    description: "Full PnL report for a wallet — realized/unrealized gains, win rate, best/worst trades on Base.",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "hub_wallet_strategy",
    toolId: "wallet-strategy-analyzer",
    description: "Analyze a wallet's trading strategy — pattern recognition, risk profile, alpha sources.",
    inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
  },
  {
    name: "hub_portfolio",
    toolId: "portfolio-rebalancer",
    description: "Portfolio rebalancer — optimal allocation across Base DeFi positions by risk tolerance.",
    inputSchema: { type: "object", properties: { address: { type: "string" }, risk: { type: "string" } }, required: ["address"] },
  },
  {
    name: "hub_defi_opportunity",
    toolId: "defi-opportunity",
    description: "Best DeFi yield opportunities on Base — APY rankings, risk-adjusted returns, protocol safety.",
    inputSchema: { type: "object", properties: { amount: { type: "string" }, risk: { type: "string" } } },
  },
  {
    name: "hub_protocol_risk",
    toolId: "protocol-risk-monitor",
    description: "Real-time risk monitor for a Base DeFi protocol — TVL changes, exploit signals, governance risks.",
    inputSchema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"] },
  },
  // ── Multi-agent ────────────────────────────────────────────────────────────
  {
    name: "hub_multi_agent",
    toolId: "multi-agent-workflow",
    description: "Orchestrate a multi-agent workflow — route tasks across Blue Agent + Aeon + MiroShark.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  {
    name: "hub_agent_match",
    toolId: "agent-collab-match",
    description: "Find the best collaborator agent for a task — match your project with Base agents by capability.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  {
    name: "hub_agent_perf",
    toolId: "agent-performance",
    description: "Performance analytics for an AI agent — response quality, task success rate, user satisfaction.",
    inputSchema: { type: "object", properties: { agent: { type: "string" } }, required: ["agent"] },
  },
  {
    name: "hub_agent_revenue",
    toolId: "agent-revenue-optimizer",
    description: "Revenue optimizer for an AI agent — pricing strategy, tool monetization, x402 fee recommendations.",
    inputSchema: { type: "object", properties: { agent: { type: "string" }, tools: { type: "string" } }, required: ["agent"] },
  },
  {
    name: "hub_agent_token",
    toolId: "agent-token-strategy",
    description: "Token strategy for an AI agent — should you launch, how to structure it, timing on Base.",
    inputSchema: { type: "object", properties: { agent: { type: "string" } }, required: ["agent"] },
  },
  // ── Community ──────────────────────────────────────────────────────────────
  {
    name: "hub_community_growth",
    toolId: "community-growth-playbook",
    description: "Community growth playbook — channels, content strategy, retention loops, milestones.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, current_size: { type: "string" } }, required: ["project"] },
  },
  {
    name: "hub_thread_intel",
    toolId: "thread-intelligence",
    description: "Thread intelligence — analyze a CT thread or topic for signal vs noise, key takes, insights.",
    inputSchema: { type: "object", properties: { thread: { type: "string" } }, required: ["thread"] },
  },
  {
    name: "hub_narrative_pulse",
    toolId: "narrative-pulse",
    description: "Real-time narrative pulse — what's being talked about right now on Base CT, velocity and sentiment.",
    inputSchema: { type: "object", properties: { focus: { type: "string" } } },
  },
  // ── blue-* suite (extended console tools, x402-paid) ───────────────────────
  {
    name: "blue_monitor",
    toolId: "blue-monitor",
    description: "On-demand health + risk snapshot for a Base token/contract — live price, liquidity, Basescan verification, risk signals + a watch plan with alert thresholds.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token/contract address (0x…) or a protocol/token name" }, focus: { type: "string", description: "Optional focus, e.g. liquidity or exit risk" } }, required: ["target"] },
  },
  {
    name: "blue_registry",
    toolId: "blue-registry",
    description: "Discover the Blue Hub tool catalog — every callable x402 tool (first-party + community), filterable by query/category, with prices and how-to-call.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional search term" }, category: { type: "string", description: "Optional category filter" } } },
  },
  {
    name: "blue_research",
    toolId: "blue-research",
    description: "Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Grounds in live DexScreener data when a token address is given.",
    inputSchema: { type: "object", properties: { topic: { type: "string", description: "Project, narrative, or token to research" }, target: { type: "string", description: "Optional 0x token address to ground in live market data" } }, required: ["topic"] },
  },
  {
    name: "blue_compose",
    toolId: "blue-compose",
    description: "Turn a goal into a runnable chain of Blue Hub tools — picks from the real catalog, orders the steps, suggests inputs, and estimates cost.",
    inputSchema: { type: "object", properties: { goal: { type: "string", description: "What you want to accomplish on Base" } }, required: ["goal"] },
  },
  {
    name: "blue_deploy",
    toolId: "blue-deploy",
    description: "Technical deploy mechanics for Base mainnet — deploy scripts, Basescan verify commands, env vars, gas notes, post-deploy checks. Never invents addresses.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "What you're deploying (contract/app + stack)" }, stack: { type: "string", description: "Optional: Foundry, Hardhat, viem…" } }, required: ["project"] },
  },
  {
    name: "blue_analytics",
    toolId: "blue-analytics",
    description: "Performance/metrics read on a Base token — live price, momentum, liquidity health, volume/liquidity ratio, growth signals. Real DexScreener data.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token contract address (0x…)" }, focus: { type: "string", description: "Optional focus" } }, required: ["target"] },
  },
  {
    name: "blue_simulate",
    toolId: "blue-simulate",
    description: "Bull/base/bear scenario modeling for a Base decision — tokenomics, fee model, growth, runway — with assumptions, projections, and sensitivities.",
    inputSchema: { type: "object", properties: { scenario: { type: "string", description: "The decision/model to simulate" }, params: { type: "string", description: "Optional parameters/values" } }, required: ["scenario"] },
  },
  {
    name: "blue_stream",
    toolId: "blue-stream",
    description: "Live snapshot feed of Base onchain activity — trending & new pools, TVL, real price/volume/liquidity. Pure real data; poll for a near-real-time feed.",
    inputSchema: { type: "object", properties: { feed: { type: "string", description: "movers | new | all (default movers)" } } },
  },
];

const ALL_TOOLS = [
  ...CONSOLE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  ...HUB_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  {
    name: "blue_score",
    description: "Look up a builder's onchain score on Base — GitHub/Farcaster handle or wallet address.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "GitHub handle, Farcaster handle, or wallet address" } }, required: ["handle"] },
  },
  {
    name: "blue_new",
    description: "Scaffold a new Base project. Templates: base-agent | base-x402 | base-token.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project directory name e.g. my-agent" },
        type: { type: "string", enum: ["base-agent", "base-x402", "base-token"], description: "Template type" },
      },
      required: ["name", "type"],
    },
  },
];

// ─── Request handlers ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // blue_score
  if (name === "blue_score") {
    const { handle } = args as { handle: string };
    if (!handle) return { content: [{ type: "text", text: "handle is required" }], isError: true };
    try {
      return { content: [{ type: "text", text: await fetchBuilderScore(handle) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }

  // blue_new
  if (name === "blue_new") {
    const { name: projectName, type } = args as { name: string; type: TemplateType };
    if (!projectName || !type) return { content: [{ type: "text", text: "name and type are required" }], isError: true };
    try {
      return { content: [{ type: "text", text: scaffoldProject(type, projectName) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }

  // Hub tools
  const hubTool = HUB_TOOLS.find((t) => t.name === name);
  if (hubTool) {
    try {
      const result = await callHubTool(hubTool.toolId, args as Record<string, unknown>);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }

  // Console tools (grounded LLM)
  const consoleTool = CONSOLE_TOOLS.find((t) => t.name === name);
  if (!consoleTool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };

  const { prompt, model } = args as { prompt: string; model?: string };
  if (!prompt) return { content: [{ type: "text", text: "prompt is required" }], isError: true };

  try {
    const result = await callWithGrounding(consoleTool.task, prompt, { model });
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Blue Agent MCP server v0.3.0 — ${ALL_TOOLS.length} tools ready`);
}

main().catch((err) => { console.error(err); process.exit(1); });
