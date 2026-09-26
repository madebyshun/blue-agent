/**
 * Blue Hood — Blue Chat card read endpoint (T-D D2).
 *
 * Public GET. Returns the pre-shaped `ChatCard` for one arrow so the
 * chat consumer never touches internal KV. Cache off — the chat renders
 * this at message time.
 *
 * 404 semantics: returns `{ ok: false, error: "not_found" }` with a 404
 * status. Never leaks the underlying arrow record; if the chat wants
 * more than the card carries, it should hit `/api/hood/arrows`.
 *
 * ⚠️ The arrow IS read here, for one reason: the card's `context` is a verbatim
 * copy of `brief.one_line_context`, and only the arrow carries the `warnings`
 * that say whether that sentence survived number reconciliation. Without the
 * lookup this route served the exact line `/api/hood/arrows` already withholds.
 * One extra KV command, on a route with no in-repo caller. See `serveChatCard`.
 */
import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { readChatCard, serveChatCard } from "@/lib/blue-hood/chat-card";
import { kvArrow } from "@/lib/blue-hood/kv-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string" || id.length > 128) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const card = await readChatCard(id);
  if (!card) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Direct read, not the hydrated feed blob: the blob caps at the newest 250
  // arrows while a card lives 30 days, so for a single id the precise lookup is
  // both cheaper (1 command, no rebuild risk) and correct at any age.
  const arrow = await kvGet<{ brief?: unknown }>(kvArrow(id));
  return NextResponse.json(
    { ok: true, card: serveChatCard(card, arrow ?? null) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
