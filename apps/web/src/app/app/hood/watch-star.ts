/**
 * Which state the Hood watch star (<WatchToggle> in HoodClient.tsx) is in —
 * pure, so scripts/watch-star-test.ts can pin it without React or wagmi.
 *
 * The state that matters is "unknown". Since 2026-09-30 the watchlist is read
 * only for a signed-in wallet, so a connected wallet without a session has a
 * null list. That used to fall through to ☆ "watch for alerts" (isWatching of
 * a null list is false, and the cap counted 0), telling a user whose Telegram
 * DMs were still arriving that their alerts were off. Unknown is its own
 * state, ahead of every state that reads the list.
 */
export type WatchStar = "disconnected" | "unknown" | "watching" | "at-cap" | "watchable";

export function watchStarState(i: {
  connected: boolean;
  /** The list was read (not null). */
  known: boolean;
  watching: boolean;
  count: number;
  cap: number;
}): WatchStar {
  if (!i.connected) return "disconnected";
  if (!i.known) return "unknown";
  if (i.watching) return "watching";
  return i.count >= i.cap ? "at-cap" : "watchable";
}

export function watchStarTitle(
  s: WatchStar,
  ctx: { needsSignIn: boolean; loading: boolean; cap: number },
): string {
  switch (s) {
    case "disconnected": return "connect wallet to watch";
    case "unknown":
      return ctx.needsSignIn
        ? "sign in to see your watchlist"
        : ctx.loading
          ? "reading your watchlist…"
          : "couldn't read your watchlist · click to retry";
    case "watching": return "watching · click to remove";
    case "at-cap": return `free limit ${ctx.cap} · hold $BLUE for more`;
    case "watchable": return "watch for alerts";
  }
}
