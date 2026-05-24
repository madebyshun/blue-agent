/**
 * Blue Sentinel — Shared Types
 *
 * Single source of truth for all Sentinel types.
 * Import from here, not from catalog.ts or individual modules.
 */

// ─── Threat taxonomy ──────────────────────────────────────────────────────────

export type ThreatCategory =
  | "honeypot"
  | "rug"
  | "phishing"
  | "mixer"
  | "exploit"
  | "drain"
  | "aml"
  | "scam_token"
  | "malicious_approval"
  | "proxy_upgrade"
  | "post_deploy"
  | "liquidity_drain";

export type ThreatSeverity = "critical" | "high" | "medium" | "low";

export type TargetType = "address" | "token" | "domain";

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface ThreatEntry {
  id:          string;
  category:    ThreatCategory;
  severity:    ThreatSeverity;
  name:        string;
  description: string;
  /** Heuristic strings used to detect this threat */
  indicators:  string[];
  /** Known-bad Base addresses */
  addresses?:  string[];
  /** Known-bad domains */
  domains?:    string[];
  updatedAt:   string;
}

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Finding {
  id:          string;
  threatId:    string;
  threatName:  string;
  category:    ThreatCategory;
  severity:    ThreatSeverity;
  target:      string;
  targetType:  TargetType;
  summary:     string;
  indicators:  string[];
  chain:       "base";
  detectedAt:  string;
  alerted:     boolean;
}

export interface WatchSubscription {
  id:              string;
  target:          string;
  targetType:      TargetType;
  label?:          string;
  alertChannels:   AlertChannel[];
  webhookUrl?:     string;
  telegramChatId?: string;
  createdAt:       string;
  active:          boolean;
}

export type AlertChannel = "telegram" | "webhook";

// ─── Scheduler ────────────────────────────────────────────────────────────────

export interface SentinelConfig {
  enabled:         boolean;
  intervalMinutes: number;
  scheduleId?:     string;
  mode:            "qstash" | "vercel-cron" | "manual";
  startedAt?:      string;
  startedBy?:      string;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

export interface HubResult {
  safe:       boolean;
  severity:   ThreatSeverity;
  indicators: string[];
  summary:    string;
  raw?:       unknown;
  error?:     string;
}

export interface ScanTarget extends WatchSubscription {
  catalogOnly: boolean;
  source?:     string;
  metadata?:   Record<string, string>;
}

// ─── Scan logs ────────────────────────────────────────────────────────────────

export interface ScanLog {
  runId:        string;
  startedAt:    string;
  finishedAt:   string;
  durationMs:   number;
  userWatches:  number;
  autoTargets:  number;
  totalScanned: number;
  findings:     number;
  alerted:      number;
  errors:       number;
  log:          string[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface SentinelStats {
  totalScans:       number;
  totalFindings:    number;
  totalDiscovered:  number;
  lastScan:         string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "down";

export interface HealthCheck {
  status: HealthStatus;
  reason: string;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export type DiscoverySource = "dexscreener" | "urlhaus" | "pattern" | "upgrade_watcher" | "liquidity_watcher";

export interface DiscoveredTarget {
  target:      string;
  targetType:  TargetType;
  source:      DiscoverySource;
  reason:      string;
  catalogOnly?: boolean;
  metadata?:   Record<string, string>;
}
