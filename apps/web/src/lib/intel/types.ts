/**
 * BlueAgent Markets Intel v1 — Shared types & defaults.
 *
 * Scope (v1): unusual DEX swap volume by NYSE trading session for three
 * verified Coinbase B20 stock tokens on Base (8453): NVDAc, AAPLc, MSTRc.
 */
import type { Address } from "viem";

export const INTEL_DETECTOR_VERSION = "v1" as const;
export const INTEL_CHAIN = "base" as const;
export const INTEL_CHAIN_ID = 8453 as const;
export const INTEL_TIMEZONE = "America/New_York" as const;
/** Expanded from initial 3-token pilot to all 12 verified Base B20 stocks in BASE_STOCKS. */
export const INTEL_TARGET_TICKERS = [
  "NVDA", "AAPL", "MSTR", "META", "GOOGL", "AMZN",
  "MSFT", "TSLA", "SPCX", "SNDK", "CRCL", "INTC",
] as const;

export type IntelSessionKind = "premarket" | "regular" | "afterhours";

export interface IntelDetectorConfig {
  detectorVersion: string;
  /** Number of prior calendar days used for comparable-session baseline. */
  lookbackDays: number;
  /** Minimum number of complete comparable baseline windows required. */
  minBaselineSamples: number;
  /** Minimum absolute USD increase above baseline median. */
  minUsdIncrease: number;
  /** Minimum ratio observedUsd / baselineMedianUsd. */
  minVolumeMultiple: number;
  /** Maximum number of deepest Base DEX pools included per token. */
  maxPools: number;
}

/**
 * Documented v1 defaults:
 * - 28-day prior lookback (~18–20 comparable weekday windows)
 * - >= 5 complete comparable baseline windows required
 * - >= $50,000 absolute USD increase above baseline median (filters micro-noise)
 * - >= 2.5x baseline median volume multiple
 * - Top 3 deepest Base DEX pools (matching Weekend Lab's pool selection)
 */
export const DEFAULT_INTEL_CONFIG: IntelDetectorConfig = {
  detectorVersion: INTEL_DETECTOR_VERSION,
  lookbackDays: 28,
  minBaselineSamples: 5,
  minUsdIncrease: 50_000,
  minVolumeMultiple: 2.5,
  maxPools: 3,
};

export interface IntelPoolDescriptor {
  address: string;
  name: string;
  dex: string;
  reserveUsd: number;
}

export interface IntelPoolContribution {
  address: string;
  name: string;
  dex: string;
  observedUsd: number;
  sharePct: number;
  baselineMedianUsd: number | null;
  missingHoursInWindow: number;
}

/** Hourly candle point: UTC hour start (unix seconds) -> explicit USD volume. */
export interface HourlyVolumePoint {
  ts: number; // unix seconds, aligned to UTC hour start
  volumeUsd: number;
}

export interface SessionWindowSpec {
  session: IntelSessionKind;
  /** New York calendar date YYYY-MM-DD. */
  nyDate: string;
  /** Exact UTC start/end of the comparable full-hour window (ISO strings). */
  startUtc: string;
  endUtc: string;
  /** Human-readable NY full-hour boundary label, e.g. "10:00-16:00 ET". */
  nyLabel: string;
  /** Explanation of any excluded boundary-straddling hour(s). */
  boundaryNote: string;
  /** Exact UTC hour timestamps (unix seconds) expected inside this window. */
  expectedHourTs: number[];
  /** True when this date is an NYSE early close (excluded from standard regular baseline). */
  isEarlyClose: boolean;
}

export interface IntelCoverageSummary {
  expectedHours: number;
  observedHoursCompleteAcrossPools: number;
  missingPoolHours: number;
  excludedIncompleteBaselineWindows: number;
  candidateBaselineWindows: number;
  straddlingHoursExcluded: string[];
  notes: string[];
}

export interface IntelEventRevision {
  revision: number;
  supersededAt: string;
  observedUsd: number;
  baselineMedianUsd: number;
  baselineSampleCount: number;
  usdIncreaseUsd: number;
  volumeMultiple: number;
  poolContributions: IntelPoolContribution[];
  coverage: IntelCoverageSummary;
}

export interface IntelEvent {
  /** Stable deterministic ID: base-<symbol>-<session>-<nyDate>-<detectorVersion> */
  id: string;
  chain: typeof INTEL_CHAIN;
  chainId: typeof INTEL_CHAIN_ID;
  ticker: string;
  symbol: string;
  name: string;
  tokenAddress: Address;
  detectorVersion: string;

  session: IntelSessionKind;
  nyDate: string;
  timeZone: typeof INTEL_TIMEZONE;
  windowStartUtc: string;
  windowEndUtc: string;
  windowNyLabel: string;
  boundaryNote: string;

  observedUsd: number;
  baselineMedianUsd: number;
  baselineSampleCount: number;
  baselineLookbackDays: number;
  usdIncreaseUsd: number;
  volumeMultiple: number;

  pools: IntelPoolDescriptor[];
  poolContributions: IntelPoolContribution[];
  coverage: IntelCoverageSummary;

  triggerRule: string;
  thresholds: {
    minBaselineSamples: number;
    minUsdIncrease: number;
    minVolumeMultiple: number;
  };
  source: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  revisions: IntelEventRevision[];
  /** True only for clearly labeled demo fixtures when live history has no qualifying event. */
  isFixture?: boolean;
}

export type WindowEvaluationStatus = "qualified" | "normal" | "insufficient_data";

export interface WindowEvaluation {
  status: WindowEvaluationStatus;
  reason: string;
  ticker: string;
  symbol: string;
  window: SessionWindowSpec;
  observedUsd: number | null;
  baselineMedianUsd: number | null;
  baselineSampleCount: number;
  usdIncreaseUsd: number | null;
  volumeMultiple: number | null;
  coverage: IntelCoverageSummary;
  event: IntelEvent | null;
}
