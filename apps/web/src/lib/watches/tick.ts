/**
 * One pass over every active watch — run by its own 5-minute cron,
 * /api/cron/watches (moved out of /api/cron/user-tasks on 2026-10-01: that
 * route's 300 s budget is sized for exactly three prompt runs, and a slow price
 * read here could kill it mid-run).
 *
 * Cost: one SMEMBERS, one MGET for every owner's record, one DexScreener call
 * per 30 tokens per chain (GeckoTerminal only for what it does not list), the
 * Chainlink reads in parallel — and KV writes ONLY for owners whose watches
 * changed state. Automations (`checkAt`) are read only when their check is
 * due; every due check writes its next check time plus an alert or a feed line.
 *
 * The pass carries a deadline: owners not reached in time wait for the next
 * pass (watches are level-triggered, nothing is lost), and the pass never
 * starts writing for an owner after it.
 */
import { kvDel, kvTryLock } from "@/lib/kv";
import { evaluateScheduled, evaluateWatch } from "./evaluate";
import { nextFireAt } from "@/lib/cron-schedule";
import { pushFeed, type FeedEntry } from "@/lib/activity";
import { readReadings } from "./prices";
import { mutateWatches, pushAlerts, readManyWatches, watchOwners } from "./store";
import { deliverAlerts } from "./deliver";
import { CASH, type Watch, type WatchAlert } from "./types";

/** A scheduled watch (automation) is read only when its check is due. */
const isDue = (w: Watch, now: number) => !w.checkAt || (typeof w.nextCheckAt === "number" && w.nextCheckAt <= now);

/**
 * The next check after this one, anchored on the SLOT that was due — not on
 * when the pass ran. Anchoring on `now` skipped a whole day when a 23:58 check
 * was reached just after midnight, and walked a weekly check forward a day
 * each week (review 2026-10-01, measured with nextFireAt).
 */
export function nextCheckAfter(w: Watch, now: number): number {
  const c = w.checkAt!;
  return nextFireAt({ schedule: c.schedule, time: c.time, tz: c.tz, lastRun: w.nextCheckAt ?? now }, now);
}

const LOCK = "watch:tick:lock";
const LOCK_TTL_S = 4 * 60;

export interface WatchTickResult { owners: number; watches: number; fired: number; skipped?: string; deferred?: number }

export async function runWatchTick(now: number, deadline = now + 45_000): Promise<WatchTickResult> {
  const owners = await watchOwners();
  if (owners == null) return { owners: 0, watches: 0, fired: 0, skipped: "owners unreadable" };
  if (owners.length === 0) return { owners: 0, watches: 0, fired: 0 };

  const lock = await kvTryLock(LOCK, { at: now }, LOCK_TTL_S);
  if (lock !== "acquired") return { owners: owners.length, watches: 0, fired: 0, skipped: `lock ${lock}` };
  try {
    const records = await readManyWatches(owners);
    if (!records) return { owners: owners.length, watches: 0, fired: 0, skipped: "records unreadable" };
    const byOwner = new Map<string, Watch[]>();
    for (const [o, ws] of records) {
      const due = ws.filter((w) => w.active && isDue(w, now));
      if (due.length) byOwner.set(o, due);
    }
    const all = [...byOwner.values()].flat();
    if (all.length === 0) return { owners: owners.length, watches: 0, fired: 0 };
    const readings = await readReadings(all);

    let fired = 0;
    let deferred = 0;
    for (const [owner, ws] of byOwner) {
      if (Date.now() > deadline) { deferred++; continue; }
      const changed = new Map<string, Watch>();
      const alerts = new Map<string, WatchAlert>();
      const feed = new Map<string, Omit<FeedEntry, "id">>();
      const alertFor = (w: Watch, text: string): WatchAlert => ({
        id: `${w.id}:${now}`, watchId: w.id, at: now, chain: w.chain, token: w.token, symbol: w.symbol, text,
        ...(w.native ? { native: true } : {}),
        ...(w.trade ? { trade: { ...w.trade, cash: CASH[w.chain] } } : {}),
      });
      for (const w of ws) {
        const r = readings.get(w.id);
        if (w.checkAt) {
          // An automation's check: answered every time it comes round, even
          // when the reading is missing — the user should see that it ran.
          const nextCheckAt = nextCheckAfter(w, now);
          const ev = r
            ? evaluateScheduled(w, r, now, nextCheckAt)
            : { fire: false, text: `${w.symbol}: no reading at the scheduled check — skipped.`, next: { ...w, lastCheckedAt: now, nextCheckAt } };
          changed.set(w.id, ev.next);
          if (ev.fire) alerts.set(w.id, alertFor(w, ev.text));
          else feed.set(w.id, { at: now, kind: "automation_checked", text: ev.text, chain: w.chain, token: w.token });
          continue;
        }
        if (!r) continue;
        const ev = evaluateWatch(w, r, now);
        if (ev.next !== w) changed.set(w.id, ev.next);
        if (ev.fire && ev.text) alerts.set(w.id, alertFor(w, ev.text));
      }
      if (changed.size === 0) continue;
      // Re-read inside the mutation: a user may have paused or deleted a watch
      // since we read it, and their edit wins. Only watches whose new state is
      // actually written here get their alert / feed line — a watch deleted or
      // paused mid-pass must not deliver a prepared trade afterwards.
      const applied = new Set<string>();
      const res = await mutateWatches(owner, (cur) => {
        let any = false;
        const next = cur.map((w) => {
          const n = changed.get(w.id);
          if (!n || !w.active) return w;
          applied.add(w.id);
          any = true;
          return { ...n, active: n.active && w.active };
        });
        return any ? next : null;
      }, { fromTick: true });
      if (res !== "ok") continue;
      const out = [...alerts.values()].filter((a) => applied.has(a.watchId));
      if (await pushAlerts(owner, out)) {
        fired += out.length;
        // Outside the app: Telegram for a wallet its owner linked (deliver.ts).
        // Only after the alert is recorded, so the record never depends on it.
        await deliverAlerts(owner, out);
      }
      await pushFeed(owner, [...feed.entries()].filter(([id]) => applied.has(id)).map(([, e]) => e));
    }
    return { owners: owners.length, watches: all.length, fired, ...(deferred ? { deferred } : {}) };
  } finally {
    await kvDel(LOCK);
  }
}
