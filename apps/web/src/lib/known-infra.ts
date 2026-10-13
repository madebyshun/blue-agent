/**
 * Contracts Blue Agent itself routes users' trades through, verified on-chain.
 *
 * WHY. MEASURED 2026-10-13: GoPlus address_security flags the 0x
 * AllowanceHolder on Base (stealing_attack + phishing_activities, data_source
 * "GoPlus") — the very contract Blue Chat's Base swap card approves. The
 * approval audit then told a user to "revoke now" an approval Blue Agent had
 * just asked them to sign. Drainers route through public routers, so a feed
 * that labels by association flags the router itself. For the contracts below
 * a feed flag is reported, never acted on.
 *
 * Every entry: Blockscout says verified with this exact name, and it is the
 * address this codebase routes through (0x quote spender, PERMIT2 constant,
 * aerodrome-swap SWAP_ROUTER, ROBINHOOD_SWAP_ROUTER_ADDRESS). Add only with
 * the same two proofs — this list SUPPRESSES warnings, so a wrong entry is a
 * hole in the safety layer.
 */
import type { TxChain } from "@/lib/tx-chains";
import { ROBINHOOD_SWAP_ROUTER_ADDRESS } from "@/lib/robinhood/swap";

const BASE: Record<string, string> = {
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x AllowanceHolder (the router Blue Agent's Base swaps use)",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x698cb2b6dd822994581fea6ea4fc755d1363a92f": "Aerodrome Slipstream SwapRouter (Blue Agent's Base stock route)",
};
const ROBINHOOD: Record<string, string> = {
  ...(ROBINHOOD_SWAP_ROUTER_ADDRESS ? { [ROBINHOOD_SWAP_ROUTER_ADDRESS.toLowerCase()]: "Blue Agent's RobinhoodSwapRouter" } : {}),
};

/** The name of a verified infrastructure contract at `addr` on `chain`, or null. */
export function knownInfra(chain: TxChain, addr: string): string | null {
  const m = chain === "robinhood" ? ROBINHOOD : BASE;
  return m[addr.toLowerCase()] ?? null;
}
