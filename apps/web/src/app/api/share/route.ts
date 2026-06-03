/**
 * Blue Chat — Share conversation
 * POST /api/share  { messages }  → { id }
 * GET  /api/share?id=<id>        → { messages }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const store = new Map<string, { messages: unknown[]; ts: number }>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function evict() {
  const now = Date.now();
  for (const [k, v] of store) { if (now - v.ts > TTL_MS) store.delete(k); }
}

function genId(): string { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

export async function POST(req: NextRequest) {
  let body: { messages?: unknown[] } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return NextResponse.json({ error: "messages required" }, { status: 400 });

  evict();
  let id = genId();
  while (store.has(id)) id = genId();
  store.set(id, { messages: body.messages, ts: Date.now() });
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.toUpperCase();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const entry = store.get(id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ messages: entry.messages });
}
