/**
 * Trust score for one paid MCP tool — computed in CODE from the receipt book
 * (lib/mcp-receipts), never by a model.
 *
 * Reliability is the Wilson lower bound (95%) of "paid runs that returned a
 * result": a tool with 3/3 does not outrank one with 196/200. Under
 * MIN_RUNS there is no score at all — "insufficient data", not a low number.
 * The verdict word is hard-mapped from the score.
 */
import type { ToolStats } from "@/lib/mcp-receipts";

export const MIN_RUNS = 5;

export interface ServiceScore {
  runs: number;
  /** 0-100, null under MIN_RUNS. */
  score: number | null;
  verdict: "reliable" | "mixed" | "unreliable" | "insufficient data";
  avgMs: number | null;
}

export function wilsonLower(ok: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = ok / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (c - m) / d;
}

export function scoreService(s: ToolStats | undefined): ServiceScore {
  const runs = s ? s.settled + s.notCharged : 0;
  const avgMs = s && s.timed > 0 ? Math.round(s.ms / s.timed) : null;
  if (!s || runs < MIN_RUNS) return { runs, score: null, verdict: "insufficient data", avgMs };
  const score = Math.round(wilsonLower(s.settled, runs) * 100);
  const verdict = score >= 90 ? "reliable" : score >= 70 ? "mixed" : "unreliable";
  return { runs, score, verdict, avgMs };
}
