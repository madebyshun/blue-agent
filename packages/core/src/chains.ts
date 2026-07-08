// @blueagent/core — supported EVM chains for token launches.
//
// IMPORTANT: values below MUST be verified against official docs before
// changing. Do not add a chain here without a docs URL as source.
//
// Base — Coinbase L2, chain ID 8453. Source: docs.base.org
// Robinhood Chain — Arbitrum Orbit L2, chain ID 4663 (mainnet) / 46630
// (testnet). Source: https://docs.robinhood.com/chain/connecting/
// Standard EVM, ETH gas token, permissionless contract deployment, NO
// native token-launch factory (unlike Base's B20 precompile) — tokens are
// deployed as plain ERC-20 via raw contract-creation transactions.

export type ChainKey = "base" | "baseSepolia" | "robinhood" | "robinhoodTestnet";

export interface ChainConfig {
  key: ChainKey;
  label: string;
  chainId: number;
  rpc: string;
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Does this chain have a native token-launch factory (e.g. B20)? */
  hasNativeLaunchFactory: boolean;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    key: "base",
    label: "Base",
    chainId: 8453,
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    hasNativeLaunchFactory: true, // B20 precompile
  },
  baseSepolia: {
    key: "baseSepolia",
    label: "Base Sepolia",
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    hasNativeLaunchFactory: true,
  },
  robinhood: {
    key: "robinhood",
    label: "Robinhood Chain",
    chainId: 4663,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    hasNativeLaunchFactory: false, // plain ERC-20, raw contract-creation deploy
  },
  robinhoodTestnet: {
    key: "robinhoodTestnet",
    label: "Robinhood Chain Testnet",
    chainId: 46630,
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    hasNativeLaunchFactory: false,
  },
};

export function getChain(key: ChainKey): ChainConfig {
  return CHAINS[key];
}

export function getChainById(chainId: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.chainId === chainId);
}
