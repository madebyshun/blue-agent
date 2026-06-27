"use client";

import { createConfig, WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { http } from "viem";
import { coinbaseWallet } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MiniAppReady from "@/components/MiniAppReady";
import BaseAppAutoConnect from "@/components/BaseAppAutoConnect";

// The Farcaster / Base App Mini App connector talks to a host frame over
// postMessage. It is NOT inert in a normal browser tab: with no host to
// answer, including it made wagmi hang on "Connecting…" for injected wallets
// (MetaMask/Rabby) — only Coinbase, which uses its own SDK, still worked.
// Mini Apps always render embedded (iframe / webview), so only register the
// connector when we're inside a host frame; a normal top-level tab gets just
// Coinbase + injected, restoring desktop wallet connect.
const inMiniAppFrame = typeof window !== "undefined" && window.top !== window.self;

const config = createConfig({
  // base = mainnet (default). baseSepolia = testnet, enabled so the chat
  // Move-to-Yield card can test Aave supply/withdraw safely before mainnet.
  chains: [base, baseSepolia],
  // We deliberately do NOT register a generic `injected()` connector.
  // wagmi v3 has EIP-6963 multi-injected discovery ON by default, so every
  // installed extension (MetaMask, Rabby, Phantom…) is surfaced as its own
  // connector backed by that wallet's *isolated* provider.
  //
  // The generic `injected()` connector instead talks to the shared
  // `window.ethereum`, which — when several extensions are installed — is a
  // multiplexed proxy that frequently resolves to a non-responding provider.
  // That made `connect()` hang on "Connecting…" for MetaMask/Rabby while only
  // Coinbase (its own SDK) worked. Dropping it routes injected wallets through
  // EIP-6963's per-wallet providers, fixing the hang.
  connectors: [
    // Only inside Base App / Farcaster — host wallet connects with no prompt.
    ...(inMiniAppFrame ? [farcasterMiniApp()] : []),
    coinbaseWallet({
      appName: "Blue Agent",
      preference: { options: "all" }, // extension + QR code fallback
    }),
  ],
  // EIP-6963 discovery (default true in v3) handles MetaMask/Rabby/etc.
  multiInjectedProviderDiscovery: true,
  transports: { [base.id]: http(), [baseSepolia.id]: http() },
  // NOTE: wagmi 3.6 / viem 2.49 have no config-level `dataSuffix` — it was a
  // silent no-op. ERC-8021 builder-code attribution is applied per-transaction
  // instead: the EIP-5792 `dataSuffix` capability in the Smart Wallet send path
  // (ToolCards SendCard) and a calldata suffix on the 0x swap (bank SwapCard).
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Dismisses the Base App / Farcaster splash once mounted. */}
        <MiniAppReady />
        {/* Silently binds the host wallet when embedded in Base App / Farcaster. */}
        <BaseAppAutoConnect />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
