/**
 * One activity timeline per wallet (2026-10-01): what fired, what ran, what
 * was traded, what was refused — on the Scheduled page, newest first.
 *
 * Most of it is READ from where it already lives, never copied:
 *   alerts        lib/watches/store (watch:a:<wallet>)
 *   trades        lib/actions (act:w:<wallet>) — signed swaps/sends/bridges,
 *                 with the pre-trade verdict they were signed under
 * Only events with no other home are written here, to `feed:<wallet>`:
 *   automation_checked  a scheduled check whose condition did not hold
 *   task_run / task_failed  a recurring prompt run (background: the cron
 *                       tick writes it; foreground: the browser posts it)
 *   blocked             a pre-trade check BLOCK for this signed-in wallet
 *
 * Private like everything it reads: /api/timeline serves it to the wallet's own
 * SIWE session only. A failed read is "unavailable" for that source and says
 * so — never an empty timeline.
 */
import { kvGetProbe, kvMutate } from "@/lib/kv";

export type FeedKind = "automation_checked" | "task_run" | "task_failed" | "blocked";

export interface FeedEntry {
  id: string;
  at: number;
  kind: FeedKind;
  text: string;
  /** Where the number in `text` came from, when there is one. */
  source?: string;
  chain?: "base" | "robinhood";
  token?: string;
}

export const FEED_CAP = 100;
/** The same refusal (chain + token) is logged at most once per this window. */
export const BLOCK_DEDUPE_MS = 6 * 60 * 60 * 1000;
const kFeed = (w: string) => `feed:${w.toLowerCase()}`;

export async function pushFeed(wallet: string, entries: Array<Omit<FeedEntry, "id">>): Promise<void> {
  if (!wallet || entries.length === 0) return;
  const stamped = entries.map((e, i) => ({ ...e, text: e.text.slice(0, 600), id: `${e.kind}:${e.at}:${i}` }));
  try {
    await kvMutate<FeedEntry[]>(kFeed(wallet), [], (xs) => {
      const cur = Array.isArray(xs) ? xs : [];
      // A pre-trade card re-checks on every mount and edit, so the same BLOCK
      // arrives again and again. One line per (chain, token) per window —
      // otherwise refusals crowd real history out of FEED_CAP.
      const fresh = stamped.filter((e) => e.kind !== "blocked" || !cur.some((c) =>
        c.kind === "blocked" && c.chain === e.chain && (c.token ?? "").toLowerCase() === (e.token ?? "").toLowerCase() && e.at - c.at < BLOCK_DEDUPE_MS));
      return fresh.length ? [...fresh, ...cur].slice(0, FEED_CAP) : null;
    });
  } catch { /* the feed is a record of what happened; the thing itself already happened */ }
}

export async function readFeed(wallet: string): Promise<FeedEntry[] | null> {
  const p = await kvGetProbe<FeedEntry[]>(kFeed(wallet));
  if (p.status === "error") return null;
  return p.status === "hit" && Array.isArray(p.value) ? p.value : [];
}

/** The merged item the page renders. */
export interface ActivityItem {
  id: string;
  at: number;
  kind: FeedKind | "alert" | "trade";
  title: string;
  detail?: string;
  source?: string;
  chain?: "base" | "robinhood";
  href?: string;
}
