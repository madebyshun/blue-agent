import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const PROTOCOL_VERSION = "2025-03-26";
const BASE_CHAIN_ID = 8453;
const BASE_NETWORK = "eip155:8453";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
const MCP_PAYMENT = "x402/payment";
const MCP_PAYMENT_RESPONSE = "x402/payment-response";

type JsonRpc = { jsonrpc: "2.0"; id?: number | string; result?: any; error?: { code: number; message: string } };
type PaymentRequirement = {
  scheme: "exact";
  network: string;
  asset: `0x${string}`;
  amount: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
};
type PaymentRequired = { x402Version: number; accepts?: PaymentRequirement[]; resource?: unknown; extensions?: unknown; error?: string };

export type PaidMcpConfig = { url?: string; privateKey: `0x${string}`; timeoutMs?: number; ttlSlackSeconds?: number };
export type PaidMcpResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };

function assertAddress(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid ${label}`);
}

function parsePaymentRequired(result: PaidMcpResult): PaymentRequired | null {
  if (!result.isError || !result.structuredContent || !Array.isArray(result.structuredContent.accepts)) return null;
  return result.structuredContent as PaymentRequired;
}

function validateRequirement(req: PaymentRequirement, ttlSlackSeconds: number): void {
  if (req.scheme !== "exact") throw new Error(`Unsupported x402 scheme: ${req.scheme}`);
  if (req.network !== BASE_NETWORK) throw new Error(`Refusing payment on ${req.network}; expected ${BASE_NETWORK}`);
  assertAddress(req.asset, "payment asset");
  if (req.asset.toLowerCase() !== BASE_USDC) throw new Error("Refusing payment for a non-Base-USDC asset");
  assertAddress(req.payTo, "payment recipient");
  if (!/^\d+$/.test(req.amount) || BigInt(req.amount) <= 0n) throw new Error("Invalid payment amount");
  if (!Number.isSafeInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds <= 0) throw new Error("Invalid payment timeout");
  if (ttlSlackSeconds < 0 || !Number.isSafeInteger(ttlSlackSeconds)) throw new Error("Invalid payment TTL slack");
}

async function signPayment(privateKey: `0x${string}`, req: PaymentRequirement, resource: unknown, ttlSlackSeconds: number) {
  validateRequirement(req, ttlSlackSeconds);
  const account = privateKeyToAccount(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: req.amount,
    validAfter: String(now - 60),
    validBefore: String(now + req.maxTimeoutSeconds + ttlSlackSeconds),
    nonce: `0x${randomBytes(32).toString("hex")}` as `0x${string}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: req.extra?.name ?? "USD Coin",
      version: req.extra?.version ?? "2",
      chainId: BASE_CHAIN_ID,
      verifyingContract: req.asset,
    },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization",
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  });
  return {
    x402Version: 2,
    accepted: req,
    resource,
    payload: { signature, authorization },
  };
}

export class PaidMcpClient {
  private readonly url: string;
  private readonly privateKey: `0x${string}`;
  private readonly timeoutMs: number;
  private readonly ttlSlackSeconds: number;
  private nextId = 1;

  constructor(config: PaidMcpConfig) {
    this.url = config.url ?? "https://blueagent.dev/api/mcp";
    this.privateKey = config.privateKey;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.ttlSlackSeconds = config.ttlSlackSeconds ?? 60;
    assertAddress(privateKeyToAccount(this.privateKey).address, "buyer wallet");
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<JsonRpc> {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await res.json().catch(() => null) as JsonRpc | null;
    if (!body) throw new Error(`MCP ${method} returned non-JSON HTTP ${res.status}`);
    if (body.error) throw new Error(`MCP ${method}: ${body.error.message}`);
    return body;
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "blueagent-x402-client", version: "0.2.0" },
    });
    await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  async listTools(): Promise<unknown[]> {
    const rpc = await this.rpc("tools/list");
    return Array.isArray(rpc.result?.tools) ? rpc.result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<PaidMcpResult> {
    const first = await this.rpc("tools/call", { name, arguments: args });
    const firstResult = first.result as PaidMcpResult | undefined;
    if (!firstResult) throw new Error("MCP tools/call returned no result");
    const required = parsePaymentRequired(firstResult);
    if (!required) return firstResult;
    const req = required.accepts?.[0];
    if (!req) throw new Error(`PaymentRequired for ${name} contained no accepted payment`);
    const payment = await signPayment(this.privateKey, req, required.resource, this.ttlSlackSeconds);
    const paid = await this.rpc("tools/call", {
      name,
      arguments: args,
      _meta: { [MCP_PAYMENT]: payment },
    });
    const result = paid.result as PaidMcpResult | undefined;
    if (!result) throw new Error("Paid MCP call returned no result");
    const receipt = result._meta?.[MCP_PAYMENT_RESPONSE] as { success?: boolean; transaction?: string | null } | undefined;
    if (result.isError || receipt?.success !== true) {
      throw new Error(`Paid MCP call failed: ${result.content?.map(c => c.text).filter(Boolean).join(" ") ?? "unknown error"}`);
    }
    return result;
  }

  get walletAddress(): string { return privateKeyToAccount(this.privateKey).address; }
}

export function paymentReceipt(result: PaidMcpResult): { success: boolean; transaction?: string | null; network?: string; payer?: string | null } | null {
  const receipt = result._meta?.[MCP_PAYMENT_RESPONSE] as { success?: boolean; transaction?: string | null; network?: string; payer?: string | null } | undefined;
  return receipt?.success === true ? { success: true, transaction: receipt.transaction, network: receipt.network, payer: receipt.payer } : null;
}

export function parseMcpJsonLine(line: string): { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown> } {
  const value = JSON.parse(line) as { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> };
  if (value.jsonrpc !== "2.0" || typeof value.method !== "string") throw new Error("Invalid MCP JSON-RPC request");
  return value as { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };
}
