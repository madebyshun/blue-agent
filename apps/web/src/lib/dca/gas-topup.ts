/**
 * DCA gas tank — READ-ONLY since 2026-09-30.
 *
 * This module used to hold `ensureKeeperGas()`, which signed with
 * GAS_TOP_UP_PRIVATE_KEY to send ETH from a shared "gas tank" to each user's
 * keeper before a DCA run. Recurring buys were retired that day
 * (docs/rebuild-5-tang-2026-09-30.md §1) together with the executor that was
 * its only caller, so the signing half went with them.
 *
 * What stays is what `/api/dca/whoami` needs to REPORT the tank — its address
 * and the thresholds it was run at — because the tank holds project ETH that
 * has to be swept before GAS_TOP_UP_PRIVATE_KEY is unset. Deriving an address
 * from the key signs nothing.
 */

import { parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MIN_KEEPER_BALANCE_ETH = "0.0002";   // ~$0.6 — enough for ~5 tx at 0.05 gwei
const TOP_UP_AMOUNT_ETH      = "0.001";    // ~$3 — enough for ~30 tx sequences

export function getGasTankAddress(): Address | null {
  const pk = process.env.GAS_TOP_UP_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  return privateKeyToAccount(pk).address;
}

export const GAS_TOPUP_CONSTANTS = {
  MIN_KEEPER_BALANCE_ETH,
  TOP_UP_AMOUNT_ETH,
  MIN_KEEPER_BALANCE_WEI: parseEther(MIN_KEEPER_BALANCE_ETH),
  TOP_UP_AMOUNT_WEI:      parseEther(TOP_UP_AMOUNT_ETH),
} as const;
