/**
 * Hermetic regression suite for BlueAgent Markets Intel v1.
 * Auto-discovered by `npm test` (zero network, zero external KV required).
 *
 * Covers:
 *   1. Session boundaries (09:00-10:00 ET straddling excluded, DST EDT/EST, NYSE holidays, early closes)
 *   2. Missing candles vs explicit zero-volume candles
 *   3. Same-pool comparisons across evaluated & baseline windows
 *   4. Exclusion of the evaluated window from its own baseline
 *   5. Insufficient-data status when baseline samples < threshold
 *   6. Idempotent duplicate ingestion + evidence revision retention with stable URL
 *   7. Deterministic lowercase X draft & Telegram /intel HTML formatter
 */
import assert from "node:assert/strict";
import { findBaseStock } from "../src/lib/base-stocks/registry";
import {
  buildIntelEventId,
  buildSessionWindow,
  classifyFullHourCandle,
  evaluateSessionWindow,
  nyWallHourToUtcSeconds,
  shiftIsoDate,
} from "../src/lib/intel/volume-detector";
import { mergeIntelEvent } from "../src/lib/intel/store";
import { buildIntelXDraft, formatIntelTelegramMessage, intelEventUrl } from "../src/lib/intel/draft";
import type { HourlyVolumePoint, IntelPoolDescriptor } from "../src/lib/intel/types";

const nvda = findBaseStock("NVDA")!;
assert.ok(nvda, "NVDA must exist in BASE_STOCKS");

const POOL_A: IntelPoolDescriptor = {
  address: "0x000000000000000000000000000000000000aa01",
  name: "NVDAc / USDC (Aerodrome)",
  dex: "aerodrome-slipstream",
  reserveUsd: 900_000,
};
const POOL_B: IntelPoolDescriptor = {
  address: "0x000000000000000000000000000000000000bb02",
  name: "NVDAc / WETH (Uniswap V3)",
  dex: "uniswap-v3-base",
  reserveUsd: 250_000,
};

function makeWindowCandles(nyDate: string, session: "premarket" | "regular" | "afterhours", perHourUsd: number): HourlyVolumePoint[] {
  const w = buildSessionWindow(nyDate, session);
  assert.ok(w, `Expected valid window for ${nyDate} ${session}`);
  return w.expectedHourTs.map((ts) => ({ ts, volumeUsd: perHourUsd }));
}

let passed = 0;

// ── Test 1: Session boundaries, straddling hour, DST, holidays, early close ──
{
  // 2026-10-20 is EDT (UTC-4): 09:00 ET = 13:00 UTC, 10:00 ET = 14:00 UTC
  const edtStraddle = nyWallHourToUtcSeconds("2026-10-20", 9);
  assert.equal(new Date(edtStraddle * 1000).toISOString(), "2026-10-20T13:00:00.000Z");
  assert.equal(classifyFullHourCandle(edtStraddle), null, "09:00-10:00 ET must be excluded as boundary-straddling");

  // 2026-11-10 is EST (UTC-5): 10:00 ET = 15:00 UTC
  const estRegular = buildSessionWindow("2026-11-10", "regular");
  assert.ok(estRegular);
  assert.equal(estRegular.startUtc, "2026-11-10T15:00:00.000Z");
  assert.equal(estRegular.endUtc, "2026-11-10T21:00:00.000Z");
  assert.equal(estRegular.expectedHourTs.length, 6);

  // Thanksgiving 2026-11-26 is an NYSE full holiday -> null
  assert.equal(buildSessionWindow("2026-11-26", "regular"), null, "NYSE holiday must return null");
  assert.equal(buildSessionWindow("2026-11-26", "premarket"), null, "NYSE holiday premarket must return null");

  // Day after Thanksgiving 2026-11-27 is an NYSE 13:00 ET early close -> regular excluded for 6h comparability
  assert.equal(buildSessionWindow("2026-11-27", "regular"), null, "Early-close regular session must be excluded");
  // Weekend -> null
  assert.equal(buildSessionWindow("2026-11-22", "regular"), null, "Sunday must return null");
  passed++;
}

// ── Test 2: Explicit zero-volume candles count; missing candles exclude window ─
{
  const evalDate = "2026-11-24"; // Tuesday
  const w = buildSessionWindow(evalDate, "regular")!;
  const candlesA: HourlyVolumePoint[] = [];
  const candlesB: HourlyVolumePoint[] = [];

  // Populate 10 prior weekdays with explicit volume (POOL_B has explicit 0 USD — must count as present!)
  let filled = 0;
  for (let d = 1; d <= 28 && filled < 10; d++) {
    const dt = shiftIsoDate(evalDate, -d);
    const bw = buildSessionWindow(dt, "regular");
    if (!bw) continue;
    candlesA.push(...makeWindowCandles(dt, "regular", 10_000)); // 60k/window
    candlesB.push(...makeWindowCandles(dt, "regular", 0)); // explicit 0/hour
    filled++;
  }
  // Evaluated window: 40k/hour on POOL_A (240k total = 4x median 60k, +180k >= 50k), explicit 0 on POOL_B
  candlesA.push(...makeWindowCandles(evalDate, "regular", 40_000));
  candlesB.push(...makeWindowCandles(evalDate, "regular", 0));

  const res = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A, POOL_B],
    candlesByPool: { [POOL_A.address]: candlesA, [POOL_B.address]: candlesB },
  });
  assert.equal(res.status, "qualified", "Explicit zero-volume candles must count as complete");
  assert.equal(res.observedUsd, 240_000);
  assert.equal(res.baselineMedianUsd, 60_000);
  assert.equal(res.volumeMultiple, 4);

  // Now drop 1 candle from POOL_B in the evaluated window -> must become insufficient_data
  const candlesBMissing = candlesB.filter((c) => c.ts !== w.expectedHourTs[2]);
  const resMissing = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A, POOL_B],
    candlesByPool: { [POOL_A.address]: candlesA, [POOL_B.address]: candlesBMissing },
  });
  assert.equal(resMissing.status, "insufficient_data", "Missing candle must invalidate evaluated window");
  assert.equal(resMissing.coverage.missingPoolHours, 1);
  passed++;
}

// ── Test 3: Same-pool comparison & exclusion of evaluated window from baseline ─
{
  const evalDate = "2026-11-24";
  const w = buildSessionWindow(evalDate, "regular")!;
  const candlesA: HourlyVolumePoint[] = [];
  const candlesB: HourlyVolumePoint[] = [];
  const candlesExtra: HourlyVolumePoint[] = [];

  // Exactly 5 prior baseline windows of $60k each (POOL_A=40k, POOL_B=20k)
  let filled = 0;
  for (let d = 1; d <= 28 && filled < 5; d++) {
    const dt = shiftIsoDate(evalDate, -d);
    const bw = buildSessionWindow(dt, "regular");
    if (!bw) continue;
    candlesA.push(...makeWindowCandles(dt, "regular", 40_000 / 6));
    candlesB.push(...makeWindowCandles(dt, "regular", 20_000 / 6));
    candlesExtra.push(...makeWindowCandles(dt, "regular", 500_000)); // unrelated pool not in selected set
    filled++;
  }
  // Huge spike in evaluated window ($600k total). If evaluated window leaked into baseline (n=6),
  // median would stay 60k, but baselineSampleCount would be 6 instead of 5. Assert strictly n=5!
  candlesA.push(...makeWindowCandles(evalDate, "regular", 80_000));
  candlesB.push(...makeWindowCandles(evalDate, "regular", 20_000));

  const res = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A, POOL_B],
    candlesByPool: {
      [POOL_A.address]: candlesA,
      [POOL_B.address]: candlesB,
      "0x000000000000000000000000000000000000cc03": candlesExtra,
    },
  });
  assert.equal(res.status, "qualified");
  assert.equal(res.baselineSampleCount, 5, "Evaluated window must be strictly excluded from its own baseline");
  assert.equal(Math.round(res.baselineMedianUsd!), 60_000, "Unselected pools must not contaminate comparison");
  assert.equal(res.event?.pools.length, 2);
  passed++;
}

// ── Test 4: Insufficient-data when baseline samples < minBaselineSamples ─────
{
  const evalDate = "2026-11-24";
  const w = buildSessionWindow(evalDate, "regular")!;
  const candlesA: HourlyVolumePoint[] = [...makeWindowCandles(evalDate, "regular", 50_000)];
  // Only 3 prior complete windows (< default minBaselineSamples = 5)
  let filled = 0;
  for (let d = 1; d <= 28 && filled < 3; d++) {
    const dt = shiftIsoDate(evalDate, -d);
    if (!buildSessionWindow(dt, "regular")) continue;
    candlesA.push(...makeWindowCandles(dt, "regular", 5_000));
    filled++;
  }
  const res = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A],
    candlesByPool: { [POOL_A.address]: candlesA },
  });
  assert.equal(res.status, "insufficient_data");
  assert.equal(res.baselineSampleCount, 3);
  assert.match(res.reason, /Insufficient baseline samples/i);
  passed++;
}

// ── Test 5: Idempotent duplicate ingestion & evidence revisions ──────────────
{
  const evalDate = "2026-11-24";
  const w = buildSessionWindow(evalDate, "regular")!;
  const candlesA: HourlyVolumePoint[] = [...makeWindowCandles(evalDate, "regular", 50_000)];
  let filled = 0;
  for (let d = 1; d <= 28 && filled < 6; d++) {
    const dt = shiftIsoDate(evalDate, -d);
    if (!buildSessionWindow(dt, "regular")) continue;
    candlesA.push(...makeWindowCandles(dt, "regular", 10_000));
    filled++;
  }
  const ev1 = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A],
    candlesByPool: { [POOL_A.address]: candlesA },
  }).event!;

  assert.equal(ev1.id, buildIntelEventId("NVDAc", "regular", "2026-11-24", "v1"));

  const created = mergeIntelEvent(null, ev1, "2026-11-24T21:05:00.000Z");
  assert.equal(created.action, "created");
  assert.equal(created.event.revision, 1);

  // Duplicate ingest with identical numbers -> unchanged
  const dup = mergeIntelEvent(created.event, ev1, "2026-11-24T22:05:00.000Z");
  assert.equal(dup.action, "unchanged");
  assert.equal(dup.event.revision, 1);
  assert.equal(dup.event.revisions.length, 0);

  // Re-ingest with revised upstream volume -> revision 2, prior snapshot retained, stable ID preserved
  const evUpdated = { ...ev1, observedUsd: 330_000, usdIncreaseUsd: 270_000, volumeMultiple: 5.5 };
  const rev = mergeIntelEvent(created.event, evUpdated, "2026-11-24T23:05:00.000Z");
  assert.equal(rev.action, "revised");
  assert.equal(rev.event.id, created.event.id, "Event URL / ID must remain stable across revisions");
  assert.equal(rev.event.revision, 2);
  assert.equal(rev.event.revisions.length, 1);
  assert.equal(rev.event.revisions[0].observedUsd, 300_000);
  passed++;
}

// ── Test 6: Deterministic lowercase X draft & Telegram formatter ─────────────
{
  const evalDate = "2026-11-24";
  const w = buildSessionWindow(evalDate, "regular")!;
  const candlesA: HourlyVolumePoint[] = [...makeWindowCandles(evalDate, "regular", 50_000)];
  let filled = 0;
  for (let d = 1; d <= 28 && filled < 6; d++) {
    const dt = shiftIsoDate(evalDate, -d);
    if (!buildSessionWindow(dt, "regular")) continue;
    candlesA.push(...makeWindowCandles(dt, "regular", 10_000));
    filled++;
  }
  const ev = evaluateSessionWindow({
    stock: nvda,
    window: w,
    pools: [POOL_A],
    candlesByPool: { [POOL_A.address]: candlesA },
  }).event!;

  const draft = buildIntelXDraft(ev);
  assert.equal(draft, draft.toLowerCase(), "X draft must be all lowercase");
  assert.ok(draft.includes("nvdac"), "X draft must name the token");
  assert.ok(draft.includes("1 selected base pool"), "X draft must state selected-pool scope");
  assert.ok(draft.includes(intelEventUrl(ev.id)), "X draft must include stable evidence URL");
  assert.ok(draft.includes("5.0x"), "X draft must include supported volume multiple");

  const tg = formatIntelTelegramMessage(ev);
  assert.ok(tg.includes("<pre>") && tg.includes(intelEventUrl(ev.id)), "Telegram message must contain copyable draft and evidence link");
  passed++;
}

console.log(`markets-intel-test: PASS (${passed}/6)`);
