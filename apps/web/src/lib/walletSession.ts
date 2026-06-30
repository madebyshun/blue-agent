"use client";

import { useCallback } from "react";
import { useDisconnect } from "wagmi";

/**
 * Wallet-session intent flag.
 *
 * On Base App / Farcaster / Coinbase in-app browsers the wallet IS the host
 * frame, so `BaseAppAutoConnect` silently re-binds the host connector on every
 * mount. That's the right default the FIRST time the app opens — but it means a
 * user who explicitly taps "Disconnect" gets silently reconnected the moment
 * they navigate (dashboard ⇄ profile), so the disconnect never appears to stick.
 *
 * Fix: when the user explicitly disconnects we set a per-tab sessionStorage flag.
 * `BaseAppAutoConnect` honours it and skips the silent reconnect. A subsequent
 * MANUAL connect clears the flag, so auto-connect resumes next session.
 *
 * sessionStorage (not localStorage) is deliberate: the intent lives for the tab/
 * webview session only. Fully closing and reopening the app is a fresh intent —
 * auto-connect should resume then, which is the expected host behaviour.
 */
const KEY = "ba:userDisconnected";

export function markUserDisconnected() {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* SSR / storage disabled */ }
}

export function clearUserDisconnected() {
  try { sessionStorage.removeItem(KEY); } catch { /* SSR / storage disabled */ }
}

export function wasUserDisconnected(): boolean {
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Drop-in replacement for wagmi's `useDisconnect().disconnect` that also records
 * the explicit-disconnect intent so auto-connect won't immediately undo it.
 * Use this everywhere the UI exposes a "Disconnect" control.
 */
export function useWalletDisconnect() {
  const { disconnect } = useDisconnect();
  return useCallback(() => {
    markUserDisconnected();
    disconnect();
  }, [disconnect]);
}
