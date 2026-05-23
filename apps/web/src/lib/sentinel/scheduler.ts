/**
 * Blue Sentinel — QStash Scheduler
 *
 * Manages recurring scan schedules via Upstash QStash.
 * Falls back gracefully if QSTASH_TOKEN is not set
 * (manual cron-only mode).
 *
 * Docs: https://upstash.com/docs/qstash/features/schedules
 */

import { kvGet, kvSet } from "@/lib/kv";

// ─── Config ───────────────────────────────────────────────────────────────────

const QSTASH_URL  = "https://qstash.upstash.io/v2";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN ?? "";
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const CONFIG_KEY  = "sentinel:config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SentinelConfig {
  enabled:         boolean;
  intervalMinutes: number;   // 5 | 15 | 30 | 60 | 240
  scheduleId?:     string;   // QStash schedule ID
  mode:            "qstash" | "vercel-cron" | "manual";
  startedAt?:      string;
  startedBy?:      string;   // "web" | "telegram" | "api"
}

const DEFAULT_CONFIG: SentinelConfig = {
  enabled:         false,
  intervalMinutes: 15,
  mode:            "manual",
};

// ─── KV helpers ───────────────────────────────────────────────────────────────

export async function getConfig(): Promise<SentinelConfig> {
  return (await kvGet<SentinelConfig>(CONFIG_KEY)) ?? DEFAULT_CONFIG;
}

export async function saveConfig(cfg: SentinelConfig): Promise<void> {
  await kvSet(CONFIG_KEY, cfg);
}

// ─── Cron expression ─────────────────────────────────────────────────────────

function toCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const h = Math.floor(minutes / 60);
  return h === 1 ? "0 * * * *" : `0 */${h} * * *`;
}

// ─── QStash API ───────────────────────────────────────────────────────────────

const scanUrl = (): string =>
  CRON_SECRET
    ? `${APP_URL}/api/cron/sentinel?secret=${CRON_SECRET}`
    : `${APP_URL}/api/cron/sentinel`;

async function qstashCreate(intervalMinutes: number): Promise<string | null> {
  if (!QSTASH_TOKEN) return null;
  try {
    const res = await fetch(`${QSTASH_URL}/schedules`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${QSTASH_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        destination: scanUrl(),
        cron:        toCron(intervalMinutes),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { scheduleId: string };
    return data.scheduleId ?? null;
  } catch {
    return null;
  }
}

async function qstashDelete(scheduleId: string): Promise<boolean> {
  if (!QSTASH_TOKEN || !scheduleId) return false;
  try {
    const res = await fetch(`${QSTASH_URL}/schedules/${scheduleId}`, {
      method:  "DELETE",
      headers: { "Authorization": `Bearer ${QSTASH_TOKEN}` },
      signal:  AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startScheduler(opts: {
  intervalMinutes?: number;
  startedBy?: string;
}): Promise<{ ok: boolean; config: SentinelConfig; message: string }> {
  const existing = await getConfig();

  // Stop existing schedule first
  if (existing.scheduleId) {
    await qstashDelete(existing.scheduleId);
  }

  const interval = opts.intervalMinutes ?? existing.intervalMinutes ?? 15;
  const scheduleId = await qstashCreate(interval);

  const cfg: SentinelConfig = {
    enabled:         true,
    intervalMinutes: interval,
    scheduleId:      scheduleId ?? undefined,
    mode:            scheduleId ? "qstash" : "manual",
    startedAt:       new Date().toISOString(),
    startedBy:       opts.startedBy ?? "api",
  };

  await saveConfig(cfg);

  const message = scheduleId
    ? `🛡️ Sentinel scanning every ${interval}min via QStash`
    : `🛡️ Sentinel enabled (manual mode — QSTASH_TOKEN not set)`;

  return { ok: true, config: cfg, message };
}

export async function stopScheduler(): Promise<{ ok: boolean; config: SentinelConfig; message: string }> {
  const existing = await getConfig();

  if (existing.scheduleId) {
    await qstashDelete(existing.scheduleId);
  }

  const cfg: SentinelConfig = {
    ...existing,
    enabled:     false,
    scheduleId:  undefined,
    mode:        "manual",
  };

  await saveConfig(cfg);

  return { ok: true, config: cfg, message: "🛑 Sentinel scanning stopped" };
}

export async function getStatus(): Promise<{
  config:    SentinelConfig;
  qstashAvailable: boolean;
  cronUrl:   string;
}> {
  const config = await getConfig();
  return {
    config,
    qstashAvailable: !!QSTASH_TOKEN,
    cronUrl: scanUrl(),
  };
}
