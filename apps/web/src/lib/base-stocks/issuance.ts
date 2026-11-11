/**
 * What the issuer has done with one Coinbase Tokenized Stock on Base 8453, read
 * on chain: supply minted, and `multiplier()` (dividends and corporate actions
 * raise it; 1 means no adjustment yet). Plus the issuer's prospectus link from
 * base.org's list. base.org lists tokens before they are issued: on 2026-11-11,
 * 338 listed and 72 minted, so "is it issued?" is the first question an agent
 * should get answered, before any price.
 *
 * A failed read is null and said so. Never 0: an unreadable supply is not an
 * unminted token.
 */
import { createPublicClient, erc20Abi, fallback, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { baseRpcUrls } from "@/lib/base-rpc";
import type { CoinbaseBaseStock } from "@/lib/base-stocks/coinbase-list";

const MULT = parseAbi(["function multiplier() view returns (uint256)"]);
const client = createPublicClient({ chain: base, transport: fallback(baseRpcUrls().map((u) => http(u, { timeout: 8_000 }))), batch: { multicall: true } });

export type Issuance = {
  /** null = the read failed; false = totalSupply() is 0. */
  minted: boolean | null;
  supply: number | null;
  /** 1 = no adjustment; above 1 = dividends/actions folded in. null = unread. */
  multiplier: number | null;
  multiplier_change_pct: number | null;
  prospectus: string | null;
  source: string;
};

export async function readIssuance(s: CoinbaseBaseStock): Promise<Issuance> {
  const [supply, mult] = await Promise.all([
    client.readContract({ address: s.token, abi: erc20Abi, functionName: "totalSupply" }).catch(() => null),
    client.readContract({ address: s.token, abi: MULT, functionName: "multiplier" }).catch(() => null),
  ]);
  const m = mult !== null && mult > 0n ? Number(mult) / 1e18 : null;
  return {
    minted: supply === null ? null : supply > 0n,
    supply: supply === null ? null : Number(supply) / 1e8,
    multiplier: m,
    multiplier_change_pct: m === null ? null : Math.round((m - 1) * 1e6) / 1e4,
    prospectus: s.prospectus,
    source: "totalSupply() and multiplier() on Base 8453; prospectus as base.org links it",
  };
}
