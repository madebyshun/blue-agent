/**
 * Blue Chat — Share conversation
 * POST /api/share  { messages }  → { id }
 * GET  /api/share?id=<id>        → { messages }
 */
import { NextRequest, NextResponse } from "next/server";
import { kvSet } from "@/lib/kv";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 15;

const store = new Map<string, { messages: unknown[]; ts: number }>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_S  = 7 * 24 * 60 * 60;

function evict() {
  const now = Date.now();
  for (const [k, v] of store) { if (now - v.ts > TTL_MS) store.delete(k); }
}

function genId(): string { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
// Lowercase hex id matching GET /api/share/[id] (`[a-f0-9]{6,32}`).
function genHexId(): string { return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16); }

export async function POST(req: NextRequest) {
  let body: {
    messages?: unknown[];
    // Hub tool-result share
    toolId?: string;
    result?: unknown;
    isMock?: boolean;
    mockReason?: string;
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Hub tool-result share → persist to KV under share:<hexid> ──────────────
  // Paired with GET /api/share/[id]. Used by the Hub "Share ↗" button.
  if (body.toolId && body.result !== undefined && body.result !== null) {
    const id = genHexId();
    await kvSet(`share:${id}`, {
      toolId:     body.toolId,
      result:     body.result,
      isMock:     !!body.isMock,
      mockReason: body.mockReason ?? "dev",
    }, TTL_S);
    return NextResponse.json({ id });
  }

  // ── Chat conversation share (legacy, in-memory) ───────────────────────────
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return NextResponse.json({ error: "messages or toolId+result required" }, { status: 400 });

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
