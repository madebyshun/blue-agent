// Blue Chat — Aave v3 yield execution config (NON-custodial).
//
// The user SIGNS approve + supply / withdraw from their OWN wallet via wagmi —
// Blue Agent never holds keys or funds. This file only supplies verified
// addresses + ABIs + amount parsing; the MoveToYieldCard composes the calls.
//
// Addresses are VERIFIED from the official Aave Address Book (bgd-labs), never
// guessed. Mirrors blueagent-runtime/src/core/execution.ts. Base only.
//   Base mainnet  Pool 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
//   Base Sepolia  Pool 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27

import { parseUnits, maxUint256, getAddress, type Abi } from "viem";
import { base, baseSepolia } from "wagmi/chains";

export type YieldNetwork = "base" | "baseSepolia";

export interface YieldNetCfg {
  chainId: number;
  label: string;
  short: string;
  explorer: string;
  testnet: boolean;
  pool: `0x${string}`;
  usdc: `0x${string}`;
  aUsdc: `0x${string}`;
  usdcDecimals: number;
}

export const YIELD_NETWORKS: Record<YieldNetwork, YieldNetCfg> = {
  baseSepolia: {
    chainId: baseSepolia.id,
    label: "Base Sepolia (testnet)",
    short: "Sepolia",
    explorer: "https://sepolia.basescan.org",
    testnet: true,
    pool:  getAddress("0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"),
    usdc:  getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"),
    aUsdc: getAddress("0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC"),
    usdcDecimals: 6,
  },
  base: {
    chainId: base.id,
    label: "Base mainnet",
    short: "Base",
    explorer: "https://basescan.org",
    testnet: false,
    pool:  getAddress("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"),
    usdc:  getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    aUsdc: getAddress("0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"),
    usdcDecimals: 6,
  },
};

export const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const satisfies Abi;

export const AAVE_POOL_ABI = [
  { name: "supply", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], outputs: [{ type: "uint256" }] },
] as const satisfies Abi;

// maxUint256 = "withdraw all" (Aave convention).
export const WITHDRAW_ALL = maxUint256;

export function parseUsdc(amount: number, network: YieldNetwork): bigint {
  return parseUnits(String(amount), YIELD_NETWORKS[network].usdcDecimals);
}
