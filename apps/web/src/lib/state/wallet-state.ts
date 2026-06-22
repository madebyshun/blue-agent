import { stateEvents } from "./events";
import type { WalletState, WalletSnapshot } from "./types";

/**
 * Pure function — derives a canonical WalletState from raw on-chain readings.
 * Emits STATE_UPDATED after computing.
 *
 * Design rules:
 * - ETH is NOT included in allocation % (it's a gas reserve, not a yield asset)
 * - gasSavedUsd is only populated when we have real transfer data
 * - Stablecoin allocation is always 100% (the pie chart only shows stables)
 * - healthScore is additive: 4 × 25-pt dimensions
 */
export function buildWalletState(snapshot: WalletSnapshot): WalletState {
  const inYield = (snapshot.aavePos ?? 0) + (snapshot.morphoPos ?? 0);
  const balance = (snapshot.walletUsdc ?? 0) + inYield;

  // Stablecoins = 100% of the allocation chart (ETH excluded)
  const allocStablecoin = 100;

  // Gas saved is derivable from real tx count — don't invent if no data
  const gasSavedUsd =
    snapshot.transferCountMonth > 0
      ? Math.round(snapshot.transferCountMonth * 0.001 * 2500 * 100) / 100
      : null;

  // Health score 0-100: 4 × 25-point dimensions
  const healthScore = Math.min(
    100,
    Math.round(
      (inYield > 0 ? 25 : 0) +
      (snapshot.bestApy != null ? 25 : 0) +
      (snapshot.ethBal > 0.005 ? 25 : 0) +
      (snapshot.transferCountMonth > 0 ? 25 : 0),
    ),
  );

  const state: WalletState = {
    balance,
    walletUsdc:          snapshot.walletUsdc ?? 0,
    inYield,
    gasReserveEth:       snapshot.ethBal ?? 0,
    allocation:          { stablecoin: allocStablecoin, other: 0 },
    bestApy:             snapshot.bestApy,
    netFlowMonth:        snapshot.netFlowMonth ?? 0,
    transferCountMonth:  snapshot.transferCountMonth ?? 0,
    gasSavedUsd,
    healthScore,
    updatedAt:           new Date().toISOString(),
  };

  stateEvents.emit("STATE_UPDATED", state);
  return state;
}
