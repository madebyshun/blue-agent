/**
 * Aerodrome pool choice: the pool is picked by the QUOTE at the real size, not
 * by in-range liquidity. Measured 2026-11-05: on LIc / INFYc / HSAIc the
 * liquidity()-chosen pool sometimes held its liquidity in a sliver of range, so
 * every size bought what $100 did ("+900%") and swap_prepare would have built
 * the trade there. pickBestQuote is pure; this pins its rules. Auto-discovered.
 */
import { pickBestQuote, type PoolQuote } from "../src/lib/aerodrome-swap";

let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };
const q = (pool: string, out: bigint, full = true): PoolQuote => ({ pool: pool as `0x${string}`, tickSpacing: 1, out, full });

ok("the most output wins", pickBestQuote([q("0xa", 5n), q("0xb", 81n), q("0xc", 40n)])?.pool === "0xb");
ok("a partial fill never wins, however large", pickBestQuote([q("0xa", 900n, false), q("0xb", 81n)])?.pool === "0xb");
ok("only partial fills: no pool", pickBestQuote([q("0xa", 900n, false)]) === null);
ok("failed quotes (null) are skipped", pickBestQuote([null, q("0xb", 3n), null])?.pool === "0xb");
ok("zero output never wins", pickBestQuote([q("0xa", 0n)]) === null);
ok("nothing quoted: no pool", pickBestQuote([]) === null);

if (failed) { console.log(`aero-best-quote-test: ${failed} FAILED`); process.exit(1); }
console.log("aero-best-quote-test: all passed");
