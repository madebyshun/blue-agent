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
import { kvGetProbe, kvMutate, kvSAdd, kvSRem, kvSMembers, kvSet } from "@/lib/kv";
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

/** Read-modify-write a wallet's watches; keeps `watch:owners` in step. */
export async function mutateWatches(wallet: string, fn: (ws: Watch[]) => Watch[]): Promise<"ok" | "failed"> {
  let after: Watch[] = [];
  const r = await kvMutate<Record_>(kW(wallet), { v: 1, watches: [] }, (rec) => {
    after = fn(Array.isArray(rec?.watches) ? rec.watches : []);
    return { v: 1, watches: after };
  });
  if (r === "failed" || r === "skipped") return "failed";
  try {
    if (after.some((w) => w.active)) await kvSAdd(K_OWNERS, wallet.toLowerCase());
    else await kvSRem(K_OWNERS, wallet.toLowerCase());
  } catch { /* the tick re-derives: an owner with no active watch is skipped */ }
  return "ok";
}

export async function pushAlerts(wallet: string, alerts: WatchAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  await kvMutate<WatchAlert[]>(kA(wallet), [], (xs) => [...alerts, ...(Array.isArray(xs) ? xs : [])].slice(0, MAX_ALERTS_KEPT));
}

export async function markSeen(wallet: string, at: number): Promise<void> {
  await kvSet(kSeen(wallet), at);
}

export async function watchOwners(): Promise<string[] | null> {
  try { return await kvSMembers(K_OWNERS); } catch { return null; }
}
