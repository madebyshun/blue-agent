export interface WalletState {
  balance: number;
  walletUsdc: number;
  inYield: number;
  gasReserveEth: number;     // ETH — separate, NOT included in allocation
  allocation: {
    stablecoin: number;      // % — always 100 (only stables in the pie)
    other: number;           // reserved, currently 0
  };
  bestApy: number | null;
  netFlowMonth: number;
  transferCountMonth: number;
  gasSavedUsd: number | null; // null when no real tx data
  healthScore: number;         // 0-100
  updatedAt: string;
}

export interface WalletSnapshot {
  walletUsdc: number;
  aavePos: number;
  morphoPos: number;
  ethBal: number;
  bestApy: number | null;
  netFlowMonth: number;
  transferCountMonth: number;
}
