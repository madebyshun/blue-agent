"use client";
/**
 * Contexts that let a chat confirmation ("yes") drive a signing card.
 *
 *   ActionMessageContext  set by ChatMessages around each message's tool
 *                         results: the message's createdAt, so a reloaded chat
 *                         never arms yesterday's proposal (lib/chat/confirm.ts).
 *   AutoConfirmContext    set by ActionStrip around its card: `armed` once the
 *                         user confirmed, `silent` when the embedded wallet may
 *                         sign without its modal (< SILENT_MAX_USD).
 */
import { createContext, useContext, useEffect, useRef } from "react";

export const ActionMessageContext = createContext<{ createdAt: number } | null>(null);

export interface AutoConfirm { armed: boolean; silent: boolean }
export const AutoConfirmContext = createContext<AutoConfirm>({ armed: false, silent: false });

/**
 * In a signing card: once the user confirmed in chat and the card is ready
 * (quote in, check cleared, nothing in flight), run its primary action ONCE,
 * passing whether the embedded wallet may sign silently.
 */
export function useAutoConfirm(ready: boolean, run: (opts: { silent: boolean }) => void) {
  const { armed, silent } = useContext(AutoConfirmContext);
  const fired = useRef(false);
  useEffect(() => {
    if (!armed || !ready || fired.current) return;
    fired.current = true;
    run({ silent });
  }, [armed, ready, silent, run]);
}
