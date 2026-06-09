/**
 * Blue Agent — Signals API
 * Returns latest Research Loop signals from KV.
 * Public endpoint — no auth required.
 */
import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 15;

const KV_KEY_SIGNALS = "research:signals:latest";
const KV_KEY_HISTORY = "research:signals:history";

export async function GET() {
  const [latest, history] = await Promise.all([
    kvGet<unknown[]>(KV_KEY_SIGNALS),
    kvGet<unknown[]>(KV_KEY_HISTORY),
  ]);

  return NextResponse.json({
    signals: latest ?? [],
    history: (history ?? []).slice(0, 20),
    hasData: (latest ?? []).length > 0,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
