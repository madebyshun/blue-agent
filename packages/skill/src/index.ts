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
  { name: "blueagent-skill", version: "0.1.1" },
  { capabilities: { tools: {} } }
);

// ── Builder Score API ─────────────────────────────────────────────────────────

const BUILDER_SCORE_BASE_URL =
  "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/builder-score";

async function fetchBuilderScore(handle: string): Promise<string> {
  const url = `${BUILDER_SCORE_BASE_URL}?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Builder Score API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

// ── Template scaffolding ──────────────────────────────────────────────────────

type TemplateType = "base-agent" | "base-x402" | "base-token";

const TEMPLATES: Record<TemplateType, Record<string, string>> = {
  "base-agent": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@blue-agent/bankr": "latest",
    "x402-fetch": "latest"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
`,
    ".env.example": `BANKR_API_KEY=your_bankr_api_key_here
BLUEAGENT_API_URL=https://api.blueagent.xyz
WALLET_PRIVATE_KEY=your_private_key_here
`,
    "src/index.ts": `import { callBankrLLM } from "@blue-agent/bankr";
import { wrapFetchWithPayment } from "x402-fetch";

const BANKR_API_KEY = process.env.BANKR_API_KEY;
const BLUEAGENT_API_URL = process.env.BLUEAGENT_API_URL ?? "https://api.blueagent.xyz";
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

if (!BANKR_API_KEY) throw new Error("BANKR_API_KEY env var required");
if (!WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY env var required");

// x402-fetch handles HTTP 402 micropayment challenges automatically
// Payment is made in USDC on Base (chain 8453)
const paidFetch = wrapFetchWithPayment(fetch, {
  privateKey: WALLET_PRIVATE_KEY as \`0x\${string}\`,
});

async function think(userMessage: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system: \`You are {{PROJECT_NAME}}, an AI agent running on Base (chain 8453).
You can reason about onchain actions and use Blue Agent tools to check safety before executing.\`,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.7,
    maxTokens: 1000,
  });
}

async function main() {
  console.log("{{PROJECT_NAME}} agent starting on Base...\\n");

  const userIntent = "I want to swap 100 USDC for ETH on Base";
  console.log(\`User: \${userIntent}\\n\`);

  const plan = await think(\`The user wants to: \${userIntent}. What should I check first?\`);
  console.log(\`Plan:\\n\${plan}\\n\`);
}

main().catch(console.error);
`,
    "README.md": `# {{PROJECT_NAME}}

A Bankr-powered AI agent on Base with x402 payment support.

## Setup

\`\`\`bash
cp .env.example .env
# fill in your keys
npm install
npm run dev
\`\`\`

Built with [Blue Agent](https://blueagent.xyz) by [Blocky Studio](https://blocky.studio).
`,
  },

  "base-x402": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@blue-agent/bankr": "latest"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
`,
    ".env.example": `BANKR_API_KEY=your_bankr_api_key_here
PORT=3000
`,
    "bankr.x402.json": `{
  "network": "base",
  "currency": "USDC",
  "services": {
    "my-tool": {
      "price": "0.10",
      "description": "{{PROJECT_NAME}} AI tool",
      "schema": {
        "input": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "Input query" }
          },
          "required": ["query"]
        },
        "output": {
          "type": "object",
          "properties": {
            "result": { "type": "string" },
            "confidence": { "type": "number" }
          }
        }
      }
    }
  }
}
`,
    "x402/my-tool/index.ts": `import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

export default async function handler(req: Request): Promise<Response> {
  let body: { query?: string } = {};
  try {
    const text = await req.text();
    if (text.trim().startsWith("{")) body = JSON.parse(text);
  } catch {}

  const { query } = body;
  if (!query) return Response.json({ error: "query is required" }, { status: 400 });

  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: "Answer the query and return JSON: { result: string, confidence: number (0-1) }",
    messages: [{ role: "user", content: query }],
    temperature: 0.3,
    maxTokens: 500,
  });

  try {
    return Response.json(extractJsonObject(raw));
  } catch {
    return Response.json({ result: raw, confidence: 0.8 });
  }
}
`,
    "src/index.ts": `import http from "node:http";
import myTool from "../x402/my-tool/index.js";

const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url ?? "/", \`http://localhost:\${PORT}\`);
  const chunks: Buffer[] = [];
  for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  const req = new Request(\`http://localhost:\${PORT}\${url.pathname}\`, {
    method: nodeReq.method ?? "GET",
    headers: Object.fromEntries(
      Object.entries(nodeReq.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""])
    ),
    body: nodeReq.method !== "GET" && body ? body : undefined,
  });

  let res: Response;
  if (nodeReq.method === "POST" && url.pathname === "/api/tools/my-tool") {
    res = await myTool(req);
  } else if (url.pathname === "/health") {
    res = Response.json({ status: "ok", service: "{{PROJECT_NAME}}" });
  } else {
    res = Response.json({ error: "Not found" }, { status: 404 });
  }

  nodeRes.writeHead(res.status, Object.fromEntries(res.headers.entries()));
  nodeRes.end(await res.text());
});

server.listen(PORT, () => console.log(\`{{PROJECT_NAME}} x402 API on http://localhost:\${PORT}\`));
`,
    "README.md": `# {{PROJECT_NAME}}

A paid x402 API service on Base powered by Bankr LLM.

## Setup

\`\`\`bash
cp .env.example .env
npm install
npm run dev
\`\`\`

Built with [Blue Agent](https://blueagent.xyz) by [Blocky Studio](https://blocky.studio).
`,
  },

  "base-token": {
    "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "scripts": {
    "build": "forge build",
    "test": "forge test",
    "deploy": "tsx scripts/deploy.ts"
  },
  "devDependencies": {
    "ethers": "^6.0.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
`,
    ".env.example": `BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=your_basescan_api_key
DEPLOYER_PRIVATE_KEY=your_private_key_here
`,
    "foundry.toml": `[profile.default]
src = "contracts"
out = "out"
libs = ["lib"]

[rpc_endpoints]
base = "\${BASE_RPC_URL}"

[etherscan]
base = { key = "\${BASESCAN_API_KEY}", url = "https://api.basescan.org/api" }
`,
    "contracts/Token.sol": `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-20 token deployed on Base (chain 8453)
contract {{PROJECT_NAME}}Token is ERC20, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor(string memory name, string memory symbol, address initialOwner, uint256 initialSupply)
        ERC20(name, symbol)
        ERC20Permit(name)
        Ownable(initialOwner)
    {
        require(initialSupply <= MAX_SUPPLY, "Exceeds max supply");
        _mint(initialOwner, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
}
`,
    "scripts/deploy.ts": `import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const CHAIN_ID = 8453; // Base only
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY required");

const TOKEN_NAME   = "{{PROJECT_NAME}} Token";
const TOKEN_SYMBOL = "TKN";
const INITIAL_SUPPLY = ethers.parseUnits("100000000", 18); // 100M

async function deploy() {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) throw new Error(\`Expected Base (\${CHAIN_ID}), got \${network.chainId}\`);

  const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY!, provider);
  console.log(\`Deploying from: \${wallet.address} on Base mainnet\\n\`);

  const artifactPath = path.join(process.cwd(), "out", "Token.sol", "{{PROJECT_NAME}}Token.json");
  if (!fs.existsSync(artifactPath)) throw new Error("Run: forge build");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);

  const contract = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, wallet.address, INITIAL_SUPPLY);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(\`Token deployed: \${address}\`);
  console.log(\`Basescan: https://basescan.org/address/\${address}\`);
}

deploy().catch((err) => { console.error(err); process.exit(1); });
`,
    "README.md": `# {{PROJECT_NAME}}

ERC-20 token on Base with Foundry.

## Setup

\`\`\`bash
forge install OpenZeppelin/openzeppelin-contracts
cp .env.example .env
forge build
npm run deploy
\`\`\`

Built with [Blue Agent](https://blueagent.xyz) by [Blocky Studio](https://blocky.studio).
`,
  },
};

function scaffoldProject(type: TemplateType, name: string): string {
  const files = TEMPLATES[type];
  const projectDir = path.join(process.cwd(), name);
  const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, "-");

  if (fs.existsSync(projectDir)) {
    throw new Error(`Directory "${name}" already exists`);
  }

  const created: string[] = [];
  for (const [filePath, rawContent] of Object.entries(files)) {
    const content = rawContent.replace(/\{\{PROJECT_NAME\}\}/g, sanitized);
    const fullPath = path.join(projectDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    created.push(filePath);
  }

  return [
    `✅ Scaffolded ${type} project: ${name}/`,
    `   Files created:`,
    ...created.map((f) => `   • ${f}`),
    ``,
    `Next steps:`,
    `   cd ${name}`,
    `   cp .env.example .env`,
    `   npm install`,
  ].join("\n");
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const GROUNDED_TOOLS = [
  {
    name: "blue_idea",
    description: `Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan. Price: $${BLUE_AGENT_PRICING.idea} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Your idea or concept to develop" },
        model: { type: "string", description: "Bankr LLM model (optional)" },
      },
      required: ["prompt"],
    },
    task: "idea" as const,
  },
  {
    name: "blue_build",
    description: `Architecture, stack, folder structure, files, integrations, and test plan for a Base project. Price: $${BLUE_AGENT_PRICING.build} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to build — brief, spec, or requirements" },
        model: { type: "string", description: "Bankr LLM model (optional)" },
      },
      required: ["prompt"],
    },
    task: "build" as const,
  },
  {
    name: "blue_audit",
    description: `Security and product risk review — critical issues, suggested fixes, go/no-go recommendation. Price: $${BLUE_AGENT_PRICING.audit} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Code, contract, or system to audit" },
        model: { type: "string", description: "Bankr LLM model (optional)" },
      },
      required: ["prompt"],
    },
    task: "audit" as const,
  },
  {
    name: "blue_ship",
    description: `Deployment checklist, verification steps, release notes, and monitoring plan. Price: $${BLUE_AGENT_PRICING.ship} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What you're shipping — app, contract, or API" },
        model: { type: "string", description: "Bankr LLM model (optional)" },
      },
      required: ["prompt"],
    },
    task: "ship" as const,
  },
  {
    name: "blue_raise",
    description: `Pitch narrative — market framing, why this wins, traction, ask, target investors. Price: $${BLUE_AGENT_PRICING.raise} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Your project — what it is and what you're raising for" },
        model: { type: "string", description: "Bankr LLM model (optional)" },
      },
      required: ["prompt"],
    },
    task: "raise" as const,
  },
];

const ALL_TOOLS = [
  ...GROUNDED_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  {
    name: "blue_score",
    description:
      "Look up a builder's onchain score on Base — contributions, activity, and trust rank. Pass a GitHub handle, Farcaster handle, or wallet address.",
    inputSchema: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: "GitHub handle, Farcaster handle, or wallet address (0x…)",
        },
      },
      required: ["handle"],
    },
  },
  {
    name: "blue_new",
    description:
      "Scaffold a new Base project from a template. Creates project files in the current directory. Templates: base-agent (Bankr AI agent + x402), base-x402 (paid API service), base-token (ERC-20 + Foundry deploy).",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project directory name (e.g. my-agent)",
        },
        type: {
          type: "string",
          enum: ["base-agent", "base-x402", "base-token"],
          description: "Template type",
        },
      },
      required: ["name", "type"],
    },
  },
];

// ── Request handlers ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // blue_score
  if (name === "blue_score") {
    const { handle } = args as { handle: string };
    if (!handle) {
      return { content: [{ type: "text", text: "handle is required" }], isError: true };
    }
    try {
      const result = await fetchBuilderScore(handle);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }

  // blue_new
  if (name === "blue_new") {
    const { name: projectName, type } = args as { name: string; type: TemplateType };
    if (!projectName || !type) {
      return { content: [{ type: "text", text: "name and type are required" }], isError: true };
    }
    if (!TEMPLATES[type]) {
      return {
        content: [{ type: "text", text: `Unknown template type: ${type}. Use: base-agent | base-x402 | base-token` }],
        isError: true,
      };
    }
    try {
      const result = scaffoldProject(type, projectName);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }

  // Grounded LLM tools
  const tool = GROUNDED_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  const { prompt, model } = args as { prompt: string; model?: string };
  if (!prompt) {
    return { content: [{ type: "text", text: "prompt is required" }], isError: true };
  }

  try {
    const result = await callWithGrounding(tool.task, prompt, { model });
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Blue Agent MCP server running (v0.1.1)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
