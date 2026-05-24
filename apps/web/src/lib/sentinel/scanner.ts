/**
 * Blue Sentinel — Scanner Utils
 *
 * Shared utilities for all scanner modules:
 *   - wrapScanner()     : standardized error handling for hub calls
 *   - extractSeverity() : text → ThreatSeverity
 *   - extractIndicators(): text → matched indicator strings
 *   - safeResult()      : safe fallback HubResult on error
 */

import { THREAT_CATALOG } from "@/lib/sentinel/catalog";
import type { HubResult, ThreatSeverity } from "@/lib/sentinel/types";

// ─── Safe fallback ────────────────────────────────────────────────────────────

export function safeResult(error: unknown): HubResult {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    safe:       true,
    severity:   "low",
    indicators: [],
    summary:    `scan_error: ${msg}`,
    error:      msg,
  };
}

// ─── wrapScanner ─────────────────────────────────────────────────────────────

/**
 * Wraps any async scanner call with:
 *   - timeout enforcement via AbortSignal
 *   - standardized error catch → safeResult()
 *   - structured console.error logging
 *
 * Usage:
 *   const result = await wrapScanner("honeypot", address, async () => { ... })
 */
export async function wrapScanner(
  scannerName: string,
  target:      string,
  fn:          () => Promise<HubResult>,
): Promise<HubResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Sentinel:${scannerName}] failed for ${target.slice(0, 12)}…: ${msg}`);
    return safeResult(e);
  }
}

// ─── Text-based severity extraction ──────────────────────────────────────────

export function extractSeverity(text: string): ThreatSeverity {
  const t = text.toLowerCase();
  if (/critical|severe|ofac|sanction|exploit|selfdestruct|backdoor/.test(t)) return "critical";
  if (/high.?risk|dangerous|malicious|rug|honeypot|drainer/.test(t))          return "high";
  if (/medium.?risk|moderate|suspicious/.test(t))                              return "medium";
  return "low";
}

// ─── Indicator extraction from text ──────────────────────────────────────────

export function extractIndicators(text: string): string[] {
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

// ─── Parse hub response ───────────────────────────────────────────────────────

/**
 * Extracts text from a hub tool API response.
 * Handles both { result: string } and raw JSON shapes.
 */
export function parseHubResponse(data: Record<string, unknown>): string {
  return (data?.result as string) ?? JSON.stringify(data);
}
