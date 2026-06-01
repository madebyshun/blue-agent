/**
 * X402Client — wraps fetch with automatic x402 payment handling
 * Works with Blue Hub and any x402 v2 compatible endpoint
 */
import { privateKeyToAccount }    from "viem/accounts";
import { buildPaymentHeader }     from "./signer";
import type {
  X402ClientConfig,
  X402PaymentRequired,
  CallOptions,
  CallResult,
  PricingManifest,
} from "./types";

const BLUE_HUB_BASE    = "https://blueagent.dev";
const PRICING_ENDPOINT = `${BLUE_HUB_BASE}/.well-known/pricing`;

export class X402Client {
  private privateKey:  `0x${string}`;
  private rpcUrl:      string;
  private ttl:         number;
  private address:     string;

  constructor(config: X402ClientConfig) {
    const pk = config.privateKey.startsWith("0x")
      ? config.privateKey
      : (`0x${config.privateKey}` as `0x${string}`);

    this.privateKey = pk as `0x${string}`;
    this.rpcUrl     = config.rpcUrl ?? "https://mainnet.base.org";
    this.ttl        = config.ttl    ?? 300;
    this.address    = privateKeyToAccount(this.privateKey).address;
  }

  // ── Core: call any x402 endpoint ────────────────────────────────────────────

  async call<T = unknown>(
    endpoint: string,
    options:  CallOptions = {},
  ): Promise<CallResult<T>> {
    const { body = {}, headers: extraHeaders = {} } = options;

    // Step 1 — probe: get 402 with payment requirements
    const probe = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body:    JSON.stringify(body),
    });

    if (probe.status !== 402) {
      // Already 200 (free tool) or unexpected error
      if (probe.ok) {
        const data = await probe.json() as T;
        return { data, toolId: this._toolId(endpoint), pricePaid: "$0.00", amountPaid: "0" };
      }
      const err = await probe.text();
      throw new Error(`Unexpected ${probe.status}: ${err}`);
    }

    // Step 2 — parse payment requirements from header
    const rawHeader = probe.headers.get("X-Payment-Requirements")
      ?? probe.headers.get("x-payment-requirements");

    if (!rawHeader) {
      throw new Error("402 response missing X-Payment-Requirements header");
    }

    const requirements: X402PaymentRequired = JSON.parse(
      Buffer.from(rawHeader, "base64").toString("utf-8"),
    );

    // Pick first accepted option (Blue Hub uses exact/eip155:8453)
    const option = requirements.accepts?.[0];
    if (!option) throw new Error("No payment option in requirements");

    // Step 3 — sign EIP-3009 TransferWithAuthorization
    const paymentHeader = await buildPaymentHeader(this.privateKey, option, this.ttl);

    // Step 4 — retry with X-Payment header
    const paid = await fetch(endpoint, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment":    paymentHeader,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!paid.ok) {
      const err = await paid.text();
      throw new Error(`Payment failed (${paid.status}): ${err}`);
    }

    const data = await paid.json() as T;

    // Extract settlement info from response header if present
    const paymentResponse = paid.headers.get("X-Payment-Response")
      ?? paid.headers.get("x-payment-response");
    let txSettled: string | undefined;
    if (paymentResponse) {
      try {
        const pr = JSON.parse(Buffer.from(paymentResponse, "base64").toString("utf-8")) as { txHash?: string };
        txSettled = pr.txHash;
      } catch { /* optional */ }
    }

    const priceUSD = this._formatPrice(option.maxAmountRequired);

    return {
      data,
      toolId:     this._toolId(endpoint),
      pricePaid:  priceUSD,
      amountPaid: option.maxAmountRequired,
      txSettled,
    };
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
  async idea(prompt: string) {
    return this.hub("blue-idea", { prompt });
  }

  /** blue build — architecture + stack ($0.50) */
  async build(prompt: string) {
    return this.hub("blue-build", { prompt });
  }

  /** blue audit — smart contract security review ($1.00) */
  async audit(prompt: string) {
    return this.hub("blue-audit", { prompt });
  }

  /** blue ship — deployment checklist ($0.10) */
  async ship(prompt: string) {
    return this.hub("blue-ship", { prompt });
  }

  /** blue raise — investor pitch narrative ($0.20) */
  async raise(prompt: string) {
    return this.hub("blue-raise", { prompt });
  }

  /** token pick signal — asymmetric Base token pick ($0.25) */
  async tokenPick(context?: string) {
    return this.hub("token-pick-signal", context ? { context } : {});
  }

  /** narrative position — CT narrative tracker ($0.20) */
  async narrative(focus?: string) {
    return this.hub("narrative-position", focus ? { focus } : {});
  }

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
