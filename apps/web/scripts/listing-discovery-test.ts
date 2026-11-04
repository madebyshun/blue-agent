/**
 * discoveryCandidates (lib/hub/listings.ts): which services a seller's
 * /.well-known/x402 offers for Sell services. Issue #518: Skavio's doc lists
 * them under `resources` (x402 v2 well-known), not `items`, and every one was
 * dropped, so a seller with seven live Base services could not be listed.
 * Hermetic. Auto-discovered by `npm test` via the `-test.ts` suffix.
 */
import { discoveryCandidates } from "../src/lib/hub/listings";

const W = "0x62bb64e9ab0e8104def0d7845223580319d4c139";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const acc = (payTo: string, network = "eip155:8453") => [{ scheme: "exact", network, amount: "20000", asset: USDC, payTo }];
let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };

const v2 = discoveryCandidates({ x402Version: 2, resources: [
  { resource: "https://getskavio.com/x402/v1/usdc/verify?tx_hash=0x1", method: "GET", accepts: acc("0x62BB64E9Ab0E8104dEf0D7845223580319d4C139") },
  { resource: "https://getskavio.com/x402/v1/web/search", method: "POST", accepts: acc(W) },
] }, W, "getskavio.com");
ok("reads `resources` (x402 v2 well-known)", v2.length === 2);
ok("keeps the doc's method", v2[0].method === "GET" && v2[1].method === "POST");
ok("price from accepts.amount, 6 decimals", v2[0].priceUsd === 0.02);

ok("reads `items` (Bazaar shape)", discoveryCandidates({ items: [{ resource: "https://a.example.com/x", accepts: acc(W) }] }, W, "a.example.com").length === 1);
ok("no accepts: still a candidate, the probe decides", discoveryCandidates({ resources: [{ resource: "https://a.example.com/x" }] }, W, "a.example.com")[0]?.priceUsd === null);
ok("accepts for another wallet: dropped", discoveryCandidates({ resources: [{ resource: "https://a.example.com/x", accepts: acc("0x0000000000000000000000000000000000000001") }] }, W, "a.example.com").length === 0);
ok("accepts on another chain only: dropped", discoveryCandidates({ resources: [{ resource: "https://a.example.com/x", accepts: acc(W, "eip155:1") }] }, W, "a.example.com").length === 0);
ok("another domain: dropped", discoveryCandidates({ resources: [{ resource: "https://evil.com/x", accepts: acc(W) }] }, W, "a.example.com").length === 0);
ok("subdomain of the claimed domain: kept", discoveryCandidates({ resources: [{ resource: "https://api.a.example.com/x", accepts: acc(W) }] }, W, "a.example.com").length === 1);
ok("http (not https): dropped", discoveryCandidates({ resources: [{ resource: "http://a.example.com/x", accepts: acc(W) }] }, W, "a.example.com").length === 0);
ok("same url in both lists: once", discoveryCandidates({ items: [{ resource: "https://a.example.com/x", accepts: acc(W) }], resources: [{ resource: "https://a.example.com/x", accepts: acc(W) }] }, W, "a.example.com").length === 1);
ok("at most 12", discoveryCandidates({ resources: Array.from({ length: 20 }, (_, i) => ({ resource: `https://a.example.com/${i}`, accepts: acc(W) })) }, W, "a.example.com").length === 12);
ok("garbage doc: none, no throw", discoveryCandidates(null, W, "a.example.com").length === 0 && discoveryCandidates({ resources: "x" }, W, "a.example.com").length === 0);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("listing-discovery-test: all passed");
