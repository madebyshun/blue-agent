/**
 * Blue Sentinel — Post-Deploy Auditor (#15)
 *
 * Automatically audits newly deployed contracts on Base:
 *   - Runs hub_risk_gate + hub_honeypot in parallel
 *   - Checks catalog for known-bad patterns
 *   - Produces a structured DeployAuditReport with a 0-100 risk score
 *
 * Designed to be called from:
 *   - POST /api/sentinel/audit  (manual API call)
 *   - scanTarget() in cron route (auto-scan of new deploys)
 *
 * Risk score formula:
 *   critical finding → +40   high → +25   medium → +10   low → +5
 *   unverified source → +15
 *   max 100
 */

import { THREAT_CATALOG } from "@/lib/sentinel/catalog";
import { wrapScanner, extractSeverity, extractIndicators, parseHubResponse } from "@/lib/sentinel/scanner";
import type { ThreatSeverity, HubResult } from "@/lib/sentinel/types";
import { SCAN_CONFIG } from "@/lib/sentinel/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeployAuditReport {
  address:    string;
  riskScore:  number;          // 0-100
  severity:   ThreatSeverity;
  findings:   DeployFinding[];
  summary:    string;
  auditedAt:  string;
  /** True if source code is unverified on Basescan */
  unverified: boolean;
  /** Raw results from each scanner for debugging */
  raw: {
    riskGate?:  HubResult;
    honeypot?:  HubResult;
    catalog:    string[];
  };
}

export interface DeployFinding {
  source:    "risk_gate" | "honeypot" | "catalog";
  severity:  ThreatSeverity;
  summary:   string;
  indicators: string[];
}

// ─── Risk score calculator ────────────────────────────────────────────────────

function calcRiskScore(findings: DeployFinding[], unverified: boolean): number {
  let score = 0;
  for (const f of findings) {
    if      (f.severity === "critical") score += 40;
    else if (f.severity === "high")     score += 25;
    else if (f.severity === "medium")   score += 10;
    else                                score += 5;
  }
  if (unverified) score += 15;
  return Math.min(score, 100);
}

function scoreToSeverity(score: number): ThreatSeverity {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

// ─── Catalog check ────────────────────────────────────────────────────────────

function checkCatalog(address: string): { matched: string[]; indicators: string[] } {
  const lowerAddr = address.toLowerCase();
  const matched: string[] = [];
  const indicators: string[] = [];

  for (const entry of THREAT_CATALOG) {
    if (entry.addresses?.some(a => a.toLowerCase() === lowerAddr)) {
      matched.push(entry.name);
      indicators.push(...entry.indicators);
    }
  }

  return { matched, indicators: [...new Set(indicators)] };
}

// ─── Hub callers ──────────────────────────────────────────────────────────────

async function callRiskGate(
  address: string,
  baseUrl: string,
): Promise<HubResult> {
  return wrapScanner("deploy-risk-gate", address, async () => {
    const res = await fetch(`${baseUrl}/api/hub/risk-gate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address, context: "post_deploy_audit" }),
      signal:  AbortSignal.timeout(SCAN_CONFIG.hubTimeout),
    });
    if (!res.ok) throw new Error(`risk-gate HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const text = parseHubResponse(data);
    return {
      safe:       !text.toLowerCase().includes("unsafe") && !text.toLowerCase().includes("risk"),
      severity:   extractSeverity(text),
      indicators: extractIndicators(text),
      summary:    text.slice(0, 300),
      raw:        data,
    };
  });
}

async function callHoneypot(
  address: string,
  baseUrl: string,
): Promise<HubResult> {
  return wrapScanner("deploy-honeypot", address, async () => {
    const res = await fetch(`${baseUrl}/api/hub/honeypot`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address }),
      signal:  AbortSignal.timeout(SCAN_CONFIG.hubTimeout),
    });
    if (!res.ok) throw new Error(`honeypot HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const text = parseHubResponse(data);
    return {
      safe:       !text.toLowerCase().includes("honeypot"),
      severity:   extractSeverity(text),
      indicators: extractIndicators(text),
      summary:    text.slice(0, 300),
      raw:        data,
    };
  });
}

// ─── Main: auditDeployedContract ──────────────────────────────────────────────

export async function auditDeployedContract(
  address: string,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
): Promise<DeployAuditReport> {
  const auditedAt = new Date().toISOString();
  const findings: DeployFinding[] = [];

  // 1. Run hub tools in parallel
  const [riskResult, honeypotResult] = await Promise.all([
    callRiskGate(address, baseUrl),
    callHoneypot(address, baseUrl),
  ]);

  // 2. Process risk gate result
  if (!riskResult.safe || riskResult.severity !== "low") {
    findings.push({
      source:     "risk_gate",
      severity:   riskResult.severity,
      summary:    riskResult.summary,
      indicators: riskResult.indicators,
    });
  }

  // 3. Process honeypot result
  if (!honeypotResult.safe || honeypotResult.severity !== "low") {
    findings.push({
      source:     "honeypot",
      severity:   honeypotResult.severity,
      summary:    honeypotResult.summary,
      indicators: honeypotResult.indicators,
    });
  }

  // 4. Catalog check
  const { matched: catalogMatches, indicators: catalogIndicators } = checkCatalog(address);
  if (catalogMatches.length > 0) {
    findings.push({
      source:     "catalog",
      severity:   "critical",
      summary:    `Matched known-bad catalog entries: ${catalogMatches.join(", ")}`,
      indicators: catalogIndicators,
    });
  }

  // 5. Check if unverified (heuristic: error text in risk gate)
  const unverified =
    riskResult.summary.toLowerCase().includes("unverified") ||
    riskResult.summary.toLowerCase().includes("not verified") ||
    riskResult.error?.includes("unverified") === true;

  // 6. Calculate risk score
  const riskScore = calcRiskScore(findings, unverified);
  const severity  = scoreToSeverity(riskScore);

  // 7. Build summary
  const summary = findings.length === 0
    ? `No threats detected for ${address.slice(0, 10)}… — risk score ${riskScore}/100`
    : `${findings.length} issue(s) detected — risk score ${riskScore}/100. ${findings.map(f => f.summary).join(" | ").slice(0, 300)}`;

  return {
    address,
    riskScore,
    severity,
    findings,
    summary,
    auditedAt,
    unverified,
    raw: {
      riskGate:  riskResult,
      honeypot:  honeypotResult,
      catalog:   catalogMatches,
    },
  };
}
