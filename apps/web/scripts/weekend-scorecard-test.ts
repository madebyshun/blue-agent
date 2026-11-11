/**
 * Weekend scorecard + diary: the pure rules (lib/weekend/*). No network.
 * Pins: DST-correct NY open, Friday labelling, the 0.5% FLAT gate, exclusion
 * of a weekend-moved oracle, per-ticker open search (holiday → next day),
 * the publication gate, and paper P&L sign for LONG / SHORT.
 */
import { buildCall, direction, findOpens, fridayOf, gradeRow, nyOpenUtc, summarize, MIN_CALLS, type GradedWeekend } from "../src/lib/weekend/scorecard";
import { positionsFor, settle, type DiaryEntry } from "../src/lib/weekend/diary";
import type { SeriesPoint } from "../src/lib/blue-hood/types";

let failed = 0, passed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

check("NY open under EDT is 13:30 UTC", nyOpenUtc("2026-10-26").toISOString() === "2026-10-26T13:30:00.000Z");
check("NY open under EST is 14:30 UTC", nyOpenUtc("2026-11-09").toISOString() === "2026-11-09T14:30:00.000Z");
check("Sunday belongs to the Friday before", fridayOf(new Date("2026-11-08T22:10:00Z")) === "2026-11-06");
check("Tuesday still labels the previous Friday", fridayOf(new Date("2026-11-10T15:00:00Z")) === "2026-11-06");
check("Friday labels itself", fridayOf(new Date("2026-11-13T23:00:00Z")) === "2026-11-13");
check("0.49% is FLAT, 0.5% is a call", direction(0.49) === "FLAT" && direction(0.5) === "UP" && direction(-0.7) === "DOWN");

const fri = "2026-11-06";
const frozen = Date.parse("2026-11-07T00:55:00Z") / 1000;
const c = buildCall(fri, "2026-11-08T22:00:46Z", [
  { ticker: "NVDA", oracle_usd: 100, dex_usd: 98, oracle_updated_at: frozen },
  { ticker: "META", oracle_usd: 100, dex_usd: 100.2, oracle_updated_at: frozen },
  { ticker: "AAPL", oracle_usd: 100, dex_usd: 101, oracle_updated_at: Date.parse("2026-11-08T12:00:00Z") / 1000 },
  { ticker: "MSFT", oracle_usd: null, dex_usd: 101, oracle_updated_at: frozen },
], "archive");
check("call: DOWN for −2%", c.rows.find((r) => r.ticker === "NVDA")?.call === "DOWN");
check("call: FLAT for +0.2%", c.rows.find((r) => r.ticker === "META")?.call === "FLAT");
check("an oracle that moved over the weekend is excluded", !c.rows.some((r) => r.ticker === "AAPL") && c.excluded.some((e) => e.ticker === "AAPL" && /weekend/.test(e.reason)));
check("a missing price is excluded, not zero-filled", c.excluded.some((e) => e.ticker === "MSFT"));

const pt = (hour: string, session: SeriesPoint["session"], rows: { t: string; usd: number; at: string }[]): SeriesPoint => ({
  hour, at: `${hour.slice(0, 4)}-${hour.slice(4, 6)}-${hour.slice(6, 8)}T${hour.slice(8)}:00:46Z`, is_open: session === "regular", session,
  rows: rows.map((r) => ({ ticker: r.t, oracle_usd: r.usd, dex_usd: r.usd, drift_pct: 0, total_tvl_usd: null, oracle_updated_at: Date.parse(r.at) / 1000 })),
});
const pts = [
  pt("2026110914", "premarket", [{ t: "NVDA", usd: 90, at: "2026-11-09T13:00:00Z" }]),
  pt("2026110915", "regular", [{ t: "NVDA", usd: 95, at: "2026-11-09T14:40:00Z" }, { t: "META", usd: 99, at: "2026-11-09T09:00:00Z" }]),
  pt("2026111015", "regular", [{ t: "META", usd: 101, at: "2026-11-10T14:50:00Z" }]),
];
const opens = findOpens(pts, ["NVDA", "META"], ["2026-11-09", "2026-11-10"]);
check("open skips premarket and takes the first post-09:30 round", opens.get("NVDA")?.usd === 95);
check("a round dated before the bell is not an open; next day is used", opens.get("META")?.usd === 101 && opens.get("META")?.day === "2026-11-10");

const nv = c.rows.find((r) => r.ticker === "NVDA")!;
const g = gradeRow(nv, { usd: 95, round_at: 1, source: "archive" });
check("DOWN call + lower open = hit", g.hit === true && g.open_gap_pct === -5);
check("errors: DEX 3% off, flat 5% off", g.dex_error_pct === 3 && g.flat_error_pct === 5);
const flat = gradeRow(c.rows.find((r) => r.ticker === "META")!, { usd: 101, round_at: 1, source: "chain" });
check("a FLAT row is never graded for direction", flat.hit === null);

const wk: GradedWeekend = { friday: fri, call_at: "", source: "archive", excluded: [], crypto: null, graded_at: "", rows: [g, flat], ungraded: [] };
const s1 = summarize([wk]);
check("below the gate: no rate, no CI", !s1.ready && s1.hit_rate === null && s1.ci95 === null && s1.calls === 1 && s1.needed === MIN_CALLS);
const many = summarize(Array.from({ length: MIN_CALLS }, () => ({ ...wk, rows: [g] })));
check("at the gate: rate and CI ship", many.ready && many.hit_rate === 1 && many.ci95 !== null);

const pos = positionsFor({ ...c, crypto: null });
check("positions only for calls, side follows the call", pos.length === 1 && pos[0].side === "SHORT" && pos[0].entry_usd === 98);
const entry: DiaryEntry = { friday: fri, opened_at: "", positions: [...pos, { ticker: "META", side: "LONG", entry_usd: 100, stake_usd: 1000 }], note_open: null, closed_at: null, results: null, pnl_usd: null, note_close: null, note_model_generated: true };
const res = settle(entry, { ...wk, rows: [g, flat] })!;
const nvr = res.find((r) => r.ticker === "NVDA")!, mtr = res.find((r) => r.ticker === "META")!;
check("SHORT from 98 to 95 makes money", nvr.pnl_usd > 0 && Math.abs(nvr.return_pct - 3.06) < 0.01);
check("LONG from 100 to 101 makes $10", mtr.pnl_usd === 10);

console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
