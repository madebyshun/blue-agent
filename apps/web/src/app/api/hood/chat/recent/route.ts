/**
 * Blue Hood — recent Blue Chat cards list (T-D D2).
 *
 * Public GET. Returns the newest N chat-card ids (default 20, cap 100)
 * plus the hydrated card payloads. Chat consumers use this to render a
 * "recent Blue Hood arrows" strip without paging through the full
 * `/api/hood/arrows` list.
 *
 * The endpoint is deliberately lean: no filtering (chat can filter
 * client-side), no cursor (only 20-100 items ever returned), no cache
 * (cards go stale the moment a new arrow fires and the chat wants that
 * instantly).
 *
 * ⚠️ The arrow feed IS read here, once. A card's `context` is a verbatim copy
 * of `brief.one_line_context` and only the arrow carries the `warnings` that
 * say whether it survived number reconciliation — so without this, the route
 * served the exact line `/api/hood/arrows` already withholds. One shared blob
 * read covers every card in the page (`readArrowFeed` is 1 KV command warm),
 * which is why this does NOT fan out to one arrow read per card.
 */
import { NextRequest, NextResponse } from "next/server";
import { readArrowFeed } from "@/lib/blue-hood/arrow-cache";
import { listRecentChatCardIds, readChatCard, serveChatCard } from "@/lib/blue-hood/chat-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

  const ids = await listRecentChatCardIds(limit);
  // Hydrate in parallel; drop misses so the chat sees only live cards.
  const [stored, feed] = await Promise.all([
    Promise.all(ids.map((id) => readChatCard(id))),
    readArrowFeed(),
  ]);

  // An `unavailable` feed leaves this map EMPTY, so every card with a context
  // line is served `withheld_unverified` rather than served raw. That is the
  // intended direction: a KV outage must not be the thing that publishes a
  // sentence nobody could check.
  const byId = new Map<string, { brief?: unknown }>();
  if (feed.status === "ok") for (const a of feed.arrows) byId.set(a.id, a);

  const cards = stored
    .filter((c): c is NonNullable<typeof c> => c != null)
    .map((c) => serveChatCard(c, byId.get(c.id) ?? null));

  return NextResponse.json(
    { ok: true, cards, count: cards.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
