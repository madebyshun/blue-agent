/**
 * Blue Sentinel — Scan Loop
 *
 * Cron: every 15 minutes  ("* /15 * * * *" in vercel.json)
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * What it does each run:
 *   1. Load watched targets from KV (sentinel:watches)
 *   2. For each active target, call the appropriate Hub tool
 *      (hub_honeypot / hub_risk_gate / hub_aml_screen / hub_phishing_scan)
 *   3. Parse responses — extract severity + indicators
 *   4. Any finding severity >= high → store as Finding + alert via Telegram
 *   5. Persist findings to KV + update scan stats
 *
 * Hub tools called internally via /api/* routes (same-origin fetch).
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import {
  THREAT_CATALOG,
  SENTINEL_KV,
  SENTINEL_TTL,
  SEVERITY_WEIGHT,
  type Finding,
  type WatchSubscription,
  type ThreatSeverity,
  type ThreatCategory,
} from "@/lib/sentinel/catalog";

export const runtime    = "nodejs";
export const maxDuration = 60;

// ─── Config ───────────────────────────────────────────────────────────────────

const CRON_SECRET          = process.env.CRON_SECRET ?? "";
const TELEGRAM_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID     = process.env.TELEGRAM_CHAT_ID ?? "";
const TELEGRAM_THREAD_ID   = process.env.TELEGRAM_THREAD_ID ?? "";
const BASE_URL             = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Only alert on these severities
const ALERT_THRESHOLD: ThreatSeverity = "high";

// ─── Hub tool callers ─────────────────────────────────────────────────────────

interface HubResult {
  safe:       boolean;
  severity:   ThreatSeverity;
  indicators: string[];
  summary:    string;
  raw?:       unknown;
}

async function callHoneypotCheck(address: string): Promise<HubResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/tool/hub_honeypot`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ contract_address: address, chain: "base" }),
      signal:  AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = (data?.result as string) ?? JSON.stringify(data);
    const isHoneypot = /honeypot|sell.*block|buy.*only/i.test(text);
    return {
      safe:       !isHoneypot,
      severity:   isHoneypot ? "critical" : "low",
      indicators: isHoneypot ? ["honeypot_detected"] : [],
      summary:    text.slice(0, 300),
      raw:        data,
    };
  } catch (e) {
    return { safe: true, severity: "low", indicators: [], summary: `scan_error: ${(e as Error).message}` };
  }
}

async function callRiskGate(address: string): Promise<HubResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/tool/hub_risk_gate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ target: address, chain: "base" }),
      signal:  AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = (data?.result as string) ?? JSON.stringify(data);
    const sev   = extractSeverityFromText(text);
    const inds  = extractIndicatorsFromText(text);
    return { safe: sev === "low", severity: sev, indicators: inds, summary: text.slice(0, 300), raw: data };
  } catch (e) {
    return { safe: true, severity: "low", indicators: [], summary: `scan_error: ${(e as Error).message}` };
  }
}

async function callAmlScreen(address: string): Promise<HubResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/tool/hub_aml_screen`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address, chain: "base" }),
      signal:  AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = (data?.result as string) ?? JSON.stringify(data);
    const sev   = extractSeverityFromText(text);
    const inds  = extractIndicatorsFromText(text);
    return { safe: sev === "low", severity: sev, indicators: inds, summary: text.slice(0, 300), raw: data };
  } catch (e) {
    return { safe: true, severity: "low", indicators: [], summary: `scan_error: ${(e as Error).message}` };
  }
}

async function callPhishingScan(domain: string): Promise<HubResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/tool/hub_phishing_scan`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: domain }),
      signal:  AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = (data?.result as string) ?? JSON.stringify(data);
    const isPhishing = /phish|malicious|dangerous|scam/i.test(text);
    return {
      safe:       !isPhishing,
      severity:   isPhishing ? "critical" : "low",
      indicators: isPhishing ? ["phishing_detected"] : [],
      summary:    text.slice(0, 300),
      raw:        data,
    };
  } catch (e) {
    return { safe: true, severity: "low", indicators: [], summary: `scan_error: ${(e as Error).message}` };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSeverityFromText(text: string): ThreatSeverity {
  const t = text.toLowerCase();
  if (/critical|severe|ofac|sanction|exploit/.test(t))  return "critical";
  if (/high.?risk|dangerous|malicious|rug|honeypot/.test(t)) return "high";
  if (/medium.?risk|moderate|suspicious/.test(t))         return "medium";
  return "low";
}

function extractIndicatorsFromText(text: string): string[] {
  const found: string[] = [];
  const t = text.toLowerCase();
  for (const entry of THREAT_CATALOG) {
    for (const ind of entry.indicators) {
      const readable = ind.replace(/_/g, " ");
      if (t.includes(readable) || t.includes(ind)) {
        found.push(ind);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * Catalog-based detection — checks target directly against known-bad
 * addresses/domains in the seed catalog. Works without BANKR credits.
 */
function catalogCheck(target: string): HubResult | null {
  const t = target.toLowerCase();
  for (const entry of THREAT_CATALOG) {
    if (entry.domains?.some(d => d.toLowerCase() === t)) {
      return {
        safe:       false,
        severity:   entry.severity,
        indicators: ["known_bad_domain", ...entry.indicators.slice(0, 3)],
        summary:    `Domain "${target}" matched catalog entry: ${entry.name}. ${entry.description}`,
      };
    }
    if (entry.addresses?.some(a => a.toLowerCase() === t)) {
      return {
        safe:       false,
        severity:   entry.severity,
        indicators: ["known_bad_address", ...entry.indicators.slice(0, 3)],
        summary:    `Address "${target}" matched catalog entry: ${entry.name}. ${entry.description}`,
      };
    }
  }
  return null;
}

function mapTargetTypeToCategory(targetType: WatchSubscription["targetType"]): ThreatCategory[] {
  switch (targetType) {
    case "address": return ["aml", "exploit", "drain", "malicious_approval"];
    case "token":   return ["honeypot", "rug", "scam_token"];
    case "domain":  return ["phishing"];
  }
}

function pickThreatId(indicators: string[], category: ThreatCategory): string {
  const match = THREAT_CATALOG.find(
    t => t.category === category && t.indicators.some(i => indicators.includes(i))
  );
  return match?.id ?? `${category}-generic`;
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Telegram delivery ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegramAlert(finding: Finding, chatId?: string): Promise<void> {
  const token  = TELEGRAM_BOT_TOKEN;
  const target = chatId ?? TELEGRAM_CHAT_ID;
  if (!token || !target) return;

  const sevEmoji: Record<ThreatSeverity, string> = {
    critical: "🚨", high: "⚠️", medium: "🟡", low: "🟢",
  };

  const msg = [
    `${sevEmoji[finding.severity]} <b>Blue Sentinel — ${esc(finding.severity.toUpperCase())} Alert</b>`,
    ``,
    `<b>Threat:</b> ${esc(finding.threatName)}`,
    `<b>Target:</b> <code>${esc(finding.target)}</code>`,
    `<b>Type:</b> ${esc(finding.targetType)} · ${esc(finding.category)}`,
    ``,
    `<b>Summary:</b>`,
    esc(finding.summary),
    ``,
    `<i>Detected at ${esc(finding.detectedAt)}</i>`,
    `—`,
    `<a href="https://blueagent.dev/hub">blueagent.dev/hub</a>`,
  ].join("\n");

  const threadId = TELEGRAM_THREAD_ID ? parseInt(TELEGRAM_THREAD_ID, 10) : undefined;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:            target,
      text:               msg,
      parse_mode:         "HTML",
      disable_web_page_preview: true,
      ...(threadId ? { message_thread_id: threadId } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
}

// ─── Webhook delivery ─────────────────────────────────────────────────────────

async function sendWebhookAlert(finding: Finding, webhookUrl: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "sentinel_alert", finding }),
      signal:  AbortSignal.timeout(10000),
    });
  } catch {
    // best-effort
  }
}

// ─── Scan one target ──────────────────────────────────────────────────────────

async function scanTarget(watch: WatchSubscription): Promise<Finding[]> {
  const findings: Finding[] = [];
  const results: HubResult[] = [];

  // ── Step 1: catalog check (no BANKR credit needed) ──────────────────────────
  const catalogHit = catalogCheck(watch.target);
  if (catalogHit) {
    results.push(catalogHit);
  }

  // ── Step 2: Hub tool scan (needs BANKR credit) ───────────────────────────────
  if (watch.targetType === "domain") {
    results.push(await callPhishingScan(watch.target));
  } else if (watch.targetType === "token") {
    const [honeypot, risk] = await Promise.all([
      callHoneypotCheck(watch.target),
      callRiskGate(watch.target),
    ]);
    results.push(honeypot, risk);
  } else {
    // address
    const [risk, aml] = await Promise.all([
      callRiskGate(watch.target),
      callAmlScreen(watch.target),
    ]);
    results.push(risk, aml);
  }

  for (const result of results) {
    if (result.safe) continue;
    if (SEVERITY_WEIGHT[result.severity] < SEVERITY_WEIGHT[ALERT_THRESHOLD]) continue;

    const cats   = mapTargetTypeToCategory(watch.targetType);
    const cat    = cats[0] ?? "exploit";
    const tId    = pickThreatId(result.indicators, cat);
    const entry  = THREAT_CATALOG.find(t => t.id === tId);

    const finding: Finding = {
      id:         nanoid(),
      threatId:   tId,
      threatName: entry?.name ?? tId,
      category:   cat,
      severity:   result.severity,
      target:     watch.target,
      targetType: watch.targetType,
      summary:    result.summary,
      chain:      "base",
      detectedAt: new Date().toISOString(),
      alerted:    false,
    };

    findings.push(finding);
  }

  return findings;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader  = req.headers.get("authorization");
  const secretParam = new URL(req.url).searchParams.get("secret");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startAt = Date.now();
  const log: string[] = [];

  // 1. Load watches
  const watches = (await kvGet<WatchSubscription[]>(SENTINEL_KV.watches)) ?? [];
  const active  = watches.filter(w => w.active);
  log.push(`✓ loaded ${active.length} active watches`);

  if (active.length === 0) {
    await kvSet(SENTINEL_KV.scanLast, new Date().toISOString());
    return NextResponse.json({ ok: true, scanned: 0, findings: 0, log });
  }

  // 2. Scan all targets
  const allFindings: Finding[] = [];
  const scanResults = await Promise.allSettled(
    active.map(w => scanTarget(w).then(f => ({ watch: w, findings: f })))
  );

  for (const result of scanResults) {
    if (result.status === "rejected") {
      log.push(`✗ scan error: ${(result.reason as Error).message}`);
      continue;
    }
    const { watch, findings } = result.value;
    if (findings.length > 0) {
      log.push(`⚠ ${watch.target.slice(0, 12)}… → ${findings.length} finding(s)`);
      allFindings.push(...findings);
    }
  }
  log.push(`✓ scanned ${active.length} targets — ${allFindings.length} finding(s)`);

  // 3. Alert + mark alerted
  let alertCount = 0;
  for (const finding of allFindings) {
    const watch = active.find(w => w.target === finding.target);
    const channels = watch?.alertChannels ?? [];

    const alertTasks: Promise<void>[] = [];

    if (channels.includes("telegram") || TELEGRAM_CHAT_ID) {
      alertTasks.push(
        sendTelegramAlert(finding, watch?.telegramChatId).then(() => {
          finding.alerted = true;
        })
      );
    }
    if (channels.includes("webhook") && watch?.webhookUrl) {
      alertTasks.push(sendWebhookAlert(finding, watch.webhookUrl));
    }

    await Promise.allSettled(alertTasks);
    alertCount++;
  }
  log.push(`✓ ${alertCount} alert(s) sent`);

  // 4. Persist findings
  const existing = (await kvGet<Finding[]>(SENTINEL_KV.findings)) ?? [];
  const merged   = [...allFindings, ...existing].slice(0, 100); // keep last 100
  await kvSet(SENTINEL_KV.findings, merged, SENTINEL_TTL.findings);

  // 5. Update stats
  type Stats = { totalScans: number; totalFindings: number; lastScan: string };
  const stats = (await kvGet<Stats>(SENTINEL_KV.scanStats)) ?? {
    totalScans: 0, totalFindings: 0, lastScan: "",
  };
  stats.totalScans++;
  stats.totalFindings += allFindings.length;
  stats.lastScan = new Date().toISOString();
  await kvSet(SENTINEL_KV.scanStats, stats, SENTINEL_TTL.stats);
  await kvSet(SENTINEL_KV.scanLast, stats.lastScan);

  log.push(`✓ findings stored · took ${Date.now() - startAt}ms`);

  return NextResponse.json({
    ok:       true,
    scanned:  active.length,
    findings: allFindings.length,
    alerted:  alertCount,
    log,
    stats,
  });
}
