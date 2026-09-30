"use client";

/**
 * Make sure the SIWE session is for THIS wallet before a call that charges it
 * or writes its private state (client half of lib/acting-wallet.ts).
 *
 * Since 2026-09-30 those routes take the wallet from the session cookie, not
 * from the body. Most connected users had never signed in — SIWE used to be
 * opt-in, for cross-device sync only — so each such call first asks here:
 *   • a session for this wallet already → nothing to do (cached ~5 minutes, so
 *     a chat does not pay a whoami round-trip per message);
 *   • none, or one for a different wallet → one SIWE signature (no
 *     transaction, no funds), which the session then covers for 30 days.
 * A refused signature throws, and the caller shows why nothing was sent.
 *
 * `fetchWithSession` adds the other half: a 401 `AUTH_REQUIRED` from the
 * server (session expired or revoked since the cache was filled) signs in and
 * retries exactly once.
 */
import { useCallback } from "react";
import { useSiweSignIn } from "@/app/chat/use-siwe-signin";

const CACHE_MS = 5 * 60 * 1000;
let cached: { wallet: string; at: number } | null = null;

export function invalidateSessionCache() {
  cached = null;
}

async function whoami(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { status?: string; wallet?: string };
    return j.status === "active" && typeof j.wallet === "string" ? j.wallet.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function useEnsureSession() {
  const signIn = useSiweSignIn();

  const ensureSession = useCallback(async (wallet: string): Promise<void> => {
    const w = wallet.toLowerCase();
    if (cached && cached.wallet === w && Date.now() - cached.at < CACHE_MS) return;
    if ((await whoami()) !== w) await signIn(wallet);
    cached = { wallet: w, at: Date.now() };
  }, [signIn]);

  /** The same question WITHOUT a prompt — for work nobody clicked (a tab
   *  auto-running a due task on load must not pop a signature request). */
  const hasSession = useCallback(async (wallet: string): Promise<boolean> => {
    const w = wallet.toLowerCase();
    if (cached && cached.wallet === w && Date.now() - cached.at < CACHE_MS) return true;
    const ok = (await whoami()) === w;
    if (ok) cached = { wallet: w, at: Date.now() };
    return ok;
  }, []);

  const fetchWithSession = useCallback(
    async (wallet: string, input: string, init?: RequestInit): Promise<Response> => {
      await ensureSession(wallet);
      const res = await fetch(input, init);
      if (res.status !== 401) return res;
      const body = (await res.clone().json().catch(() => ({}))) as { code?: string };
      if (body.code !== "AUTH_REQUIRED") return res;
      invalidateSessionCache();
      await ensureSession(wallet);
      return fetch(input, init);
    },
    [ensureSession],
  );

  return { ensureSession, hasSession, fetchWithSession };
}
