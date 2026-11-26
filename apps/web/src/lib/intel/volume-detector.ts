/**
 * BlueAgent Markets Intel v1 — Unusual Session Volume Detector.
 *
 * Reuses:
 *   - `BASE_STOCKS` / `findBaseStock` from `@/lib/base-stocks/registry`
 *   - `nyseMarketStatus`, `nyUtcOffsetHours` from `@/lib/market-hours`
 *   - GeckoTerminal hourly OHLCV conventions from `@/lib/weekend/sessions`
 *
 * Strict invariants:
 *   1. Full-hour comparable windows in `America/New_York` (DST, NYSE holidays,
 *      and early closes handled via `nyseMarketStatus`). Any hourly candle
 *      straddling a session boundary (e.g. 09:00-10:00 ET across 09:30 open)
 *      is EXCLUDED rather than assigned to either session.
 *   2. Same pool set and identical summation formula in both the evaluated
 *      window and all prior 28-day baseline windows.
 *   3. Evaluated window is strictly excluded from its own baseline.
 *   4. Explicit zero-volume candles count as present; missing candles mark a
 *      window incomplete and exclude it from evaluation and baseline.
 *   5. Returns explicit `insufficient_data` when coverage or baseline sample
 *      count is below threshold.
 */
import { findBaseStock, type BaseStock } from "@/lib/base-stocks/registry";
import { nyseMarketStatus, nyUtcOffsetHours } from "@/lib/market-hours";
import {
  DEFAULT_INTEL_CONFIG,
  INTEL_CHAIN,
  INTEL_CHAIN_ID,
  INTEL_TARGET_TICKERS,
  INTEL_TIMEZONE,
  type HourlyVolumePoint,
  type IntelCoverageSummary,
  type IntelDetectorConfig,
  type IntelEvent,
  type IntelPoolContribution,
  type IntelPoolDescriptor,
  type IntelSessionKind,
  type SessionWindowSpec,
  type WindowEvaluation,
} from "./types";

const HOUR_S = 3600;
const DAY_MS = 86_400_000;

/** Stable, deterministic event key based on chain, token, session window, and detector version. */
export function buildIntelEventId(
  symbol: string,
  session: IntelSessionKind,
  nyDate: string,
  detectorVersion: string = DEFAULT_INTEL_CONFIG.detectorVersion,
): string {
  return `${INTEL_CHAIN}-${symbol.toLowerCase()}-${session}-${nyDate}-${detectorVersion.toLowerCase()}`;
}

/** Add `deltaDays` calendar days to a YYYY-MM-DD date string. */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const ms = Date.parse(`${isoDate}T12:00:00Z`) + deltaDays * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Current NY calendar date YYYY-MM-DD for a UTC Date. */
export function nyDateOf(d: Date): string {
  return nyseMarketStatus(d).ny_time_iso.slice(0, 10);
}

/**
 * Convert a NY wall-clock date + hour (0..23) to its exact UTC Unix timestamp
 * in seconds, respecting DST via `nyUtcOffsetHours`.
 */
export function nyWallHourToUtcSeconds(nyDate: string, nyHour: number): number {
  // Start with a midday probe to get the approximate offset, then refine at the exact instant
  // so spring-forward / fall-back days resolve accurately.
  const approxUtc = Date.parse(`${nyDate}T${String(nyHour).padStart(2, "0")}:00:00Z`);
  const probeOff = nyUtcOffsetHours(new Date(approxUtc + 5 * 3_600_000));
  const candMs = approxUtc + probeOff * 3_600_000;
  const exactOff = nyUtcOffsetHours(new Date(candMs));
  return Math.floor((approxUtc + exactOff * 3_600_000) / 1000);
}

/**
 * Classify a single 1-hour candle `[hourStartSec, hourStartSec + 3600)` using
 * `nyseMarketStatus`. Returns `null` if the candle straddles a session boundary
 * (e.g. 09:00-10:00 ET where 09:00 is premarket and 09:59:59 is regular).
 */
export function classifyFullHourCandle(
  hourStartSec: number,
): { session: "premarket" | "regular" | "afterhours" | "weekend" | "holiday"; nyDate: string } | null {
  const start = nyseMarketStatus(new Date(hourStartSec * 1000));
  const end = nyseMarketStatus(new Date((hourStartSec + HOUR_S) * 1000 - 1));
  if (start.session !== end.session) return null; // Straddles a session boundary — excluded
  const startDate = start.ny_time_iso.slice(0, 10);
  const endDate = end.ny_time_iso.slice(0, 10);
  if (startDate !== endDate) return null; // Straddles NY midnight
  return { session: start.session, nyDate: startDate };
}

/**
 * Build the comparable full-hour session window for a given NY calendar date
 * and session kind. Returns `null` on weekends, NYSE holidays, or early-close
 * regular sessions (which have 3 full hours instead of 6 and are not comparable
 * to standard regular sessions).
 */
export function buildSessionWindow(nyDate: string, session: IntelSessionKind): SessionWindowSpec | null {
  // Check noon ET on this date to detect weekends and holidays.
  const noonUtcSec = nyWallHourToUtcSeconds(nyDate, 12);
  const noonStatus = nyseMarketStatus(new Date(noonUtcSec * 1000));
  if (noonStatus.session === "weekend" || noonStatus.session === "holiday") {
    return null;
  }

  // Detect NYSE early close (13:00 ET): at 13:30 ET, normal days are "regular", early-close days are "afterhours".
  const at1330Utc = nyWallHourToUtcSeconds(nyDate, 13) + 1800;
  const isEarlyClose = nyseMarketStatus(new Date(at1330Utc * 1000)).session === "afterhours";

  let startHourNy: number;
  let endHourNy: number;
  let nyLabel: string;
  let boundaryNote: string;

  if (session === "premarket") {
    startHourNy = 4;
    endHourNy = 9;
    nyLabel = "04:00-09:00 ET";
    boundaryNote = "Full-hour pre-market window; 09:00-10:00 ET candle straddles the 09:30 ET open and is excluded.";
  } else if (session === "regular") {
    if (isEarlyClose) {
      // Early-close regular session only has 10:00-13:00 ET (3h) vs standard 6h; skip so comparisons stay like-for-like.
      return null;
    }
    startHourNy = 10;
    endHourNy = 16;
    nyLabel = "10:00-16:00 ET";
    boundaryNote = "Comparable full-hour regular session (6h); 09:00-10:00 ET straddles the 09:30 ET open and is excluded.";
  } else {
    // afterhours: 16:00-20:00 ET (4 full hours). On early-close days 13:00-16:00 ET is also afterhours,
    // so keeping 16:00-20:00 ET preserves exact 4h comparability across weekdays.
    startHourNy = 16;
    endHourNy = 20;
    nyLabel = "16:00-20:00 ET";
    boundaryNote = isEarlyClose
      ? "Comparable 4h post-close window (16:00-20:00 ET); early-close hours 13:00-16:00 ET excluded for comparability."
      : "Full-hour post-close window (16:00-20:00 ET), aligned to 16:00 ET NYSE close.";
  }

  const expectedHourTs: number[] = [];
  for (let h = startHourNy; h < endHourNy; h++) {
    const ts = nyWallHourToUtcSeconds(nyDate, h);
    const cls = classifyFullHourCandle(ts);
    if (cls && cls.session === session && cls.nyDate === nyDate) {
      expectedHourTs.push(ts);
    }
  }

  if (expectedHourTs.length === 0) return null;
  const firstTs = expectedHourTs[0];
  const lastEndTs = expectedHourTs[expectedHourTs.length - 1] + HOUR_S;

  return {
    session,
    nyDate,
    startUtc: new Date(firstTs * 1000).toISOString(),
    endUtc: new Date(lastEndTs * 1000).toISOString(),
    nyLabel,
    boundaryNote,
    expectedHourTs,
    isEarlyClose,
  };
}

/** List all completed session windows in the last `daysBack` NY days as of `now`. */
export function listCompletedWindows(
  now: Date,
  daysBack: number,
  sessions: readonly IntelSessionKind[] = ["premarket", "regular", "afterhours"],
): SessionWindowSpec[] {
  const todayNy = nyDateOf(now);
  const nowSec = Math.floor(now.getTime() / 1000);
  const windows: SessionWindowSpec[] = [];

  for (let d = daysBack; d >= 0; d--) {
    const nyDate = shiftIsoDate(todayNy, -d);
    for (const s of sessions) {
      const w = buildSessionWindow(nyDate, s);
      if (!w) continue;
      const endSec = Math.floor(Date.parse(w.endUtc) / 1000);
      if (endSec <= nowSec) {
        windows.push(w);
      }
    }
  }
  return windows;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Measure a single window across a fixed pool set.
 * - Explicit zero-volume candles present in `poolCandles` count as present (0 USD).
 * - Missing timestamps are counted in `missingPoolHours` and mark the window incomplete.
 */
function measureWindowAcrossPools(
  window: SessionWindowSpec,
  pools: IntelPoolDescriptor[],
  poolCandles: Map<string, Map<number, number>>,
): {
  complete: boolean;
  totalUsd: number;
  perPoolUsd: Map<string, number>;
  perPoolMissing: Map<string, number>;
  completeHoursAcrossPools: number;
  missingPoolHours: number;
} {
  const perPoolUsd = new Map<string, number>();
  const perPoolMissing = new Map<string, number>();
  let totalUsd = 0;
  let missingPoolHours = 0;
  let completeHoursAcrossPools = 0;

  for (const p of pools) {
    perPoolUsd.set(p.address, 0);
    perPoolMissing.set(p.address, 0);
  }

  for (const ts of window.expectedHourTs) {
    let allPoolsHaveHour = true;
    for (const p of pools) {
      const map = poolCandles.get(p.address);
      const val = map?.get(ts);
      if (val === undefined || !Number.isFinite(val) || val < 0) {
        allPoolsHaveHour = false;
        missingPoolHours++;
        perPoolMissing.set(p.address, (perPoolMissing.get(p.address) ?? 0) + 1);
      } else {
        perPoolUsd.set(p.address, (perPoolUsd.get(p.address) ?? 0) + val);
        totalUsd += val;
      }
    }
    if (allPoolsHaveHour) completeHoursAcrossPools++;
  }

  return {
    complete: pools.length > 0 && missingPoolHours === 0,
    totalUsd,
    perPoolUsd,
    perPoolMissing,
    completeHoursAcrossPools,
    missingPoolHours,
  };
}

/**
 * Pure detector: evaluate one completed session window for one Base stock token
 * against its prior `lookbackDays` comparable windows using the exact same pool set.
 */
export function evaluateSessionWindow(params: {
  stock: BaseStock;
  window: SessionWindowSpec;
  pools: IntelPoolDescriptor[];
  /** Map: lowercase pool address -> hourly points (only explicit candles reported by source). */
  candlesByPool: Record<string, HourlyVolumePoint[]>;
  config?: Partial<IntelDetectorConfig>;
  evaluatedAt?: Date;
  sourceLabel?: string;
}): WindowEvaluation {
  const cfg: IntelDetectorConfig = { ...DEFAULT_INTEL_CONFIG, ...params.config };
  const nowIso = (params.evaluatedAt ?? new Date()).toISOString();
  const pools = params.pools.slice(0, cfg.maxPools).map((p) => ({
    ...p,
    address: p.address.toLowerCase(),
  }));

  const poolCandles = new Map<string, Map<number, number>>();
  for (const p of pools) {
    const m = new Map<number, number>();
    for (const pt of params.candlesByPool[p.address] ?? params.candlesByPool[p.address.toLowerCase()] ?? []) {
      if (Number.isFinite(pt.ts) && Number.isFinite(pt.volumeUsd) && pt.volumeUsd >= 0) {
        m.set(pt.ts, pt.volumeUsd);
      }
    }
    poolCandles.set(p.address, m);
  }

  const straddlingHoursExcluded =
    params.window.session === "regular" || params.window.session === "premarket"
      ? ["09:00-10:00 ET (straddles 09:30 ET NYSE open)"]
      : [];

  if (pools.length === 0) {
    const coverage: IntelCoverageSummary = {
      expectedHours: params.window.expectedHourTs.length,
      observedHoursCompleteAcrossPools: 0,
      missingPoolHours: params.window.expectedHourTs.length,
      excludedIncompleteBaselineWindows: 0,
      candidateBaselineWindows: 0,
      straddlingHoursExcluded,
      notes: ["No eligible Base DEX pools found for this token."],
    };
    return {
      status: "insufficient_data",
      reason: "No eligible Base DEX pools available.",
      ticker: params.stock.ticker,
      symbol: params.stock.symbol,
      window: params.window,
      observedUsd: null,
      baselineMedianUsd: null,
      baselineSampleCount: 0,
      usdIncreaseUsd: null,
      volumeMultiple: null,
      coverage,
      event: null,
    };
  }

  const current = measureWindowAcrossPools(params.window, pools, poolCandles);

  // Build prior comparable windows strictly BEFORE `params.window.nyDate` within `lookbackDays`.
  // The evaluated window itself is NEVER included in its own baseline.
  const baselineTotals: number[] = [];
  const perPoolBaseline = new Map<string, number[]>();
  for (const p of pools) perPoolBaseline.set(p.address, []);

  let candidateBaselineWindows = 0;
  let excludedIncompleteBaselineWindows = 0;

  for (let d = 1; d <= cfg.lookbackDays; d++) {
    const priorDate = shiftIsoDate(params.window.nyDate, -d);
    if (priorDate === params.window.nyDate) continue; // defensive self-exclusion
    const bw = buildSessionWindow(priorDate, params.window.session);
    if (!bw) continue;
    // Enforce exact hour-count comparability (e.g. skip any non-standard length)
    if (bw.expectedHourTs.length !== params.window.expectedHourTs.length) continue;
    candidateBaselineWindows++;
    const m = measureWindowAcrossPools(bw, pools, poolCandles);
    if (!m.complete) {
      excludedIncompleteBaselineWindows++;
      continue;
    }
    baselineTotals.push(m.totalUsd);
    for (const p of pools) {
      perPoolBaseline.get(p.address)!.push(m.perPoolUsd.get(p.address) ?? 0);
    }
  }

  const notes: string[] = [];
  if (!current.complete) {
    notes.push(
      `Evaluated window missing ${current.missingPoolHours} pool-hour candle(s) across ${pools.length} selected pool(s).`,
    );
  }
  if (excludedIncompleteBaselineWindows > 0) {
    notes.push(
      `${excludedIncompleteBaselineWindows} of ${candidateBaselineWindows} prior ${cfg.lookbackDays}d comparable windows excluded due to missing candles.`,
    );
  }

  const coverage: IntelCoverageSummary = {
    expectedHours: params.window.expectedHourTs.length,
    observedHoursCompleteAcrossPools: current.completeHoursAcrossPools,
    missingPoolHours: current.missingPoolHours,
    excludedIncompleteBaselineWindows,
    candidateBaselineWindows,
    straddlingHoursExcluded,
    notes,
  };

  if (!current.complete) {
    return {
      status: "insufficient_data",
      reason: `Incomplete evaluated window: ${current.missingPoolHours} missing pool-hour candle(s).`,
      ticker: params.stock.ticker,
      symbol: params.stock.symbol,
      window: params.window,
      observedUsd: null,
      baselineMedianUsd: median(baselineTotals),
      baselineSampleCount: baselineTotals.length,
      usdIncreaseUsd: null,
      volumeMultiple: null,
      coverage,
      event: null,
    };
  }

  if (baselineTotals.length < cfg.minBaselineSamples) {
    return {
      status: "insufficient_data",
      reason: `Insufficient baseline samples: ${baselineTotals.length} complete comparable window(s) in prior ${cfg.lookbackDays}d (need >= ${cfg.minBaselineSamples}).`,
      ticker: params.stock.ticker,
      symbol: params.stock.symbol,
      window: params.window,
      observedUsd: Math.round(current.totalUsd * 100) / 100,
      baselineMedianUsd: median(baselineTotals),
      baselineSampleCount: baselineTotals.length,
      usdIncreaseUsd: null,
      volumeMultiple: null,
      coverage,
      event: null,
    };
  }

  const baselineMed = median(baselineTotals)!;
  const observedUsd = Math.round(current.totalUsd * 100) / 100;
  const baselineMedianUsd = Math.round(baselineMed * 100) / 100;
  const usdIncreaseUsd = Math.round((observedUsd - baselineMedianUsd) * 100) / 100;
  const volumeMultiple =
    baselineMedianUsd > 0 ? Math.round((observedUsd / baselineMedianUsd) * 100) / 100 : null;

  const passesIncrease = usdIncreaseUsd >= cfg.minUsdIncrease;
  const passesMultiple = volumeMultiple !== null && volumeMultiple >= cfg.minVolumeMultiple;

  if (!passesIncrease || !passesMultiple) {
    const reasons: string[] = [];
    if (!passesIncrease) reasons.push(`USD increase $${Math.round(usdIncreaseUsd).toLocaleString("en-US")} < $${cfg.minUsdIncrease.toLocaleString("en-US")}`);
    if (!passesMultiple) reasons.push(`multiple ${volumeMultiple ?? "n/a"}x < ${cfg.minVolumeMultiple}x`);
    return {
      status: "normal",
      reason: `Below threshold (${reasons.join("; ")}).`,
      ticker: params.stock.ticker,
      symbol: params.stock.symbol,
      window: params.window,
      observedUsd,
      baselineMedianUsd,
      baselineSampleCount: baselineTotals.length,
      usdIncreaseUsd,
      volumeMultiple,
      coverage,
      event: null,
    };
  }

  const poolContributions: IntelPoolContribution[] = pools
    .map((p) => {
      const obs = Math.round((current.perPoolUsd.get(p.address) ?? 0) * 100) / 100;
      const sharePct = observedUsd > 0 ? Math.round((obs / observedUsd) * 1000) / 10 : 0;
      const bMed = median(perPoolBaseline.get(p.address) ?? []);
      return {
        address: p.address,
        name: p.name,
        dex: p.dex,
        observedUsd: obs,
        sharePct,
        baselineMedianUsd: bMed !== null ? Math.round(bMed * 100) / 100 : null,
        missingHoursInWindow: current.perPoolMissing.get(p.address) ?? 0,
      };
    })
    .sort((a, b) => b.observedUsd - a.observedUsd);

  const triggerRule = `observed >= ${cfg.minVolumeMultiple}x prior ${cfg.lookbackDays}d median AND +$${cfg.minUsdIncrease.toLocaleString("en-US")} min increase AND >= ${cfg.minBaselineSamples} complete baseline sessions (${volumeMultiple!.toFixed(2)}x, +$${Math.round(usdIncreaseUsd).toLocaleString("en-US")}, n=${baselineTotals.length})`;

  const event: IntelEvent = {
    id: buildIntelEventId(params.stock.symbol, params.window.session, params.window.nyDate, cfg.detectorVersion),
    chain: INTEL_CHAIN,
    chainId: INTEL_CHAIN_ID,
    ticker: params.stock.ticker,
    symbol: params.stock.symbol,
    name: params.stock.name,
    tokenAddress: params.stock.token,
    detectorVersion: cfg.detectorVersion,

    session: params.window.session,
    nyDate: params.window.nyDate,
    timeZone: INTEL_TIMEZONE,
    windowStartUtc: params.window.startUtc,
    windowEndUtc: params.window.endUtc,
    windowNyLabel: params.window.nyLabel,
    boundaryNote: params.window.boundaryNote,

    observedUsd,
    baselineMedianUsd,
    baselineSampleCount: baselineTotals.length,
    baselineLookbackDays: cfg.lookbackDays,
    usdIncreaseUsd,
    volumeMultiple: volumeMultiple!,

    pools,
    poolContributions,
    coverage,
    triggerRule,
    thresholds: {
      minBaselineSamples: cfg.minBaselineSamples,
      minUsdIncrease: cfg.minUsdIncrease,
      minVolumeMultiple: cfg.minVolumeMultiple,
    },
    source:
      params.sourceLabel ??
      `GeckoTerminal hourly OHLCV (USD), top ${pools.length} deepest Base 8453 pool(s) by reserve_in_usd`,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1,
    revisions: [],
  };

  return {
    status: "qualified",
    reason: triggerRule,
    ticker: params.stock.ticker,
    symbol: params.stock.symbol,
    window: params.window,
    observedUsd,
    baselineMedianUsd,
    baselineSampleCount: baselineTotals.length,
    usdIncreaseUsd,
    volumeMultiple,
    coverage,
    event,
  };
}

// ── Live GeckoTerminal fetcher (same conventions as lib/weekend/sessions.ts) ─

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gtGet<T>(path: string): Promise<{ body: T | null; error?: string }> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2${path}`, {
        headers: { Accept: "application/json", "User-Agent": "blueagent-markets-intel/1" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (r.ok) return { body: (await r.json()) as T };
      lastErr = `HTTP ${r.status}`;
      if (r.status !== 429) return { body: null, error: lastErr };
      await sleep(3000 * (attempt + 1));
    } catch (e) {
      lastErr = (e as Error).name === "TimeoutError" ? "timeout 20s" : (e as Error).message.slice(0, 80);
    }
  }
  return { body: null, error: lastErr || "fetch failed" };
}

export interface TokenHistoryRead {
  stock: BaseStock;
  pools: IntelPoolDescriptor[];
  candlesByPool: Record<string, HourlyVolumePoint[]>;
  errors: string[];
}

/**
 * Fetch top `maxPools` deepest Base DEX pools and up to 1000 hourly USD candles
 * (~41.6 days, covering both the evaluated windows and 28-day prior baseline).
 * Passes `include_empty_intervals=true` so GeckoTerminal explicitly reports
 * zero-volume hours instead of omitting them.
 */
export async function fetchTokenHourlyHistory(
  ticker: string,
  maxPools = DEFAULT_INTEL_CONFIG.maxPools,
): Promise<TokenHistoryRead> {
  const stock = findBaseStock(ticker);
  if (!stock) throw new Error(`Unknown Base stock ticker: ${ticker}`);

  const errors: string[] = [];
  const poolsRes = await gtGet<{
    data?: Array<{
      id?: string;
      attributes: { address: string; name?: string; reserve_in_usd?: string | null };
      relationships?: { dex?: { data?: { id?: string } } };
    }>;
  }>(`/networks/base/tokens/${stock.token.toLowerCase()}/pools?page=1`);

  if (!poolsRes.body?.data) {
    errors.push(`pools fetch failed: ${poolsRes.error ?? "empty"}`);
    return { stock, pools: [], candlesByPool: {}, errors };
  }

  const pools: IntelPoolDescriptor[] = poolsRes.body.data
    .map((p) => ({
      address: p.attributes.address.toLowerCase(),
      name: p.attributes.name ?? `${stock.symbol} pool`,
      dex: p.relationships?.dex?.data?.id ?? "base-dex",
      reserveUsd: Number(p.attributes.reserve_in_usd ?? 0),
    }))
    .filter((p) => Number.isFinite(p.reserveUsd) && p.reserveUsd >= 1_000)
    .sort((a, b) => b.reserveUsd - a.reserveUsd)
    .slice(0, maxPools);

  const candlesByPool: Record<string, HourlyVolumePoint[]> = {};
  for (const p of pools) {
    await sleep(2500);
    const ohlcv = await gtGet<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
      `/networks/base/pools/${p.address}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&include_empty_intervals=true`,
    );
    const list = ohlcv.body?.data?.attributes?.ohlcv_list;
    if (!list) {
      errors.push(`pool ${p.address.slice(0, 10)} ohlcv failed: ${ohlcv.error ?? "empty"}`);
      candlesByPool[p.address] = [];
      continue;
    }
    candlesByPool[p.address] = list
      .filter((row) => Array.isArray(row) && row.length >= 6 && Number.isFinite(row[0]) && Number.isFinite(row[5]))
      .map((row) => ({ ts: Math.floor(row[0]), volumeUsd: Math.max(0, Number(row[5])) }));
  }

  return { stock, pools, candlesByPool, errors };
}

export function targetIntelStocks(): BaseStock[] {
  return INTEL_TARGET_TICKERS.map((t) => {
    const s = findBaseStock(t);
    if (!s) throw new Error(`Missing target stock in BASE_STOCKS: ${t}`);
    return s;
  });
}
