/**
 * base-stock-quote's buy_impact is published only when the Aerodrome quote
 * covered the deepest pool. Measured 2026-11-12: the deep NVDAc/USDC pool sits
 * on a CL factory our Quoter cannot read, and the thin pools it could read
 * gave +14.45% on $10k vs ~0.05% on base.org. Auto-discovered.
 */
import { buyImpactCoverage } from "../src/lib/aerodrome-swap";

let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };
const DEEP = "0xF668E21993F0ACD7AB00BB1CFBAED0DF28A3C8EC";
const THIN = "0x853f5f1b92b16714fe6cda67caad0856b83c7ab9";

ok("deepest pool quoted (case-insensitive) → published", buyImpactCoverage({ pools_quoted: [THIN, DEEP.toLowerCase()] }, { address: DEEP }).ok);
const miss = buyImpactCoverage({ pools_quoted: [THIN] }, { address: DEEP, dex: "aero-slipstream-base", liquidityUsd: 1676844 });
ok("deepest pool NOT quoted → unknown", !miss.ok);
ok("reason names the deepest pool and its liquidity", !miss.ok && miss.reason.includes(DEEP) && miss.reason.includes("1,676,844"));
ok("no deepest pool known → unknown, never trusted", !buyImpactCoverage({ pools_quoted: [THIN] }, null).ok);
ok("no quote → unknown", !buyImpactCoverage(null, { address: DEEP }).ok);

if (failed) { console.log(`buy-impact-coverage-test: ${failed} FAILED`); process.exit(1); }
console.log("buy-impact-coverage-test: all passed");
