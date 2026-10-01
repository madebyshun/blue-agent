/**
 * KV for price watches. Shape and budget:
 *
 *   watch:owners           SET of wallets with ≥ 1 ACTIVE watch — the tick's
 *                          one read when nobody is watching anything
 *   watch:w:<wallet>       { v, watches: Watch[] }
 *   watch:a:<wallet>       WatchAlert[] newest first, capped at MAX_ALERTS_KEPT
 *   watch:seen:<wallet>    ms timestamp: alerts newer than this are unread
 *
 * The tick writes ONLY when something changes (a fire, a re-arm, a
 * deactivation) — never "last checked" stamps — because every 5-minute write
 * per wallet is the KV-budget shape #148 was about.
 *
 * Reads that fail are "unavailable", never an empty list (the same #150 rule
 * as the schedule store): a UI that shows "no watches" during a KV blip invites
 * the user to create duplicates.
 */
import { kv, kvGetProbe, kvMutate, kvSRem, kvSet } from "@/lib/kv";
import { MAX_ALERTS_KEPT, type Watch, type WatchAlert } from "./types";

const K_OWNERS = "watch:owners";
const kW = (w: string) => `watch:w:${w.toLowerCase()}`;
const kA = (w: string) => `watch:a:${w.toLowerCase()}`;
const kSeen = (w: string) => `watch:seen:${w.toLowerCase()}`;

type Record_ = { v: 1; watches: Watch[] };

export type Read<T> = { status: "ok"; value: T } | { status: "unavailable" };

export async function readWatches(wallet: string): Promise<Read<Watch[]>> {
  const p = await kvGetProbe<Record_>(kW(wallet));
  if (p.status === "error") return { status: "unavailable" };
  return { status: "ok", value: p.status === "hit" && Array.isArray(p.value?.watches) ? p.value.watches : [] };
}

export async function readAlerts(wallet: string): Promise<Read<{ alerts: WatchAlert[]; seenAt: number }>> {
  const [a, s] = await Promise.all([kvGetProbe<WatchAlert[]>(kA(wallet)), kvGetProbe<number>(kSeen(wallet))]);
  if (a.status === "error" || s.status === "error") return { status: "unavailable" };
  return {
    status: "ok",
    value: {
      alerts: a.status === "hit" && Array.isArray(a.value) ? a.value : [],
      seenAt: s.status === "hit" ? Number(s.value) || 0 : 0,
    },
  };
}

/**
 * Read-modify-write a wallet's watches. `fn` returns the new list, or `null`
 * for "nothing to change" (no write, result "unchanged").
 *
 * `watch:owners` (review 2026-10-01): the ADD is checked — a watch the tick
 * cannot find never fires, so a failed SADD fails the call rather than
 * reporting a watch that will silently never be checked. Only the USER's own
 * writes (`fromTick: false`) may remove the wallet; the tick never does,
 * because its stale view raced a user's new watch and orphaned it. An owner
 * left with nothing active costs one slot in the tick's single MGET.
 */
export async function mutateWatches(
  wallet: string,
  fn: (ws: Watch[]) => Watch[] | null,
  opts: { fromTick?: boolean } = {},
): Promise<"ok" | "unchanged" | "failed"> {
  let after: Watch[] | null = null;
  const r = await kvMutate<Record_>(kW(wallet), { v: 1, watches: [] }, (rec) => {
    after = fn(Array.isArray(rec?.watches) ? rec.watches : []);
    return after ? { v: 1, watches: after } : null;
  });
  if (r === "failed" || r === "skipped") return "failed";
  if (r === "unchanged" || !after) return "unchanged";
  const list: Watch[] = after;
  if (list.some((w) => w.active)) {
    try { await kv.sadd(K_OWNERS, wallet.toLowerCase()); }
    catch (e) { console.error(`[watch] owner index write failed: ${(e as Error).message}`); return "failed"; }
  } else if (!opts.fromTick) {
    await kvSRem(K_OWNERS, wallet.toLowerCase());
  }
  return "ok";
}

/** Every owner's watches in ONE command (MGET). null ⟹ the read failed. */
export async function readManyWatches(owners: string[]): Promise<Map<string, Watch[]> | null> {
  const out = new Map<string, Watch[]>();
  try {
    for (let i = 0; i < owners.length; i += 100) {
      const chunk = owners.slice(i, i + 100);
      const recs = await kv.mget<Record_>(...chunk.map(kW));
      chunk.forEach((o, j) => out.set(o, Array.isArray(recs[j]?.watches) ? recs[j]!.watches : []));
    }
    return out;
  } catch (e) {
    console.error(`[watch] owner records read failed: ${(e as Error).message}`);
    return null;
  }
}

/** Ids are deterministic (`<watchId>:<tick time>`), so a retried write
 *  never duplicates an alert already stored. */
export async function pushAlerts(wallet: string, alerts: WatchAlert[]): Promise<boolean> {
  if (alerts.length === 0) return true;
  const r = await kvMutate<WatchAlert[]>(kA(wallet), [], (xs) => {
    const cur = Array.isArray(xs) ? xs : [];
    const have = new Set(cur.map((a) => a.id));
    const fresh = alerts.filter((a) => !have.has(a.id));
    return fresh.length ? [...fresh, ...cur].slice(0, MAX_ALERTS_KEPT) : null;
  });
  if (r === "failed" || r === "skipped") {
    console.error(`[watch] alerts not written for ${alerts.length} fired watch(es): ${r}`);
    return false;
  }
  return true;
}

/** Mark read up to the newest alert the user was SHOWN (never past "now"):
 *  an alert written after the page loaded stays unread. */
export async function markSeen(wallet: string, at: number): Promise<void> {
  await kvSet(kSeen(wallet), Math.min(at, Date.now()));
}

/** null ⟹ the index could not be read (logged) — not "nobody is watching". */
export async function watchOwners(): Promise<string[] | null> {
  try { return (await kv.smembers(K_OWNERS)) ?? []; }
  catch (e) { console.error(`[watch] owners read failed: ${(e as Error).message}`); return null; }
}
