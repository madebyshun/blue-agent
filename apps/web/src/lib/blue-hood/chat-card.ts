/**
 * Blue Hood — Blue Chat card payload (T-D D2).
 *
 * When an arrow fires, `writeChatCard` shapes a chat-consumable card and
 * stashes it at `bh:chat:card:{arrow_id}`. A separate rolling list at
 * `bh:chat:feed` keeps the last N ids newest-first so the chat can
 * enumerate without walking the raw arrow feed.
 *
 * Kept intentionally lean:
 *   - Only fields Blue Chat wants to render (serial, ticker, signal,
 *     verdict_note, deep-links).
 *   - No `snapshot_refs`, no `outcome_detail` (chat is fire-time), no
 *     full brief (we take just the one-liner + optional context line).
 *   - Numeric fields are pre-formatted strings so the chat renderer
 *     never has to know Robinhood-Chain USDC decimals.
 *
 * The write is best-effort — a failure logs and returns null; the arrow
 * still fires. The chat consumer is expected to gracefully skip missing
 * cards.
 *
 * NOTE: this is the write-side only. A read helper lives at
 * `/api/hood/chat/card/[id]` (public GET) so the eventual chat consumer
 * or the LLM tool can fetch by id without importing internal libs.
 */
import { kvGet, kvSet, kvMutate } from "@/lib/kv";
import { absoluteUrl } from "@/lib/site-url";
import { BRIEF_STATUS_WITHHELD, briefHasNumberDrift } from "./brief-serving";
import { kvChatCard, KV_CHAT_CARD_FEED, TTL_CHAT_CARD } from "./kv-keys";
import type { Arrow } from "./types";

export interface ChatCard {
  /** Payload version — bump only if the chat renderer needs to migrate. */
  v: 1;
  /** Stable UUID (same as the arrow's). */
  id: string;
  /** Cosmetic `#0001` serial for chat headers. */
  serial: string;
  ticker: string;
  /** Human-readable signal tag e.g. "DRIFT ↑", "ARB long dex". */
  signal: string;
  /** One-line brief verdict note — the chat's headline body. Empty if
   *  the brief chain was skipped or crashed at fire time. */
  headline: string;
  /** Optional one-line market context ("premarket · closed", etc.).
   *  Never mixed with `headline` server-side so the chat can style them
   *  differently (headline bold, context muted). */
  context: string;
  /** ISO timestamp — chat renders relative time from this. */
  fired_at: string;
  /** Deep-links so the card can offer "Open in inbox" / "Track record". */
  href: {
    inbox: string;
    board: string;
  };
}

function signalTag(a: Arrow): string {
  if (a.type === "drift") return `DRIFT ${a.expected_direction === "up" ? "↑" : "↓"}`;
  if (a.type === "arb") return `ARB ${a.expected_direction === "up" ? "long dex" : "short dex"}`;
  if (a.type === "flow") return `FLOW ${a.expected_direction === "up" ? "buy" : "sell"}`;
  return "WHALE Δ";
}

export function buildChatCard(a: Arrow): ChatCard {
  return {
    v: 1,
    id: a.id,
    serial: a.serial,
    ticker: a.ticker,
    signal: signalTag(a),
    headline: (a.brief?.verdict_note ?? "").trim(),
    context: (a.brief?.one_line_context ?? "").trim(),
    fired_at: a.fired_at,
    href: {
      // Absolute URLs — the card is persisted in KV and may be
      // rendered from any origin (chat is same-origin today, but the
      // reviewer is planning cross-context surfaces). `absoluteUrl`
      // pins to `NEXT_PUBLIC_SITE_URL` on prod; falls back to a
      // relative path on preview/localhost.
      inbox: absoluteUrl(`/hood/inbox#${a.id}`),
      board: absoluteUrl(`/hood`),
    },
  };
}

/**
 * Persist a chat card + push its id onto the feed list. Errors are
 * swallowed with a warn — arrow firing must never depend on chat write.
 */
export async function writeChatCard(a: Arrow): Promise<ChatCard | null> {
  try {
    const card = buildChatCard(a);
    await kvSet(kvChatCard(a.id), card, TTL_CHAT_CARD);
    // `kvMutate` skips the write when the read failed, instead of replacing
    // the whole card feed with `[a.id]` (task #150). The `null` return is the
    // old duplicate guard — e.g. if fireArrow is retried while the card write
    // already succeeded.
    const res = await kvMutate<string[]>(KV_CHAT_CARD_FEED, [], (feed) =>
      feed.includes(a.id) ? null : [a.id, ...feed],
    );
    if (res === "skipped") {
      console.warn(`[chat-card] ${a.serial} written but not indexed — KV read failed`);
    }
    console.log(`[chat-card] written arrow=${a.serial} ticker=${a.ticker} headline_len=${card.headline.length}`);
    return card;
  } catch (e) {
    console.warn(`[chat-card] write failed for ${a.serial} ${a.ticker}: ${(e as Error).message}`);
    return null;
  }
}

/** Best-effort read for the API surface + eventual chat consumer. */
export async function readChatCard(arrowId: string): Promise<ChatCard | null> {
  return (await kvGet<ChatCard>(kvChatCard(arrowId))) ?? null;
}

/**
 * ── SERVE-TIME WITHHOLDING FOR THE CARD'S `context` LINE ─────────────────────
 *
 * `context` is a VERBATIM COPY of `brief.one_line_context` — the one field in
 * this whole system that an LLM writes freely, and the one `brief-serving.ts`
 * exists to withhold when `detectBriefNumberDrift` catches it citing a
 * percentage that does not reconcile against `facts_at_fire`.
 *
 * The copy is the hole. `brief-serving.ts` withholds the ORIGINAL, on the
 * arrow; the card carries a second copy, written at fire time, with no
 * `warnings` field on it to judge itself by. So `/api/hood/chat/card/[id]` and
 * `/api/hood/chat/recent` were serving the exact sentence the arrow feed had
 * already been taught to suppress, from a different URL. `/api/chat` was fixed
 * in-line and is the reason this is a projection and not a rewrite — see the
 * `briefWithheld` branch there.
 *
 * ⚠️ PROJECTION, NOT MUTATION, NOT A CORRECTION — same law as
 * `brief-serving.ts` and `arrow-fields.ts`. The stored card keeps its original
 * `context` verbatim and so does the arrow; a published number stays exactly as
 * published, wrong ones included. Only what leaves the server changes.
 *
 * Done at READ time rather than at `buildChatCard` time on purpose: cards live
 * for `TTL_CHAT_CARD` (30 days), so a write-time fix would leave a month of
 * already-written cards still serving the flagged sentence — the backlog is the
 * whole reason this is worth doing, not an edge case of it.
 */

/** `context` was blanked because the arrow's brief carries a drift warning. */
export const CONTEXT_WITHHELD_DRIFT = BRIEF_STATUS_WITHHELD;

/**
 * `context` was blanked because the arrow it came from could not be read, so
 * there was nothing to reconcile it against.
 *
 * A separate value from the one above because the two are different facts and
 * a reader acts on them differently: the first says "we caught a bad number",
 * the second says "we could not check". Collapsing them would let an outage
 * masquerade as a detection.
 */
export const CONTEXT_WITHHELD_UNVERIFIED = "withheld_unverified" as const;

export type ChatCardContextStatus =
  | typeof CONTEXT_WITHHELD_DRIFT
  | typeof CONTEXT_WITHHELD_UNVERIFIED;

export interface ServedChatCard extends ChatCard {
  /** Present ONLY when `context` was withheld. Absent on every clean card, so
   *  an empty `context` with no status still means what it always meant: the
   *  brief chain wrote no context line. */
  context_status?: ChatCardContextStatus;
  /** The arrow's brief warnings, verbatim. Part three of the withholding rule:
   *  suppressing the text while hiding the reason would turn a visible
   *  fabrication into an invisible one, which is worse than the bug. Only
   *  attached alongside a `withheld_number_drift` status — a clean card is
   *  served byte-identical to what it has always been. */
  warnings?: string[];
}

/**
 * The served form of one card.
 *
 * Returns the SAME REFERENCE when there is nothing to withhold — including for
 * a card whose `context` is already empty, which is most of them. That keeps
 * "a clean card is served completely unchanged" true by identity, and stops a
 * context-less card from being stamped with an alarming status that describes
 * nothing.
 *
 * `arrow` is `undefined` when the lookup was never attempted and `null` when it
 * was attempted and missed. Both are treated as unverified — but only the miss
 * can happen on the routes below, and it is the case that must never silently
 * pass a narrative line through.
 */
export function serveChatCard(
  card: ChatCard,
  arrow: { brief?: unknown } | null | undefined,
): ServedChatCard {
  if (!card.context) return card;
  if (!arrow) {
    return { ...card, context: "", context_status: CONTEXT_WITHHELD_UNVERIFIED };
  }
  if (!briefHasNumberDrift(arrow.brief)) return card;
  const warnings = (arrow.brief as { warnings?: unknown }).warnings;
  return {
    ...card,
    context: "",
    context_status: CONTEXT_WITHHELD_DRIFT,
    warnings: Array.isArray(warnings) ? warnings.filter((w): w is string => typeof w === "string") : [],
  };
}

/** Newest N card ids (default 20). Trimmed inline so the chat consumer
 *  doesn't have to know the KV shape. */
export async function listRecentChatCardIds(limit = 20): Promise<string[]> {
  const feed = (await kvGet<string[]>(KV_CHAT_CARD_FEED)) ?? [];
  return feed.slice(0, Math.max(1, Math.min(200, limit)));
}
