/**
 * Blue Sentinel — Telegram Webhook
 * POST /api/webhook/telegram
 *
 * Handles incoming Telegram messages.
 * Register webhook:
 *   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://blueagent.dev/api/webhook/telegram
 *
 * Commands:
 *   /check <address|domain>           — instant risk score (0-100) for any address or domain
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
    `<b>/check 0x... or domain.xyz</b>`,
    `  Instant risk score for any address or domain`,
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

// ─── /start command — register user & return their chat ID ───────────────────

function handleBotStart(chatId: number, user?: TgUser): string {
  const name = user?.first_name ?? "there";
  return [
    `🛡️ <b>Welcome to Blue Sentinel, ${esc(name)}!</b>`,
    ``,
    `I monitor wallets, tokens, and domains on Base 24/7 and alert you when threats are detected.`,
    ``,
    `<b>Your Telegram ID:</b>`,
    `<code>${chatId}</code>`,
    ``,
    `Copy this ID and paste it when adding a Watch at:`,
    `<a href="${BASE_URL}/sentinel">${esc(BASE_URL)}/sentinel</a>`,
    ``,
    `<b>Commands:</b>`,
    `• <code>/check 0x...</code> — instant risk scan`,
    `• <code>/check domain.xyz</code> — phishing check`,
    `• <code>/blue sentinel help</code> — all commands`,
  ].join("\n");
}

// ─── /check command ───────────────────────────────────────────────────────────

interface ScoreResponse {
  score:      number;
  grade:      string;
  risk_level: string;
  type:       string;
  indicators: string[];
  summary:    string;
  categories: Record<string, { severity: string; indicators: string[] }>;
  scan_ms:    number;
  cached:     boolean;
}

async function handleCheck(target: string): Promise<string> {
  if (!target) {
    return [
      `🛡️ <b>Blue Sentinel — /check</b>`,
      ``,
      `Usage: <code>/check 0x... or domain.xyz</code>`,
      ``,
      `Examples:`,
      `  <code>/check 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913</code>`,
      `  <code>/check coinbase-claim.net</code>`,
    ].join("\n");
  }

  // Auto-detect type
  const isAddress = /^0x[0-9a-fA-F]{40}$/i.test(target);
  const typeParam = isAddress ? "" : "&type=domain";
  const url = `${BASE_URL}/api/sentinel/score?address=${encodeURIComponent(target)}${typeParam}`;

  let data: ScoreResponse;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    data = await res.json() as ScoreResponse;
  } catch (e) {
    return `❌ <b>Scan failed</b>\n\n${esc((e as Error).message)}\n\nTry again in a moment.`;
  }

  // Grade → emoji
  const gradeEmoji: Record<string, string> = {
    A: "🟢", B: "🟡", C: "🟠", D: "🔴", F: "🚨",
  };
  const riskEmoji: Record<string, string> = {
    safe: "✅ SAFE", low: "🟢 LOW", medium: "🟡 MEDIUM", high: "🔴 HIGH", critical: "🚨 CRITICAL",
  };

  const emoji  = gradeEmoji[data.grade] ?? "•";
  const risk   = riskEmoji[data.risk_level] ?? data.risk_level.toUpperCase();
  const short  = isAddress ? `${target.slice(0, 6)}…${target.slice(-4)}` : target;

  // Category breakdown (only flagged)
  const flaggedCats = Object.entries(data.categories ?? {})
    .map(([cat, v]) => {
      const sev = v.severity;
      const sevIcon = sev === "critical" ? "🚨" : sev === "high" ? "⚠️" : sev === "medium" ? "🟡" : "🔵";
      return `  ${sevIcon} ${cat.replace(/_/g, " ")} — <i>${sev}</i>`;
    });

  // Top indicators (max 5)
  const topIndicators = (data.indicators ?? [])
    .slice(0, 5)
    .map(i => `  • ${esc(i.replace(/_/g, " "))}`);

  const lines = [
    `${emoji} <b>Blue Sentinel — Risk Score</b>`,
    ``,
    `<b>Target:</b> <code>${esc(short)}</code>`,
    `<b>Type:</b> ${data.type}`,
    ``,
    `<b>Score: ${data.score}/100 · Grade ${data.grade}</b>`,
    `<b>Risk: ${risk}</b>`,
  ];

  if (flaggedCats.length > 0) {
    lines.push(``, `<b>Threats detected:</b>`, ...flaggedCats);
  }

  if (topIndicators.length > 0) {
    lines.push(``, `<b>Indicators:</b>`, ...topIndicators);
  }

  if (data.summary) {
    lines.push(``, `<i>${esc(data.summary.slice(0, 200))}</i>`);
  }

  lines.push(
    ``,
    `⏱ ${data.scan_ms ?? 0}ms · ${data.cached ? "cached" : "live scan"}`,
    `<a href="${BASE_URL}/sentinel">🌐 Full report → blueagent.dev/sentinel</a>`,
  );

  return lines.join("\n");
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
  const rawText  = msg.text.trim();
  const text     = rawText.toLowerCase();

  // ── /start — register user, return their chat ID ────────────────────────────
  if (text.startsWith("/start")) {
    await send(chatId, handleBotStart(chatId, msg.from));
    return NextResponse.json({ ok: true });
  }

  // ── /check <address|domain> — instant risk scan ──────────────────────────────
  if (text.startsWith("/check")) {
    // Preserve original casing for addresses/domains
    const target = rawText.slice("/check".length).trim();
    const reply  = await handleCheck(target);
    await send(chatId, reply);
    return NextResponse.json({ ok: true });
  }

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
