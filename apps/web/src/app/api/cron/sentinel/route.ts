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
import { isDuplicate, markSeen } from "@/lib/sentinel/dedup";
import { discoverAll } from "@/lib/sentinel/discovery";

export const runtime     = "nodejs";
export const maxDuration = 60;

// ─── Scan lock (prevent concurrent runs) ─────────────────────────────────────

const LOCK_KEY = "sentinel:scan:running";
const LOCK_TTL = 90; // seconds — slightly longer than maxDuration

async function acquireLock(): Promise<boolean> {
  const existing = await kvGet<string>(LOCK_KEY);
  if (existing) return false;
  await kvSet(LOCK_KEY, new Date().toISOString(), LOCK_TTL);
  return true;
}

async function releaseLock(): Promise<void> {
  await kvSet(LOCK_KEY, "", 1); // expire in 1s
}

// ─── Scan log ─────────────────────────────────────────────────────────────────

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

const SCAN_LOGS_KEY = "sentinel:scan:logs";
const SCAN_LOGS_MAX = 20; // keep last 20 runs

async function persistScanLog(entry: ScanLog): Promise<void> {
  const existing = (await kvGet<ScanLog[]>(SCAN_LOGS_KEY)) ?? [];
  const updated  = [entry, ...existing].slice(0, SCAN_LOGS_MAX);
  await kvSet(SCAN_LOGS_KEY, updated, 60 * 60 * 24 * 7); // 7 days
}

// ─── Batch scanner (rate-limit: max 10 concurrent) ────────────────────────────

const BATCH_SIZE = 10;

async function scanInBatches(targets: WatchSubscription[]): Promise<Array<{ watch: WatchSubscription; findings: Finding[] }>> {
  const results: Array<{ watch: WatchSubscription; findings: Finding[] }> = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(w => scanTarget(w).then(f => ({ watch: w, findings: f })))
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    // Small pause between batches to avoid hammering Bankr API
    if (i + BATCH_SIZE < targets.length) {
      await new Promise(res => setTimeout(res, 500));
    }
  }
  return results;
}

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

async function sendTelegramAlert(finding: Finding, chatId?: string): Promise<boolean> {
  const token  = TELEGRAM_BOT_TOKEN;
  const target = chatId ?? TELEGRAM_CHAT_ID;
  if (!token || !target) return false;

  const sevEmoji: Record<ThreatSeverity, string> = {
    critical: "🚨", high: "⚠️", medium: "🟡", low: "🟢",
  };

  const indicatorLine = finding.indicators?.length
    ? `\n<b>Indicators:</b> <code>${esc(finding.indicators.slice(0, 5).join(", "))}</code>`
    : "";

  const msg = [
    `${sevEmoji[finding.severity]} <b>Blue Sentinel — ${esc(finding.severity.toUpperCase())} Alert</b>`,
    ``,
    `<b>Threat:</b> ${esc(finding.threatName)}`,
    `<b>Target:</b> <code>${esc(finding.target)}</code>`,
    `<b>Type:</b> ${esc(finding.targetType)} · ${esc(finding.category)}`,
    indicatorLine,
    ``,
    `<b>Summary:</b>`,
    esc(finding.summary.slice(0, 300)),
    ``,
    `<i>Detected at ${esc(finding.detectedAt)}</i>`,
    `—`,
    `<a href="https://blueagent.dev/sentinel">blueagent.dev/sentinel</a>`,
  ].filter(l => l !== undefined).join("\n");

  const threadId = TELEGRAM_THREAD_ID ? parseInt(TELEGRAM_THREAD_ID, 10) : undefined;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:                  target,
        text:                     msg,
        parse_mode:               "HTML",
        disable_web_page_preview: true,
        ...(threadId ? { message_thread_id: threadId } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[Sentinel] Telegram alert failed:", res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Sentinel] Telegram alert error:", e);
    return false;
  }
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

    // ── Deduplication: skip if same target+threat seen within 24h ────────────
    const dup = await isDuplicate({ target: watch.target, threatId: tId, severity: result.severity });
    if (dup) continue;

    const finding: Finding = {
      id:         nanoid(),
      threatId:   tId,
      threatName: entry?.name ?? tId,
      category:   cat,
      severity:   result.severity,
      target:     watch.target,
      targetType: watch.targetType,
      summary:    result.summary,
      indicators: result.indicators,
      chain:      "base",
      detectedAt: new Date().toISOString(),
      alerted:    false,
    };

    // Mark as seen immediately so parallel scans don't double-fire
    await markSeen({ target: watch.target, threatId: tId, severity: result.severity, alerted: false });

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

  // ── Concurrent lock ──────────────────────────────────────────────────────────
  const locked = await acquireLock();
  if (!locked) {
    console.warn("[Sentinel] Scan already running — skipping concurrent run");
    return NextResponse.json({ ok: false, skipped: true, reason: "concurrent_run" });
  }

  const startAt  = Date.now();
  const runId    = Math.random().toString(36).slice(2, 10);
  const log: string[] = [];
  let errorCount = 0;

  try {
    // 1. Load user watches
    const watches = (await kvGet<WatchSubscription[]>(SENTINEL_KV.watches)) ?? [];
    const active  = watches.filter(w => w.active);
    log.push(`✓ loaded ${active.length} active watches`);

    // 2. Auto-discovery
    const discovered = await discoverAll();
    log.push(`✓ discovered ${discovered.length} targets (${discovered.filter(d => d.targetType === "token").length} tokens · ${discovered.filter(d => d.targetType === "domain").length} domains)`);

    await kvSet("sentinel:discovery:last", {
      count:     discovered.length,
      tokens:    discovered.filter(d => d.targetType === "token").length,
      domains:   discovered.filter(d => d.targetType === "domain").length,
      scannedAt: new Date().toISOString(),
    });

    // Merge — skip targets already in user watches
    const userTargetSet = new Set(active.map(w => w.target.toLowerCase()));
    const discoveredWatches: WatchSubscription[] = discovered
      .filter(d => !userTargetSet.has(d.target.toLowerCase()))
      .map(d => ({
        id:            `auto:${d.source}:${d.target}`,
        target:        d.target,
        targetType:    d.targetType,
        label:         `[auto] ${d.reason}`,
        active:        true,
        createdAt:     new Date().toISOString(),
        alertChannels: ["telegram"] as ("telegram" | "webhook")[],
      }));

    const allTargets: WatchSubscription[] = [...active, ...discoveredWatches];
    log.push(`✓ scanning ${allTargets.length} total (${active.length} user · ${discoveredWatches.length} auto) in batches of ${BATCH_SIZE}`);

    if (allTargets.length === 0) {
      await kvSet(SENTINEL_KV.scanLast, new Date().toISOString());
      return NextResponse.json({ ok: true, scanned: 0, findings: 0, log });
    }

    // 3. Scan in batches (rate-limited)
    const allFindings: Finding[] = [];
    const batchResults = await scanInBatches(allTargets);

    for (const { watch, findings } of batchResults) {
      if (findings.length > 0) {
        log.push(`⚠ ${watch.target.slice(0, 12)}… → ${findings.length} finding(s)`);
        allFindings.push(...findings);
      }
    }
    errorCount = allTargets.length - batchResults.length;
    if (errorCount > 0) log.push(`✗ ${errorCount} scan(s) errored`);
    log.push(`✓ scanned ${batchResults.length}/${allTargets.length} targets — ${allFindings.length} finding(s)`);

    // 4. Alert + mark alerted
    let alertCount = 0;
    for (const finding of allFindings) {
      const watch    = allTargets.find(w => w.target === finding.target);
      const channels = watch?.alertChannels ?? [];

      let alerted = false;

      if (channels.includes("telegram") || TELEGRAM_CHAT_ID) {
        const ok = await sendTelegramAlert(finding, watch?.telegramChatId);
        if (ok) alerted = true;
        else log.push(`✗ Telegram alert failed for ${finding.target.slice(0, 12)}…`);
      }
      if (channels.includes("webhook") && watch?.webhookUrl) {
        await sendWebhookAlert(finding, watch.webhookUrl);
      }

      finding.alerted = alerted;

      if (alerted) {
        await markSeen({
          target:   finding.target,
          threatId: finding.threatId,
          severity: finding.severity,
          alerted:  true,
        });
        alertCount++;
      }
    }
    log.push(`✓ ${alertCount} alert(s) sent`);

    // 5. Persist findings
    const existing = (await kvGet<Finding[]>(SENTINEL_KV.findings)) ?? [];
    const merged   = [...allFindings, ...existing].slice(0, 100);
    await kvSet(SENTINEL_KV.findings, merged, SENTINEL_TTL.findings);

    // 6. Update stats
    type Stats = { totalScans: number; totalFindings: number; lastScan: string; totalDiscovered: number };
    const stats = (await kvGet<Stats>(SENTINEL_KV.scanStats)) ?? {
      totalScans: 0, totalFindings: 0, lastScan: "", totalDiscovered: 0,
    };
    stats.totalScans++;
    stats.totalFindings  += allFindings.length;
    stats.totalDiscovered = (stats.totalDiscovered ?? 0) + discovered.length;
    stats.lastScan        = new Date().toISOString();
    await kvSet(SENTINEL_KV.scanStats, stats, SENTINEL_TTL.stats);
    await kvSet(SENTINEL_KV.scanLast, stats.lastScan);

    const durationMs = Date.now() - startAt;
    log.push(`✓ done · ${durationMs}ms`);

    // 7. Persist scan log
    await persistScanLog({
      runId,
      startedAt:    new Date(startAt).toISOString(),
      finishedAt:   new Date().toISOString(),
      durationMs,
      userWatches:  active.length,
      autoTargets:  discoveredWatches.length,
      totalScanned: batchResults.length,
      findings:     allFindings.length,
      alerted:      allFindings.filter(f => f.alerted).length,
      errors:       errorCount,
      log,
    });

    return NextResponse.json({
      ok:          true,
      runId,
      scanned:     allTargets.length,
      userWatches: active.length,
      autoTargets: discoveredWatches.length,
      findings:    allFindings.length,
      alerted:     allFindings.filter(f => f.alerted).length,
      durationMs,
      log,
      stats,
    });

  } finally {
    await releaseLock();
  }
}
