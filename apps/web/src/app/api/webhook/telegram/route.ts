/**
 * Blue Sentinel — Telegram Webhook
 * POST /api/webhook/telegram
 *
 * Handles incoming Telegram messages.
 * Register webhook:
 *   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://blueagent.dev/api/webhook/telegram
 *
 * Commands:
 *   /blue sentinel start [interval]   — start auto-scan loop (interval: 5|15|30|60|240 min)
 *   /blue sentinel stop               — stop auto-scan loop
 *   /blue sentinel status             — show current config + last scan
 *   /blue sentinel scan               — trigger manual scan now
 *   /blue sentinel watches            — list watched targets
 *   /blue sentinel help               — show all commands
 */

import { NextRequest, NextResponse } from "next/server";
import { getStatus, startScheduler, stopScheduler } from "@/lib/sentinel/scheduler";
import { kvGet } from "@/lib/kv";
import { SENTINEL_KV, type WatchSubscription, type Finding } from "@/lib/sentinel/catalog";

export const runtime = "nodejs";

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN   ?? "";
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL  ?? "https://blueagent.dev";
const CRON_SECRET   = process.env.CRON_SECRET          ?? "";

// ─── Telegram types ───────────────────────────────────────────────────────────

interface TgUser    { id: number; username?: string; first_name?: string }
interface TgChat    { id: number; type: string }
interface TgMessage { message_id: number; from?: TgUser; chat: TgChat; text?: string; date: number }
interface TgUpdate  { update_id: number; message?: TgMessage }

// ─── Send helper ─────────────────────────────────────────────────────────────

async function send(chatId: number, text: string, threadId?: number): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               "HTML",
      disable_web_page_preview: true,
      ...(threadId ? { message_thread_id: threadId } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
}

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleStart(chatId: number, args: string[]): Promise<string> {
  const VALID = [5, 15, 30, 60, 240];
  const interval = args[0] ? parseInt(args[0]) : 15;
  const validInterval = VALID.includes(interval) ? interval : 15;

  const result = await startScheduler({
    intervalMinutes: validInterval,
    startedBy: "telegram",
  });

  const mode = result.config.mode === "qstash"
    ? `🔄 QStash · every <b>${validInterval} min</b>`
    : `📌 Manual mode (add QSTASH_TOKEN for auto-scheduling)`;

  return [
    `🛡️ <b>Blue Sentinel — Started</b>`,
    ``,
    mode,
    ``,
    `<b>Interval:</b> every ${validInterval} minutes`,
    `<b>Target URL:</b> <code>${esc(BASE_URL)}/api/cron/sentinel</code>`,
    ``,
    `Use /blue sentinel status to check progress.`,
  ].join("\n");
}

async function handleStop(chatId: number): Promise<string> {
  const result = await stopScheduler();
  void chatId;
  return [
    `🛑 <b>Blue Sentinel — Stopped</b>`,
    ``,
    `Auto-scanning is now disabled.`,
    `Use /blue sentinel start to re-enable.`,
  ].join("\n");
}

async function handleStatus(): Promise<string> {
  const [status, lastScan, stats] = await Promise.all([
    getStatus(),
    kvGet<string>(SENTINEL_KV.scanLast),
    kvGet<{ totalScans: number; totalFindings: number }>(SENTINEL_KV.scanStats),
  ]);

  const cfg = status.config;
  const stateEmoji = cfg.enabled ? "🟢" : "🔴";
  const modeLabel  = cfg.mode === "qstash" ? "QStash" : cfg.mode === "vercel-cron" ? "Vercel Cron" : "Manual";

  return [
    `🛡️ <b>Blue Sentinel — Status</b>`,
    ``,
    `${stateEmoji} <b>State:</b> ${cfg.enabled ? "RUNNING" : "STOPPED"}`,
    `⏱ <b>Interval:</b> every ${cfg.mode === "vercel-cron" ? "24h (cron)" : cfg.intervalMinutes + " min"}`,
    `🔧 <b>Mode:</b> ${modeLabel}`,
    ``,
    `<b>Last scan:</b> ${lastScan ? new Date(lastScan).toLocaleString("en", { timeZone: "UTC" }) + " UTC" : "Never"}`,
    `<b>Total scans:</b> ${stats?.totalScans ?? 0}`,
    `<b>Total findings:</b> ${stats?.totalFindings ?? 0}`,
    ``,
    `<b>QStash available:</b> ${status.qstashAvailable ? "✅" : "❌ (set QSTASH_TOKEN)"}`,
    cfg.startedAt ? `<b>Started:</b> ${new Date(cfg.startedAt).toLocaleString("en", { timeZone: "UTC" })} UTC` : "",
  ].filter(Boolean).join("\n");
}

async function handleScan(chatId: number): Promise<string> {
  void chatId;
  try {
    const url = CRON_SECRET
      ? `${BASE_URL}/api/cron/sentinel?secret=${CRON_SECRET}`
      : `${BASE_URL}/api/cron/sentinel`;

    const res  = await fetch(url, { signal: AbortSignal.timeout(55000) });
    const data = await res.json() as { findings?: number; alerted?: number; scanned?: number; ok?: boolean };

    if (!data.ok) return `❌ Scan failed — check logs`;

    return [
      `✅ <b>Scan Complete</b>`,
      ``,
      `📋 Targets scanned: <b>${data.scanned ?? 0}</b>`,
      `⚠️ Findings: <b>${data.findings ?? 0}</b>`,
      `📢 Alerts sent: <b>${data.alerted ?? 0}</b>`,
    ].join("\n");
  } catch (e) {
    return `❌ Scan error: ${(e as Error).message}`;
  }
}

async function handleWatches(): Promise<string> {
  const watches = (await kvGet<WatchSubscription[]>(SENTINEL_KV.watches)) ?? [];
  const active  = watches.filter(w => w.active);

  if (active.length === 0) {
    return `👁 <b>Watched Targets</b>\n\nNo active watches.\nAdd targets at <a href="${BASE_URL}/sentinel">${esc(BASE_URL)}/sentinel</a>`;
  }

  const lines = active.map((w, i) =>
    `${i + 1}. <code>${esc(w.target.slice(0, 20))}…</code>${w.label ? ` — ${esc(w.label)}` : ""} <i>(${w.targetType})</i>`
  );

  return [`👁 <b>Watched Targets · ${active.length}</b>`, "", ...lines].join("\n");
}

async function handleFindings(): Promise<string> {
  const findings = (await kvGet<Finding[]>(SENTINEL_KV.findings)) ?? [];
  const recent   = findings.slice(0, 5);

  if (recent.length === 0) {
    return `🛡️ <b>No recent findings</b>\n\nAll watched targets look clean.`;
  }

  const sevEmoji: Record<string, string> = { critical: "🚨", high: "⚠️", medium: "🟡", low: "🟢" };

  const lines = recent.map(f =>
    `${sevEmoji[f.severity] ?? "•"} <b>${esc(f.threatName)}</b>\n   <code>${esc(f.target.slice(0, 20))}</code> · ${f.category}`
  );

  return [`⚠️ <b>Recent Findings · ${findings.length} total</b>`, "", ...lines].join("\n");
}

function handleHelp(): string {
  return [
    `🛡️ <b>Blue Sentinel Commands</b>`,
    ``,
    `<b>/blue sentinel start [interval]</b>`,
    `  Start auto-scan. Interval: 5, 15, 30, 60, 240 min`,
    ``,
    `<b>/blue sentinel stop</b>`,
    `  Stop auto-scan loop`,
    ``,
    `<b>/blue sentinel status</b>`,
    `  Show current config + scan stats`,
    ``,
    `<b>/blue sentinel scan</b>`,
    `  Trigger a manual scan now`,
    ``,
    `<b>/blue sentinel watches</b>`,
    `  List all watched targets`,
    ``,
    `<b>/blue sentinel findings</b>`,
    `  Show recent findings`,
    ``,
    `<a href="${BASE_URL}/sentinel">🌐 Open Sentinel Dashboard</a>`,
  ].join("\n");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let update: TgUpdate;
  try {
    update = await req.json() as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed
  }

  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const chatId   = msg.chat.id;
  const text     = msg.text.trim().toLowerCase();

  // Only handle /blue sentinel commands
  if (!text.startsWith("/blue sentinel") && !text.startsWith("/sentinel")) {
    return NextResponse.json({ ok: true });
  }

  // Parse: /blue sentinel <sub> [args...]
  const parts    = text.replace("/blue sentinel", "").replace("/sentinel", "").trim().split(/\s+/);
  const sub      = parts[0] ?? "help";
  const args     = parts.slice(1);

  let reply = "";

  switch (sub) {
    case "start":
      reply = await handleStart(chatId, args);
      break;
    case "stop":
      reply = await handleStop(chatId);
      break;
    case "status":
      reply = await handleStatus();
      break;
    case "scan":
      reply = await handleScan(chatId);
      break;
    case "watches":
    case "watch":
      reply = await handleWatches();
      break;
    case "findings":
    case "alerts":
      reply = await handleFindings();
      break;
    case "help":
    default:
      reply = handleHelp();
  }

  await send(chatId, reply);
  return NextResponse.json({ ok: true });
}
