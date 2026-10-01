"use client";
/**
 * The Scheduled page's price-alert state — one loader shared by the stat strip,
 * the watch cards, the alerts feed and the create drawer, so the four never
 * show different numbers.
 *
 * NO SIGNATURE WITHOUT A CLICK (review 2026-10-01). Background reads — the
 * load on open, marking alerts seen — use plain `sessionFetch`: a 401 means
 * "signed out" and clears the cached session, it never retries into a prompt.
 * Only `signIn()` and the user's own edits go through `fetchWithSession`.
 * Every response is checked against the wallet that asked for it, so a slow
 * answer for wallet A can never be shown (or marked seen) under wallet B, and
 * a sign-in anywhere in the app (the session epoch) reloads this.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useEnsureSession, useSessionEpoch, invalidateSessionCache } from "@/hooks/useEnsureSession";
import { sessionFetch } from "@/lib/session-client";
import type { Watch, WatchAlert, WatchReading } from "@/lib/watches/types";

export type WatchesState =
  | { s: "no-wallet" } | { s: "signed-out" } | { s: "loading" } | { s: "error"; msg: string }
  | { s: "ok"; watches: Watch[]; alerts: WatchAlert[]; seenAt: number; unread: number; readings: Record<string, WatchReading> };

export function useWatches(walletAddr: string | null | undefined) {
  const { ensureSession, fetchWithSession } = useEnsureSession();
  const epoch = useSessionEpoch();
  const [state, setState] = useState<WatchesState>({ s: "loading" });
  const current = useRef(walletAddr);
  current.current = walletAddr;

  const refresh = useCallback(async () => {
    const asked = walletAddr;
    if (!asked) { setState({ s: "no-wallet" }); return; }
    const mine = () => current.current === asked;
    try {
      const r = await sessionFetch(`/api/watches?address=${asked}&readings=1`, { cache: "no-store" });
      if (!mine()) return;
      if (r.status === 401) { invalidateSessionCache(); setState({ s: "signed-out" }); return; }
      const j = await r.json().catch(() => ({}));
      if (!mine()) return;
      if (!r.ok) { setState({ s: "error", msg: j.error ?? `HTTP ${r.status}` }); return; }
      setState({ s: "ok", watches: j.watches ?? [], alerts: j.alerts ?? [], seenAt: j.seenAt ?? 0, unread: j.unread ?? 0, readings: j.readings ?? {} });
    } catch (e) { if (mine()) setState({ s: "error", msg: (e as Error).message.slice(0, 120) }); }
  }, [walletAddr]);

  useEffect(() => { void refresh(); }, [refresh, epoch]);

  /** A user action — may ask for a signature, which is what the click was for. */
  const send = useCallback(async (method: string, q: string, body?: unknown) => {
    if (!walletAddr) return { ok: false, error: "Connect your wallet first." };
    const r = await fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}${q}`, {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j } : { ok: false, error: (j.error as string) ?? `HTTP ${r.status}` };
  }, [walletAddr, fetchWithSession]);

  return {
    state,
    refresh,
    signIn: async (): Promise<string | null> => {
      if (!walletAddr) return "Connect your wallet first.";
      try { await ensureSession(walletAddr); await refresh(); return null; }
      catch (e) { return (e as Error).message || "Sign-in was not completed."; }
    },
    create: async (body: Record<string, unknown>) => { const r = await send("POST", "", body); if (r.ok) await refresh(); return r; },
    setActive: async (id: string, active: boolean) => { await send("PATCH", "", { id, active }); await refresh(); },
    remove: async (id: string) => { await send("DELETE", `&id=${encodeURIComponent(id)}`); await refresh(); },
    /** Background: marks read up to the newest alert this page RENDERED. Never prompts. */
    markSeen: async (upTo: number) => {
      const asked = walletAddr;
      if (!asked) return;
      await sessionFetch(`/api/watches?address=${asked}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: true, upTo }),
      }).catch(() => {});
    },
  };
}
