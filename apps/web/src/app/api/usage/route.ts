/**
 * /api/usage — paid-run counts per tool, for dynamic "Featured" ranking.
 * Public, cached. Counters are incremented in /api/x402/[tool] on each paid run.
 */
import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 10;

export async function GET() {
  const ids = AGENT_TOOLS.map(t => t.id);
  const entries = await Promise.all(
    ids.map(async id => [id, (await kvGet<number>(`usage:${id}`)) ?? 0] as const)
  );
  return NextResponse.json(Object.fromEntries(entries), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
