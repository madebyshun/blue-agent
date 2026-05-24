/**
 * Blue Sentinel — Constants & Config
 *
 * All magic numbers, KV keys, TTLs, and thresholds in one place.
 * Import from here instead of scattering values across modules.
 */

import type { ThreatSeverity } from "@/lib/sentinel/types";

// ─── KV Keys ──────────────────────────────────────────────────────────────────

export const SENTINEL_KV = {
  config:            "sentinel:config",
  watches:           "sentinel:watches",
  findings:          "sentinel:findings:latest",
  findingsHistory:   "sentinel:findings:history",
  scanLast:          "sentinel:scan:last",
  scanStats:         "sentinel:scan:stats",
  scanLogs:          "sentinel:scan:logs",
  scanLock:          "sentinel:scan:running",
  discoveryLast:     "sentinel:discovery:last",
  discoverySeenTokens: "sentinel:discovery:seen_tokens",
  upgradeLastBlock:  "sentinel:upgrade:last_block",
  openphishCache:    "sentinel:phishing:openphish",
  liquiditySnapshot: "sentinel:liquidity:snapshot",
  dedupPrefix:       "sentinel:dedup",
} as const;

// ─── TTLs (seconds) ───────────────────────────────────────────────────────────

export const SENTINEL_TTL = {
  findings:          60 * 60 * 24 * 7,   //  7 days
  findingsHistory:   60 * 60 * 24 * 30,  // 30 days
  scanStats:         60 * 60 * 24 * 7,   //  7 days
  scanLogs:          60 * 60 * 24 * 7,   //  7 days
  scanLock:          90,                  // 90 seconds (slightly > maxDuration)
  dedup:             60 * 60 * 24,        // 24 hours
  seenTokens:        60 * 60 * 24,        // 24 hours
  upgradeBlock:      60 * 60 * 24,        // 24 hours
  openphish:         60 * 60 * 6,         //  6 hours
  liquiditySnapshot: 60 * 60,             //  1 hour  (survives 4 cycles @ 15min)
  watches:           0,                   // no TTL — persistent
} as const;

// ─── Scan config ──────────────────────────────────────────────────────────────

export const SCAN_CONFIG = {
  /** Max concurrent hub calls per batch */
  batchSize:           10,
  /** Pause between batches (ms) */
  batchPauseMs:        500,
  /** Max scan logs to retain */
  maxScanLogs:         20,
  /** Max findings to retain in KV */
  maxFindings:         100,
  /** Max auto-discovered upgrade events per cycle */
  maxUpgradesPerCycle: 30,
  /** Max OpenPhish domains per cycle */
  maxOpenPhishDomains: 50,
  /** Max seen-token cache size */
  maxSeenTokens:       500,
  /** Base blocks per 15-min cycle (~2s block time) */
  blocksPerCycle:      450,
  /** Hub tool timeout (ms) */
  hubTimeout:          20_000,
  /** Upgrade audit timeout (ms) */
  upgradeTimeout:      25_000,
  /** Telegram alert timeout (ms) */
  telegramTimeout:     15_000,
  /** External API timeout (ms) */
  fetchTimeout:        12_000,
} as const;

// ─── Alert threshold ──────────────────────────────────────────────────────────

/** Only alert when finding severity >= this */
export const ALERT_THRESHOLD: ThreatSeverity = "high";

/** Valid QStash schedule intervals (minutes) */
export const VALID_INTERVALS = [5, 15, 30, 60, 240] as const;

// ─── Severity weights (for comparison) ───────────────────────────────────────

export const SEVERITY_WEIGHT: Record<ThreatSeverity, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

// ─── Health check thresholds ──────────────────────────────────────────────────

export const HEALTH_CONFIG = {
  /** Minutes since last scan before status → degraded */
  degradedAfterMin: 20,
  /** Minutes since last scan before status → down */
  downAfterMin:     60,
} as const;

// ─── Discovery crypto keywords (URLhaus filter) ───────────────────────────────

export const CRYPTO_KEYWORDS = [
  "coinbase", "metamask", "uniswap", "base", "ethereum", "crypto",
  "wallet", "defi", "nft", "airdrop", "claim", "reward", "token",
  "blueagent", "basechain", "aerodrome", "compound",
] as const;
