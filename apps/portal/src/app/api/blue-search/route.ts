/**
 * POST /api/blue-search
 *
 * Base ecosystem search. Curated corpus today, vector index path is ready.
 * Free tier — when x402 wiring lands this gets gated at $0.05/call.
 *
 * Request:
 *   { "query": "how to deploy on Base?", "limit": 8 }
 *
 * Response:
 *   { query, mode, total, results: [{ id, title, url, snippet, score, source, updatedAt }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/blue-search/search";

export const runtime = "nodejs";

interface Body {
  query: string;
  limit?: number;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "Query too long (max 500 chars)" }, { status: 400 });
  }

  const limit = Math.min(Math.max(body.limit ?? 8, 1), 20);
  const resp  = await search(query, limit);

  return NextResponse.json(resp, {
    headers: {
      "Cache-Control":              "public, s-maxage=30, stale-while-revalidate=120",
      "Access-Control-Allow-Origin":"*",
    },
  });
}

// Allow GET with ?q= for easy testing in browser
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "8");

  if (!query) {
    return NextResponse.json({
      endpoint:    "/api/blue-search",
      usage:       "POST { query, limit? } or GET ?q=...",
      example:     "/api/blue-search?q=how+to+deploy+on+base",
      mode:        "lexical (vector upgrade ready)",
    });
  }

  const resp = await search(query, Math.min(Math.max(limit, 1), 20));
  return NextResponse.json(resp, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
