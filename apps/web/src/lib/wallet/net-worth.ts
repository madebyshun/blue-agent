/**
 * Cross-chain net worth — one honest dollar figure for the whole wallet.
 *
 * ── What this answers ─────────────────────────────────────────────────────────
 * The balance headline and the CHAINS switcher used to show a SINGLE chain's
 * cash (`walletState.balance`, whichever network is selected). This module adds
 * the other question the design asked for: "what is everything I hold worth,
 * across BOTH live chains, tokens AND tokenized stocks?" It does NOT replace the
 * per-chain figure — it sits beside it.
 *
 * ── Why a server module and not a client hook ─────────────────────────────────
 * The three readers it composes are all server-side: `checkWallet` needs the
 * Moralis key, `readRhHoldings` and the RH stock leg speak Blockscout, the Base
 * stock leg does Chainlink + DEX reads. None can run in the browser. So the
 * summation lives here, once, and a thin route (/api/wallet/net-worth) exposes
 * it. Keeping the arithmetic in ONE place is the same discipline as
 * `read-state.ts` / `buildWalletState`: a money figure derived in four different
 * components is a money figure that disagrees with itself.
 *
 * ── The honesty contract (this is the whole point) ────────────────────────────
 * `usd` is only ever a sum of numbers a vetted reader actually produced —
 * Moralis' `usd_value`, Blockscout's exchange-rate value, the equity pricer's
 * Chainlink/DEX quote. NOTHING is fabricated, inferred, or defaulted to zero to
 * make the row look complete. When any input is missing — a token we hold but
 * cannot price, a chain we could not reach, a list the reader had to truncate —
 * the figure becomes a LOWER BOUND and `isFloor` says so, so the UI renders "≥".
 * A floor with a reason is honest; a fabricated number that looks whole is the
 * exact bug the wallet-honesty rules exist to prevent (CLAUDE.md: "Missing data
 * → 'unknown'. NEVER infer a fake number.").
 *
 * ── No double-count ───────────────────────────────────────────────────────────
 * Base B20 `*c` share tokens are returned by BOTH `checkWallet` (Moralis indexes
 * them as ordinary ERC-20s, badged `isB20`) AND the Base stock leg (which reads
 * the same shares from the pinned registry and prices them properly). Counting
 * both would double the equity. So every contract the Base stock leg reports a
 * holding for is EXCLUDED from the Moralis token sum — the stock leg owns those
 * rows. RH needs no such filter: `readRhHoldings` already excludes the equity
 * addresses the RH stock leg claims, so the two partition the registry.
 */

import { isAddress, getAddress } from "viem";
import { checkWallet } from "@/lib/wallet/holdings";
import { readRhHoldings } from "@/lib/wallet/rh-holdings";
import { readStockHoldings } from "@/lib/wallet/stock-holdings";
import { countsTowardTotal } from "@/lib/wallet/token-trust";

export type NetWorthChain = "base" | "robinhood";

export interface ChainWorth {
  chain: NetWorthChain;
  /** Dollars this app can stand behind on this chain: priced, vouched-for tokens
   *  plus priced tokenized stocks. Never fabricated — see the module header. */
  usd: number;
  /** True when `usd` is a LOWER BOUND, not the full picture: some row was
   *  unpriced, a leg was unavailable, the list was truncated, or the token read
   *  fell back to the curated-majors RPC set. The UI renders "≥" and can show
   *  `reasons`. */
  isFloor: boolean;
  /** Plain-language reasons `usd` is a floor. Empty iff `isFloor` is false. */
  reasons: string[];
  /** "ok" — at least one source for this chain answered. "unavailable" — every
   *  source failed, so `usd: 0` is ignorance, not an empty wallet. */
  status: "ok" | "unavailable";
}

export interface NetWorth {
  address: string;
  chains: ChainWorth[];
  total: { usd: number; isFloor: boolean };
  ts: number;
  error?: string;
}

const BASESCAN = "https://basescan.org";

/** Sum only the numeric ones; ignore null/undefined (unpriced) entirely. */
function sumDefined(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
}

export async function readNetWorth(address: string): Promise<NetWorth> {
  const ts = Date.now();
  if (!isAddress(address)) {
    return { address, chains: [], total: { usd: 0, isFloor: false }, ts, error: "Invalid wallet address." };
  }
  const wallet = getAddress(address);

  // All three readers do independent network I/O — run them together. Each is
  // individually fail-safe: readRhHoldings/readStockHoldings never throw by
  // contract, and checkWallet is wrapped so one dead source cannot sink the sum.
  const [tokens, rh, stocks] = await Promise.all([
    checkWallet(wallet, "base").catch(
      (e): Awaited<ReturnType<typeof checkWallet>> => ({
        address: wallet, network: "mainnet", explorer: BASESCAN,
        addressUrl: `${BASESCAN}/address/${wallet}`,
        source: "rpc", partial: false, holdings: [], error: (e as Error).message,
      }),
    ),
    readRhHoldings(wallet),
    readStockHoldings(wallet),
  ]);

  const baseLeg = stocks.legs.find((l) => l.venue === "base");
  const rhLeg = stocks.legs.find((l) => l.venue === "robinhood");

  // ── Base ────────────────────────────────────────────────────────────────────
  // De-dup set: every contract the Base stock leg already accounts for. Those
  // rows are the stock leg's job, so they must NOT also be summed from Moralis.
  const baseStockContracts = new Set(
    (baseLeg?.holdings ?? []).map((h) => h.contract.toLowerCase()),
  );

  // Tokens we can price AND vouch for AND are not already in the stock leg.
  const baseTokenRows = tokens.holdings.filter(
    (h) => countsTowardTotal(h.trust) && !baseStockContracts.has(h.address.toLowerCase()),
  );
  const baseTokenUsd = sumDefined(baseTokenRows.map((h) => h.usdValue));
  const baseStockUsd = sumDefined((baseLeg?.holdings ?? []).map((h) => h.valueUsd));

  const baseReasons: string[] = [];
  if (tokens.partial) baseReasons.push("token list limited to majors (Moralis unavailable)");
  if (tokens.error) baseReasons.push("token read did not complete");
  // A vouched, non-stock token we hold but Moralis had no price for.
  if (baseTokenRows.some((h) => typeof h.usdValue !== "number"))
    baseReasons.push("some tokens have no price");
  if (baseLeg?.status === "unavailable") baseReasons.push("stock balances unread");
  if ((baseLeg?.unread ?? 0) > 0) baseReasons.push("some stock reads failed");
  if ((baseLeg?.holdings ?? []).some((h) => h.valueUsd == null))
    baseReasons.push("some stocks have no price");

  const baseTokensOk = !tokens.error;
  const baseStocksOk = baseLeg?.status === "ok";
  const base: ChainWorth = {
    chain: "base",
    usd: baseTokenUsd + baseStockUsd,
    isFloor: baseReasons.length > 0,
    reasons: baseReasons,
    status: baseTokensOk || baseStocksOk ? "ok" : "unavailable",
  };

  // ── Robinhood ─────────────────────────────────────────────────────────────
  // rh.totalUsd is already priced + vouched (impostors and equities excluded),
  // so it needs no de-dup against the RH stock leg — they partition the registry.
  const rhStockUsd = sumDefined((rhLeg?.holdings ?? []).map((h) => h.valueUsd));

  const rhReasons: string[] = [];
  if (rh.status === "unavailable") rhReasons.push("token balances unread");
  if (rh.nativeUnread) rhReasons.push("native ETH not read");
  if (rh.truncated) rhReasons.push("token list truncated at the read cap");
  // A vouched RH token we hold but Blockscout had no exchange rate for.
  if (rh.holdings.some((h) => countsTowardTotal(h.trust) && h.usdValue == null))
    rhReasons.push("some tokens have no price");
  if (rhLeg?.status === "unavailable") rhReasons.push("stock balances unread");
  if ((rhLeg?.unread ?? 0) > 0) rhReasons.push("some stock reads failed");
  // Normal case on RH: 168 of 203 RWA tokens have no Chainlink feed at all.
  if ((rhLeg?.holdings ?? []).some((h) => h.valueUsd == null))
    rhReasons.push("some stocks have no price");

  const rhTokensOk = rh.status === "ok";
  const rhStocksOk = rhLeg?.status === "ok";
  const robinhood: ChainWorth = {
    chain: "robinhood",
    usd: rh.totalUsd + rhStockUsd,
    isFloor: rhReasons.length > 0,
    reasons: rhReasons,
    status: rhTokensOk || rhStocksOk ? "ok" : "unavailable",
  };

  const chains = [base, robinhood];
  const total = {
    usd: chains.reduce((acc, c) => acc + c.usd, 0),
    // A floor if ANY chain is a floor OR any chain we could not read at all —
    // an unreadable chain means the true total is at least this, probably more.
    isFloor: chains.some((c) => c.isFloor || c.status === "unavailable"),
  };

  return { address: wallet, chains, total, ts };
}
