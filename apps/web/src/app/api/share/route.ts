/**
 * POST /api/share — store a tool result in KV under a short id, return that id.
 * The hub uses this to make share links short (a few chars instead of 3 KB
 * of base64). Results auto-expire after 30 days.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvSet } from "@/lib/kv";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

const TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  if (!payload.toolId || !payload.result) {
    return NextResponse.json({ error: "Missing toolId or result" }, { status: 400 });
  }
  const id = randomBytes(5).toString("hex"); // 10 hex chars, ~1 in 10^12 collisions
  await kvSet(`share:${id}`, payload, TTL_SEC);
  return NextResponse.json({ id });
}
