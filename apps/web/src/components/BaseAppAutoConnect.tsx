"use client";

import { useEffect, useRef } from "react";
import { useConnect, useAccount } from "wagmi";

/**
 * Auto-connects the wallet when BlueAgent is opened INSIDE Base App / Farcaster
 * (or the Coinbase in-app browser). In those hosts the wallet is the host frame
 * itself, so prompting the user to click "Connect" is pointless friction —
 * we silently bind to the host connector on mount.
 *
 * Deliberately inert in a normal browser tab: the detection below only fires in
 * an embedded Mini App frame / Coinbase browser, so desktop Chrome/Safari still
 * get the usual manual Connect button (ConnectModal) untouched.
 */
export default function BaseAppAutoConnect() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  // Guard so we only ever attempt the silent connect once per mount, even if
  // wagmi re-renders while the host is resolving the account.
  const tried = useRef(false);

  useEffect(() => {
    if (isConnected || tried.current) return;

    // Host detection — only an embedded Mini App / Coinbase context qualifies.
    const w = window as unknown as { ethereum?: { isCoinbaseWallet?: boolean } };
    const inFrame = window.top !== window.self;
    const isCoinbaseBrowser =
      w.ethereum?.isCoinbaseWallet === true ||
      navigator.userAgent.includes("CoinbaseBrowser");
    const fromBaseApp =
      document.referrer.includes("base.app") ||
      document.referrer.includes("base.org");

    if (!inFrame && !isCoinbaseBrowser && !fromBaseApp) return;

    // Prefer the Mini App host connector (Farcaster / Base App embeds register
    // it only inside a frame); fall back to the Coinbase Smart Wallet SDK.
    const host =
      connectors.find(c => c.id === "farcasterMiniApp" || c.name.toLowerCase().includes("farcaster")) ??
      connectors.find(c => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase"));

    if (!host) return;
    tried.current = true;
    connect({ connector: host });
  }, [isConnected, connect, connectors]);

  return null;
}
