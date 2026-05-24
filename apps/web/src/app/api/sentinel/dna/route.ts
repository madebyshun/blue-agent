/**
 * Blue Sentinel — Phishing DNA API
 *
 * GET  /api/sentinel/dna
 *   Returns DNA database stats (signature counts, categories).
 *
 * POST /api/sentinel/dna
 *   Body: { target: string }
 *   Scans a URL/domain/address against Phishing DNA signatures.
 *   Returns: { matches, safe, topSeverity }
 *   Free — no hub credit consumed.
 */

import { NextRequest, NextResponse } from "next/server";
import { scanDNA, getDNAStats, DRAINER_SELECTORS } from "@/lib/sentinel/phishing-dna";

export const runtime = "nodejs";

export async function GET() {
  const stats = getDNAStats();
  return NextResponse.json({
    ok:    true,
    stats,
    drainerSelectors: DRAINER_SELECTORS.map(s => ({
      selector: s.selector,
      name:     s.name,
      severity: s.severity,
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: { target?: string };
  try {
    body = await req.json() as { target?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const target = body.target?.trim();
  if (!target) {
    return NextResponse.json({ error: "Missing field: target" }, { status: 400 });
  }

  const matches = scanDNA(target);
  const safe    = matches.length === 0;
  const topSev  = matches.some(m => m.severity === "critical")
    ? "critical"
    : matches.some(m => m.severity === "high")
      ? "high"
      : null;

  return NextResponse.json({
    ok:          true,
    target,
    safe,
    topSeverity: topSev,
    matchCount:  matches.length,
    matches,
  });
}
