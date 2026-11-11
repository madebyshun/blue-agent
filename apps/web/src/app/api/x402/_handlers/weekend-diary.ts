/**
 * weekend-diary ($0.00) — Blue's public paper book on Base stocks over the
 * weekend. Positions come from one fixed rule in code (lib/weekend/diary.ts);
 * the notes are model-generated from those numbers and labelled as such.
 * Reads the same KV record as weekend-scorecard. Free; 503 when unreadable.
 */
import { diaryView } from "@/lib/weekend/view";

export default async function handler(req: Request): Promise<Response> {
  let body: { entries?: unknown } = {};
  try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
  const limit = Math.min(Math.max(Number(body.entries ?? new URL(req.url).searchParams.get("entries") ?? 12) || 12, 1), 52);
  const v = await diaryView({ limit });
  if (v === "error") return Response.json({ error: "Diary record unreadable right now; try again shortly." }, { status: 503 });
  return Response.json(v);
}
