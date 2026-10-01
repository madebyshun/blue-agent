/**
 * Keyless Base RPCs in fallback order, overridable by BASE_RPC_URLS (comma
 * list) or BASE_RPC_URL. Moved here from lib/robinhood/rwa-price.ts on
 * 2026-10-01 so the launchpad resolver shares it: mainnet.base.org alone
 * rate-limited a five-probe token lookup into "could not be read".
 */
// Reliable keyless Base RPCs, in fallback order. Verified 2026-08-23 to serve
// contract reads (NVDA `multiplier()` → 1e18). `base.llamarpc.com` (CF 521) and
// `base.meowrpc.com` (eth_call disabled) were rejected during that check.
const DEFAULT_BASE_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
  "https://1rpc.io/base",
];
export function baseRpcUrls(): string[] {
  const env =
    (typeof process !== "undefined" &&
      (process.env.BASE_RPC_URLS || process.env.BASE_RPC_URL)) ||
    "";
  const fromEnv = env.split(",").map((s) => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_BASE_RPCS;
}
