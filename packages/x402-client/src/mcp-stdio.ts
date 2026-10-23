#!/usr/bin/env node
import { createInterface } from "node:readline";
import { PaidMcpClient, paymentReceipt, parseMcpJsonLine } from "./mcp";

const key = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("blueagent-x402-mcp: set BUYER_PRIVATE_KEY to a dedicated demo wallet before starting");
  process.exit(1);
}

const client = new PaidMcpClient({
  privateKey: key,
  url: process.env.BLUEAGENT_MCP_URL,
});

function send(id: number | string | undefined, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), result })}\n`);
}

function sendError(id: number | string | undefined, message: string): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), error: { code: -32000, message } })}\n`);
}

async function handle(line: string): Promise<void> {
  const request = parseMcpJsonLine(line);
  if (request.method === "notifications/initialized") return;
  if (request.method === "initialize") {
    send(request.id, {
      protocolVersion: "2025-03-26",
      capabilities: {},
      serverInfo: { name: "Blue Agent x402 MCP bridge", version: "0.2.0" },
    });
    return;
  }
  if (request.method === "tools/list") {
    await client.initialize();
    send(request.id, { tools: await client.listTools() });
    return;
  }
  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments && typeof params.arguments === "object"
      ? params.arguments as Record<string, unknown>
      : {};
    if (!name) throw new Error("tools/call requires name");
    await client.initialize();
    const result = await client.callTool(name, args);
    const receipt = paymentReceipt(result);
    if (receipt) {
      const tx = receipt.transaction ? ` https://basescan.org/tx/${receipt.transaction}` : "";
      console.error(`blueagent-x402-mcp: settled ${name} for ${receipt.network ?? "Base"}${tx}`);
    }
    send(request.id, result);
    return;
  }
  throw new Error(`Unsupported MCP method: ${request.method}`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  void handle(line).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`blueagent-x402-mcp: ${message}`);
    let id: number | string | undefined;
    try { id = JSON.parse(line).id as number | string | undefined; } catch { /* malformed input has no id */ }
    sendError(id, message);
  });
});
