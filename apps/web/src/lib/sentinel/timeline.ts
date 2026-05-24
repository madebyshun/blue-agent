/**
 * Blue Sentinel — Threat Timeline (#11)
 *
 * Tracks daily threat counts over the last 30 days.
 * Updated after every scan run that produces findings.
 *
 * KV key: sentinel:timeline → DailySnapshot[]
 *
 * Each entry covers one UTC calendar day.
 * Multiple scan runs on the same day are MERGED into the same entry.
 */

import { kvGet, kvSet } from "@/lib/kv";
import { SENTINEL_KV } from "@/lib/sentinel/constants";
import type { Finding, DailySnapshot, ThreatCategory } from "@/lib/sentinel/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_DAYS = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "2026-05-24"
}

function emptySnapshot(date: string): DailySnapshot {
  return {
    date,
    total:      0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byCategory: {},
    targets:    [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record new findings into today's snapshot.
 * Merges into the existing entry if the day already has data.
 * Called by the cron route after each scan run.
 */
export async function recordFindings(findings: Finding[]): Promise<void> {
  if (findings.length === 0) return;

  const today    = todayUTC();
  const timeline = (await kvGet<DailySnapshot[]>(SENTINEL_KV.timeline)) ?? [];

  // Find or create today's entry
  const idx      = timeline.findIndex(s => s.date === today);
  const snapshot = idx >= 0 ? timeline[idx] : emptySnapshot(today);

  // Merge findings into snapshot
  for (const f of findings) {
    snapshot.total++;
    snapshot.bySeverity[f.severity]++;

    const cat = f.category as ThreatCategory;
    snapshot.byCategory[cat] = (snapshot.byCategory[cat] ?? 0) + 1;

    const t = f.target.toLowerCase();
    if (!snapshot.targets.includes(t)) snapshot.targets.push(t);
  }

  // Upsert
  if (idx >= 0) {
    timeline[idx] = snapshot;
  } else {
    timeline.unshift(snapshot); // newest first
  }

  // Keep rolling 30-day window, sorted newest first
  const trimmed = timeline
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_DAYS);

  await kvSet(SENTINEL_KV.timeline, trimmed);
}

/**
 * Get the full timeline (last 30 days, newest first).
 */
export async function getTimeline(): Promise<DailySnapshot[]> {
  return (await kvGet<DailySnapshot[]>(SENTINEL_KV.timeline)) ?? [];
}

/**
 * Get aggregated stats for the last N days.
 */
export async function getTimelineStats(days = 7): Promise<{
  totalThreats:    number;
  totalTargets:    number;
  bySeverity:      { critical: number; high: number; medium: number; low: number };
  byCategory:      Partial<Record<ThreatCategory, number>>;
  dailyPeak:       number;
  activeDays:      number;
  snapshots:       DailySnapshot[];
}> {
  const all      = await getTimeline();
  const cutoff   = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = all.filter(s => s.date >= cutoffStr);

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory: Partial<Record<ThreatCategory, number>> = {};
  const allTargets  = new Set<string>();
  let   dailyPeak   = 0;

  for (const s of recent) {
    bySeverity.critical += s.bySeverity.critical;
    bySeverity.high     += s.bySeverity.high;
    bySeverity.medium   += s.bySeverity.medium;
    bySeverity.low      += s.bySeverity.low;

    for (const [cat, count] of Object.entries(s.byCategory)) {
      const c = cat as ThreatCategory;
      byCategory[c] = (byCategory[c] ?? 0) + (count ?? 0);
    }

    s.targets.forEach(t => allTargets.add(t));
    if (s.total > dailyPeak) dailyPeak = s.total;
  }

  const totalThreats = bySeverity.critical + bySeverity.high + bySeverity.medium + bySeverity.low;

  // Fill missing days with zero-entries for chart continuity
  const filled: DailySnapshot[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const found   = recent.find(s => s.date === dateStr);
    filled.push(found ?? emptySnapshot(dateStr));
  }

  return {
    totalThreats,
    totalTargets:  allTargets.size,
    bySeverity,
    byCategory,
    dailyPeak,
    activeDays:    recent.filter(s => s.total > 0).length,
    snapshots:     filled, // oldest → newest, always `days` entries
  };
}
