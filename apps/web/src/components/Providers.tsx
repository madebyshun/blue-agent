"use client";

import { createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { http } from "viem";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const config = createConfig({
  chains: [base],
  connectors: [
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
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
