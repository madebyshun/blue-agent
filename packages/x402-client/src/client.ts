/**
 * X402Client — wraps fetch with automatic x402 payment handling
 * Works with Blue Hub and any x402 endpoint that takes USDC on Base, v1 or v2:
 * reads PAYMENT-REQUIRED (v2) or X-Payment-Requirements (v1) or the 402 body,
 * pays `amount` (v2) or `maxAmountRequired` (v1), retries with PAYMENT-SIGNATURE
 * and X-PAYMENT, and reads PAYMENT-RESPONSE or X-Payment-Response (issue #446).
 */
import { privateKeyToAccount }    from "viem/accounts";
import { buildPaymentHeader }     from "./signer";
import { signPayment }            from "./mcp";
import { AgentBudget, DEFAULT_AGENT } from "./budget";
import type {
  X402ClientConfig,
  PaymentOption,
  CallOptions,
  CallResult,
  PricingManifest,
} from "./types";

const BLUE_HUB_BASE    = "https://blueagent.dev";
const BASE_NETWORK     = "eip155:8453";
const BASE_USDC        = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

type Requirements = { x402Version: number; accepts: PaymentOption[]; resource?: unknown };

const decode = (h: string): unknown => JSON.parse(Buffer.from(h, "base64").toString("utf-8"));

/** The 402's payment requirements, from whichever place the seller put them. */
export async function readRequirements(res: Response): Promise<Requirements> {
  const fromHeader = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("X-Payment-Requirements");
  let raw: unknown = null;
  if (fromHeader) { try { raw = decode(fromHeader); } catch { /* fall through to the body */ } }
  if (!raw || !Array.isArray((raw as Requirements).accepts)) raw = await res.json().catch(() => null);
  const r = raw as Partial<Requirements> | null;
  if (!r || !Array.isArray(r.accepts) || !r.accepts.length) throw new Error("402 response has no payment requirements (PAYMENT-REQUIRED header or body); nothing was paid");
  return { x402Version: Number(r.x402Version ?? 1), accepts: r.accepts, resource: r.resource };
}
const PRICING_ENDPOINT = `${BLUE_HUB_BASE}/.well-known/pricing`;

export class X402Client {
  private privateKey:  `0x${string}`;
  private rpcUrl:      string;
  private ttl:         number;
  private address:     string;
  private maxPerCall?: bigint;
  /** Budgets and loop guard; always present (default: loop guard only). */
  readonly budget: AgentBudget;

  constructor(config: X402ClientConfig) {
    const pk = config.privateKey.startsWith("0x")
      ? config.privateKey
      : (`0x${config.privateKey}` as `0x${string}`);

    this.privateKey = pk as `0x${string}`;
    this.rpcUrl     = config.rpcUrl ?? "https://mainnet.base.org";
    this.ttl        = config.ttl    ?? 300;
    this.address    = privateKeyToAccount(this.privateKey).address;
    this.maxPerCall = config.maxPerCallAtomic;
    this.budget     = new AgentBudget(config.budget);
  }

  // ── Core: call any x402 endpoint ────────────────────────────────────────────

  async call<T = unknown>(
    endpoint: string,
    options:  CallOptions = {},
  ): Promise<CallResult<T>> {
    const { body = {}, headers: extraHeaders = {} } = options;

    const method = options.method ?? "POST";
    const agent = options.agent ?? DEFAULT_AGENT;
    // Loop guard first, for every call: a retry storm is stopped before even the probe.
    this.budget.checkLoop(agent, `${method} ${endpoint} ${method === "GET" ? "" : JSON.stringify(body)}`);
    const send = (payHeaders: Record<string, string> = {}) => fetch(endpoint, method === "GET"
      ? { method, headers: { ...extraHeaders, ...payHeaders } }
      : { method, headers: { "Content-Type": "application/json", ...extraHeaders, ...payHeaders }, body: JSON.stringify(body) });

    // Step 1 — probe: get 402 with payment requirements
    const probe = await send();

    if (probe.status !== 402) {
      // Already 200 (free tool) or unexpected error
      if (probe.ok) {
        const data = await probe.json() as T;
        return { data, toolId: this._toolId(endpoint), pricePaid: "$0.00", amountPaid: "0" };
      }
      const err = await probe.text();
      throw new Error(`Unexpected ${probe.status}: ${err}`);
    }

    // Step 2 — payment requirements: x402 v2 `PAYMENT-REQUIRED` header, the legacy
    // `X-Payment-Requirements` header, or the 402 body (issue #446).
    const requirements = await readRequirements(probe);

    // A Base USDC `exact` option: the only thing this signer can pay. v2 names the
    // amount `amount`; v1 named it `maxAmountRequired`.
    const option = requirements.accepts.find((o) =>
      o.scheme === "exact" && (o.network === BASE_NETWORK || o.network === "base") &&
      String(o.asset ?? "").toLowerCase() === BASE_USDC);
    if (!option) throw new Error("No USDC-on-Base payment option in the 402; nothing was paid");
    const amount = String(option.amount ?? option.maxAmountRequired ?? "");
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error("Invalid payment amount in the 402; nothing was paid");
    if (this.maxPerCall !== undefined && BigInt(amount) > this.maxPerCall) {
      throw new Error(`${endpoint} costs ${this._formatPrice(amount)}, above the per-call cap of ${this._formatPrice(String(this.maxPerCall))}; nothing was paid`);
    }

    // Budgets: reserve before signing; kept only if the seller answers 2xx.
    const hold = this.budget.reserve(agent, BigInt(amount), endpoint);
    try {

    // Step 3 — sign EIP-3009 TransferWithAuthorization, in the version the seller speaks.
    const paymentHeader = requirements.x402Version >= 2
      ? Buffer.from(JSON.stringify(await signPayment(this.privateKey, {
          scheme: "exact", network: BASE_NETWORK, asset: option.asset as `0x${string}`, amount,
          payTo: option.payTo as `0x${string}`, maxTimeoutSeconds: option.maxTimeoutSeconds ?? this.ttl,
          extra: option.extra as { name?: string; version?: string } | undefined,
        }, requirements.resource, 60))).toString("base64")
      : await buildPaymentHeader(this.privateKey, { ...option, maxAmountRequired: amount }, this.ttl);

    // Step 4 — retry. v2 sellers read PAYMENT-SIGNATURE, v1 sellers (and Blue Hub) X-PAYMENT;
    // the value is the same base64 payload, so both are sent.
    const paid = await send({ "PAYMENT-SIGNATURE": paymentHeader, "X-PAYMENT": paymentHeader });

    if (!paid.ok) {
      const err = await paid.text();
      throw new Error(`Payment failed (${paid.status}): ${err}`);
    }
    hold.commit();

    const data = await paid.json() as T;

    // Settlement receipt: v2 `PAYMENT-RESPONSE` ({ transaction }), v1 `X-Payment-Response`.
    const paymentResponse = paid.headers.get("PAYMENT-RESPONSE") ?? paid.headers.get("X-Payment-Response");
    let txSettled: string | undefined;
    if (paymentResponse) {
      try {
        const pr = JSON.parse(Buffer.from(paymentResponse, "base64").toString("utf-8")) as { transaction?: string; txHash?: string };
        txSettled = pr.transaction ?? pr.txHash;
      } catch { /* optional */ }
    }

    return {
      data,
      toolId:     this._toolId(endpoint),
      pricePaid:  this._formatPrice(amount),
      amountPaid: amount,
      txSettled,
    };
    } finally {
      hold.release(); // no-op once committed
    }
  }

  // ── Blue Hub shortcuts ───────────────────────────────────────────────────────

  /** Call any Blue Hub tool by ID */
  async hub<T = unknown>(
    toolId:  string,
    inputs:  Record<string, string>,
    options: Omit<CallOptions, "body"> = {},
  ): Promise<CallResult<T>> {
    return this.call<T>(`${BLUE_HUB_BASE}/api/x402/${toolId}`, {
      ...options,
      body: inputs,
    });
  }

  /** blue idea — fundable brief from rough concept ($0.05) */
  /** blue build — architecture + stack ($0.50) */
  /** blue audit — smart contract security review ($1.00) */
  /** blue ship — deployment checklist ($0.10) */
  /** blue raise — investor pitch narrative ($0.20) */
  /** token pick signal — asymmetric Base token pick ($0.25) */
  /** narrative position — CT narrative tracker ($0.20) */
  // ── Pricing discovery ────────────────────────────────────────────────────────

  /** Fetch the machine-readable pricing manifest */
  async pricing(): Promise<PricingManifest> {
    const res = await fetch(PRICING_ENDPOINT);
    if (!res.ok) throw new Error(`Pricing fetch failed: ${res.status}`);
    return res.json() as Promise<PricingManifest>;
  }

  /** Get price for a specific tool ID */
  async priceOf(toolId: string): Promise<{ priceUSD: string | null; amountRequired: string } | null> {
    const manifest = await this.pricing();
    const route = manifest.routes.find(r => r.path.endsWith(`/${toolId}`));
    if (!route) return null;
    return { priceUSD: route.priceUSD, amountRequired: route.maxAmountRequired };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  get walletAddress() { return this.address; }

  private _toolId(endpoint: string): string {
    return endpoint.split("/").pop() ?? endpoint;
  }

  private _formatPrice(rawUnits: string): string {
    const usd = parseInt(rawUnits) / 1_000_000;
    return `$${usd.toFixed(2)}`;
  }
}
