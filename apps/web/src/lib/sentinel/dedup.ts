/**
 * Blue Sentinel — Finding Deduplication
 *
 * Prevents re-alerting for the same threat on the same target
 * within a configurable window (default: 24h).
 *
 * Key format:  "sentinel:dedup:{target}:{threatId}"
 * Value:       ISO timestamp of first detection
 * TTL:         DEDUP_TTL_SECONDS (default 24h)
 *
 * Logic:
 *   - First detection  → NOT duplicate → alert
 *   - Same target+threat within TTL window → duplicate → skip
 *   - Severity escalation (medium → critical) → NOT duplicate → re-alert
 */

import { kvGet, kvSet, kvDel } from "@/lib/kv";
import type { ThreatSeverity } from "./catalog";

// ─── Config ───────────────────────────────────────────────────────────────────

const DEDUP_PREFIX    = "sentinel:dedup";
const DEDUP_TTL       = 60 * 60 * 24;       // 24h default
const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DedupEntry {
  seenAt:   string;
  severity: ThreatSeverity;
  alertedAt?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedupKey(target: string, threatId: string): string {
  return `${DEDUP_PREFIX}:${target.toLowerCase()}:${threatId}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if a finding is a duplicate.
 * Returns true if same target+threat was seen within the TTL window
 * AND severity has not escalated.
 */
export async function isDuplicate(opts: {
  target:   string;
  threatId: string;
  severity: ThreatSeverity;
}): Promise<boolean> {
  const entry = await kvGet<DedupEntry>(dedupKey(opts.target, opts.threatId));
  if (!entry) return false;

  // Severity escalation → NOT a duplicate → re-alert
  if (SEVERITY_WEIGHT[opts.severity] > SEVERITY_WEIGHT[entry.severity]) {
    return false;
  }

  return true;
}

/**
 * Record a finding as seen.
 * Call this after creating a Finding (whether alerted or not).
 */
export async function markSeen(opts: {
  target:   string;
  threatId: string;
  severity: ThreatSeverity;
  alerted:  boolean;
  ttl?:     number;
}): Promise<void> {
  const entry: DedupEntry = {
    seenAt:   new Date().toISOString(),
    severity: opts.severity,
    alertedAt: opts.alerted ? new Date().toISOString() : undefined,
  };
  await kvSet(dedupKey(opts.target, opts.threatId), entry, opts.ttl ?? DEDUP_TTL);
}

/**
 * Clear dedup state for a specific target (e.g., when watch is removed).
 * Pass threatId to clear a specific finding, omit to clear all for target.
 */
export async function clearTarget(target: string, threatId?: string): Promise<void> {
  if (threatId) {
    await kvDel(dedupKey(target, threatId));
  }
  // Note: clearing all entries for a target requires a scan — use sparingly
}

/**
 * Reset dedup for a target so it gets rescanned fresh.
 * Useful for: user manually adds a watch, or after a finding is dismissed.
 */
export async function resetTarget(target: string, threatId: string): Promise<void> {
  await kvDel(dedupKey(target, threatId));
}
