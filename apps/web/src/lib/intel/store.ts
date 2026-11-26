/**
 * BlueAgent Markets Intel v1 — Idempotent KV store with evidence revisions.
 *
 * Keys:
 *   - `intel:event:<id>`           — full IntelEvent (with revision history)
 *   - `intel:events:index:v1`      — Set of stored event IDs
 *   - `intel:scan:latest:v1`       — Latest scan summary (coverage, counts, errors)
 *
 * Invariants:
 *   - Event URL (`/markets/intel/<id>`) stays stable across re-ingestion.
 *   - Identical numbers → idempotent `unchanged` (no revision bump).
 *   - Changed numbers → previous snapshot pushed into `revisions[]`, `revision`
 *     incremented, `updatedAt` refreshed, URL unchanged.
 */
import { kvGetProbe, kvSet, kvSAdd, kvSMembers } from "@/lib/kv";
import { findBaseStock } from "@/lib/base-stocks/registry";
import {
  DEFAULT_INTEL_CONFIG,
  INTEL_CHAIN,
  INTEL_CHAIN_ID,
  INTEL_TIMEZONE,
  type IntelEvent,
} from "./types";

export const KV_INTEL_INDEX = "intel:events:index:v1";
export const KV_INTEL_SCAN_LATEST = "intel:scan:latest:v1";
export const intelEventKey = (id: string) => `intel:event:${id}`;

export interface IntelScanSummary {
  scannedAt: string;
  tokens: string[];
  windowsEvaluated: number;
  qualifiedCount: number;
  normalCount: number;
  insufficientDataCount: number;
  ingested: { id: string; action: "created" | "revised" | "unchanged" }[];
  notes: string[];
}

export type IngestOutcome = {
  action: "created" | "revised" | "unchanged";
  event: IntelEvent;
};

function numbersChanged(a: IntelEvent, b: IntelEvent): boolean {
  if (
    a.observedUsd !== b.observedUsd ||
    a.baselineMedianUsd !== b.baselineMedianUsd ||
    a.baselineSampleCount !== b.baselineSampleCount ||
    a.usdIncreaseUsd !== b.usdIncreaseUsd ||
    a.volumeMultiple !== b.volumeMultiple ||
    a.coverage.missingPoolHours !== b.coverage.missingPoolHours ||
    a.coverage.excludedIncompleteBaselineWindows !== b.coverage.excludedIncompleteBaselineWindows
  ) {
    return true;
  }
  if (a.poolContributions.length !== b.poolContributions.length) return true;
  for (let i = 0; i < a.poolContributions.length; i++) {
    const pa = a.poolContributions[i];
    const pb = b.poolContributions[i];
    if (pa.address !== pb.address || pa.observedUsd !== pb.observedUsd) return true;
  }
  return false;
}

/** Pure merge function for idempotent ingestion + revision retention. */
export function mergeIntelEvent(existing: IntelEvent | null, incoming: IntelEvent, nowIso: string): IngestOutcome {
  if (!existing) {
    return {
      action: "created",
      event: {
        ...incoming,
        createdAt: incoming.createdAt || nowIso,
        updatedAt: nowIso,
        revision: 1,
        revisions: [],
      },
    };
  }

  if (!numbersChanged(existing, incoming)) {
    return { action: "unchanged", event: existing };
  }

  const prevRevision = {
    revision: existing.revision,
    supersededAt: nowIso,
    observedUsd: existing.observedUsd,
    baselineMedianUsd: existing.baselineMedianUsd,
    baselineSampleCount: existing.baselineSampleCount,
    usdIncreaseUsd: existing.usdIncreaseUsd,
    volumeMultiple: existing.volumeMultiple,
    poolContributions: existing.poolContributions,
    coverage: existing.coverage,
  };

  const revised: IntelEvent = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso,
    revision: existing.revision + 1,
    revisions: [...existing.revisions, prevRevision],
  };

  return { action: "revised", event: revised };
}

export async function ingestIntelEvent(incoming: IntelEvent, now = new Date()): Promise<IngestOutcome> {
  const probe = await kvGetProbe<IntelEvent>(intelEventKey(incoming.id));
  const existing = probe.status === "hit" ? probe.value : null;
  const outcome = mergeIntelEvent(existing, incoming, now.toISOString());
  if (outcome.action !== "unchanged") {
    await kvSet(intelEventKey(outcome.event.id), outcome.event);
    await kvSAdd(KV_INTEL_INDEX, outcome.event.id);
  }
  return outcome;
}

export async function readIntelEvent(id: string): Promise<IntelEvent | null> {
  if (id === DEMO_FIXTURE_EVENT.id) return DEMO_FIXTURE_EVENT;
  const probe = await kvGetProbe<IntelEvent>(intelEventKey(id));
  return probe.status === "hit" ? probe.value : null;
}

export async function listIntelEvents(): Promise<IntelEvent[]> {
  const ids = await kvSMembers(KV_INTEL_INDEX);
  const events: IntelEvent[] = [];
  for (const id of ids) {
    const p = await kvGetProbe<IntelEvent>(intelEventKey(id));
    if (p.status === "hit") events.push(p.value);
  }
  return events.sort((a, b) => b.windowEndUtc.localeCompare(a.windowEndUtc));
}

export async function saveIntelScanSummary(summary: IntelScanSummary): Promise<void> {
  await kvSet(KV_INTEL_SCAN_LATEST, summary);
}

export async function readIntelScanSummary(): Promise<IntelScanSummary | null> {
  const p = await kvGetProbe<IntelScanSummary>(KV_INTEL_SCAN_LATEST);
  return p.status === "hit" ? p.value : null;
}

/**
 * Clearly labeled deterministic demo fixture for NVDAc on Base 8453.
 * Used ONLY when explicitly opened or when live storage has no qualifying event yet.
 */
const nvda = findBaseStock("NVDA")!;
export const DEMO_FIXTURE_EVENT: IntelEvent = {
  id: "base-nvdac-regular-2026-11-20-v1-fixture",
  chain: INTEL_CHAIN,
  chainId: INTEL_CHAIN_ID,
  ticker: nvda.ticker,
  symbol: nvda.symbol,
  name: nvda.name,
  tokenAddress: nvda.token,
  detectorVersion: DEFAULT_INTEL_CONFIG.detectorVersion,

  session: "regular",
  nyDate: "2026-11-20",
  timeZone: INTEL_TIMEZONE,
  windowStartUtc: "2026-11-20T15:00:00.000Z",
  windowEndUtc: "2026-11-20T21:00:00.000Z",
  windowNyLabel: "10:00-16:00 ET",
  boundaryNote: "Comparable full-hour regular session (6h); 09:00-10:00 ET straddles the 09:30 ET open and is excluded.",

  observedUsd: 1_420_000,
  baselineMedianUsd: 410_000,
  baselineSampleCount: 16,
  baselineLookbackDays: 28,
  usdIncreaseUsd: 1_010_000,
  volumeMultiple: 3.46,

  pools: [
    {
      address: "0x000000000000000000000000000000000000f101",
      name: "NVDAc / USDC (Aerodrome Slipstream — Fixture)",
      dex: "aerodrome-slipstream",
      reserveUsd: 980_000,
    },
    {
      address: "0x000000000000000000000000000000000000f102",
      name: "NVDAc / WETH (Uniswap V3 — Fixture)",
      dex: "uniswap-v3-base",
      reserveUsd: 245_000,
    },
  ],
  poolContributions: [
    {
      address: "0x000000000000000000000000000000000000f101",
      name: "NVDAc / USDC (Aerodrome Slipstream — Fixture)",
      dex: "aerodrome-slipstream",
      observedUsd: 1_192_800,
      sharePct: 84,
      baselineMedianUsd: 344_000,
      missingHoursInWindow: 0,
    },
    {
      address: "0x000000000000000000000000000000000000f102",
      name: "NVDAc / WETH (Uniswap V3 — Fixture)",
      dex: "uniswap-v3-base",
      observedUsd: 227_200,
      sharePct: 16,
      baselineMedianUsd: 66_000,
      missingHoursInWindow: 0,
    },
  ],
  coverage: {
    expectedHours: 6,
    observedHoursCompleteAcrossPools: 6,
    missingPoolHours: 0,
    excludedIncompleteBaselineWindows: 1,
    candidateBaselineWindows: 17,
    straddlingHoursExcluded: ["09:00-10:00 ET (straddles 09:30 ET NYSE open)"],
    notes: [
      "Clearly labeled fixture demonstrating end-to-end Markets Intel v1 evidence & copy-ready X draft.",
      "1 of 17 prior 28d comparable windows excluded due to missing candles.",
    ],
  },
  triggerRule:
    "observed >= 2.5x prior 28d median AND +$50,000 min increase AND >= 5 complete baseline sessions (3.46x, +$1,010,000, n=16)",
  thresholds: {
    minBaselineSamples: 5,
    minUsdIncrease: 50_000,
    minVolumeMultiple: 2.5,
  },
  source: "Fixture dataset (modeled on GeckoTerminal hourly OHLCV, Base 8453)",
  createdAt: "2026-11-20T21:05:00.000Z",
  updatedAt: "2026-11-20T21:05:00.000Z",
  revision: 1,
  revisions: [],
  isFixture: true,
};
