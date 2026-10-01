"use client";

// Signs the SIWE session message WITHOUT a modal when the wallet is the user's
// own Privy embedded wallet (email / Google / social login) — 2026-10-01.
//
// Why: since 2026-09-30 a paid chat message, a credit claim or a price alert
// needs a SIWE session (lib/acting-wallet.ts), and on an embedded wallet that
// surfaced as Privy's "Sign message" modal in the middle of typing a message.
// For an embedded wallet that modal proves nothing the user has not already
// proved by logging in: the key lives in Privy's enclave and only signs for
// the authenticated user. So we sign the same message with
// `showWalletUIs: false`. The SERVER is unchanged — it still verifies the same
// SIWE signature against the same server-minted nonce; only the modal is gone.
//
// External wallets (MetaMask, Coinbase Wallet, WalletConnect…) are NOT handled
// here and still see their wallet's prompt: their key is outside Privy, and a
// signature is the only proof of ownership there is. `signSilently` returns
// null for them and the caller falls back to wagmi's signMessage.
//
// Same context trick as identity-bridge.tsx: Privy hooks throw outside
// <PrivyProvider>, so they are called once here and published through a
// context the default (Privy-off) tree never provides.
import { useCallback } from "react";
import { useSignMessage, useWallets } from "@privy-io/react-auth";
import { SilentSignContext, type SilentSigner } from "./silent-signer";

export function PrivySilentSignBridge({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();

  const signSilently = useCallback<SilentSigner>(async (address, message) => {
    const a = address.toLowerCase();
    const embedded = wallets.find((w) => w.walletClientType === "privy" && w.address.toLowerCase() === a);
    if (!embedded) return null;
    const { signature } = await signMessage({ message }, { address: embedded.address, uiOptions: { showWalletUIs: false } });
    return signature;
  }, [wallets, signMessage]);

  return <SilentSignContext.Provider value={signSilently}>{children}</SilentSignContext.Provider>;
}
