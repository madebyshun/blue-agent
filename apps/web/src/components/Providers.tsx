"use client";

import { createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { http } from "viem";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MiniAppReady from "@/components/MiniAppReady";
const config = createConfig({
  chains: [base],
  connectors: [
    // First so that inside Base App / Farcaster the host wallet connects
    // seamlessly (no prompt). Inert in a normal desktop browser.
    farcasterMiniApp(),
    coinbaseWallet({
      appName: "Blue Agent",
      preference: { options: "all" }, // extension + QR code fallback
    }),
    injected({ shimDisconnect: true }), // MetaMask/Rabby if installed
  ],
  transports: { [base.id]: http() },
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
