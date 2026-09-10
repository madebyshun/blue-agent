// The chains the wallet can display, and the dollar token each one settles in.
//
// This exists because the wallet used to read its network config out of
// `yield-execution.ts` — the Aave supply/withdraw module. Every chain the wallet
// could show therefore had to be a chain Aave had a lending market on, and
// deleting Earn from the wallet would have taken the network switcher with it.
// Identity ("which chain am I looking at, and what is cash here?") is a wallet
// concern; a lending pool address is not. They are separate files now.
//
// Deliberately NOT here: pool / aUsdc / venue addresses. If a field only makes
// sense to Earn, it belongs to Earn.

import { getAddress } from "viem";
import { base, baseSepolia } from "wagmi/chains";
import { robinhoodMainnet } from "@/lib/robinhood/chains";

export type WalletChain = "base" | "baseSepolia" | "robinhood";

export interface WalletChainCfg {
  chainId: number;
  /** Full name, for banners and the network chip. */
  label: string;
  /** Short name, for inline prose ("add USDC on Base"). */
  short: string;
  explorer: string;
  /**
   * Display name for `explorer`. Carried WITH the URL because call sites kept
   * hardcoding "Basescan" next to an explorer href — so on Sepolia the link read
   * "Basescan" and went to sepolia.basescan.org. Same trap now applies double:
   * Robinhood Chain's explorer is Blockscout, and the two chains share no state,
   * so a Basescan link for a 4663 address resolves to nothing.
   */
  explorerName: string;
  testnet: boolean;
  /**
   * The chain's canonical dollar token — what this wallet calls "cash".
   *
   * Named `stable`, not `usdc`, because it is NOT always USDC: Robinhood Chain
   * settles in USDG. A field named for one token while holding another is how
   * the "Basescan" bug above happened, one layer down.
   */
  stable: `0x${string}`;
  stableSymbol: "USDC" | "USDG";
  stableDecimals: number;
  /**
   * Which money-moving paths actually WORK on this chain — declared per chain,
   * not asked as `network === "base"` at each call site.
   *
   * This replaces a prose comment in BankClient that enumerated five things
   * which "would keep answering in Base" if Robinhood were ever made
   * selectable. A list in a comment is not enforced by anything; a required
   * field is. Adding a fourth chain now fails to compile until someone answers
   * these four questions, which is the only version of that list that cannot
   * drift away from the code it describes.
   *
   * Each flag means "a WORKING card exists for this path on this chain". Which
   * card serves it is chosen by chain in BankClient — a true flag never implies
   * one shared component, because two of these paths are satisfied by different
   * cards on different chains:
   *   fiat     Coinbase Onramp/Offramp pin `defaultNetwork=base` in the URL and
   *            `blockchains: ["base"]` in the session — Base-only, no per-chain
   *            card exists, so this is false everywhere but Base.
   *   send     Base + Base Sepolia use SendCard, whose network type is
   *            `YieldNetwork` (base|baseSepolia) — it reads any other value as
   *            baseSepolia, so it CANNOT represent 4663. Robinhood therefore has
   *            its own RhSendCard, which speaks /api/robinhood/router/send-prepare
   *            on 4663 directly. The flag says a send path exists; the chain
   *            switch in BankClient picks the card that can actually serve it.
   *   swap     Base uses SwapCard (0x API, force-switches to Base mainnet before
   *            signing). Robinhood cannot use it — wrong chain, wrong router — so
   *            it has RhSwapCard against the deployed RobinhoodSwapRouter on 4663.
   *            Base Sepolia has NEITHER: the 0x router would spend real mainnet
   *            funds under a page captioned "no real value".
   *   txHistory  /api/wallet/transactions is Moralis, which does not index 4663.
   *
   * A false flag means the UI must SAY the path is unavailable here. It must
   * never mean the UI quietly does the Base thing under another chain's label —
   * which is exactly why RH gets its OWN cards instead of a true flag pointing
   * the Base cards at 4663.
   */
  can: {
    fiat: boolean;
    send: boolean;
    swap: boolean;
    txHistory: boolean;
  };
}

/**
 * Every address here is verified on ITS OWN chain — Base contracts on Base,
 * Robinhood contracts on Robinhood. The two chains share no state, so an
 * explorer check on the wrong one proves nothing.
 *
 * USDG is the repo's existing registry value (`lib/robinhood/rwa-registry.ts`,
 * which carries a deployer check), re-confirmed live 2026-09-05 against
 * rpc.mainnet.chain.robinhood.com: symbol() → "USDG", decimals() → 6,
 * eth_chainId → 0x1237 (4663). Base USDC re-confirmed the same day against
 * mainnet.base.org: symbol() → "USDC", decimals() → 6.
 */
export const WALLET_CHAINS: Record<WalletChain, WalletChainCfg> = {
  base: {
    chainId: base.id,
    label: "Base mainnet",
    short: "Base",
    explorer: "https://basescan.org",
    explorerName: "Basescan",
    testnet: false,
    stable: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    stableSymbol: "USDC",
    stableDecimals: 6,
    // The chain every one of those four paths was written against.
    can: { fiat: true, send: true, swap: true, txHistory: true },
  },
  baseSepolia: {
    chainId: baseSepolia.id,
    label: "Base Sepolia (testnet)",
    short: "Sepolia",
    explorer: "https://sepolia.basescan.org",
    explorerName: "Sepolia Basescan",
    testnet: true,
    stable: getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"),
    stableSymbol: "USDC",
    stableDecimals: 6,
    // `send` is TRUE and `swap`/`fiat` are false, and the asymmetry is the
    // point: SendCard genuinely supports Sepolia, while the onramp and the 0x
    // router would spend REAL money under a page captioned "no real value".
    can: { fiat: false, send: true, swap: false, txHistory: true },
  },
  robinhood: {
    chainId: robinhoodMainnet.id,
    label: "Robinhood Chain",
    short: "Robinhood",
    explorer: "https://robinhoodchain.blockscout.com",
    explorerName: "Blockscout",
    testnet: false,
    stable: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    stableSymbol: "USDG",
    stableDecimals: 6,
    // Send + swap now WORK on 4663 — through chain-native cards (RhSendCard,
    // RhSwapCard in app/bank/) that speak /api/robinhood/router/send-prepare and
    // the deployed RobinhoodSwapRouter directly. They exist as separate cards
    // precisely because the Base ones cannot represent 4663: SendCard is
    // `YieldNetwork`-typed (renders a Base Sepolia form when handed "robinhood")
    // and SwapCard force-switches the wallet to Base mainnet before signing. The
    // flag flip is paired with a `network === "robinhood"` branch in BankClient
    // that mounts the RH card BEFORE any `can`-based Base mount, so a true flag
    // can never route 4663 through a Base card.
    //
    // `fiat` and `txHistory` stay false and remain real dependencies, not
    // caution: Coinbase's onramp does not list 4663 and Moralis does not index
    // it. Balances, holdings and the explorer all work too.
    can: { fiat: false, send: true, swap: true, txHistory: false },
  },
};

/**
 * The order the network switcher renders. Still narrower than `WALLET_CHAINS`
 * in principle — defining a chain is not the same as shipping it — but all
 * three are listed now.
 *
 * Robinhood used to be excluded on the grounds that "the wallet's balance
 * reads, send and swap paths are still Base-shaped". None of that holds now:
 * balances read fine (wagmi has a 4663 transport, and `stable` above is the
 * real USDG address), /api/wallet/rh-holdings reads the chain through
 * Blockscout, StockTable has returned an RH leg on every call since it shipped,
 * and send + swap now have chain-native cards (RhSendCard, RhSwapCard) that
 * speak 4663 directly instead of borrowing the Base-shaped ones. So the wallet
 * was already SHOWING two chains while offering to switch between one — the
 * omission had stopped protecting anyone and had started hiding a whole chain's
 * holdings behind an external link.
 *
 * What is STILL Base-only is now captured by `can` above, per chain, instead of
 * an all-or-nothing absence from this list: `fiat` (the Coinbase onramp does
 * not list 4663) and `txHistory` (Moralis does not index it). Being listed
 * means "you can look at this chain here"; `can` decides what you may DO once
 * you are looking.
 */
export const WALLET_CHAIN_ORDER: readonly WalletChain[] = ["base", "robinhood", "baseSepolia"];

/** Reverse lookup for a numeric chainId, e.g. decoding an EIP-681 URI. */
export function walletChainByChainId(chainId: number): WalletChain | undefined {
  return (Object.keys(WALLET_CHAINS) as WalletChain[]).find(
    (k) => WALLET_CHAINS[k].chainId === chainId,
  );
}
