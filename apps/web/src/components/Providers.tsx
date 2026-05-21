"use client";

import { createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { http } from "viem";
import { injected, coinbaseWallet, metaMask } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig({
  chains: [base],
  connectors: [
    injected(),                                    // MetaMask, Rabby, etc.
    coinbaseWallet({ appName: "Blue Agent" }),     // Coinbase Wallet
    metaMask(),                                    // MetaMask SDK
  ],
  transports: { [base.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
