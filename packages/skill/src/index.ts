#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callWithGrounding, BLUE_AGENT_PRICING } from "@blueagent/core";

const server = new Server(
  { name: "blueagent-skill", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "blue_idea",
    description: `Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan. Price: $${BLUE_AGENT_PRICING.idea} USDC.`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Your idea or concept to develop" },
        model: { type: "string", description: "Bankr LLM model (optional, default: claude-haiku-4-5)" },
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = TOOLS.find((t) => t.name === name);

  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const { prompt, model } = args as { prompt: string; model?: string };

  if (!prompt) {
    return {
      content: [{ type: "text", text: "prompt is required" }],
      isError: true,
    };
  }

  try {
    const result = await callWithGrounding(tool.task, prompt, { model });
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Blue Agent MCP server running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
