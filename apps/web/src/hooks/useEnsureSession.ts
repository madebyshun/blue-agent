"use client";

/**
 * Make sure the SIWE session is for THIS wallet before a call that charges it
 * or writes its private state (client half of lib/acting-wallet.ts).
 *
 * Since 2026-09-30 those routes take the wallet from the SIWE session, not
 * from the body. Most connected users had never signed in — SIWE used to be
 * opt-in, for cross-device sync only — so each such call first asks here:
 *   • a session for this wallet already → nothing to do (cached ~5 minutes, so
 *     a chat does not pay a whoami round-trip per message);
 *   • none, or one for a different wallet → one SIWE signature (no
 *     transaction, no funds), which the session then covers for 30 days.
 * A refused signature throws, and the caller shows why nothing was sent. So
 * does a signature whose session this page cannot carry (the cross-site
 * mini-app before the header fallback existed): `signIn` proves the session
 * answers before returning, so "signed in" is never cached on a POST's 200
 * alone — that cache is what turned a dropped cookie into a prompt per send.
 *
 * `fetchWithSession` adds the other half: a 401 `AUTH_REQUIRED` from the
 * server (session expired or revoked since the cache was filled) signs in and
 * retries exactly once.
 *
 * `useSessionEpoch` is for readers that asked `hasSession` on load, got "no",
 * and rendered a signed-out state: it changes when a signature on this page
 * creates a session, so they re-read. Without it, signing in through ONE card
 * left every other owner-only read on the page stuck on its signed-out answer
 * until a reload (the wallet's Activity list said "which tool it bought was
 * never recorded" beside the spend card the user had just signed in from).
 */
import { useCallback, useSyncExternalStore } from "react";
import { useSiweSignIn } from "@/app/chat/use-siwe-signin";
import { sessionFetch } from "@/lib/session-client";

const CACHE_MS = 5 * 60 * 1000;
let cached: { wallet: string; at: number } | null = null;

export function invalidateSessionCache() {
  cached = null;
}

// Bumped only when a SIGNATURE created a session — not on invalidation, and
// not on a whoami that merely confirmed one. Invalidating is what a reader does
// after its own request was refused; if that re-triggered the reader, a server
// that keeps refusing a session whoami accepts would loop it forever.
let epoch = 0;
const listeners = new Set<() => void>();
function bumpEpoch() {
  epoch += 1;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** A number that changes each time a sign-in on this page succeeds. Put it in
 *  an effect's dependencies to re-run an owner-only read after sign-in. */
export function useSessionEpoch(): number {
  return useSyncExternalStore(subscribe, () => epoch, () => 0);
}

async function whoami(): Promise<string | null> {
  try {
    const r = await sessionFetch("/api/auth/session", { cache: "no-store" });
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
    const signed = (await whoami()) !== w;
    if (signed) await signIn(wallet);
    cached = { wallet: w, at: Date.now() };
    if (signed) bumpEpoch();
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
      const res = await sessionFetch(input, init);
      if (res.status !== 401) return res;
      const body = (await res.clone().json().catch(() => ({}))) as { code?: string };
      if (body.code !== "AUTH_REQUIRED") return res;
      invalidateSessionCache();
      await ensureSession(wallet);
      return sessionFetch(input, init);
    },
    [ensureSession],
  );

  return { ensureSession, hasSession, fetchWithSession };
}
