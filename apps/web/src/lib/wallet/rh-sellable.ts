"use client";

/**
 * "May this row offer a Sell button?" — measured, cached, and never guessed.
 *
 * ── The rule this module enforces ─────────────────────────────────────────────
 *
 * A Sell control appears on a Robinhood Chain row ONLY where a Uniswap V3
 * token/WETH pool has actually been read on 4663. Not where one is likely, not
 * where the token looks legitimate, not where the registry lists it — where one
 * was measured. `/api/robinhood/swap/sellable` does the reading; this module
 * caches it and hands the tables a verdict.
 *
 * The reason is narrow and worth stating once: `swap-prepare`'s sell mode builds
 * a single `swapExactInputSingleForETH` against one fee tier, so a live
 * token/WETH pool is not evidence of a route — it IS the route. Most RWA tokens
 * on this chain have no pool at all. A Sell button on one of them opens a card
 * that answers NO_ROUTE, after the user has already decided to sell.
 *
 * ── Three states, and why the third is not folded into the second ─────────────
 *
 *   "pool"        measured, fillable        → the control is drawn
 *   "none"        measured, nothing to fill → a dash, and we say why
 *   "unreadable"  NOT measured              → a dash, and we say THAT instead
 *
 * The button treats `unreadable` exactly like `none` — fail closed, no affordance
 * we cannot back. The LABEL does not: "no pool on this chain" is a claim, and an
 * RPC that timed out cannot support it. Collapsing the two would put a confident
 * sentence about a user's own asset on screen on the strength of a dropped
 * request, which is the #211/#212/#213 shape (an absence produced by a broken
 * reader, rendered as a fact) applied to the trade path.
 *
 * `undefined` — an address we never asked about — is a FOURTH thing and is read
 * the same way as `unreadable` by every caller. There is no branch anywhere that
 * turns "we have no entry" into a sellable row.
 */

import { useEffect, useState } from "react";

export type SellState = "pool" | "none" | "unreadable";

/** What a row needs to know. `undefined` means not measured — see the header. */
export type SellMap = Record<string, SellState | undefined>;

type Probe = { state: SellState; reason?: string };
type Resp = { ok?: boolean; sellable?: Record<string, Probe>; truncated?: number };

/**
 * 10 minutes, matching the route's own memo. Pool existence changes when someone
 * deploys a pool, not tick by tick, so this is a slow-moving fact and the cache
 * is not papering over anything. A user who wants it re-read has a reload.
 */
const TTL_MS = 10 * 60_000;

const cache = new Map<string, { state: SellState; at: number }>();
/** One in-flight request per address, so N tables mounting at once share a read. */
const inflight = new Map<string, Promise<void>>();

function fresh(addr: string): SellState | undefined {
  const hit = cache.get(addr);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= TTL_MS) { cache.delete(addr); return undefined; }
  return hit.state;
}

/**
 * Measure any of `tokens` we do not already have, then return what we know.
 *
 * Never rejects: a failed request leaves those addresses simply absent from the
 * map, and absent is read as unmeasured. There is no error path that could be
 * mistaken for an answer.
 */
export async function getRhSellable(tokens: string[]): Promise<SellMap> {
  const want = Array.from(
    new Set(tokens.map(t => t.trim().toLowerCase()).filter(t => /^0x[a-f0-9]{40}$/.test(t))),
  );
  if (!want.length) return {};

  const cold = want.filter(a => fresh(a) === undefined && !inflight.has(a));

  if (cold.length) {
    const run = fetch(`/api/robinhood/swap/sellable?tokens=${cold.join(",")}`)
      .then(r => r.json() as Promise<Resp>)
      .then(j => {
        for (const [addr, probe] of Object.entries(j.sellable ?? {})) {
          // Only a MEASUREMENT is stored. An `unreadable` kept for ten minutes
          // would turn one blip into a session-long "couldn't check" — the same
          // law the route applies server-side, and the same one
          // `rh-holdings-cache` applies to a failed explorer read.
          if (probe?.state === "pool" || probe?.state === "none") {
            cache.set(addr.toLowerCase(), { state: probe.state, at: Date.now() });
          }
        }
      })
      .catch(() => { /* absent stays absent — see the doc above */ })
      .finally(() => { for (const a of cold) inflight.delete(a); });

    for (const a of cold) inflight.set(a, run);
  }

  // Join every read covering an address we were asked about, including ones
  // another caller started.
  await Promise.all(Array.from(new Set(want.map(a => inflight.get(a)).filter(Boolean))));

  const out: SellMap = {};
  for (const a of want) out[a] = fresh(a);
  return out;
}

/**
 * React binding for the tables.
 *
 * Keyed on the joined address list so a portfolio that re-renders with the same
 * rows does not re-probe. Returns `{}` until the first read lands — and `{}`
 * means "nothing measured yet", which every caller renders as unmeasured. The
 * table therefore shows no Sell control while the probe is in flight, which is
 * the correct default: a button that appears before the measurement would be a
 * button we had not yet earned.
 */
export function useRhSellable(tokens: string[]): SellMap {
  const key = tokens.map(t => t.toLowerCase()).sort().join(",");
  const [map, setMap] = useState<SellMap>({});

  useEffect(() => {
    if (!key) { setMap({}); return; }
    let off = false;
    void getRhSellable(key.split(",")).then(m => { if (!off) setMap(m); });
    return () => { off = true; };
  }, [key]);

  return map;
}

/**
 * The one place a Sell control is allowed to be drawn from.
 *
 * Written as a function rather than an inline `=== "pool"` at each call site so
 * the gate has a single definition and a test can hold it to the whole input
 * space — including the inputs that are not states at all (`undefined`, and
 * whatever a future fourth state turns out to be). Every one of them that is not
 * a measured pool answers false.
 */
export function canSellRow(state: SellState | undefined): boolean {
  return state === "pool";
}

/**
 * Why there is a dash instead of a control — the sentence the gate owes the user.
 *
 * Split from `canSellRow` on purpose: the two questions have DIFFERENT answers
 * for `unreadable`, and keeping them in one function is how they would drift
 * back into one boolean.
 */
export function sellDashTitle(state: SellState | undefined): string {
  return state === "none"
    ? "No Uniswap V3 pool for this token on Robinhood Chain — there is nothing to sell into here"
    : "We couldn't check for a pool on Robinhood Chain just now, so no sell is offered. This does not mean there isn't one.";
}
