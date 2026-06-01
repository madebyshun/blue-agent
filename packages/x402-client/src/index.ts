export { X402Client }                    from "./client";
export type {
  X402ClientConfig,
  CallOptions,
  CallResult,
  PricingManifest,
  PricingRoute,
  X402PaymentRequired,
  PaymentOption,
  X402Payment,
  X402Authorization,
}                                        from "./types";

// ── Convenience factory ──────────────────────────────────────────────────────

import { X402Client } from "./client";
import type { X402ClientConfig } from "./types";

/**
 * Create an x402 client for Blue Hub
 *
 * @example
 * const client = createX402Client({ privateKey: "0x..." })
 * const result = await client.tokenPick()
 * console.log(result.data, result.pricePaid)
 */
export function createX402Client(config: X402ClientConfig): X402Client {
  return new X402Client(config);
}
