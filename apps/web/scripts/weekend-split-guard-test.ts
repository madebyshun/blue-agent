// Weekend scorecard: a pool and oracle on different share bases are not graded (SNDKc 2026-11-20).
import { comparable, summarize, MAX_COMPARABLE_MOVE_PCT } from "../src/lib/weekend/scorecard";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

check("SNDKc +722% (split on one side) is not comparable", !comparable({ weekend_move_pct: 721.9266 }));
check("NVDAc +2.96% is comparable", comparable({ weekend_move_pct: 2.9556 }));
check(`boundary ${MAX_COMPARABLE_MOVE_PCT}% still comparable`, comparable({ weekend_move_pct: -MAX_COMPARABLE_MOVE_PCT }));
const row = (t: string, m: number, hit: boolean) => ({ ticker: t, token: "0x", close_usd: 1, close_round_at: 0, dex_usd: 1, weekend_move_pct: m, call: "UP" as const, open_usd: 1, open_round_at: 0, open_source: "archive" as const, open_gap_pct: 1, hit, dex_error_pct: 1, flat_error_pct: 2 });
const s = summarize([{ friday: "2026-11-20", rows: [row("NVDA", 2.9, true), row("SNDK", 721.9, true)] } as never]);
check("summary ignores the split row", s.calls === 1 && s.hits === 1 && s.by_size.find((b) => b.bucket === "≥2%")!.calls === 1);
console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
