/**
 * Blue Hood — per-user alert watchlist context (task 1.7, the "Provider").
 *
 * A CLIENT-SIDE CACHE over the /api/hood/watchlist routes — never a second copy
 * of the rules. The server (lib/blue-hood/watchlist.ts) owns validation, the
 * cap policy, and the symmetric reverse-index write; this context just holds the
 * current wallet's list for the UI and forwards mutations. The Telegram bot and
 * the alert cron read the SAME KV via that lib, so web and bot never diverge.
 *
 * DELIBERATELY NO POLL LOOP. A wallet's watchlist only changes when THIS user
 * edits it, so we fetch once per connected address and then trust the list the
 * server echoes back on each mutation. That keeps 1.7 from adding a recurring
 * hot read — the exact KV-budget discipline the 2026-07-27 Upstash-cap outage
 * demanded (and that HealthProvider 1.3 now watches for).
 *
 * Not mounted by default: wire <WatchlistProvider> in only on a surface that
 * actually renders the list, so an idle /hood view never pays for a read it
 * doesn't use.
 *
 * ⚠️ EVERY METHOD TAKES A CHAIN, AND NONE OF THEM DEFAULTS IT. A watch is
 * (ticker, chain): the board lists NVDA twice — once on Robinhood Chain, once on
 * Base — as different contracts. While these took a bare ticker, ★ on the Base
 * NVDA row reported the RH star's state, wrote the RH subscription, and un-★
 * removed the RH one. Nothing errored; the user simply got a different desk's
 * alerts. The chain is right there in the row (`chainOf(r)`), so requiring it
 * costs a call site nothing and makes the silent version unwritable.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Watchlist, WatchEntry, AlertKind } from "@/lib/blue-hood/watchlist";
import { rowKey, type HoodChain } from "@/lib/blue-hood/types";
import { useEnsureSession, useSessionEpoch } from "@/hooks/useEnsureSession";

/** Result of an add/remove — carries the server's reason so the UI can show a cap/validation message. */
export type WatchlistMutation = { ok: true } | { ok: false; error: string; code?: string };

type WatchlistState = {
  /** The connected wallet's list, or null when it is UNKNOWN: disconnected,
   *  before the first load, not signed in, or a first read that failed. Null
   *  is never "watches nothing", so a UI must not render it as unwatched. */
  watchlist: Watchlist | null;
  /** true until the first fetch for the current address resolves. */
  loading: boolean;
  /** A wallet is connected but has no session, so its list was not read. */
  needsSignIn: boolean;
  /** Convenience: is this ticker watched ON THIS CHAIN? Both args required.
   *  Also `false` while `watchlist` is null — check that first. */
  isWatching: (ticker: string, chain: HoodChain) => boolean;
  add: (ticker: string, chain: HoodChain, kinds?: AlertKind[]) => Promise<WatchlistMutation>;
  remove: (ticker: string, chain: HoodChain) => Promise<WatchlistMutation>;
  refresh: () => Promise<void>;
  /** Show the list: ask for the one signature if there is no session, then
   *  read. Subscribes to nothing — unlike a ★, which would also add a watch. */
  signIn: () => Promise<WatchlistMutation>;
};

const noop = async (): Promise<WatchlistMutation> => ({ ok: false, error: "connect a wallet first" });

const WatchlistContext = createContext<WatchlistState>({
  watchlist: null,
  loading: false,
  needsSignIn: false,
  isWatching: () => false,
  add: noop,
  remove: noop,
  refresh: async () => {},
  signIn: noop,
});

/** Subscribe to the connected wallet's alert watchlist. */
export function useWatchlist(): WatchlistState {
  return useContext(WatchlistContext);
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // The watchlist is private to the SIGNED-IN wallet (SIWE, 2026-09-30). The
  // on-load read never prompts — without a session the list is simply unknown
  // (null, `needsSignIn`), and the star renders it as unknown, NOT as ☆ "watch
  // for alerts": a user whose Telegram DMs are still arriving must not be told
  // they watch nothing. Clicking that unknown star calls `signIn` (signature,
  // then read); a ★ asks for the same signature and the server's echo fills
  // the list in.
  const { ensureSession, hasSession, fetchWithSession } = useEnsureSession();
  // Re-read after a signature anywhere on this page creates a session. Without
  // it, signing in through another card (or the chat) left this list unknown
  // until a reload — see the header of hooks/useEnsureSession.
  const epoch = useSessionEpoch();

  const refresh = useCallback(async () => {
    if (!address) {
      setWatchlist(null);
      setNeedsSignIn(false);
      return;
    }
    setLoading(true);
    try {
      if (!(await hasSession(address))) {
        setWatchlist(null);
        setNeedsSignIn(true);
        return;
      }
      setNeedsSignIn(false);
      const res = await fetch(`/api/hood/watchlist?address=${address}`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; watchlist?: Watchlist };
      // A failed read leaves the last-known list rather than nuking the UI to
      // empty — an unreadable KV shouldn't look like "you watch nothing".
      if (body.ok && body.watchlist) setWatchlist(body.watchlist);
    } catch {
      /* keep last-known; a transient fetch failure is not "empty watchlist" */
    } finally {
      setLoading(false);
    }
  }, [address, hasSession]);

  // A list belongs to the wallet it was read for. Drop it when the wallet
  // changes, so a failed first read for the new one stays unknown instead of
  // showing the previous wallet's stars — "keep last-known" is per wallet.
  useEffect(() => {
    setWatchlist(null);
  }, [address]);

  // Fetch once per connected address, and again after a sign-in on this page.
  // No interval — see file header. (A sign-in through `signIn` below reads
  // twice, once here and once there: one extra GET per signature, not a poll.)
  useEffect(() => {
    void refresh();
  }, [refresh, epoch]);

  const signIn = useCallback(async (): Promise<WatchlistMutation> => {
    if (!address) return { ok: false, error: "connect a wallet first" };
    try {
      await ensureSession(address);
    } catch (e) {
      return { ok: false, error: (e as Error).message || "the signature was cancelled" };
    }
    // Not left to the epoch effect: a session that already existed (the first
    // read failed, not the sign-in) bumps no epoch, and still needs a read.
    await refresh();
    return { ok: true };
  }, [address, ensureSession, refresh]);

  const add = useCallback(
    async (ticker: string, chain: HoodChain, kinds?: AlertKind[]): Promise<WatchlistMutation> => {
      if (!address) return { ok: false, error: "connect a wallet first" };
      try {
        const res = await fetchWithSession(address, "/api/hood/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, ticker, chain, kinds }),
        });
        const body = (await res.json()) as { ok: boolean; watchlist?: Watchlist; error?: string; code?: string };
        if (!body.ok) return { ok: false, error: body.error ?? "could not add", code: body.code };
        if (body.watchlist) setWatchlist(body.watchlist); // server echo = source of truth
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [address, fetchWithSession],
  );

  const remove = useCallback(
    async (ticker: string, chain: HoodChain): Promise<WatchlistMutation> => {
      if (!address) return { ok: false, error: "connect a wallet first" };
      try {
        const res = await fetchWithSession(address, "/api/hood/watchlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          // Same `chain` the add sent — an asymmetric remove leaves the reverse
          // set populated and the DMs keep coming after the ★ goes dark.
          body: JSON.stringify({ address, ticker, chain }),
        });
        const body = (await res.json()) as { ok: boolean; watchlist?: Watchlist; error?: string; code?: string };
        if (!body.ok) return { ok: false, error: body.error ?? "could not remove", code: body.code };
        if (body.watchlist) setWatchlist(body.watchlist);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [address, fetchWithSession],
  );

  const isWatching = useCallback(
    (ticker: string, chain: HoodChain) => {
      // `rowKey` on BOTH sides — the stored entry's `chain` is absent on records
      // written before the Base desk, and `rowKey` runs `chainOf`, so those
      // resolve to the Robinhood key exactly as they always did.
      const key = rowKey({ ticker: ticker.trim().toUpperCase(), chain });
      return !!watchlist?.entries.some((e: WatchEntry) => rowKey(e) === key);
    },
    [watchlist],
  );

  return (
    <WatchlistContext.Provider value={{ watchlist, loading, needsSignIn, isWatching, add, remove, refresh, signIn }}>
      {children}
    </WatchlistContext.Provider>
  );
}
