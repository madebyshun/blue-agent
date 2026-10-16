"use client";
// The context half of the silent TRANSACTION sender (silent-sign-bridge.tsx
// provides it), kept free of any Privy import for the same reason as
// silent-signer.ts. Used only after the user confirmed in chat
// (lib/chat/confirm.ts) and only below SILENT_MAX_USD.
import { createContext, useContext } from "react";

export type SilentTx = { to: `0x${string}`; data?: `0x${string}`; value?: bigint; chainId: number };

/** Resolves to the tx hash, or `null` when `from` is not this user's embedded
 *  wallet — the caller then uses the normal wallet prompt. */
export type SilentSender = (from: string, tx: SilentTx) => Promise<`0x${string}` | null>;

export const SilentTxContext = createContext<SilentSender | null>(null);

/** `null` when Privy is off (default provider tree). */
export function useSilentSender(): SilentSender | null {
  return useContext(SilentTxContext);
}
