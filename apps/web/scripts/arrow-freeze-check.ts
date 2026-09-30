/**
 * arrow-freeze-check — the arrow freeze (ShunTr, 2026-09-30) holds everywhere
 * it has to, and stays reversible.
 *
 * Two switches live in `src/lib/blue-hood/arrow-freeze.ts`:
 *   ARROWS_FROZEN        — the rule engine publishes no new arrow.
 *   ARROW_TRADE_ENABLED  — the Review & Sign panel (a real trade opened straight
 *                          from a signal) and the three routes that exist only
 *                          for it.
 *
 * A freeze that is honoured in one place and not another is the failure this
 * file exists for: the panel was rendered from THREE components (board, inbox,
 * chat card) and hiding the first two would have left the chat card opening a
 * live Robinhood Chain trade. So the render checks are a property over every
 * file under src/, not a list of the files known today.
 *
 * Part 1 runs the REAL engine against the in-memory KV (no env → lib/kv falls
 * back to a Map), on a fixture that is proved to fire before it is proved not
 * to — otherwise "fired 0 while frozen" would pass on a fixture that never
 * fires at all.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { kvGet, kvSet } from "../src/lib/kv";
import { runRuleEngine } from "../src/lib/blue-hood/rule-engine";
import { ARROWS_FROZEN, ARROW_TRADE_ENABLED } from "../src/lib/blue-hood/arrow-freeze";
import type { HoodSnapshot, TickerSnapshot } from "../src/lib/blue-hood/types";

let failures = 0;
let passes = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments talk about the panel at length; only code counts as evidence. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// ── fixture (same shape blue-hood-smoke uses) ────────────────────────────────
const mk = (
  ticker: string,
  verdict: TickerSnapshot["verdict"],
  isOpen: boolean,
  driftPct: number,
  volume24h: number | null = 1_000,
): TickerSnapshot => ({
  ticker,
  name: ticker,
  contract: `0x${ticker}`,
  verdict,
  oracle_usd: 100,
  dex_usd: 100 * (1 + driftPct / 100),
  tvl_usd: 10_000,
  total_tvl_usd: 10_000,
  volume_24h_usd: volume24h,
  drift_pct: driftPct,
  pool_ref: "0xpool",
  is_v4_pool_id: false,
  market: {
    is_open: isOpen,
    session: isOpen ? "regular" : "afterhours",
    ny_time_iso: new Date().toISOString(),
  },
  warnings: [],
  polled_at_ms: 0,
  data_age_s: null,
  sparkline: null,
  no_data_reason: null,
});

const snap: HoodSnapshot = {
  cycle_id: Date.now(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  duration_ms: 0,
  tickers: [
    mk("TSLA", "LONG_DEX", true, 1.5),           // arb
    mk("AAPL", "AFTERHOURS_DRIFT", false, 3),    // drift
    mk("COIN", "AFTERHOURS_DRIFT", false, 4, null), // drift, liveness gate fails open
    mk("MSFT", "ALIGNED", true, 0.1),            // below threshold
  ],
  metrics: {
    registry_total: 4,
    tokens_watched: 4,
    tokens_no_feed: 0,
    tokens_errored: 0,
    tvl_scanned_usd: 40_000,
    market_is_open: true,
    market_session: "regular",
  },
};

async function resetArrows() {
  await kvSet("bh:arrow:feed", []);
  await kvSet("bh:arrow:serial", 0);
}

(async () => {
  console.log("\n1. The engine really stops firing — and only because of the switch");

  await resetArrows();
  const live = await runRuleEngine(snap, { frozen: false });
  check("1.1 the fixture fires when NOT frozen (so a 0 below means something)",
    live.fired === 3, `fired=${live.fired}`);

  await resetArrows();
  const frozen = await runRuleEngine(snap, { frozen: true });
  check("1.2 frozen: nothing fires", frozen.fired === 0, `fired=${frozen.fired}`);
  check("1.3 frozen: every would-be arrow is counted as skipped_frozen",
    frozen.skipped_frozen === 3, `skipped_frozen=${frozen.skipped_frozen}`);
  const feed = (await kvGet<string[]>("bh:arrow:feed")) ?? [];
  check("1.4 frozen: the arrow index is untouched", feed.length === 0, `feed=${feed.length}`);
  const serial = (await kvGet<number>("bh:arrow:serial")) ?? 0;
  check("1.5 frozen: no serial is consumed", serial === 0, `serial=${serial}`);
  const sum = frozen.skipped_dust + frozen.skipped_no_executable_pool + frozen.skipped_dead_pool
    + frozen.skipped_feed_stale + frozen.skipped_frozen + frozen.deduped + frozen.fired;
  check("1.6 conservation identity still closes with the frozen gate in it",
    sum === frozen.candidates_over_threshold, `${sum} vs ${frozen.candidates_over_threshold}`);

  await resetArrows();
  const byDefault = await runRuleEngine(snap);
  check("1.7 the default follows ARROWS_FROZEN",
    ARROWS_FROZEN ? byDefault.fired === 0 : byDefault.fired === 3,
    `ARROWS_FROZEN=${ARROWS_FROZEN} fired=${byDefault.fired}`);

  const engine = stripComments(read("src/lib/blue-hood/rule-engine.ts"));
  const gateAt = engine.indexOf("if (frozen)");
  const fireAt = engine.indexOf("await fireArrow(");
  check("1.8 the frozen gate sits before the only fireArrow call",
    gateAt > 0 && fireAt > gateAt, `gate@${gateAt} fire@${fireAt}`);

  console.log("\n2. No surface opens a trade from a signal while ARROW_TRADE_ENABLED is off");

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));

  const renderers = files.filter((f) => /<ReviewSignPanel\b/.test(stripComments(readFileSync(f, "utf8"))));
  check("2.1 the panel is still rendered somewhere (the detector is alive)",
    renderers.length >= 3, `found ${renderers.length}`);
  for (const f of renderers) {
    const code = stripComments(readFileSync(f, "utf8"));
    const lines = code.split("\n");
    const ok = lines.every((line, i) => {
      if (!/<ReviewSignPanel\b/.test(line)) return true;
      const window = `${lines[i - 1] ?? ""}\n${line}`;
      return /ARROW_TRADE_ENABLED\s*&&/.test(window);
    });
    check(`2.2 ${relative(ROOT, f)} renders the panel only under ARROW_TRADE_ENABLED`, ok);
  }

  const panelRoutes = [
    "src/app/api/hood/trade/quote/route.ts",
    "src/app/api/hood/trade/prepare/route.ts",
    "src/app/api/hood/arrows/[id]/user-action/route.ts",
  ];
  for (const r of panelRoutes) {
    const code = stripComments(read(r));
    const post = code.slice(code.indexOf("export async function POST"));
    const gate = post.indexOf("if (!ARROW_TRADE_ENABLED) return arrowTradeDisabledResponse()");
    const limiter = post.indexOf("rateLimit(");
    check(`2.3 ${r} refuses before doing any work`, gate > 0 && (limiter < 0 || gate < limiter),
      `gate@${gate} rateLimit@${limiter}`);
  }
  check("2.4 the trade switch is independent of the freeze (both exported, separately)",
    typeof ARROW_TRADE_ENABLED === "boolean" && typeof ARROWS_FROZEN === "boolean");

  console.log("\n3. Nothing keeps working for arrows that can no longer exist");
  const vercel = JSON.parse(read("vercel.json")) as { crons?: { path: string }[] };
  const scheduled = (name: string) => (vercel.crons ?? []).some((c) => c.path.includes(name));
  check("3.1 while frozen, the brief-worker is not on a timer",
    !ARROWS_FROZEN || !scheduled("brief-worker"), `frozen=${ARROWS_FROZEN} scheduled=${scheduled("brief-worker")}`);
  // alert-drain's queue has exactly one writer (emitAlertsForArrow, inside the
  // brief-worker), so while frozen it could only finish sending pre-freeze
  // arrows — which is what the freeze is meant to stop.
  const alertWriters = files
    .filter((f) => /(?<!function\s+)\bemitAlertsForArrow\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => relative(ROOT, f));
  check("3.2 the alert queue still has a single writer, and it is the brief-worker",
    alertWriters.length === 1 && alertWriters[0].includes("brief-worker"), alertWriters.join(", "));
  check("3.3 while frozen, alert-drain is not on a timer either",
    !ARROWS_FROZEN || !scheduled("alert-drain"), `frozen=${ARROWS_FROZEN} scheduled=${scheduled("alert-drain")}`);

  console.log(`\narrow-freeze-check: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
