/**
 * Blue Sentinel — Findings API
 *
 * GET /api/sentinel/findings?severity=critical&limit=20
 *   Returns recent findings filtered by optional severity.
 *
 * DELETE /api/sentinel/findings?id=<findingId>
 *   Dismiss (remove) a finding.
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import {
  SENTINEL_KV,
  SENTINEL_TTL,
  type Finding,
  type ThreatSeverity,
} from "@/lib/sentinel/catalog";

export async function GET(req: NextRequest) {
  const url      = new URL(req.url);
  const severity = url.searchParams.get("severity") as ThreatSeverity | null;
  const limit    = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const since    = url.searchParams.get("since"); // ISO string

  const findings = (await kvGet<Finding[]>(SENTINEL_KV.findings)) ?? [];

  let filtered = findings;
  if (severity) {
    filtered = filtered.filter(f => f.severity === severity);
  }
  if (since) {
    const sinceMs = new Date(since).getTime();
    filtered = filtered.filter(f => new Date(f.detectedAt).getTime() >= sinceMs);
  }

  // Sort newest first
  filtered.sort((a, b) =>
    new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );

  return NextResponse.json({
    ok:       true,
    total:    filtered.length,
    findings: filtered.slice(0, limit),
  });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing ?id= param" }, { status: 400 });
  }

  const findings = (await kvGet<Finding[]>(SENTINEL_KV.findings)) ?? [];
  const updated  = findings.filter(f => f.id !== id);

  if (updated.length === findings.length) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  await kvSet(SENTINEL_KV.findings, updated, SENTINEL_TTL.findings);
  return NextResponse.json({ ok: true, dismissed: id });
}
