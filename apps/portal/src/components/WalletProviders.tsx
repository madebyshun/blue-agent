"use client";

/**
 * Wallet providers for the portal (api.blueagent.dev).
 * Mirrors apps/web/src/components/Providers.tsx — Base chain, Coinbase Smart
 * Wallet + injected connectors. Used to wrap the /submit form so builders can
 * connect a wallet and sign the registration manifest (real SIWE).
 */

import { createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { http } from "viem";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({ appName: "Blue Hub", preference: { options: "all" } }),
    injected({ shimDisconnect: true }),
  ],
  transports: { [base.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
