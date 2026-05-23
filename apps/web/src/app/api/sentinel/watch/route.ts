/**
 * Blue Sentinel — Watch Subscription API
 *
 * POST /api/sentinel/watch
 *   Subscribe a target (address / token / domain) for 24/7 monitoring.
 *   Body: { target, targetType, label?, alertChannels?, webhookUrl?, telegramChatId? }
 *   Returns: { ok, watch }
 *
 * GET /api/sentinel/watch
 *   List all active watches + recent findings + scan stats.
 *   Returns: { watches, findings, stats }
 *
 * DELETE /api/sentinel/watch?target=<address>
 *   Deactivate a watch subscription.
 *   Returns: { ok, removed }
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import {
  SENTINEL_KV,
  SENTINEL_TTL,
  THREAT_CATALOG,
  type WatchSubscription,
  type Finding,
} from "@/lib/sentinel/catalog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function isValidAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function isValidDomain(s: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s) ||
    /^https?:\/\//.test(s);
}

function inferTargetType(target: string): WatchSubscription["targetType"] {
  if (isValidDomain(target) || /^https?:\/\//.test(target)) return "domain";
  // token vs address — can't always tell; default to address, let caller specify
  return "address";
}

// ─── POST — subscribe ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = (body.target as string)?.trim();
  if (!target) {
    return NextResponse.json({ error: "Missing required field: target" }, { status: 400 });
  }

  // Validate target
  const targetType = (body.targetType as WatchSubscription["targetType"]) ?? inferTargetType(target);

  if (targetType !== "domain" && !isValidAddress(target)) {
    return NextResponse.json(
      { error: "Invalid address format — expected 0x… (42 hex chars)" },
      { status: 400 }
    );
  }

  // Load existing watches
  const watches = (await kvGet<WatchSubscription[]>(SENTINEL_KV.watches)) ?? [];

  // Dedupe — reactivate if already exists
  const existing = watches.find(w => w.target.toLowerCase() === target.toLowerCase());
  if (existing) {
    existing.active = true;
    existing.label  = (body.label as string) ?? existing.label;
    await kvSet(SENTINEL_KV.watches, watches);
    return NextResponse.json({ ok: true, watch: existing, reactivated: true });
  }

  const alertChannels = (body.alertChannels as string[]) ?? ["telegram"];
  const watch: WatchSubscription = {
    id:            nanoid(),
    target,
    targetType,
    label:         (body.label as string) ?? undefined,
    alertChannels: alertChannels as WatchSubscription["alertChannels"],
    webhookUrl:    (body.webhookUrl as string) ?? undefined,
    telegramChatId: (body.telegramChatId as string) ?? undefined,
    createdAt:     new Date().toISOString(),
    active:        true,
  };

  watches.push(watch);
  await kvSet(SENTINEL_KV.watches, watches);

  return NextResponse.json({ ok: true, watch }, { status: 201 });
}

// ─── GET — list watches + findings ───────────────────────────────────────────

export async function GET() {
  const [watches, findings, stats, lastScan] = await Promise.all([
    kvGet<WatchSubscription[]>(SENTINEL_KV.watches),
    kvGet<Finding[]>(SENTINEL_KV.findings),
    kvGet<{ totalScans: number; totalFindings: number; lastScan: string }>(SENTINEL_KV.scanStats),
    kvGet<string>(SENTINEL_KV.scanLast),
  ]);

  // Summary counts
  const activeWatches  = (watches ?? []).filter(w => w.active).length;
  const criticalFindings = (findings ?? []).filter(f => f.severity === "critical").length;
  const highFindings     = (findings ?? []).filter(f => f.severity === "high").length;

  return NextResponse.json({
    ok:      true,
    watches: watches ?? [],
    findings: findings ?? [],
    stats: {
      ...(stats ?? { totalScans: 0, totalFindings: 0, lastScan: null }),
      lastScan: lastScan ?? stats?.lastScan ?? null,
      activeWatches,
      criticalFindings,
      highFindings,
    },
    catalog: {
      total:       THREAT_CATALOG.length,
      categories:  [...new Set(THREAT_CATALOG.map(t => t.category))],
      lastUpdated: THREAT_CATALOG.reduce((a, b) => a > b.updatedAt ? a : b.updatedAt, ""),
    },
  });
}

// ─── DELETE — deactivate watch ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const target = new URL(req.url).searchParams.get("target");
  const id     = new URL(req.url).searchParams.get("id");

  if (!target && !id) {
    return NextResponse.json({ error: "Provide ?target= or ?id= param" }, { status: 400 });
  }

  const watches = (await kvGet<WatchSubscription[]>(SENTINEL_KV.watches)) ?? [];
  const match   = watches.find(w =>
    (target && w.target.toLowerCase() === target.toLowerCase()) ||
    (id && w.id === id)
  );

  if (!match) {
    return NextResponse.json({ error: "Watch not found" }, { status: 404 });
  }

  match.active = false;
  await kvSet(SENTINEL_KV.watches, watches);

  return NextResponse.json({ ok: true, removed: match });
}
