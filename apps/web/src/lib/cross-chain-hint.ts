/**
 * "Nothing on Base" is not the same sentence as "does not exist".
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26: `0x8Ff92566f2e81BDd68EDfAa8cde73942A723796b` is VEX, a
 * live token on Robinhood Chain 4663. `hub_token_price` answered "no pair" and
 * `honeypot-check` answered "this address is an externally-owned account (EOA /
 * normal wallet), not a token contract". Both are Base-8453-only tools and
 * NEITHER said so, so a true statement about Base ("no code here") was phrased
 * as a claim about the token ("not a token"), on a product whose hard rule #1 is
 * that an address alone never identifies a token — chain plus address does.
 *
 * The confident half is the damage. "No Base pair" is honest and useful. "This
 * is a wallet, not a token" is a verdict about a contract that exists, has
 * holders and trades, one chain over.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * It is exactly ONE `eth_getCode` against RH 4663, appended as a `hint` field
 * on the Base tool's existing answer. The Base answer does not change: a Base
 * tool keeps reporting Base, the numbers stay Base numbers, the chain field
 * stays 8453. It is a POINTER, not a fallback.
 *
 * It is NOT a chain scan, NOT an auto-switch, and it must never return RH data
 * from a Base tool. Two chains that share no state cannot be merged behind one
 * answer without making every number in that answer ambiguous — which is the
 * bug, not the fix. `eth_getCode` is the minimum that distinguishes "you are on
 * the wrong chain" from "this address is empty everywhere", and that is all the
 * caller needs to take the next step themselves.
 *
 * An RPC failure yields `null` — no hint. Absence of a hint is therefore NEVER
 * a claim that the address is absent on RH; it means we did not look or could
 * not tell. Nothing downstream may read a missing hint as evidence.
 */
import { TX_CHAINS } from "@/lib/tx-chains";

const RH = TX_CHAINS.robinhood;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** A pointer must not delay the answer it is attached to. */
const HINT_TIMEOUT_MS = 5_000;

export interface CrossChainHint {
  /** Numeric chain id, because "robinhood" is a label and 4663 is the fact. */
  found_on_chain: number;
  chain: "robinhood";
  /** RH's own Blockscout — a Basescan link for a 4663 address resolves to nothing. */
  explorer: string;
  note: string;
}

/** Does RH 4663 have bytecode at this address? `false` also covers "could not ask". */
export type CodeReader = (address: string) => Promise<boolean>;

const rhHasCode: CodeReader = async (address) => {
  try {
    const res = await fetch(RH.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
      signal: AbortSignal.timeout(HINT_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const d = (await res.json()) as { result?: string; error?: unknown };
    if (d.error || typeof d.result !== "string") return false;
    return d.result !== "0x" && d.result.length > 2;
  } catch {
    return false;
  }
};

/**
 * Build the `hint` a Base-only tool appends when Base has no pair / no token.
 * Returns `null` for a ticker (a ticker has no address on any chain), for a
 * malformed address, and whenever RH has no code — a hint is only ever emitted
 * on a positive read.
 *
 * `hasCode` is injectable so the guard suite covers both branches without
 * network; CI runs hermetically.
 */
export async function robinhoodCodeHint(
  rawAddress: string,
  hasCode: CodeReader = rhHasCode,
): Promise<CrossChainHint | null> {
  const address = (rawAddress ?? "").trim();
  if (!ADDRESS.test(address)) return null;

  let found = false;
  try { found = await hasCode(address); } catch { return null; }
  if (!found) return null;

  return {
    found_on_chain: RH.chainId,
    chain: "robinhood",
    explorer: `${RH.explorer}/address/${address}`,
    note: `This address HAS bytecode on ${RH.label} (chain ${RH.chainId}). This tool reads Base 8453 only, so the answer above is about Base and is unchanged — the two chains share no state. Re-run against an RH-specific tool (rh-*) to price or inspect it there.`,
  };
}
