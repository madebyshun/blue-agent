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
import { useCallback, useMemo } from "react";
import { useSendTransaction, useSignMessage, useWallets } from "@privy-io/react-auth";
import { SilentSignContext, type SilentSigner } from "./silent-signer";
import { EmbeddedWalletsContext, SilentTxContext, type SilentSender } from "./silent-tx";

export function PrivySilentSignBridge({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { sendTransaction } = useSendTransaction();

  const signSilently = useCallback<SilentSigner>(async (address, message) => {
    const a = address.toLowerCase();
    const embedded = wallets.find((w) => w.walletClientType === "privy" && w.address.toLowerCase() === a);
    if (!embedded) return null;
    const { signature } = await signMessage({ message }, { address: embedded.address, uiOptions: { showWalletUIs: false } });
    return signature;
  }, [wallets, signMessage]);

  // Confirm-in-chat (2026-10-16, lib/chat/confirm.ts): after the user typed
  // "yes" for a prepared action under SILENT_MAX_USD, the embedded wallet sends
  // it without the modal. Same reasoning as the SIWE signature above — the key
  // only signs for the authenticated user — plus the explicit typed
  // confirmation of this one action. External wallets get null and keep their
  // own prompt.
  const sendSilently = useCallback<SilentSender>(async (from, tx) => {
    const a = from.toLowerCase();
    const embedded = wallets.find((w) => w.walletClientType === "privy" && w.address.toLowerCase() === a);
    if (!embedded) return null;
    const { hash } = await sendTransaction(
      { to: tx.to, data: tx.data, value: tx.value, chainId: tx.chainId },
      { address: embedded.address, uiOptions: { showWalletUIs: false } },
    );
    return hash;
  }, [wallets, sendTransaction]);

  const embeddedList = useMemo(
    () => wallets.filter((w) => w.walletClientType === "privy").map((w) => w.address.toLowerCase()),
    [wallets],
  );

  return (
    <SilentSignContext.Provider value={signSilently}>
      <SilentTxContext.Provider value={sendSilently}>
        <EmbeddedWalletsContext.Provider value={embeddedList}>{children}</EmbeddedWalletsContext.Provider>
      </SilentTxContext.Provider>
    </SilentSignContext.Provider>
  );
}
