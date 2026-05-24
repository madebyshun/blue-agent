/**
 * Blue Sentinel — Liquidity Sentinel (#16)
 *
 * Monitors token liquidity on Base using DexScreener pair data.
 * Detects:
 *   - Critical liquidity drop (>70% drop since last cycle)
 *   - Critically low liquidity (<$10k USD)
 *   - Extreme volume/liquidity ratio (>10x — wash trading / pump-dump)
 *   - Rapid price crash (>50% drop in 1h)
 *
 * Data source: DexScreener free API (no key required)
 *   GET https://api.dexscreener.com/latest/dex/tokens/{address}
 *
 * KV cache: sentinel:liquidity:snapshot  (15min TTL — matches scan cycle)
 *   Stores: { [tokenAddress]: { liquidity: number, price: number, ts: string } }
 */

import { kvGet, kvSet } from "@/lib/kv";
import type { DiscoveredTarget } from "@/lib/sentinel/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairData {
  pairAddress:  string;
  baseToken:    { address: string; name: string; symbol: string };
  quoteToken:   { address: string; symbol: string };
  priceUsd?:    string;
  liquidity?:   { usd?: number };
  volume?:      { h24?: number };
  priceChange?: { h1?: number; h24?: number };
  chainId:      string;
}

interface LiquiditySnapshot {
  liquidityUsd: number;
  priceUsd:     number;
  volumeH24:    number;
  ts:           string;
}

type LiquiditySnapshotMap = Record<string, LiquiditySnapshot>;

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAPSHOT_KEY        = "sentinel:liquidity:snapshot";
const SNAPSHOT_TTL        = 60 * 60;       // 1h — survives 4 cycles at 15min
const FETCH_TIMEOUT_MS    = 12_000;

const THRESHOLDS = {
  /** USD below which liquidity is dangerously low */
  minLiquidityUsd:    10_000,
  /** % liquidity drop from last snapshot that triggers critical alert */
  criticalDropPct:    70,
  /** % price drop in 1h that triggers alert */
  priceCrash1hPct:    50,
  /** vol/liq ratio above which wash-trading/pump-dump is flagged */
  volLiqRatio:        10,
  /** Minimum liquidity to bother monitoring (ignore micro-pools) */
  ignoreBelow:        500,
} as const;

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

async function getSnapshot(): Promise<LiquiditySnapshotMap> {
  return (await kvGet<LiquiditySnapshotMap>(SNAPSHOT_KEY)) ?? {};
}

async function saveSnapshot(map: LiquiditySnapshotMap): Promise<void> {
  await kvSet(SNAPSHOT_KEY, map, SNAPSHOT_TTL);
}

// ─── DexScreener fetcher ──────────────────────────────────────────────────────

async function fetchPairs(tokenAddress: string): Promise<PairData[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      {
        headers: { "Accept": "application/json" },
        signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const data = await res.json() as { pairs?: PairData[] };
    // Only Base chain pairs, sorted by liquidity desc
    return (data.pairs ?? [])
      .filter(p => p.chainId === "base")
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  } catch {
    return [];
  }
}

// ─── Analyze a single token ───────────────────────────────────────────────────

export interface LiquidityAlert {
  tokenAddress: string;
  symbol:       string;
  threatId:     string;
  severity:     "critical" | "high";
  reason:       string;
  liquidityUsd: number;
  priceUsd:     number;
  volumeH24:    number;
  priceChange1h?: number;
}

export async function checkTokenLiquidity(
  tokenAddress: string,
): Promise<LiquidityAlert[]> {
  const alerts: LiquidityAlert[] = [];
  const pairs = await fetchPairs(tokenAddress);
  if (pairs.length === 0) return alerts;

  // Use the most liquid pair as source of truth
  const pair          = pairs[0];
  const symbol        = pair.baseToken.symbol;
  const liquidityUsd  = pair.liquidity?.usd  ?? 0;
  const volumeH24     = pair.volume?.h24      ?? 0;
  const priceUsd      = parseFloat(pair.priceUsd ?? "0");
  const priceChange1h = pair.priceChange?.h1;

  // Skip micro-pools not worth monitoring
  if (liquidityUsd < THRESHOLDS.ignoreBelow) return alerts;

  // ── Load snapshot & check for liquidity drop ───────────────────────────────
  const snapshot    = await getSnapshot();
  const prev        = snapshot[tokenAddress.toLowerCase()];
  const prevLiq     = prev?.liquidityUsd ?? 0;

  if (prev && prevLiq > 0) {
    const dropPct = ((prevLiq - liquidityUsd) / prevLiq) * 100;
    if (dropPct >= THRESHOLDS.criticalDropPct) {
      alerts.push({
        tokenAddress,
        symbol,
        threatId:     "liquidity-critical-drop-v1",
        severity:     "critical",
        reason:       `Liquidity dropped ${dropPct.toFixed(0)}% in last cycle ($${prevLiq.toLocaleString()} → $${liquidityUsd.toLocaleString()})`,
        liquidityUsd,
        priceUsd,
        volumeH24,
        priceChange1h,
      });
    }
  }

  // ── Low liquidity check ────────────────────────────────────────────────────
  if (liquidityUsd < THRESHOLDS.minLiquidityUsd) {
    alerts.push({
      tokenAddress,
      symbol,
      threatId:     "liquidity-low-v1",
      severity:     "high",
      reason:       `Liquidity critically low: $${liquidityUsd.toLocaleString()} (threshold: $${THRESHOLDS.minLiquidityUsd.toLocaleString()})`,
      liquidityUsd,
      priceUsd,
      volumeH24,
      priceChange1h,
    });
  }

  // ── Vol/Liq ratio check ────────────────────────────────────────────────────
  if (liquidityUsd > 0 && volumeH24 > 0) {
    const ratio = volumeH24 / liquidityUsd;
    if (ratio >= THRESHOLDS.volLiqRatio) {
      alerts.push({
        tokenAddress,
        symbol,
        threatId:     "liquidity-vol-ratio-v1",
        severity:     "high",
        reason:       `Vol/Liq ratio ${ratio.toFixed(1)}x — possible wash trading or pump-dump (vol $${volumeH24.toLocaleString()}, liq $${liquidityUsd.toLocaleString()})`,
        liquidityUsd,
        priceUsd,
        volumeH24,
        priceChange1h,
      });
    }
  }

  // ── Price crash check ──────────────────────────────────────────────────────
  if (priceChange1h !== undefined && priceChange1h <= -THRESHOLDS.priceCrash1hPct) {
    alerts.push({
      tokenAddress,
      symbol,
      threatId:     "liquidity-price-crash-v1",
      severity:     "high",
      reason:       `Price crashed ${priceChange1h.toFixed(1)}% in 1h — possible rug or coordinated dump`,
      liquidityUsd,
      priceUsd,
      volumeH24,
      priceChange1h,
    });
  }

  // ── Update snapshot ────────────────────────────────────────────────────────
  const updatedSnapshot = { ...snapshot };
  updatedSnapshot[tokenAddress.toLowerCase()] = {
    liquidityUsd,
    priceUsd,
    volumeH24,
    ts: new Date().toISOString(),
  };
  await saveSnapshot(updatedSnapshot);

  return alerts;
}

// ─── Discovery: scan top Base tokens for liquidity anomalies ─────────────────

/**
 * Returns DiscoveredTarget[] for tokens showing liquidity alerts.
 * Called from discoverAll() as source "liquidity_watcher".
 *
 * Input: token addresses to check (e.g. recently seen from DexScreener)
 */
export async function discoverLiquidityAlerts(
  tokenAddresses: string[],
): Promise<DiscoveredTarget[]> {
  if (tokenAddresses.length === 0) return [];

  const discovered: DiscoveredTarget[] = [];

  // Check in small batches to avoid hammering DexScreener
  const BATCH = 5;
  for (let i = 0; i < tokenAddresses.length; i += BATCH) {
    const batch = tokenAddresses.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(addr => checkTokenLiquidity(addr)),
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || r.value.length === 0) continue;
      const alerts = r.value;
      const worst  = alerts.sort((a, b) =>
        (b.severity === "critical" ? 2 : 1) - (a.severity === "critical" ? 2 : 1),
      )[0];

      discovered.push({
        target:     worst.tokenAddress,
        targetType: "token",
        source:     "liquidity_watcher",
        reason:     worst.reason,
        metadata: {
          symbol:       worst.symbol,
          threatId:     worst.threatId,
          severity:     worst.severity,
          liquidityUsd: String(worst.liquidityUsd),
          priceUsd:     String(worst.priceUsd),
          volumeH24:    String(worst.volumeH24),
        },
      });
    }

    // Small pause between batches
    if (i + BATCH < tokenAddresses.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return discovered;
}

/**
 * Discover from DexScreener top tokens on Base + check liquidity.
 * Used when called standalone (not as a sub-check).
 */
export async function discoverTopBaseLiquidity(): Promise<DiscoveredTarget[]> {
  const tokenAddresses: string[] = [];

  try {
    // Boosted tokens (actively promoted — higher risk of manipulation)
    const boostRes = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (boostRes.ok) {
      const boosts = await boostRes.json() as Array<{ chainId: string; tokenAddress: string }>;
      for (const b of boosts) {
        if (b.chainId === "base" && b.tokenAddress) {
          tokenAddresses.push(b.tokenAddress);
        }
      }
    }
  } catch { /* silent */ }

  // Deduplicate
  const unique = [...new Set(tokenAddresses)].slice(0, 30);
  return discoverLiquidityAlerts(unique);
}
