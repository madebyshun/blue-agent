/**
 * One in-flight RH holdings read per address, shared across mounts.
 *
 * ── The problem this solves ───────────────────────────────────────────────────
 * `RhTokenTable` is mounted behind `showsChain("robinhood")`. When the chain
 * filter hides Robinhood the component UNMOUNTS, and React throws away its
 * `useState` with it — so every switch back to Robinhood is a cold start:
 * spinner, new request, full wait. Switching Base → RH → Base → RH is four
 * complete reads of a wallet that did not change.
 *
 * That is the half of the slowness the user could see. The other half is
 * measured in `blockscout.ts` (the native-balance leg holding the token list
 * hostage) and fixed there. They compound: a cold start on every switch, each
 * one paying a 16-second tail.
 *
 * ── Why a promise cache and not a value cache ─────────────────────────────────
 * The value is the smaller half. Caching only resolved values still lets two
 * mounts in the same second fire two identical requests — and on a flaky
 * explorer, two requests is two chances to get the 500 that shows the user an
 * "unavailable" banner. Storing the PROMISE means the second caller joins the
 * first read instead of racing it.
 *
 * It also makes the read WARMABLE, which is the only thing that helps the FIRST
 * switch. The wallet page knows the address at mount; it does not need to wait
 * for the user to ask for Robinhood before starting to read it. `warmRhHoldings`
 * is that call, and because it goes through the same entry as the table, warming
 * cannot double-fetch.
 *
 * ── What is NOT cached, and why that is the important part ────────────────────
 * A read whose `status` is not "ok" is never stored. `status: "unavailable"`
 * means the explorer did not answer — it is the ABSENCE of a read, and caching
 * an absence would turn one transient 500 into a full TTL of a wallet page
 * insisting the user's holdings cannot be checked. The flaky leg here 500s at a
 * measured 5-of-9 (see `blockscout.ts`), so this is the common case, not a
 * corner. Failures fall straight through and the next mount retries.
 *
 * Stale data is likewise never presented as fresh: `TTL_MS` is short, and every
 * cached entry is a REAL read that really happened, just seconds ago. Nothing
 * here synthesises a holding, a price, or a total. On expiry the entry is
 * dropped and the next caller reads the chain again.
 */
import type { RhHoldingsResult } from "@/lib/wallet/rh-holdings";

/**
 * How long a successful read stays servable.
 *
 * 45s is chosen against what the number is FOR: this is a holdings list, and a
 * holdings list that is three-quarters of a minute old is the same list. It is
 * deliberately shorter than the time it takes to notice a balance changed and
 * long enough to cover the switch-back-and-forth the cache exists for. A user
 * who wants a guaranteed-fresh read has one: reload, which starts a new module
 * instance and an empty cache.
 */
const TTL_MS = 45_000;

type Entry = {
  /** The read itself — stored in flight so concurrent mounts share one request. */
  promise: Promise<RhHoldingsResult>;
  /** When the VALUE landed. `null` while still in flight: an unresolved entry
   *  cannot be expired, because there is nothing yet to be stale. */
  settledAt: number | null;
};

const cache = new Map<string, Entry>();

function key(address: string): string {
  return address.toLowerCase();
}

function isFresh(e: Entry): boolean {
  return e.settledAt === null || Date.now() - e.settledAt < TTL_MS;
}

/**
 * Read this address's Robinhood Chain holdings, reusing an in-flight or recent
 * read when there is one.
 *
 * Always resolves — the route itself never throws a 500 into an empty list (see
 * its `unavailable()` helper), and a genuinely failed fetch is re-thrown to the
 * caller so the table can render "we could not check" rather than "you hold
 * nothing". The two are different facts and this function keeps them different.
 */
export function getRhHoldings(address: string): Promise<RhHoldingsResult> {
  const k = key(address);
  const hit = cache.get(k);
  if (hit && isFresh(hit)) return hit.promise;

  const entry: Entry = { settledAt: null, promise: Promise.resolve(null as never) };
  entry.promise = fetch(`/api/wallet/rh-holdings?address=${address}`)
    .then(r => r.json() as Promise<RhHoldingsResult>)
    .then(d => {
      // Only a real read is worth keeping. An "unavailable" is the explorer
      // refusing us, and pinning that for 45s would make one 500 look like a
      // dead chain — see the header.
      if (d?.status === "ok") entry.settledAt = Date.now();
      else cache.delete(k);
      return d;
    })
    .catch(err => {
      // Same rule, stronger case: a thrown fetch is not an answer at all.
      cache.delete(k);
      throw err;
    });

  cache.set(k, entry);
  return entry.promise;
}

/**
 * Start the read now, without waiting for anyone to look at it.
 *
 * Called by the wallet page on mount so the Robinhood tab is warm BEFORE the
 * user switches to it — the cache above only ever helped the second switch, and
 * the first one is the one that was reported as slow. Errors are swallowed here
 * on purpose: this is a prefetch with no reader, and an unhandled rejection from
 * a speculative read would be noise in the console and nothing else. The real
 * caller re-reads and gets the real error.
 */
export function warmRhHoldings(address: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return;
  void getRhHoldings(address).catch(() => {});
}
