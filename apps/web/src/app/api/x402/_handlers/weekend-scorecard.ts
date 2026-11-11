/**
 * weekend-scorecard ($0.00) — Base's weekend price vs the Monday open, graded.
 * Reads one KV record written by /api/cron/weekend (lib/weekend/scorecard.ts)
 * plus, between Saturday and the Monday open, the Base desk's latest rows for a
 * PROVISIONAL view of this weekend. Free because a scorecard behind a paywall
 * is one nobody can check. An unreadable record answers 503, never an empty one.
 */
import { scorecardView } from "@/lib/weekend/view";

export default async function handler(req: Request): Promise<Response> {
  let body: { ticker?: unknown; weekends?: unknown } = {};
  try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
  const url = new URL(req.url);
  const ticker = String(body.ticker ?? url.searchParams.get("ticker") ?? "").trim().toUpperCase().replace(/C$/, "") || null;
  const limit = Math.min(Math.max(Number(body.weekends ?? url.searchParams.get("weekends") ?? 12) || 12, 1), 52);
  const v = await scorecardView({ ticker, limit });
  if (v === "error") return Response.json({ error: "Scorecard record unreadable right now; try again shortly." }, { status: 503 });
  return Response.json(v);
}
