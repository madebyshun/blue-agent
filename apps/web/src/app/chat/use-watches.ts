"use client";
/**
 * The Scheduled page's price-alert state — one loader shared by the stat strip,
 * the watch cards, the alerts feed and the create drawer, so the four never
 * show different numbers. Reading needs the SIWE session; opening the page
 * never prompts — `signIn()` is the only call that may ask for a signature.
 */
import { useCallback, useEffect, useState } from "react";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import type { Watch, WatchAlert, WatchReading } from "@/lib/watches/types";

export type WatchesState =
  | { s: "no-wallet" } | { s: "signed-out" } | { s: "loading" } | { s: "error"; msg: string }
  | { s: "ok"; watches: Watch[]; alerts: WatchAlert[]; seenAt: number; unread: number; readings: Record<string, WatchReading> };

export function useWatches(walletAddr: string | null | undefined) {
  const { hasSession, ensureSession, fetchWithSession } = useEnsureSession();
  const [state, setState] = useState<WatchesState>({ s: "loading" });

  const url = (q = "") => `/api/watches?address=${walletAddr}${q}`;

  const refresh = useCallback(async (interactive = false) => {
    if (!walletAddr) { setState({ s: "no-wallet" }); return; }
    if (!interactive && !(await hasSession(walletAddr))) { setState({ s: "signed-out" }); return; }
    try {
      const r = await fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}&readings=1`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setState({ s: "error", msg: j.error ?? `HTTP ${r.status}` }); return; }
      setState({ s: "ok", watches: j.watches ?? [], alerts: j.alerts ?? [], seenAt: j.seenAt ?? 0, unread: j.unread ?? 0, readings: j.readings ?? {} });
    } catch (e) { setState({ s: "error", msg: (e as Error).message.slice(0, 120) }); }
  }, [walletAddr, hasSession, fetchWithSession]);

  useEffect(() => { void refresh(false); }, [refresh]);

  const send = useCallback(async (method: string, q: string, body?: unknown) => {
    if (!walletAddr) return { ok: false, error: "Connect your wallet first." };
    const r = await fetchWithSession(walletAddr, url(q), {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j } : { ok: false, error: (j.error as string) ?? `HTTP ${r.status}` };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddr, fetchWithSession]);

  return {
    state,
    refresh,
    signIn: async () => { if (walletAddr) { await ensureSession(walletAddr); await refresh(true); } },
    create: async (body: Record<string, unknown>) => { const r = await send("POST", "", body); if (r.ok) await refresh(true); return r; },
    setActive: async (id: string, active: boolean) => { await send("PATCH", "", { id, active }); await refresh(true); },
    remove: async (id: string) => { await send("DELETE", `&id=${encodeURIComponent(id)}`); await refresh(true); },
    markSeen: async () => { await send("PATCH", "", { seen: true }); },
  };
}
