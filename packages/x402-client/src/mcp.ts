import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const PROTOCOL_VERSION = "2025-03-26";
const BASE_CHAIN_ID = 8453;
const BASE_NETWORK = "eip155:8453";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
const MCP_PAYMENT = "x402/payment";
const MCP_PAYMENT_RESPONSE = "x402/payment-response";

type JsonRpc = { jsonrpc: "2.0"; id?: number | string; result?: any; error?: { code: number; message: string } };
export type PaymentRequirement = {
  scheme: "exact";
  network: string;
  asset: `0x${string}`;
  amount: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
};
type PaymentRequired = { x402Version: number; accepts?: PaymentRequirement[]; resource?: unknown; extensions?: unknown; error?: string };

/**
 * `privateKey` absent = read-only: free tools run, paid tools return their
 * PaymentRequired untouched and nothing is signed. `maxPerCallAtomic` and
 * `budgetAtomic` (USDC, 6 decimals) are enforced BEFORE signing: a quote above
 * either is refused and nothing is paid.
 */
export type PaidMcpConfig = { url?: string; privateKey?: `0x${string}`; timeoutMs?: number; ttlSlackSeconds?: number; maxPerCallAtomic?: bigint; budgetAtomic?: bigint };
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

export async function signPayment(privateKey: `0x${string}`, req: PaymentRequirement, resource: unknown, ttlSlackSeconds: number) {
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

const fmt = (atomic: bigint) => { const v = Number(atomic) / 1e6; return `$${v > 0 && v < 0.01 ? v.toFixed(3) : v.toFixed(2)}`; };

export class PaidMcpClient {
  private readonly url: string;
  private readonly privateKey: `0x${string}` | null;
  private readonly maxPerCall: bigint;
  private readonly budget: bigint;
  private spent = 0n;
  private readonly timeoutMs: number;
  private readonly ttlSlackSeconds: number;
  private nextId = 1;

  constructor(config: PaidMcpConfig) {
    this.url = config.url ?? "https://blueagent.dev/api/mcp";
    this.privateKey = config.privateKey ?? null;
    this.maxPerCall = config.maxPerCallAtomic ?? 50_000n;      // $0.05
    this.budget = config.budgetAtomic ?? 1_000_000n;           // $1.00 per process
    // 120s, the MCP route's maxDuration. It was 30s until 0.3.2, and a paid call
    // that ran longer (verify + run + settle) was abandoned AFTER the server had
    // settled: the buyer paid and got nothing (measured 2026-11-05, $0.03).
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.ttlSlackSeconds = config.ttlSlackSeconds ?? 60;
    if (this.privateKey) assertAddress(privateKeyToAccount(this.privateKey).address, "buyer wallet");
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<JsonRpc> {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    let readErr = "";
    const body = await res.json().catch((e: unknown) => { readErr = e instanceof Error ? `${e.name}: ${e.message}` : String(e); return null; }) as JsonRpc | null;
    if (!body) {
      const paid = !!(params as { _meta?: Record<string, unknown> })._meta?.[MCP_PAYMENT];
      throw new Error(`MCP ${method} returned HTTP ${res.status} but its body could not be read${readErr ? ` (${readErr})` : ""}.` +
        (paid ? " A payment was attached: the server may have settled it. Check the payer's USDC transfers on Base before retrying." : ""));
    }
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
    // Read-only: hand back the price, sign nothing.
    if (!this.privateKey) return firstResult;
    const req = required.accepts?.[0];
    if (!req) throw new Error(`PaymentRequired for ${name} contained no accepted payment`);
    const amount = /^\d+$/.test(req.amount) ? BigInt(req.amount) : -1n;
    if (amount < 0n) throw new Error(`PaymentRequired for ${name} has an invalid amount; nothing was paid`);
    if (amount > this.maxPerCall) throw new Error(`${name} costs ${fmt(amount)}, above the per-call cap of ${fmt(this.maxPerCall)}; nothing was paid`);
    if (this.spent + amount > this.budget) throw new Error(`${name} costs ${fmt(amount)}; ${fmt(this.budget - this.spent)} of the ${fmt(this.budget)} budget is left; nothing was paid`);
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
    this.spent += amount;
    return result;
  }

  get walletAddress(): string | null { return this.privateKey ? privateKeyToAccount(this.privateKey).address : null; }
  get spentAtomic(): bigint { return this.spent; }
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
