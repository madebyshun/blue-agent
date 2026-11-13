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

// One declaration. The startup banner below reads this rather than repeating the
// literal — the two had already drifted apart once.
const VERSION = "0.4.1";

const server = new Server(
  { name: "blueagent-skill", version: VERSION },
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
  // This used to call `/api/x402/builder-score`, described in-comment as the PAID
  // endpoint external callers pay per call. MEASURED 2026-09-18: that id is in
  // neither AGENT_TOOLS nor HANDLERS, so it answered 501 "you were not charged"
  // — GET and POST alike — and answers 404 UNKNOWN_TOOL_ID since 2026-09-28. It
  // was never a paywall and never carried a price; blue_score threw
  // `Builder Score API error: 501` on every invocation.
  //
  // `/api/builder-score` runs the same handler and returns 200. Its guard rejects
  // cross-site *browser* callers via Sec-Fetch-Site, a header no Node process
  // sends — so this MCP was already admitted there, and was pointed instead at the
  // one endpoint that could not work.
  //
  // To make it genuinely paid: register `builder-score` in AGENT_TOOLS + HANDLERS
  // with a price, then flip this URL back. One line on each side.
  //
  // What that flip costs changed on 2026-09-28: `/api/x402/builder-score` now
  // answers 404 UNKNOWN_TOOL_ID, not 501 — an id in neither map is unknown, not
  // unimplemented, and 501 told the caller its id was right. So the branch below
  // accepts BOTH codes. Until today it accepted only 501, which would have made
  // the friendly message die silently the moment anyone repointed this URL.
  const url = `${BLUEAGENT_API}/api/builder-score?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url);
  if (res.status === 402) {
    return `Builder Score is a paid x402 tool.\nConnect a wallet and pay via x402 to call it.\nSee: https://blueagent.dev/api-docs#auth`;
  }
  if (res.status === 403) {
    // The first-party guard on `/api/builder-score`, and the ONLY non-200 this URL
    // actually emits. Unreachable from Node (it keys off Sec-Fetch-Site, a header
    // no Node fetch sends) but answered honestly in case a proxy ever adds one.
    return `Builder Score is first-party only — you were not charged.\nLive tool ids: https://blueagent.dev/api/catalog`;
  }
  if (res.status === 404 || res.status === 501) {
    return `Builder Score is not available on the server (${res.status}) — you were not charged.\nLive tool ids: https://blueagent.dev/api/catalog`;
  }
  if (!res.ok) throw new Error(`Builder Score API error: ${res.status}`);
  return JSON.stringify(await res.json(), null, 2);
}

// ─── Template scaffolding ─────────────────────────────────────────────────────

type TemplateType = "base-agent" | "base-x402" | "base-token";

const TEMPLATES: Record<TemplateType, Record<string, string>> = {
  // Scaffolds deliberately have ZERO dependency on our own packages. Until
  // 2026-09-18 this template required `@blue-agent/bankr` — a scope that does not
  // exist on npm — so `npm install` failed for every project it ever generated.
  // Virtuals is OpenAI-compatible, so a plain fetch needs no SDK and cannot rot
  // against our publish state.
  "base-agent": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "start": "tsx src/index.ts" },
  "devDependencies": { "typescript": "^5.3.0", "@types/node": "^20.0.0", "tsx": "^4.0.0" }
}`,
    ".env.example": `# Virtuals inference — https://compute.virtuals.io
VIRTUALS_API_KEY=your_virtuals_api_key_here
# Pick a model id from the live Virtuals catalog. Required: this template does not
# hardcode one, because an id baked into a scaffold goes stale the moment the
# gateway de-lists it.
VIRTUALS_MODEL=
WALLET_PRIVATE_KEY=your_private_key_here`,
    "src/index.ts": `const API_KEY = process.env.VIRTUALS_API_KEY?.trim();
const MODEL = process.env.VIRTUALS_MODEL?.trim();
if (!API_KEY) throw new Error("VIRTUALS_API_KEY is not set — see .env.example");
if (!MODEL) throw new Error("VIRTUALS_MODEL is not set — pick an id from the Virtuals catalog");

async function main() {
  // Virtuals is OpenAI-compatible: /chat/completions, Bearer auth, system as the
  // first message. It is NOT the Anthropic Messages shape.
  const res = await fetch("https://compute.virtuals.io/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${API_KEY}\` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are {{PROJECT_NAME}}, an AI agent on Base (chain 8453)." },
        { role: "user", content: "Hello from Base!" },
      ],
    }),
  });
  if (!res.ok) throw new Error(\`Virtuals \${res.status}: \${await res.text()}\`);
  const data = await res.json();
  console.log(data.choices?.[0]?.message?.content ?? "");
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
  "devDependencies": { "typescript": "^5.3.0", "@types/node": "^20.0.0", "tsx": "^4.0.0" }
}`,
    // No LLM key here: this scaffold is a bare node:http server and never calls one.
    // It listed `@blue-agent/bankr` + BANKR_API_KEY until 2026-09-18 — an unresolvable
    // dependency and an env var nothing read.
    ".env.example": `PORT=3000`,
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
      name: "hub_contract_trust",
      toolId: "contract-trust",
      description: "Trust score for any smart contract — code quality, upgrade risk, ownership, audit history.",
      inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
    },
  {
      name: "blue_registry",
      toolId: "blue-registry",
      description: "Discover the Blue Hub tool catalog — every callable x402 tool (first-party + community), filterable by query/category, with prices and how-to-call.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional search term" }, category: { type: "string", description: "Optional category filter" } } },
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
  console.error(`Blue Agent MCP server v${VERSION} — ${ALL_TOOLS.length} tools ready`);
}

main().catch((err) => { console.error(err); process.exit(1); });
