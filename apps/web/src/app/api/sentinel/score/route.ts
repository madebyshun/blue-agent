/**
 * Blue Sentinel — Score API
 *
 * GET /api/sentinel/score?address=0x...&type=token|address|domain
 *
 * Returns a risk score 0–100 for any address/domain on Base.
 * Combines all 8 threat categories into a single weighted verdict.
 *
 * Response shape:
 * {
 *   address:    "0x...",
 *   type:       "token" | "address" | "domain",
 *   score:      0-100,        // 0 = safest, 100 = most dangerous
 *   grade:      "A"–"F",
 *   risk_level: "safe" | "low" | "medium" | "high" | "critical",
 *   categories: { honeypot, rug, phishing, drain, aml, exploit, scam_token, malicious_approval },
 *   indicators: string[],
 *   summary:    string,
 *   cached:     boolean,
 *   scanned_at: ISO string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { THREAT_CATALOG } from "@/lib/sentinel/catalog";
import { scanDNA } from "@/lib/sentinel/phishing-dna";
import { scanRug } from "@/lib/sentinel/rug-scanner";
import { scanDrain, scanMaliciousApprovals } from "@/lib/sentinel/drain-scanner";
import { scanExploit } from "@/lib/sentinel/exploit-scanner";
import { scanScamToken } from "@/lib/sentinel/scam-token-scanner";
import { wrapScanner } from "@/lib/sentinel/scanner";
import type { HubResult, ThreatSeverity } from "@/lib/sentinel/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const SCORE_CACHE_TTL = 60 * 30; // 30 minutes

const SEVERITY_SCORE: Record<ThreatSeverity, number> = {
  critical: 40,
  high:     25,
  medium:   10,
  low:      0,
};

const CATEGORY_WEIGHT: Record<string, number> = {
  honeypot:            1.5,
  rug:                 1.3,
  phishing:            1.2,
  drain:               1.4,
  aml:                 1.3,
  exploit:             1.2,
  scam_token:          1.1,
  malicious_approval:  1.0,
};

// ─── Bankr LLM callers (reuse proxy pattern) ─────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

async function callHoneypot(address: string): Promise<HubResult> {
  return wrapScanner("honeypot", address, async () => {
    const res  = await fetch(`${BASE_URL}/api/honeypot-check`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_address: address, chain: "base" }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = JSON.stringify(data);
    const isHoneypot = /honeypot|sell.*block|buy.*only/i.test(text);
    return {
      safe:       !isHoneypot,
      severity:   isHoneypot ? "critical" : "low",
      indicators: isHoneypot ? ["honeypot_detected"] : [],
      summary:    text.slice(0, 200),
    };
  });
}

async function callAml(address: string): Promise<HubResult> {
  return wrapScanner("aml", address, async () => {
    const res  = await fetch(`${BASE_URL}/api/aml-screen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, chain: "base" }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = JSON.stringify(data);
    const isFlagged = /ofac|sanction|tornado|mixer|high.?risk/i.test(text);
    return {
      safe:       !isFlagged,
      severity:   isFlagged ? "critical" : "low",
      indicators: isFlagged ? ["aml_flagged"] : [],
      summary:    text.slice(0, 200),
    };
  });
}

// ─── Catalog check ────────────────────────────────────────────────────────────

function catalogCheck(target: string): HubResult | null {
  const t = target.toLowerCase();
  for (const entry of THREAT_CATALOG) {
    if (entry.domains?.some(d => d.toLowerCase() === t) ||
        entry.addresses?.some(a => a.toLowerCase() === t)) {
      return {
        safe:       false,
        severity:   entry.severity,
        indicators: ["known_bad", ...entry.indicators.slice(0, 3)],
        summary:    `Catalog match: ${entry.name}. ${entry.description}`,
      };
    }
  }
  return null;
}

// ─── Score calculation ────────────────────────────────────────────────────────

function severityToScore(sev: ThreatSeverity): number {
  return SEVERITY_SCORE[sev] ?? 0;
}

function scoreToGrade(score: number): string {
  if (score <= 5)  return "A";
  if (score <= 20) return "B";
  if (score <= 40) return "C";
  if (score <= 65) return "D";
  return "F";
}

function scoreToRiskLevel(score: number): string {
  if (score <= 5)  return "safe";
  if (score <= 20) return "low";
  if (score <= 40) return "medium";
  if (score <= 65) return "high";
  return "critical";
}

// ─── Auto-detect type ─────────────────────────────────────────────────────────

function detectType(input: string): "token" | "address" | "domain" {
  if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
    // Could be token or address — will scan both paths
    return "address"; // caller can override with ?type=token
  }
  return "domain";
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url     = new URL(req.url);
  const address = url.searchParams.get("address") ?? url.searchParams.get("target") ?? "";
  const typeParam = url.searchParams.get("type") as "token" | "address" | "domain" | null;
  const noCache = url.searchParams.get("fresh") === "1";

  if (!address) {
    return NextResponse.json(
      { error: "Missing ?address= param. Usage: /api/sentinel/score?address=0x...&type=token|address|domain" },
      { status: 400 }
    );
  }

  const targetType = typeParam ?? detectType(address);
  const cacheKey   = `sentinel:score:${address.toLowerCase()}:${targetType}`;

  // Return cached score (30min TTL) unless ?fresh=1
  if (!noCache) {
    const cached = await kvGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  const startMs   = Date.now();
  const categories: Record<string, { score: number; severity: string; indicators: string[]; safe: boolean }> = {};
  const allIndicators: string[] = [];

  // ── Catalog check (instant, all types) ──────────────────────────────────────
  const catalogHit = catalogCheck(address);
  if (catalogHit && !catalogHit.safe) {
    const cat = targetType === "domain" ? "phishing" : "aml";
    categories[cat] = {
      score:      severityToScore(catalogHit.severity),
      severity:   catalogHit.severity,
      indicators: catalogHit.indicators,
      safe:       false,
    };
    allIndicators.push(...catalogHit.indicators);
  }

  // ── Run scanners based on type ───────────────────────────────────────────────
  if (targetType === "domain") {
    // Phishing DNA (instant)
    const dna = scanDNA(address);
    if (dna.length > 0) {
      const worst = dna.sort((a, b) => (a.severity === "critical" ? -1 : 1))[0];
      categories["phishing"] = {
        score:      severityToScore(worst.severity),
        severity:   worst.severity,
        indicators: dna.map(d => d.signatureId),
        safe:       false,
      };
      allIndicators.push(...dna.map(d => d.signatureId));
    }

  } else if (targetType === "token") {
    // 4 categories: honeypot, rug, scam_token, malicious_approval
    const [honeypot, rug, scam, approvals] = await Promise.all([
      callHoneypot(address),
      wrapScanner("rug",      address, () => scanRug(address)),
      wrapScanner("scam",     address, () => scanScamToken(address)),
      wrapScanner("approvals",address, () => scanMaliciousApprovals(address)),
    ]);

    const tokenResults: [string, HubResult][] = [
      ["honeypot",           honeypot],
      ["rug",                rug],
      ["scam_token",         scam],
      ["malicious_approval", approvals],
    ];

    for (const [cat, result] of tokenResults) {
      if (!result.safe) {
        categories[cat] = {
          score:      severityToScore(result.severity),
          severity:   result.severity,
          indicators: result.indicators,
          safe:       false,
        };
        allIndicators.push(...result.indicators);
      }
    }

  } else {
    // address — 3 categories: aml, exploit, drain
    const [aml, exploit, drain] = await Promise.all([
      callAml(address),
      wrapScanner("exploit", address, () => scanExploit(address)),
      wrapScanner("drain",   address, () => scanDrain(address)),
    ]);

    const addressResults: [string, HubResult][] = [
      ["aml",     aml],
      ["exploit", exploit],
      ["drain",   drain],
    ];

    for (const [cat, result] of addressResults) {
      if (!result.safe) {
        categories[cat] = {
          score:      severityToScore(result.severity),
          severity:   result.severity,
          indicators: result.indicators,
          safe:       false,
        };
        allIndicators.push(...result.indicators);
      }
    }
  }

  // ── Calculate final score ────────────────────────────────────────────────────
  let totalScore = 0;
  const summaryParts: string[] = [];

  for (const [cat, data] of Object.entries(categories)) {
    const weight = CATEGORY_WEIGHT[cat] ?? 1.0;
    totalScore  += Math.round(data.score * weight);
    summaryParts.push(`${cat}:${data.severity}`);
  }

  // Cap at 100
  const finalScore = Math.min(100, totalScore);
  const grade      = scoreToGrade(finalScore);
  const riskLevel  = scoreToRiskLevel(finalScore);

  const summary = finalScore === 0
    ? `No threats detected on Base for ${address.slice(0, 10)}…`
    : `Risk detected: ${summaryParts.join(", ")}. Score ${finalScore}/100.`;

  const response = {
    address,
    type:       targetType,
    score:      finalScore,
    grade,
    risk_level: riskLevel,
    categories,
    indicators: [...new Set(allIndicators)],
    summary,
    scanned_at: new Date().toISOString(),
    scan_ms:    Date.now() - startMs,
    cached:     false,
  };

  // Cache result
  await kvSet(cacheKey, response, SCORE_CACHE_TTL);

  return NextResponse.json(response);
}
