/**
 * One pass over every active watch — run from the existing 5-minute cron
 * (/api/cron/user-tasks), BEFORE that route's schedule watermark, because the
 * watermark only knows about prompt schedules and would put watches to sleep
 * for up to an hour.
 *
 * Cost when nobody is watching: one SMEMBERS. Otherwise: one GET per owner,
 * one GeckoTerminal call per 30 pools per chain, one Chainlink read per stock
 * feed — and KV writes ONLY for owners whose watches changed state.
 */
import { kvDel, kvTryLock } from "@/lib/kv";
import { evaluateWatch } from "./evaluate";
import { readReadings } from "./prices";
import { mutateWatches, pushAlerts, readWatches, watchOwners } from "./store";
import type { Watch, WatchAlert } from "./types";

const LOCK = "watch:tick:lock";
const LOCK_TTL_S = 4 * 60;

export interface WatchTickResult { owners: number; watches: number; fired: number; skipped?: string }

export async function runWatchTick(now: number): Promise<WatchTickResult> {
  const owners = await watchOwners();
  if (!owners || owners.length === 0) return { owners: 0, watches: 0, fired: 0 };

  const lock = await kvTryLock(LOCK, { at: now }, LOCK_TTL_S);
  if (lock !== "acquired") return { owners: owners.length, watches: 0, fired: 0, skipped: `lock ${lock}` };
  try {
    const byOwner = new Map<string, Watch[]>();
    for (const o of owners) {
      const r = await readWatches(o);
      if (r.status === "ok") byOwner.set(o, r.value.filter((w) => w.active));
    }
    const all = [...byOwner.values()].flat();
    if (all.length === 0) return { owners: owners.length, watches: 0, fired: 0 };
    const readings = await readReadings(all);

    let fired = 0;
    for (const [owner, ws] of byOwner) {
      const changed = new Map<string, Watch>();
      const alerts: WatchAlert[] = [];
      for (const w of ws) {
        const r = readings.get(w.id);
        if (!r) continue;
        const ev = evaluateWatch(w, r, now);
        if (ev.next !== w) changed.set(w.id, ev.next);
        if (ev.fire && ev.text) {
          alerts.push({ id: `${w.id}:${now}`, watchId: w.id, at: now, chain: w.chain, token: w.token, symbol: w.symbol, text: ev.text });
        }
      }
      if (changed.size === 0) continue;
      // Re-read inside the mutation: a user may have paused or deleted a watch
      // since we read it, and their edit wins over this tick's state change.
      const res = await mutateWatches(owner, (cur) => cur.map((w) => {
        const n = changed.get(w.id);
        return n && w.active ? { ...n, active: n.active && w.active } : w;
      }));
      // An alert is written only once its watch's new state persisted —
      // otherwise the next tick would fire it again.
      if (res === "ok") { await pushAlerts(owner, alerts); fired += alerts.length; }
    }
    return { owners: owners.length, watches: all.length, fired };
  } finally {
    await kvDel(LOCK);
  }
}
