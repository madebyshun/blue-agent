/**
 * /api/chat/share
 *
 * POST { title, messages }  → { id }   — save conversation to KV, TTL 30 days
 * GET  ?id=<uuid>           → ShareDoc  — retrieve a saved conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const KEY_PREFIX   = "chatshare:";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Slimmed-down message for public sharing — strips attachments (binary data) */
interface ShareMessage {
  role:            "user" | "assistant";
  content:         string;
  createdAt?:      number;
  modelUsed?:      string;
  responseMs?:     number;
  toolLogs?:       Array<{ tool: string; status: string; ms?: number }>;
  webSearch?:      { provider: string; sources: number };
  thinkingContent?: string;
}

export interface ShareDoc {
  id:        string;
  title:     string;
  messages:  ShareMessage[];
  createdAt: number;
  /** Share page renders a "Replicated at blueagent.dev/chat" watermark */
  origin:    "blueagent";
}

// ── POST — save ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { title?: string; messages?: unknown[] };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // Strip heavy fields (base64 attachments) — keep only text-safe data
    const slim: ShareMessage[] = (body.messages as ShareMessage[]).map(m => ({
      role:            m.role,
      content:         m.content ?? "",
      createdAt:       m.createdAt,
      modelUsed:       m.modelUsed,
      responseMs:      m.responseMs,
      thinkingContent: m.thinkingContent,
      webSearch:       m.webSearch ? { provider: m.webSearch.provider, sources: m.webSearch.sources } : undefined,
      toolLogs:        m.toolLogs?.map(l => ({ tool: l.tool, status: l.status, ms: l.ms })),
    }));

    const id  = randomUUID();
    const doc: ShareDoc = {
      id,
      title:     (typeof body.title === "string" && body.title.trim()) ? body.title.trim().slice(0, 200) : "Shared conversation",
      messages:  slim,
      createdAt: Date.now(),
      origin:    "blueagent",
    };

    await kv.set(`${KEY_PREFIX}${id}`, doc, { ex: TTL_SECONDS });

    return NextResponse.json({ id });
  } catch (e) {
    console.error("[chat/share] POST error:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// ── GET — retrieve ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const doc = await kv.get<ShareDoc>(`${KEY_PREFIX}${id}`);
    if (!doc) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(doc);
  } catch (e) {
    console.error("[chat/share] GET error:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
