/**
 * /api/services/scores — machine-readable price + measured reliability for
 * every MCP tool, so a router (ours or another agent's) can pick by cost and
 * trust instead of by description.
 *
 *   ?group=safety|stocks|transactions|market|catalog   filter
 *   ?max_price=0.05                                    USD ceiling
 *   ?min_score=90                                      drops unscored tools too
 *
 * Ranking: scored tools first (score desc), then cheaper, then faster.
 * Unscored tools are listed with `score: null` and verdict "insufficient
 * data" — never given a guessed number.
 */
import { NextResponse } from "next/server";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";
import { readMcpStats } from "@/lib/mcp-receipts";
import { scoreService, MIN_RUNS } from "@/lib/service-score";
import { META } from "@/app/app/services/meta";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const group = q.get("group");
  const maxPrice = q.has("max_price") ? Number(q.get("max_price")) : null;
  const minScore = q.has("min_score") ? Number(q.get("min_score")) : null;
  const stats = await readMcpStats(30);
  const rows = MCP_TOOLS.map((t) => {
    const units = MCP_PRICES[t.name] ?? 0;
    const sc = stats.readable && units ? scoreService(stats.byTool[t.name]) : null;
    return {
      tool: t.name,
      group: META[t.name]?.group ?? "catalog",
      chains: META[t.name]?.chains ?? [],
      price_usd: units / 1e6,
      score: sc?.score ?? null,
      verdict: units ? (sc?.verdict ?? "unreadable") : "free, not scored",
      runs_30d: sc?.runs ?? null,
      avg_ms: sc?.avgMs ?? null,
      profile: `https://blueagent.dev/app/services/${t.name}`,
    };
  })
    .filter((r) => !group || r.group === group)
    .filter((r) => maxPrice === null || r.price_usd <= maxPrice)
    .filter((r) => minScore === null || (r.score !== null && r.score >= minScore))
    .sort((a, b) =>
      (b.score ?? -1) - (a.score ?? -1) || a.price_usd - b.price_usd || (a.avg_ms ?? 1e9) - (b.avg_ms ?? 1e9));
  return NextResponse.json({
    window_days: 30,
    readable: stats.readable,
    method: `score = 95% Wilson lower bound of paid runs that returned; null under ${MIN_RUNS} runs`,
    endpoint: "https://blueagent.dev/api/mcp",
    services: rows,
  }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
}
