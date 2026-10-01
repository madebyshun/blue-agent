"use client";
// The context half of silent-sign-bridge.tsx, kept free of any Privy import so
// that code reading it (use-siwe-signin, and every test that reaches it) does
// not load @privy-io/react-auth — its phone-number dependency throws at import
// time under tsx. Only Providers.tsx imports the bridge itself.
import { createContext, useContext } from "react";

/** Resolves to a signature, or `null` when `address` is not this user's
 *  embedded wallet (the caller must then use the normal wallet prompt). */
export type SilentSigner = (address: string, message: string) => Promise<string | null>;

export const SilentSignContext = createContext<SilentSigner | null>(null);

/** `null` when Privy is off (default provider tree). */
export function useSilentSigner(): SilentSigner | null {
  return useContext(SilentSignContext);
}
