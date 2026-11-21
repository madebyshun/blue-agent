"use client";

// Convert — in-app non-custodial swap on Base mainnet (ETH / WETH / USDC / cbBTC)
// routed via the 0x Swap API. BlueBank fetches the route from /api/swap/quote;
// the user approves (for ERC-20 sells) and signs the swap from their own wallet.
// Base mainnet only — 0x doesn't route testnet liquidity.
//
// ⚠️ NETWORK-BLIND BY DESIGN; THE CALLER MUST GATE — see BankClient.
// This component takes no `network` prop and reads none. Every address in
// `TOKENS` is Base mainnet, every balance read pins `chainId: base.id`, and
// `swap()` calls `switchChainAsync({ chainId: base.id })` BEFORE signing. So
// rendering it while the surrounding page is on a testnet does not produce a
// testnet swap — it silently yanks the wallet to MAINNET and spends REAL funds
// under a page captioned "no real value". BankClient is what stops that: its
// Convert panel refuses to mount this card when `isTestnet`.
//
// The hazard is a SECOND caller. Import this anywhere else and you inherit the
// mainnet-blindness without inheriting the guard, and nothing here will warn
// you — there is no runtime check, only that one call site. Add the gate at
// the new call site too, or give this component a `network` prop and make the
// refusal its own responsibility.
//
// ─── The second caller now exists: chat (#256/#257, 2026-09-12) ──────────────
//
// Chat had its own Convert card. The two drifted on exactly the field that
// decides whose money moves — chat's `prepare_swap` accepted `network:
// "baseSepolia"` and drew a testnet banner over a card that, like this one,
// routes through 0x and therefore cannot be anything but mainnet. Rather than
// fix the same bug twice, chat mounts THIS card and the duplicate goes away.
//
// It inherits the guard by construction rather than by discipline: `baseSepolia`
// is being removed from the `prepare_swap` schema in the same change, so the
// chat panel has no testnet value to hold and cannot mount this card under a
// no-value label. The panel owns a `convertChain` state exactly as BankClient
// does, and switches to RhSwapCard for Robinhood — it never hands this card a
// chain.
//
// What chat does bring that the portfolio table did not is an ARBITRARY token
// on EITHER side, named by the user in prose. That is why the three `initial*`
// props below arm by ADDRESS (or a curated major), never by bare ticker, and
// why the buy side's decimals are read on-chain: a quoted "you receive" scaled
// by a guessed exponent is a fabricated figure on a card the user signs from.

import { useState, useEffect, useRef } from "react";
import { useAccount, useSwitchChain, useWriteContract, useSendTransaction, useReadContract } from "wagmi";
import { useSilentSender } from "@/lib/privy/silent-tx";
import { useAutoConfirm, useAutoReport } from "@/components/wallet/action-context";
import { formatUnits, parseUnits, isAddress, getAddress, encodeFunctionData } from "viem";
import { base } from "wagmi/chains";
import { ERC20_ABI } from "@/lib/yield-execution";
import { DATA_SUFFIX } from "@/constants/builderCode";
import { useRecordAction } from "@/hooks/useRecordAction";
import { PreTradeBanner, usePreTradeCheck } from "@/components/wallet/PreTradeBanner";
import { BASE_MAJORS } from "@/lib/wallet/token-trust";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { useSendableAssets } from "@/lib/wallet/useSendableAssets";
import { resolveSpend } from "@/lib/wallet/read-state";
// A quantity WORD ("all"/"max"/"half"/"N%") — chat passes these through verbatim
// rather than doing the arithmetic itself, because only the card can see the
// live balance. Resolved in base units once that balance lands; see `setPct`.
import { wordToBps } from "@/lib/wallet/amount";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";
import type { WalletChain } from "@/lib/wallet/chains";
import { Picker, PickerRow } from "@/components/wallet/Picker";
import { WalletCard, Field, NetworkPicker, ConfirmButton, CardNote } from "@/components/wallet/CardShell";

const SYMBOL_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const COINBASE_BY_ADDR = new Map(
  COINBASE_BASE_STOCKS.map((s) => [s.token.toLowerCase(), s] as const),
);

// The tradable majors come from `token-trust.ts`, which is also what decides
// whether a token in the portfolio may be sold at all. They used to be two
// hand-typed lists that happened to agree; now the list this card offers to buy
// IS the list the app vouches for, and adding a major in one place adds it in
// both. Looked up by symbol rather than index — an imported array can be
// reordered upstream, a local literal cannot.
/**
 * `decimals` is OPTIONAL, and that is the point.
 *
 * It used to be required, which quietly meant every token on this card had a
 * known scale — true while the only tokens were the four curated majors and a
 * `preset` row the portfolio table had already read on-chain. Chat breaks that:
 * it can name a token by address that neither list has ever seen, and there is
 * no honest number to put here for it.
 *
 * So the type now says what is actually true — the scale may be unknown — and
 * every place that turns a quantity into money reads it instead: the sell side
 * from `bal.decimals` (`useSpendableBalance`), the buy side from `buyDec`
 * below. What is left in this field is a DISPLAY hint for the curated four.
 */
type Token = {
  sym: string;
  addr: string;
  decimals?: number;
  native?: boolean;
  name?: string;
  image?: string | null;
  amount?: string;
  usdValue?: number;
  isB20?: boolean;
};
const TOKENS: Token[] = BASE_MAJORS;
const ETH  = TOKENS.find(t => t.native)!;
const USDC = TOKENS.find(t => t.sym === "USDC")!;

// A quick-sell pre-fill pushed in from the portfolio token table: an arbitrary
// sell token (beyond the 4 majors) + a concrete amount. `nonce` bumps on every
// click so re-selling the same token re-applies.
export type SellPreset = { addr: string; sym: string; decimals: number; amount: string; nonce: number };

function resolveKnownByAddr(addr: string): Token | null {
  const lc = addr.toLowerCase();
  const major = TOKENS.find(t => t.addr.toLowerCase() === lc);
  if (major) return major;
  const cb = COINBASE_BY_ADDR.get(lc);
  if (cb) return { sym: cb.symbol, addr, decimals: 8, name: cb.name, image: cb.image, isB20: true };
  const stock = BASE_STOCKS.find(t => t.token.toLowerCase() === lc);
  if (stock) return { sym: stock.symbol, addr, decimals: 8, name: stock.name, isB20: true };
  return null;
}

/**
 * Arm one side of the trade from a caller-supplied string.
 *
 * Accepts an ADDRESS, or a symbol that names one of the CURATED majors — and
 * nothing else. Addresses in `BASE_MAJORS`, `BASE_STOCKS`, or
 * `COINBASE_BASE_STOCKS` resolve to their verified symbol and decimals.
 */
function seedToken(want: string | undefined, fallback: Token): { token: Token; unmatched?: string } {
  const s = String(want ?? "").trim();
  if (!s) return { token: fallback };
  if (isAddress(s)) {
    const addr = getAddress(s);
    const known = resolveKnownByAddr(addr);
    if (known) return { token: known };
    // No `sym`: the chip falls back to the address, which is what identifies it.
    return { token: { sym: "", addr } };
  }
  const k = s.toLowerCase();
  if (k === "native") return { token: ETH };
  const major = TOKENS.find(t => t.sym.toLowerCase() === k);
  return major ? { token: major } : { token: fallback, unmatched: s };
}

/** The two venues Convert offers. Base Sepolia is absent for the reason in the
 *  header: 0x has no testnet liquidity and `swap()` force-switches to MAINNET,
 *  so a "testnet convert" would spend real funds under a no-value label. */
const CONVERT_CHAINS: readonly WalletChain[] = ["base", "robinhood"];

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
function fmtAmt(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return Math.round(n).toLocaleString("en-US");
  return s;
}
const truncAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
/** What to CALL a token. An injected one has no symbol we are willing to vouch
 *  for, so it wears its address — shorter than the truth but not a different
 *  claim, which a borrowed ticker would be. */
const label = (t: Token) => t.sym || truncAddr(t.addr);
/** Is this one of the curated majors or verified Coinbase B20 stocks? */
const inMajors = (t: Token) => TOKENS.some(x => x.addr.toLowerCase() === t.addr.toLowerCase());
const isKnownVerified = (t: Token) => inMajors(t) || COINBASE_BY_ADDR.has(t.addr.toLowerCase()) || BASE_STOCKS.some(x => x.token.toLowerCase() === t.addr.toLowerCase());

type FeeLeg = { amount?: string; token?: string; type?: string } | null;
type Quote = {
  needsKey?: boolean; error?: string;
  /** "aerodrome" for a Base B20 stock leg (lib/aerodrome-swap.ts); absent = 0x. */
  venue?: string;
  buyAmount?: string; minBuyAmount?: string;
  transaction?: { to: `0x${string}`; data: `0x${string}`; value?: string };
  issues?: { allowance?: { spender: `0x${string}` } | null };
  /** 0x v2 itemises what it takes. `zeroExFee` is 0x's own cut (0.15% on the
   *  standard plan); it was never shown, so the rate read as all-in when it
   *  was not (plan §1 fix 4). Read from the quote, never assumed. */
  fees?: { zeroExFee?: FeeLeg; integratorFee?: FeeLeg };
};

/** Slippage the user picks (plan §1 fix 4: the card sent none, so every
 *  Convert silently took 0x's 1% default). 1% stays the default. */
const SLIPPAGE_CHOICES = [50, 100, 300] as const;

export default function SwapCard({
  account, preset, onChain, initialSell, initialBuy, initialBuyLogo, initialAmount,
}: {
  account?: `0x${string}`;
  preset?: SellPreset | null;
  /** Arm the PAY side. A 0x address, or a curated major's symbol — see
   *  `seedToken`. Anything else surfaces as a banner, not as a silent default. */
  initialSell?: string;
  /** Arm the RECEIVE side. Same rule. Ignored if it resolves to the sell token
   *  — a pair cannot have the same token on both sides, and quietly keeping it
   *  would leave the card permanently quoteless with nothing saying why. */
  initialBuy?: string;
  /** Optional fallback logo URL (e.g. from Markets/GeckoTerminal) when the registry has none. */
  initialBuyLogo?: string | null;
  /** A number, or a quantity WORD ("all" / "half" / "25%") resolved against the
   *  live balance once it lands. */
  initialAmount?: string | number;
  onChain?: (c: WalletChain) => void;
}) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  // Confirm-in-chat (lib/chat/confirm.ts): an embedded wallet may send without
  // its modal, but only for a chat-confirmed swap under SILENT_MAX_USD.
  const silentSend = useSilentSender();

  // Seeded ONCE. `useState(fn)` and not an effect: an effect would re-run and
  // stomp a token the user had since changed by hand, and these props arrive
  // with the card — chat renders it from a finished tool call, never mutates it.
  const [seeded] = useState(() => {
    const s = seedToken(initialSell, ETH);
    const fallbackBuy = s.token.addr.toLowerCase() === USDC.addr.toLowerCase() ? ETH : USDC;
    const b = seedToken(initialBuy, fallbackBuy);
    const same = b.token.addr.toLowerCase() === s.token.addr.toLowerCase();
    const buyTok = same ? fallbackBuy : (b.token.image || !initialBuyLogo ? b.token : { ...b.token, image: initialBuyLogo });
    return {
      sell: s.token,
      buy: buyTok,
      // Both sides' misses are reported, deduped — "swap FOO for FOO" should
      // name FOO once.
      unmatched: [...new Set([s.unmatched, b.unmatched].filter(Boolean) as string[])],
    };
  });

  const [sell, setSell] = useState<Token>(seeded.sell);
  const [buy, setBuy]   = useState<Token>(seeded.buy);
  const [sellQuery, setSellQuery] = useState("");
  const [buyQuery, setBuyQuery] = useState("");
  const [assetHint, setAssetHint] = useState<string[]>(seeded.unmatched);
  const [amount, setAmount] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount) : "";
    return wordToBps(raw) == null ? raw : "";
  });
  const [pendingWord, setPendingWord] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount).trim() : "";
    return wordToBps(raw) != null ? raw.toLowerCase() : "";
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [slippageBps, setSlippageBps] = useState<number>(100);
  // G2 — the pre-trade check on the token being BOUGHT (the side a honeypot or
  // an impostor would trap). BLOCK disables signing; WARN needs a tick. It
  // replaces the plain "unverified token" tick this card had since fix 4.
  const pt = usePreTradeCheck({ chain: "base", kind: "swap", token: buy.native ? "ETH" : buy.addr });
  const [step, setStep] = useState<"idle" | "approving" | "swapping" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState("");
  // G1 — the signed swap becomes an action record (only with a session).
  useRecordAction(txHash, () => ({
    wallet: account, kind: "swap", chain: "base",
    params: { tokenIn: sell.addr, tokenOut: buy.addr, amountIn: amount, slippageBps, symIn: label(sell), symOut: label(buy) },
    quote: { venue: quote?.venue ?? "0x", expected_out: quote?.buyAmount ?? null, min_out: quote?.minBuyAmount ?? null, unit: "base" },
    check: pt.check ? { verdict: pt.check.verdict, reasons: pt.check.reasons.map((r) => r.text) } : null,
  }));

  // Wallet holdings on Base — populates YOU PAY with the user's actual tokens
  // (excluding impostors) and enriches majors/stocks with live balances.
  const walletList = useSendableAssets(account, "base");

  // Balance of the sell token — read (with its scale) through the one hook, so
  // "still reading" and "could not read" stay distinguishable. `sell.decimals`
  // is NOT used for money any more: BASE_MAJORS is curated and a `preset` comes
  // from the portfolio table, but neither is the token itself. What signs is
  // `bal.decimals`, read from the contract.
  const bal = useSpendableBalance({
    holder: account, native: !!sell.native, token: sell.native ? undefined : sell.addr, chainId: base.id,
  });
  const balance = bal.balance;

  // Read on-chain symbol() if a pasted token has no known symbol yet.
  const { data: sellSymOnChain } = useReadContract({
    address: sell.addr as `0x${string}`, abi: SYMBOL_ABI, functionName: "symbol", chainId: base.id,
    query: { enabled: !sell.native && sell.sym === "" && isAddress(sell.addr) },
  });
  useEffect(() => {
    if (typeof sellSymOnChain === "string" && sellSymOnChain) {
      setSell(s => (s.sym === "" && !s.native ? { ...s, sym: sellSymOnChain } : s));
    }
  }, [sellSymOnChain]);

  const { data: buySymOnChain } = useReadContract({
    address: buy.addr as `0x${string}`, abi: SYMBOL_ABI, functionName: "symbol", chainId: base.id,
    query: { enabled: !buy.native && buy.sym === "" && isAddress(buy.addr) },
  });
  useEffect(() => {
    if (typeof buySymOnChain === "string" && buySymOnChain) {
      setBuy(b => (b.sym === "" && !b.native ? { ...b, sym: buySymOnChain } : b));
    }
  }, [buySymOnChain]);

  // The BUY token's scale, read from the contract.
  const { data: buyDecOnChain } = useReadContract({
    address: buy.addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals", chainId: base.id,
    query: { enabled: !buy.native && isAddress(buy.addr) },
  });
  const buyDec: number | null = buy.native ? 18
    : buyDecOnChain != null ? Number(buyDecOnChain)
    : isKnownVerified(buy) ? buy.decimals ?? null
    : null;

  const amt = parseFloat(amount);
  const sellBase = amount && amt > 0 && bal.decimals != null
    ? (() => { try { return parseUnits(amount, bal.decimals!).toString(); } catch { return ""; } })()
    : "";
  // FAIL-CLOSED. `over` alone is false on an unread balance; `resolveSpend`
  // supplies the half that says so — see lib/wallet/read-state.ts.
  const gate = resolveSpend({
    loading: bal.loading, received: bal.received, failed: bal.failed,
    over: balance != null && amt > balance,
  });
  const overBalance = gate === "insufficient";

  // Debounced quote fetch.
  const reqId = useRef(0);
  useEffect(() => {
    if (!sellBase || sell.addr === buy.addr) { setQuote(null); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ sellToken: sell.addr, buyToken: buy.addr, sellAmount: sellBase, slippageBps: String(slippageBps), ...(account ? { taker: account } : {}) });
      fetch(`/api/swap/quote?${qs}`).then(r => r.json()).then((j: Quote) => {
        if (id !== reqId.current) return;
        setQuote(j); setLoading(false);
      }).catch(() => { if (id === reqId.current) { setQuote({ error: "quote failed" }); setLoading(false); } });
    }, 450);
    return () => clearTimeout(t);
  }, [sellBase, sell.addr, buy.addr, account, slippageBps]);


  // Apply a quick-sell pre-fill from the token table: set the (possibly
  // non-major) sell token + amount and default the buy side to USDC — but sell
  // *to ETH* when the token being sold IS USDC. Keyed on nonce so repeat clicks
  // re-fill. The user still reviews and signs via the normal Convert button.
  useEffect(() => {
    if (!preset) return;
    setSell({ sym: preset.sym, addr: preset.addr, decimals: preset.decimals });
    setBuy(preset.addr.toLowerCase() === USDC.addr.toLowerCase() ? ETH : USDC);
    setAmount(preset.amount);
    setQuote(null); setStep("idle"); setErr(""); setPendingWord(""); setAssetHint([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  // Resolve a quantity WORD the moment the balance it refers to arrives.
  //
  // It cannot be resolved at seed time and it must not be resolved by the
  // caller: "half" is half of a number only this card has read, and chat is
  // explicitly told (see the `amount` description on every money tool) to pass
  // the word through rather than compute one. Clearing `pendingWord` in the
  // same pass is what makes this fire once — after that the field is the
  // user's, and a late balance refetch must not overwrite what they typed.
  useEffect(() => {
    if (!pendingWord || bal.raw == null || bal.decimals == null) return;
    const bps = wordToBps(pendingWord);
    if (bps != null) setPct(bps);
    setPendingWord("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWord, bal.raw, bal.decimals]);

  const buyAmount = quote?.buyAmount && buyDec != null ? Number(formatUnits(BigInt(quote.buyAmount), buyDec)) : null;
  const minBuy = quote?.minBuyAmount && buyDec != null ? Number(formatUnits(BigInt(quote.minBuyAmount), buyDec)) : null;
  const rate = buyAmount != null && amt > 0 ? buyAmount / amt : null;
  // 0x's fee, in the token it is taken in — formatted only when we hold that
  // token's scale (one of the two sides), otherwise shown as raw base units.
  const zeroExFee = (() => {
    const f = quote?.fees?.zeroExFee;
    if (!f?.amount || !f.token) return null;
    const tok = f.token.toLowerCase();
    if (tok === buy.addr.toLowerCase() && buyDec != null) return `${fmt(Number(formatUnits(BigInt(f.amount), buyDec)))} ${label(buy)}`;
    if (tok === sell.addr.toLowerCase() && bal.decimals != null) return `${fmt(Number(formatUnits(BigInt(f.amount), bal.decimals)))} ${label(sell)}`;
    return `${f.amount} (base units of ${truncAddr(f.token)})`;
  })();

  function flip() { setSell(buy); setBuy(sell); setAmount(""); setQuote(null); setPendingWord(""); }
  // The percentage buttons and the quantity WORDS are one calculation, in BASE
  // UNITS. Doing it on `balance` (a float) is how "100%" lands a hair over the
  // real holding on an odd 18-decimal balance and trips the very guard it was
  // meant to satisfy — measured, see `clampDecimals`'s header.
  //
  // Only offered when a balance was actually read: the whole "Bal … Max" line
  // is behind `balance != null` below, so it disappears rather than becoming a
  // dead click. What the user gets instead is the banner, which says why and
  // offers the retry.
  function setPct(bps: number) {
    if (bal.raw == null || bal.decimals == null) return;
    let v = (bal.raw * BigInt(bps)) / 10000n;
    // Selling the last wei of ETH leaves nothing to pay gas with, and the swap
    // itself is the transaction that needs it.
    if (sell.native && bps === 10000) {
      const reserve = parseUnits("0.00005", bal.decimals);
      v = v > reserve ? v - reserve : 0n;
    }
    setAmount(formatUnits(v, bal.decimals));
  }
  const walletTokens: Token[] = walletList.assets
    .filter(a => a.trust !== "impostor")
    .map(a => {
      const addr = a.address ?? ETH.addr;
      const known = resolveKnownByAddr(addr);
      return {
        ...(known ?? { sym: a.symbol, addr, decimals: a.decimals }),
        native: a.address === null,
        name: known?.name ?? a.name,
        amount: a.amount,
        usdValue: a.usdValue,
      };
    });

  const dedupeTokens = (list: Token[]): Token[] => {
    const seen = new Map<string, Token>();
    for (const t of list) {
      const k = t.addr.toLowerCase();
      const prev = seen.get(k);
      if (!prev) {
        seen.set(k, t);
      } else {
        seen.set(k, {
          ...prev,
          ...t,
          sym: prev.sym || t.sym,
          image: prev.image ?? t.image,
          name: prev.name ?? t.name,
          amount: prev.amount ?? t.amount,
          usdValue: prev.usdValue ?? t.usdValue,
        });
      }
    }
    return [...seen.values()];
  };

  const coinbaseTokens: Token[] = COINBASE_BASE_STOCKS.map(s => ({
    sym: s.symbol,
    addr: s.token,
    decimals: 8,
    name: s.name,
    image: s.image,
    isB20: true,
  }));

  const payOptions = dedupeTokens([
    ...walletTokens,
    ...TOKENS,
    sell,
  ]);

  const receiveOptions = dedupeTokens([
    buy,
    ...TOKENS,
    ...walletTokens,
    ...coinbaseTokens,
  ]);

  function pick(side: "sell" | "buy", addr: string, explicit?: Token) {
    const tok = explicit
      ?? [...payOptions, ...receiveOptions].find(t => t.addr.toLowerCase() === addr.toLowerCase())
      ?? (isAddress(addr) ? (resolveKnownByAddr(getAddress(addr)) ?? { sym: "", addr: getAddress(addr) }) : undefined);
    if (!tok) return;
    if (side === "sell") { if (tok.addr.toLowerCase() === buy.addr.toLowerCase()) setBuy(sell); setSell(tok); }
    else { if (tok.addr.toLowerCase() === sell.addr.toLowerCase()) setSell(buy); setBuy(tok); }
    setAmount(""); setQuote(null); setPendingWord(""); setAssetHint([]);
  }

  const canSwap = !!account && !!quote?.transaction && amt > 0 && gate === "ok" && !loading && buyDec != null
    && pt.cleared && !pt.blocked;
  const busy = step === "approving" || step === "swapping";
  // A chat "yes" runs the same swap() once the card is ready to sign.
  useAutoConfirm(canSwap && step === "idle", (o) => { void swap(o); });
  useAutoReport(step, err, txHash ? `https://basescan.org/tx/${txHash}` : null,
    { detail: `${fmt(amt)} ${label(sell)} → ${buyAmount != null ? fmt(buyAmount) : ""} ${label(buy)}`.replace(/\s+/g, " ") });

  /** One transaction: silently through the embedded wallet when the user
   *  confirmed in chat and it is under the limit, else the wallet's prompt. */
  async function sendTx(tx: { to: `0x${string}`; data: `0x${string}`; value?: bigint }, silent: boolean): Promise<`0x${string}`> {
    if (silent && silentSend && account) {
      const h = await silentSend(account, { ...tx, chainId: base.id });
      if (h) return h;
    }
    return sendTransactionAsync({ ...tx, chainId: base.id });
  }

  async function swap(opts: { silent?: boolean } = {}) {
    const silent = !!opts.silent;
    if (!account) { setErr("Connect your wallet"); setStep("error"); return; }
    if (quote?.needsKey) { setErr("Trading needs a 0x API key (ZEROX_API_KEY)"); setStep("error"); return; }
    if (!quote?.transaction) { setErr(quote?.error || "No route for this pair"); setStep("error"); return; }
    setErr(""); setTxHash("");
    try {
      // Unconditional jump to MAINNET, whatever chain the page thinks it is on
      // — network-blind by design; the caller MUST gate (see the file header
      // and BankClient's `isTestnet` refusal). Real funds move after this line.
      await switchChainAsync({ chainId: base.id });
      // ERC-20 sells need an allowance to the 0x AllowanceHolder first.
      //
      // The approve is scaled by `bal.decimals` — the SAME on-chain read that
      // produced `sellBase`, which is what 0x quoted and what the swap will
      // actually pull. It used to be scaled by `sell.decimals`, the row's own
      // field, and the two agreeing was a coincidence of the sell list being
      // curated. The moment chat arms an arbitrary token that field is empty,
      // and the gap is not cosmetic: approve the same digits under the wrong
      // exponent and the allowance is 10^n too small, so the swap reverts after
      // the user has already paid gas for the approve — or 10^n too LARGE, a
      // standing grant over the whole balance left behind on a token they meant
      // to spend a slice of.
      if (!sell.native && quote.issues?.allowance?.spender) {
        if (bal.decimals == null) throw new Error("Token scale unread — refusing to approve");
        setStep("approving");
        if (silent) {
          await sendTx({
            to: sell.addr as `0x${string}`,
            data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [quote.issues.allowance.spender, parseUnits(amount, bal.decimals)] }),
          }, true);
        } else {
          await writeContractAsync({
            address: sell.addr as `0x${string}`, abi: ERC20_ABI, functionName: "approve",
            args: [quote.issues.allowance.spender, parseUnits(amount, bal.decimals)], chainId: base.id,
          });
        }
      }
      setStep("swapping");
      const hash = await sendTx({
        to: quote.transaction.to as `0x${string}`,
        // Append the ERC-8021 builder-code suffix to the 0x swap calldata so the
        // tx is credited to BlueAgent on base.dev (0x… data + suffix without 0x).
        data: (quote.transaction.data + DATA_SUFFIX.slice(2)) as `0x${string}`,
        value: quote.transaction.value ? BigInt(quote.transaction.value) : undefined,
      }, silent);
      setTxHash(hash); setStep("done");
    } catch (e) {
      setErr(((e as Error).message || String(e)).slice(0, 160)); setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[14px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Converted {fmt(amt)} {label(sell)} → {buyAmount != null ? fmt(buyAmount) : ""} {label(buy)}
        </div>
        {txHash && (
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[13px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
        )}
        <button onClick={() => { setStep("idle"); setAmount(""); setQuote(null); }}
          className="font-mono text-[13px] text-slate-500 hover:text-slate-300 ml-3">Trade again</button>
      </div>
    );
  }

  // CALLED, not rendered as `<TokenSelect …/>`. An arrow defined in the render
  // body is a NEW component type every render, so React would unmount and
  // remount whatever it returns — which was harmless for a `<select>` (the OS
  // owns its popup) and fatal for `Picker`, whose `open` lives in React state:
  // the panel would slam shut on the next keystroke in the amount field.
  // Invoking it instead splices the `<Picker>` element straight into this
  // component's tree, where its position — and therefore its state — is stable.
  //
  // `label` is not DRAWN in inline mode — it becomes the bar's `aria-label`,
  // which is the whole reason it is still passed: two identical-looking chips
  // one above the other need different accessible names.
  const tokenAvatar = (t: Token) => t.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={t.image} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 bg-[#0F121A]" />
  ) : (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 border border-[#2a3350] bg-[#0F121A] text-[8px] font-semibold text-slate-400">
      {label(t).replace(/^0x/i, "").slice(0, 2).toUpperCase()}
    </span>
  );

  const tokenChip = (side: "sell" | "buy", value: Token, options: Token[]) => {
    const query = side === "sell" ? sellQuery : buyQuery;
    const setQuery = side === "sell" ? setSellQuery : setBuyQuery;
    const q = query.trim();
    const pastedAddr = isAddress(q) ? getAddress(q) : null;
    const ql = q.toLowerCase();
    const shown = q && !pastedAddr
      ? options.filter(t =>
          t.sym.toLowerCase().includes(ql)
          || (t.name ?? "").toLowerCase().includes(ql)
          || t.addr.toLowerCase().includes(ql))
      : options;
    const alreadyListed = pastedAddr
      ? options.some(t => t.addr.toLowerCase() === pastedAddr.toLowerCase())
      : false;
    const pastedTok: Token | null = pastedAddr
      ? (resolveKnownByAddr(pastedAddr) ?? { sym: "", addr: pastedAddr })
      : null;

    return (
      <Picker
        inline
        label={side === "sell" ? "Pay with" : "Receive"}
        onClose={() => setQuery("")}
        panelClassName="w-72 max-w-[calc(100vw-3rem)]"
        summary={
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {tokenAvatar(value)}
            <span className="text-[14px] text-slate-200 whitespace-nowrap">{label(value)}</span>
          </span>
        }>
        {close => (
          <div>
            <div className="p-2 border-b border-[#13131f]">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search symbol or paste 0x…"
                spellCheck={false} autoCapitalize="none" autoCorrect="off"
                className="w-full bg-[#050508] border border-[#1A1A2E] rounded-md px-2 py-1.5 font-mono text-[13px] text-white outline-none placeholder:text-slate-700 focus:border-[#4FC3F740]"
              />
            </div>

            <div className="max-h-60 overflow-y-auto">
              {pastedTok && !alreadyListed && (
                <PickerRow onClick={() => { pick(side, pastedTok.addr, pastedTok); close(); }}>
                  <span className="font-mono text-[13px] text-[#4FC3F7] flex-1 truncate">
                    Use {label(pastedTok)}
                  </span>
                  <span className="font-mono text-[12px] text-slate-600 shrink-0 whitespace-nowrap">
                    {truncAddr(pastedTok.addr)}
                  </span>
                </PickerRow>
              )}

              {shown.map(t => (
                <PickerRow
                  key={t.addr}
                  selected={t.addr.toLowerCase() === value.addr.toLowerCase()}
                  onClick={() => { pick(side, t.addr, t); close(); }}>
                  {tokenAvatar(t)}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-white whitespace-nowrap truncate">{label(t)}</span>
                    {t.name && <span className="block text-[11px] text-slate-500 truncate">{t.name}</span>}
                  </span>
                  <span className="text-right shrink-0 whitespace-nowrap">
                    {t.amount != null ? (
                      <>
                        <span className="block font-mono text-[12px] text-slate-300">{fmtAmt(t.amount)}</span>
                        {t.usdValue != null && (
                          <span className="block font-mono text-[11px] text-slate-600">${t.usdValue.toFixed(2)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[12px] text-slate-600">{t.native ? "native" : truncAddr(t.addr)}</span>
                    )}
                  </span>
                </PickerRow>
              ))}

              {shown.length === 0 && !pastedAddr && (
                <div className="px-2.5 py-3 text-[12px] text-slate-500">
                  No token matches &ldquo;{q}&rdquo;. Paste a Base contract address to trade it.
                </div>
              )}
            </div>

            {side === "sell" && (
              <div className="px-2.5 py-1.5 border-t border-[#13131f] font-mono text-[11px] text-slate-600 leading-relaxed">
                {!account ? "Connect wallet to load your Base tokens."
                  : walletList.loading ? "Reading your Base wallet tokens…"
                  : walletList.failed ? (
                    <span className="text-amber-400">
                      Couldn&apos;t load wallet tokens — showing majors.{" "}
                      <button type="button" onClick={() => walletList.refetch()} className="underline">Retry</button>
                    </span>
                  ) : walletList.partial ? "Some wallet tokens may be omitted — paste an address if needed."
                  : "Your Base wallet tokens · paste any 0x address."}
              </div>
            )}
          </div>
        )}
      </Picker>
    );
  };

  return (
    <WalletCard title="CONVERT" chain="base" note={quote?.venue === "aerodrome" ? "via Aerodrome" : "via 0x"}>
      {/* The picker's `value` is a LITERAL, not state — see `onChain` above.
          This card signs on Base whatever it is told, so Base is the only thing
          it is allowed to claim. */}
      {onChain && (
        <NetworkPicker label="NETWORK" disabled={busy} chains={CONVERT_CHAINS}
          value="base" onChange={onChain} />
      )}

      {/* A ticker the app holds no address for. Said out loud rather than
          swallowed: the card HAS armed something (it must show a pair), and
          without this the user would read a default they never asked for as if
          it were their request understood. */}
      {assetHint.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 mb-3">
          <p className="text-[12px] text-amber-300/90 leading-relaxed">
            Couldn&apos;t arm <span className="text-amber-200 font-bold">{assetHint.join(" / ")}</span> — a ticker
            alone doesn&apos;t identify a token on Base. Pick it below, or paste the contract address.
          </p>
        </div>
      )}

      {/* Sell. `!mb-1` beats `Field`'s default `mb-3`: these two boxes clamp the
          flip button and must sit closer than the card's normal field rhythm. */}
      <Field className="!mb-1" label="YOU PAY"
        right={balance != null && (
          <span className="text-[12px] text-slate-600">Bal {balance.toFixed(bal.decimals === 6 ? 2 : 5)}
            <button type="button" onClick={() => setPct(10000)} className="text-[#4FC3F7] ml-1">Max</button></span>
        )}>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => { setAmount(e.target.value); setPendingWord(""); }} placeholder="0.0"
            className="flex-1 bg-transparent text-[19px] text-white outline-none placeholder:text-slate-700 w-0" />
          {tokenChip("sell", sell, payOptions)}
        </div>
        {pendingWord && (
          <div className="text-[12px] text-slate-500 mt-1">
            &ldquo;{pendingWord}&rdquo; — resolving against your {label(sell)} balance…
          </div>
        )}
        {overBalance && <div className="text-[12px] text-red-500 mt-1">Exceeds your {label(sell)} balance</div>}
      </Field>

      {/* Flip */}
      <div className="flex justify-center -my-1 relative z-10">
        <button onClick={flip} className="w-7 h-7 rounded-lg border border-[#1A1A2E] bg-[#0d0d12] text-slate-400 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/40 text-[15px]">⇅</button>
      </div>

      {/* Buy */}
      <Field className="mt-1" label="YOU RECEIVE">
        <div className="flex items-center gap-2">
          <div className="flex-1 text-[19px] text-white w-0 truncate">
            {loading ? <span className="text-slate-600">…</span> : buyAmount != null ? fmt(buyAmount) : <span className="text-slate-700">0.0</span>}
          </div>
          {tokenChip("buy", buy, receiveOptions)}
        </div>
        {/* An unread exponent is not a small display gap — it is the difference
            between this line and 100× this line. The button is disabled with it. */}
        {buyDec == null && (
          <div className="text-[12px] text-amber-400 mt-1">Reading {label(buy)}&apos;s decimals on-chain…</div>
        )}
      </Field>

      {rate != null && (
        <div className="text-[12px] text-slate-500 mb-2 flex items-center justify-between">
          <span>1 {label(sell)} ≈ {fmt(rate)} {label(buy)}</span>
          {minBuy != null && <span className="text-slate-600">min {fmt(minBuy)} {label(buy)}</span>}
        </div>
      )}

      {/* Slippage the user chose — sent to 0x and enforced as minBuyAmount. */}
      <div className="text-[12px] text-slate-500 mb-2 flex items-center gap-1.5">
        <span>Max slippage</span>
        {SLIPPAGE_CHOICES.map(bps => (
          <button key={bps} type="button" disabled={busy} onClick={() => setSlippageBps(bps)}
            className="px-1.5 py-0.5 rounded border"
            style={slippageBps === bps
              ? { borderColor: "#4FC3F760", color: "#4FC3F7" }
              : { borderColor: "#1A1A2E", color: "#64748b" }}>
            {bps / 100}%
          </button>
        ))}
        {zeroExFee && <span className="ml-auto text-slate-600" title="0x's own fee, itemised in the quote">0x fee {zeroExFee}</span>}
      </div>

      <PreTradeBanner pt={pt} />

      {quote?.needsKey && <p className="text-[12px] text-amber-400 mb-2">Trading needs a free 0x API key — set <span className="text-slate-300">ZEROX_API_KEY</span>.</p>}
      {step === "error" && <p className="text-[13px] text-amber-400 mb-2">{err}</p>}

      {gate === "unverified" && (
        <UnverifiedBalance symbol={label(sell)} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
      )}

      <ConfirmButton tone="blue" onClick={() => { void swap(); }} disabled={!canSwap || busy}>
        {!isConnected ? "Connect your wallet"
          : busy ? (step === "approving" ? "Approve in wallet…" : "Confirm swap…")
          : overBalance ? "Insufficient balance"
          : gate === "unverified" ? "Balance unread — held"
          : buyDec == null ? "Token scale unread — held"
          : pt.blocked ? "Blocked — see the check above"
          : pt.state === "loading" ? "Checking this trade…"
          : pt.state === "throttled" ? "Check held — retry above"
          : !pt.cleared ? "Confirm the check above"
          : `Trade ${amt > 0 ? fmt(amt) : ""} ${label(sell)} → ${label(buy)}`}
      </ConfirmButton>
      <CardNote>{quote?.venue === "aerodrome" ? "Base stock tokens route via Aerodrome Slipstream (USDC pair) · you sign · non-custodial · Base mainnet." : "Best route via 0x · 0x fee shown when quoted · you sign · non-custodial · Base mainnet."}</CardNote>
    </WalletCard>
  );
}
