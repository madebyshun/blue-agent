/** Fixes from the 2026-11-13 Hood audit: market-aware feed staleness (b20-quote). No network. */
import { closedSecondsWithin, feedStaleMarketAware } from "../src/lib/base-stocks/b20-quote";
let failed = 0, passed = 0;
const check = (n: string, ok: boolean) => { if (ok) { passed++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n}`); } };
const HB = 86_400;
// Monday 2026-11-09 01:00 UTC; feed last updated Friday 2026-11-06 ~23:00 UTC (50 h).
const mon = new Date("2026-11-09T01:00:00Z");
check("a 50 h weekend gap is not stale", !feedStaleMarketAware(50 * 3600, HB, mon));
// Fri 18:00 ET -> Sun 20:00 ET: the New York weekend days inside it are Sat 00:00 -> Sun 20:00 ET = 44 h.
check("the closed hours of a weekend are the New York weekend hours (44 h)", closedSecondsWithin(50 * 3600, mon) === 44 * 3600);
// Wednesday 2026-11-11 18:00 UTC; same 50 h gap on weekdays.
const wed = new Date("2026-11-11T18:00:00Z");
check("a 50 h gap on weekdays is stale", feedStaleMarketAware(50 * 3600, HB, wed));
check("inside 2x heartbeat is never stale", !feedStaleMarketAware(47 * 3600, HB, wed));
check("past a week is stale whatever the calendar", feedStaleMarketAware(8 * 86_400, HB, mon));
// Friday 2026-11-27 (Thanksgiving Thursday 26th closed): 72 h back from Saturday noon spans the holiday + weekend start.
const sat = new Date("2026-11-28T12:00:00Z");
// Thanksgiving (24 h) + Saturday 00:00 -> 07:00 ET (7 h) = 31 h.
check("a holiday counts as closed (Thanksgiving 24 h + 7 h of Saturday)", closedSecondsWithin(72 * 3600, sat) === 31 * 3600);
console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
