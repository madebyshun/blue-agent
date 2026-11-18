// /markets sparkline store: one point per hour, newest 24 kept.
import { addPoint, KEEP } from "../src/lib/markets-sparks";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

const t0 = new Date("2026-11-19T10:05:00Z");
let s = addPoint(undefined, t0, 100);
s = addPoint(s, new Date("2026-11-19T10:50:00Z"), 101);
check("same hour keeps one point, the latest read", s.length === 1 && s[0][1] === 101);
s = addPoint(s, new Date("2026-11-19T11:01:00Z"), 102);
check("next hour adds a point, in order", s.length === 2 && s[1][1] === 102 && s[0][0] < s[1][0]);
for (let h = 0; h < 40; h++) s = addPoint(s, new Date(Date.parse("2026-11-19T12:00:00Z") + h * 3_600_000), 200 + h);
check(`keeps only the newest ${KEEP}`, s.length === KEEP && s[KEEP - 1][1] === 239);
console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
