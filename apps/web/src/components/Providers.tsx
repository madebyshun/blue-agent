"use client";

import { createConfig, WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { http } from "viem";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MiniAppReady from "@/components/MiniAppReady";

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
  connectors: [
    // Only inside Base App / Farcaster — host wallet connects with no prompt.
    ...(inMiniAppFrame ? [farcasterMiniApp()] : []),
    coinbaseWallet({
      appName: "Blue Agent",
      preference: { options: "all" }, // extension + QR code fallback
    }),
    injected({ shimDisconnect: true }), // MetaMask/Rabby if installed
  ],
  transports: { [base.id]: http(), [baseSepolia.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Dismisses the Base App / Farcaster splash once mounted. */}
        <MiniAppReady />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
