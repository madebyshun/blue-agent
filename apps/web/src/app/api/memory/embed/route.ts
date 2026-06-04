/**
 * Venice Embeddings proxy
 *
 * Converts a text string into a semantic vector for memory search.
 * Uses Venice text-embedding-bge-m3 (1024-dim, multilingual).
 *
 * POST /api/memory/embed
 *   { text: string }
 * → { embedding: number[] }
 */

import { NextRequest, NextResponse } from "next/server";

const VENICE_EMBEDDINGS = "https://api.venice.ai/api/v1/embeddings";
const EMBED_MODEL       = "text-embedding-bge-m3";

export async function POST(req: NextRequest) {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Venice not configured." }, { status: 503 });
  }

  let body: { text?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { text } = body;
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  try {
    const res = await fetch(VENICE_EMBEDDINGS, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.slice(0, 8192), // BGE-M3 max input
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Venice embeddings error ${res.status}`, detail: err },
        { status: res.status }
      );
    }

    const data = await res.json() as {
      data?: Array<{ embedding: number[] }>;
    };

    const embedding = data?.data?.[0]?.embedding;
    if (!embedding) {
      return NextResponse.json({ error: "No embedding returned." }, { status: 502 });
    }

    return NextResponse.json({ embedding });
  } catch (e) {
    return NextResponse.json(
      { error: `Embeddings request failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
