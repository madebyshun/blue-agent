/**
 * Blue Sentinel — Post-Deploy Auditor API (#15)
 *
 * POST /api/sentinel/audit
 *   Body: { address: string }
 *   Returns: DeployAuditReport
 *
 * Runs a full post-deploy risk scan on a contract address:
 *   - hub_risk_gate + hub_honeypot in parallel
 *   - Known-bad catalog check
 *   - Risk score 0-100 with severity classification
 */

import { NextRequest, NextResponse } from "next/server";
import { auditDeployedContract } from "@/lib/sentinel/deploy-auditor";

export const runtime     = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const body = await req.json() as { address?: string };
  const { address } = body;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "address must be a valid EVM address (0x…40 hex chars)" },
      { status: 400 },
    );
  }

  try {
    const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const report  = await auditDeployedContract(address, baseUrl);

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET — quick health check / schema info
export async function GET() {
  return NextResponse.json({
    ok:          true,
    description: "Blue Sentinel Post-Deploy Auditor",
    usage:       "POST { address: '0x...' }",
    fields:      ["address", "riskScore", "severity", "findings", "summary", "auditedAt", "unverified"],
  });
}
