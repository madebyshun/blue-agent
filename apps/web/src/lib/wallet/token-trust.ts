// Token trust — CAN this app vouch for the row it is about to render, and may
// it offer a one-click Sell on it?
//
// WHY THIS FILE EXISTS: the portfolio table rendered every token Moralis
// returned, identically, with a live `Sell ▾` on each row. A real wallet on
// Base came back holding
//     USDC   — "United States of Doge CashCat"
//     $ETH   — "$Ethereum Token Hood"
//     AI     — "Open AI"
// none of which are what their symbol says. Moralis' own `possible_spam` flag
// missed all three. The fake USDC then sorted into the STABLECOIN tier (see
// `rank()` in ./holdings.ts, which keyed off `STABLES.has(symbol)`) and landed
// two rows under the card showing the user's REAL USDC balance — which is
// exactly the confusion those tokens are minted to create.
//
// This is CLAUDE.md hard rule #2 applied to the wallet: **a ticker string never
// identifies a token; chain + address does.** Name-matching a ticker is how an
// impostor got into the RH registry (#280). The same mistake here does not just
// mislabel a row — it puts a trade button on it.
//
// Three-valued for the same reason `identity.ts` is: "we cannot vouch for this"
// is a real answer, distinct from "this is a fake". Collapsing them would
// either brand every legitimate long-tail token a scam, or wave the scams
// through. See CLAUDE.md: missing data is "unknown", never an inferred negative.

import { YIELD_NETWORKS, VENUES } from "@/lib/yield-execution";
import { RWA_TOKENS } from "@/lib/robinhood/rwa-registry";

/** Invisible characters impostors splice in (soft hyphen, Khmer inherent
 *  vowels U+17B4/5, zero-widths, bidi marks, variation selectors, BOM…). */
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

/** Letters from other scripts that render as Latin capitals. MEASURED
 *  2026-10-13 on Base: live fake-USDC tokens "ÚSDС" (Cyrillic С),
 *  "U឵S឵Dꓚ" (Khmer invisibles, Lisu ꓚ) and "ꓴ឵ՏᎠ឵Ꮳ" (Lisu, Armenian,
 *  Cherokee) all classified "unverified" before this map. */
const CONFUSABLE: Record<string, string> = {
  // Cyrillic
  "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I", "Ј": "J", "К": "K", "М": "M", "О": "O", "Р": "P", "Ѕ": "S", "Т": "T", "Х": "X", "У": "Y", "Ү": "Y",
  "а": "A", "с": "C", "е": "E", "о": "O", "р": "P", "х": "X", "у": "Y", "і": "I", "ј": "J", "ѕ": "S", "ԁ": "D", "ԛ": "Q", "ԝ": "W",
  // Greek
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "ο": "O", "ν": "V",
  // Lisu (U+A4D0–A4FD)
  "ꓐ": "B", "ꓑ": "P", "ꓓ": "D", "ꓔ": "T", "ꓖ": "G", "ꓗ": "K", "ꓙ": "J", "ꓚ": "C", "ꓜ": "Z", "ꓝ": "F", "ꓟ": "M", "ꓠ": "N", "ꓡ": "L", "ꓢ": "S", "ꓣ": "R", "ꓦ": "V", "ꓧ": "H", "ꓪ": "W", "ꓫ": "X", "ꓬ": "Y", "ꓮ": "A", "ꓰ": "E", "ꓲ": "I", "ꓳ": "O", "ꓴ": "U",
  // Cherokee
  "Ꭺ": "A", "Ᏼ": "B", "Ꮯ": "C", "Ꭰ": "D", "Ꭼ": "E", "Ꮐ": "G", "Ꮋ": "H", "Ꮶ": "K", "Ꮮ": "L", "Ꮇ": "M", "Ꮲ": "P", "Ꮪ": "S", "Ꭲ": "T", "Ꮩ": "V", "Ꮃ": "W", "Ꮓ": "Z", "Ꮳ": "C",
  // Armenian
  "Տ": "S", "Օ": "O", "Ս": "U", "օ": "O", "ս": "U",
};

/**
 * Fold the cosmetic tricks impostors use so `$ETH`, `ETH `, `(ETH)`, a
 * fullwidth `ＥＴＨ`, an accented `ÉTH` and a Cyrillic `ЕТН` all collide with
 * `ETH`. Deliberately NOT a fuzzy match — only exact collision after folding
 * look-alike letters and stripping non-alphanumerics, so `ETH2` stays its own
 * symbol.
 */
export function normalizeSymbol(s: string): string {
  const folded = (s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(INVISIBLE, "");
  let out = "";
  for (const ch of folded) out += CONFUSABLE[ch] ?? ch;
  return out.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type TokenTrust =
  /** Address matches a token this repo already pins, or the chain confirmed it. */
  | "verified"
  /** Wears the SYMBOL of a token we pin, at a DIFFERENT address. Actively lying. */
  | "impostor"
  /** Long-tail. Not vouched for, not accused — we simply have no basis. */
  | "unverified";

/** The subset of a holding this module needs. Structural, so both the client
 *  table and any server caller can pass their own row shape. */
export interface TrustInput {
  symbol:   string;
  address:  string;
  isNative?: boolean;
  isB20?:   boolean;
}

/**
 * ERC-20 sentinel used across this app (and by Moralis, and by the 0x Swap API)
 * for native ETH. Checksummed spelling because it is sent verbatim to 0x as a
 * `sellToken`/`buyToken`; every comparison in this module lowercases first, so
 * the casing is a wire-format detail and never a matching hazard.
 */
export const NATIVE_SENTINEL: `0x${string}` = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * Canonical Base-mainnet majors.
 *
 * Every address here is one this repo ALREADY pins somewhere and can therefore
 * stand behind. USDC / aUSDC / the Morpho share token are read straight out of
 * the venue config rather than retyped, so there is no second copy to drift:
 * change `yield-execution.ts` and this list follows.
 *
 * WETH and cbBTC are Base predeploys/canonicals that `SwapCard` already trades
 * against — this module is now the single home for them, and SwapCard imports
 * from here rather than keeping its own duplicate list.
 *
 * NOT INCLUDED, deliberately: $BLUEAGENT. The address in CLAUDE.md is the OLD
 * token — a relaunch is in flight — so pinning it here would vouch for an
 * address we know to be stale. Add it back with the post-relaunch address, not
 * before; a stale constant that claims to be verified is the exact bug this
 * file exists to prevent.
 */
export interface MajorToken { sym: string; addr: `0x${string}`; decimals: number; native?: boolean }

export const BASE_MAJORS: MajorToken[] = [
  { sym: "ETH",   addr: NATIVE_SENTINEL, decimals: 18, native: true },
  { sym: "USDC",  addr: YIELD_NETWORKS.base.usdc,  decimals: YIELD_NETWORKS.base.usdcDecimals },
  { sym: "WETH",  addr: "0x4200000000000000000000000000000000000006", decimals: 18 },
  { sym: "cbBTC", addr: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
];

/**
 * The chains this module can classify on.
 *
 * Kept explicit rather than widened to `string`: every network here needs a
 * pinned address book, and a chain with no address book cannot produce
 * "verified" or "impostor" at all — only "unverified" for everything, which is
 * a classifier that does nothing while looking like it works.
 */
export type TrustNetwork = "base" | "baseSepolia" | "robinhood";

/**
 * address(lowercased) → canonical symbol in `normalizeSymbol` form, per network.
 *
 * The value is normalized HERE, at insertion, because its only reader is the
 * PROTECTED set below, which `classifyToken` probes with
 * `normalizeSymbol(t.symbol)`. Storing the symbol as written broke that for
 * every pinned symbol that is not already upper-case alphanumeric: BASE_MAJORS
 * spells it "cbBTC", the probe spells it "CBBTC", and a contract calling itself
 * cbBTC from any address classified as "unverified" instead of "impostor" —
 * which is the one verdict the pre-trade BLOCK (G2) keys on.
 */
function verifiedMap(network: TrustNetwork): Map<string, string> {
  const m = new Map<string, string>();
  const put = (addr: string, sym: string) => m.set(addr.toLowerCase(), normalizeSymbol(sym));

  put(NATIVE_SENTINEL, "ETH");

  // Robinhood Chain has its own address book and shares no state with Base, so
  // it is built from the RH registry alone — never from the Base venue config.
  // Every RWA_TOKENS row was crawled out of the RHJ factory's own Deployed
  // events (see rwa-registry.ts), which makes "this address issued this ticker"
  // a provenance fact rather than a name match. The two utility rows (WETH,
  // USDG) are pinned by the same registry with different issuers, and both are
  // worth protecting: USDG is what this chain calls cash.
  if (network === "robinhood") {
    for (const t of RWA_TOKENS) put(t.contract, t.ticker);
    return m;
  }

  const y = YIELD_NETWORKS[network];
  put(y.usdc,  "USDC");
  put(y.aUsdc, "AUSDC");

  if (network === "base") {
    for (const t of BASE_MAJORS) put(t.addr, t.sym);
    const morpho = VENUES.morpho.nets.base;
    if (morpho) put(morpho.receipt, "MORPHOUSDC");
  }
  return m;
}

const VERIFIED: Record<TrustNetwork, Map<string, string>> = {
  base:        verifiedMap("base"),
  baseSepolia: verifiedMap("baseSepolia"),
  robinhood:   verifiedMap("robinhood"),
};

/**
 * Symbols we are entitled to call an impostor ON.
 *
 * ONLY symbols for which we hold a canonical address, because only then is
 * "this isn't it" a derivation rather than a hunch. A token calling itself
 * USDT is not accused here — we pin no USDT on Base, so we genuinely do not
 * know, and "unverified" is the honest verdict.
 */
const PROTECTED: Record<TrustNetwork, Set<string>> = {
  base:        new Set(VERIFIED.base.values()),
  baseSepolia: new Set(VERIFIED.baseSepolia.values()),
  // ~205 tickers on RH. Wide on purpose: the counterfeits this chain actually
  // has copy an RHJ equity exactly — the fake GME carries the byte-for-byte
  // name "GameStop • Robinhood Token". A token wearing a pinned RH ticker from
  // an address the factory never deployed is the case this set exists for.
  robinhood:   new Set(VERIFIED.robinhood.values()),
};


/**
 * Address is the identity; the symbol is just a label the token chose for
 * itself. Hence the order below: address match wins, and a symbol collision is
 * only ever evidence AGAINST a token, never for it.
 */
export function classifyToken(t: TrustInput, network: TrustNetwork): TokenTrust {
  const verified = VERIFIED[network];
  const addr = (t.address || "").toLowerCase();

  // The RPC fallback cannot misreport the native asset — it isn't a contract.
  if (t.isNative) return "verified";
  if (addr && verified.has(addr)) return "verified";

  // Wearing a pinned symbol at an address that is NOT the pinned one.
  if (PROTECTED[network].has(normalizeSymbol(t.symbol))) return "impostor";

  // Confirmed on-chain by B20Factory.isB20() in holdings.ts — a real read, not
  // a name match. Checked AFTER the impostor test on purpose: being a genuine
  // B20 does not entitle a token to call itself USDC.
  if (t.isB20) return "verified";

  return "unverified";
}

/**
 * May the table offer one-click Sell on this row?
 *
 * `unverified` still gets the control — most real portfolios are long-tail and
 * hiding it there would break the feature to no benefit; the badge carries the
 * caveat instead. `impostor` does NOT: the whole point of that token is to be
 * mistaken for another one, and a trade button is the payoff for the trick.
 */
export function canQuickSell(trust: TokenTrust): boolean {
  return trust !== "impostor";
}

/** Should this row count toward the portfolio's displayed total? */
export function countsTowardTotal(trust: TokenTrust): boolean {
  return trust !== "impostor";
}

export const TRUST_BADGE: Record<TokenTrust, { label: string; color: string } | null> = {
  verified:   null,                                       // no badge — the default, quiet state
  unverified: { label: "unverified", color: "#64748b" },
  impostor:   { label: "⚠ fake name", color: "#EF4444" },
};
