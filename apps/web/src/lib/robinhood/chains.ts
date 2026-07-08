import { defineChain } from "viem";

// Robinhood Chain — EVM chainId 4663 (mainnet) / 46630 (testnet), Arbitrum
// Orbit L2 settling on Ethereum L1. Source: docs.robinhood.com/chain/connecting/
//
// Single shared source for these two viem `Chain` objects — used by both the
// wagmi config (so `useSwitchChain` can actually prompt wallets to add/switch
// to Robinhood Chain instead of throwing "chain not configured") and the
// server-side `createPublicClient` in /api/robinhood/receipt.
export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
});
