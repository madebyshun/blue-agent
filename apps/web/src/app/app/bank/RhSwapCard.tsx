"use client";

// Swap — in-app NON-CUSTODIAL swap on Robinhood Chain (chainId 4663), ETH↔token.
//
// Why this exists and is not the Base `SwapCard`: that card is pinned to Base +
// the 0x aggregator — it force-switches to Base mainnet before signing and
// executes 0x quote calldata — so handing it "robinhood" would sign a Base swap
// under a Robinhood heading and move the wrong funds on the wrong chain. See the
// `can.swap` note in lib/wallet/chains.ts. This is the 4663-native equivalent:
// it speaks Robinhood Chain directly and reuses the SAME proven endpoints the
// chat card uses — GET /api/robinhood/swap/quote (pool discovery + display-only
// estimate) and POST /api/robinhood/router/swap-prepare (calldata) — against the
// deployed RobinhoodSwapRouter. Two directions only: buy (ETH → token) and sell
// (token → ETH).
//
// That "two only" is a gap in THIS CARD, not a limit of the server, and the
// sentence here used to say otherwise ("token→token multi-hop returns NO_ROUTE
// server-side and is not offered here"), which folded two different facts into
// one and got the live half wrong. What swap-prepare actually does, measured
// against its own route file:
//
//   • token → token WITH a direct V3 pool  → supported (mode 3, `tokenIn`)
//   • token → token with no direct pool    → NO_ROUTE, with a message telling
//                                            the user to hop via ETH by hand
//
// So the first case is a capability the card does not expose yet — porting it
// is a UI task, not a routing one. Only the second is a genuine refusal.
//
// ─── What the SELL direction licenses upstream ───────────────────────────────
//
// Sell builds ONE `swapExactInputSingleForETH` against ONE fee tier. There is no
// multi-hop on that path, so "this row can be sold" is exactly "a token/WETH V3
// pool with live liquidity exists on 4663" — not a proxy for it. That equality
// is what lets RhTokenTable and StockTable draw a Sell control per row by
// MEASURING the pool (lib/wallet/rh-sellable.ts) instead of assuming one. If
// this direction ever gains a second hop, that gate becomes too strict and has
// to be widened here first.
//
// The server only builds calldata + a display estimate; the real output is
// bounded on-chain by amountOutMinimum (a 3% slippage floor off that estimate),
// and the user signs from their own wallet. No keys server-side, no funds
// touched. Balances fail CLOSED via useSpendableBalance + resolveSpend, and each
// token's own decimals are READ on-chain (never assumed) on BOTH sides — USDG is
// 6 decimals, and assuming 18 is the exact bug the shared hook was written to
// kill (see useSpendableBalance.ts).
//
// ─── Chat mounts this card too (#256/#257, 2026-09-12) ───────────────────────
//
// `robinhood_swap` used to render its own card. The `initial*` props below are
// what that card carried and this one didn't, so retiring it removes no
// capability: a direction, a token, an amount that may be a quantity WORD, and
// the server's RESOLUTION NOTE.
//
// The note is not decoration. `/api/chat/route.ts` turns a ticker the user
// typed into an address by searching the live GeckoTerminal Robinhood pool
// index — a real derivation, not a guess, but still a derivation the user never
// saw and cannot check from a symbol alone. So `initialToken` is an ADDRESS
// only, `initialSymbol` is a DISPLAY hint that identifies nothing, and
// `initialNote` is rendered verbatim above the token field. On a chain whose
// only index is one Blockscout, "which VEX?" is a question the card has to
// answer out loud.

import { useEffect, useRef, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, usePublicClient, useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress, getAddress, parseUnits, formatUnits } from "viem";
import { WALLET_CHAINS, type WalletChain } from "@/lib/wallet/chains";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
// A quantity WORD ("all"/"max"/"half"/"N%"). Chat passes these through verbatim
// — only the card can see the balance they refer to. One definition for all five
// surfaces that accept them; see the header in `amount.ts` for the measured
// divergence that forced it there.
import { clampDecimals, wordToBps } from "@/lib/wallet/amount";
import { ERC20_ABI } from "@/lib/yield-execution";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";
import { Picker, PickerRow } from "@/components/wallet/Picker";
import { WalletCard, Field, NetworkPicker, ConfirmButton, CardNote } from "@/components/wallet/CardShell";

const RH = WALLET_CHAINS.robinhood;
const RH_CHAIN_ID = RH.chainId; // 4663

/** Same two venues the Base card offers, same reason Sepolia is absent — see
 *  SwapCard's `CONVERT_CHAINS`. Written here too rather than shared, because
 *  what a card will sign on is the card's own rule. */
const CONVERT_CHAINS: readonly WalletChain[] = ["base", "robinhood"];

// The deployed RobinhoodSwapRouter (V3-style). Hardcoded to match the chat
// card's proven path — flagged for a future Virtuals-native migration (#98) but
// LIVE today. Not read from chains.ts because that config carries no router.
const RH_ROUTER = "0x3bb0e9E3dB75faDC5f1f8b7D7B9D761Ef15cd23D" as const;

const SLIPPAGE_PCT = 3; // display estimate → amountOutMinimum floor

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

// Curated non-ETH tokens. USDG is the chain's cash; anything else is a paste.
type RhToken = { sym: string; addr: `0x${string}` };
const CURATED: RhToken[] = [{ sym: RH.stableSymbol, addr: RH.stable }];

// Shape of the quote route (mirrors the chat card's Quote type).
type Quote = {
  ok?: boolean;
  hasPool?: boolean;
  note?: string;
  pool?: { address: `0x${string}`; fee: 100 | 500 | 3000 | 10000; liquidity: string; token0: `0x${string}`; token1: `0x${string}` };
  price?: { tokenUsd: number | null; ethUsd: number | null };
  estimate?: { amountIn: number; direction: "buy" | "sell"; amountOut: number | null };
  error?: string;
};

// Shape of the swap-prepare route's ETH↔token response.
type Prep = {
  ok?: boolean;
  direction?: string;
  approve?: { to: `0x${string}`; data: `0x${string}`; value: string } | null;
  swap?: { to: `0x${string}`; data: `0x${string}`; value: string } | null;
  error?: string | { code?: string; message?: string };
};

export default function RhSwapCard({
  account, onChain, initialDirection, initialToken, initialSymbol, initialAmount, initialNote,
}: {
  account?: `0x${string}`;
  /** Move the CALLER to another venue — see SwapCard's `onChain`. A callback,
   *  not a value: this card speaks 4663 and nothing else, so "robinhood" is the
   *  only chain it is allowed to display. */
  onChain?: (c: WalletChain) => void;
  /** buy = spend ETH for the token; sell = spend the token for ETH. */
  initialDirection?: "buy" | "sell";
  /** The ERC-20 leg, as a 0x ADDRESS. A ticker is ignored on purpose — see the
   *  header; the caller is the one holding an index it can resolve against. */
  initialToken?: string;
  /** Display only. Never used to find, match, or arm a token. */
  initialSymbol?: string;
  /** A number, or a quantity WORD ("all" / "half" / "25%"). */
  initialAmount?: string | number;
  /** How the caller got from what the user typed to `initialToken` — rendered
   *  verbatim so the user can check the hop they never saw. */
  initialNote?: string;
}) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  // Public client on RH — waits for the approve to mine before the swap, so the
  // wallet simulates the swap against a non-zero allowance (else "likely to
  // fail"), and reads the OUT-side decimals fresh at sign time.
  const rhPublicClient = usePublicClient({ chainId: RH_CHAIN_ID });

  // Seeded ONCE, from props, in a lazy initialiser rather than an effect — an
  // effect would re-run and stomp a token the user had since changed by hand.
  const [seeded] = useState(() => {
    const raw = String(initialToken ?? "").trim();
    if (!isAddress(raw)) return { choice: CURATED[0].sym, addr: "" };
    const addr = getAddress(raw);
    const hit = CURATED.find(t => t.addr.toLowerCase() === addr.toLowerCase());
    return hit ? { choice: hit.sym, addr: "" } : { choice: "custom", addr };
  });

  const [direction, setDirection] = useState<"buy" | "sell">(initialDirection === "sell" ? "sell" : "buy");
  const [choice, setChoice] = useState<string>(seeded.choice);       // curated sym | "custom"
  const [customAddr, setCustomAddr] = useState(seeded.addr);
  // The caller's display hint for a pasted/injected token. Survives only as
  // long as THAT token: picking another clears it, so a symbol can never end up
  // captioning an address it did not come with.
  const [customSym, setCustomSym] = useState(
    seeded.choice === "custom" ? String(initialSymbol ?? "").replace(/^\$/, "").trim() : "",
  );
  // The token panel's filter-and-paste field. Cleared by the Picker's `onClose`
  // on every dismissal path, so reopening never shows a list narrowed by a
  // search the user already abandoned.
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount) : "";
    return wordToBps(raw) == null ? raw : "";
  });
  const [pendingWord, setPendingWord] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount).trim() : "";
    return wordToBps(raw) != null ? raw.toLowerCase() : "";
  });
  const [step, setStep] = useState<
    "idle" | "switching" | "preparing" | "approving" | "swapping" | "broadcasting" | "done" | "error"
  >("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");

  // Which ERC-20 sits on the non-ETH side.
  const isCustom = choice === "custom";
  const curated = CURATED.find(t => t.sym === choice) ?? null;
  const custom = customAddr.trim();
  const activeAddr: `0x${string}` | "" =
    isCustom ? (isAddress(custom) ? (custom as `0x${string}`) : "") : (curated?.addr ?? "");
  const tokenReady = isAddress(activeAddr);
  const shortAddr = tokenReady ? `${activeAddr.slice(0, 6)}…${activeAddr.slice(-4)}` : "";
  // A caller's symbol may CAPTION the token; it may never stand alone. Wherever
  // `customSym` is drawn, the address is drawn beside it (see the picker
  // summary), because on 4663 a ticker is a label several contracts can wear.
  const tokenSym = isCustom
    ? (customSym || shortAddr || "token")
    : (curated?.sym ?? "token");

  // The token panel's one field is a filter AND a paste box. Two controls would
  // have made "swap something that isn't USDG" an advanced mode; on a chain
  // whose only index is one Blockscout, that is the ORDINARY case.
  //
  // Pasting no longer arms an address on keystroke: it offers a ROW, and only a
  // well-formed address produces one. The old free-text box accepted anything
  // and left `tokenReady` false with an amber hint underneath — this makes the
  // invalid state unselectable instead of explained.
  const q = query.trim();
  const pastedAddr = isAddress(q) ? (q as `0x${string}`) : null;
  const shownTokens = q && !pastedAddr
    ? CURATED.filter(t => t.sym.toLowerCase().includes(q.toLowerCase()))
    : CURATED;

  const isNativeIn = direction === "buy"; // input is native ETH on a buy
  const inSym = isNativeIn ? "ETH" : tokenSym;
  const outSym = isNativeIn ? tokenSym : "ETH";

  // Balance of the SPENT asset — native ETH on a buy, the token on a sell —
  // WITH its scale, through the one hook, so "still reading" and "could not
  // read" stay distinct and the gate fails closed.
  const bal = useSpendableBalance({
    holder: account,
    native: isNativeIn,
    token: isNativeIn ? undefined : (tokenReady ? activeAddr : undefined),
    chainId: RH_CHAIN_ID,
  });
  const balance = bal.balance;

  const amt = parseFloat(amount);

  // Debounced quote — /api/robinhood/swap/quote takes the ERC-20 side as
  // `token` plus the direction; `amount` is the input (ETH on buy, token on
  // sell). Display-only: the real output is bounded on-chain at swap time.
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const reqId = useRef(0);
  useEffect(() => {
    if (!tokenReady || !(amt > 0)) { setQuote(null); setQuoting(false); return; }
    const id = ++reqId.current;
    setQuoting(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ token: activeAddr, direction, amount: String(amt) });
      fetch(`/api/robinhood/swap/quote?${qs}`)
        .then(r => r.json())
        .then((j: Quote) => { if (id === reqId.current) { setQuote(j); setQuoting(false); } })
        .catch(() => { if (id === reqId.current) { setQuote({ error: "quote failed" }); setQuoting(false); } });
    }, 400);
    return () => clearTimeout(t);
  }, [activeAddr, tokenReady, direction, amt]);

  const hasPool = !!(quote?.ok && quote?.hasPool);
  const estimatedOut = quote?.estimate?.amountOut ?? null;
  const rate = estimatedOut != null && amt > 0 ? estimatedOut / amt : null;
  const minOut = estimatedOut != null ? estimatedOut * (1 - SLIPPAGE_PCT / 100) : null;

  // FAIL-CLOSED. `over` alone is false on an unread balance; resolveSpend
  // supplies the half that refuses to sign when the balance is merely unknown.
  const gate = resolveSpend({
    loading: bal.loading, received: bal.received, failed: bal.failed,
    over: balance != null && amt > balance,
  });
  const overBalance = gate === "insufficient";
  const busy = step === "switching" || step === "preparing" || step === "approving" || step === "swapping" || step === "broadcasting";
  const valid = tokenReady && hasPool && amt > 0 && gate === "ok" && !quoting;

  // Max and the quantity WORDS are ONE calculation, in BASE UNITS. Computing it
  // on `balance` (a float) is how "100%" lands a hair above the real holding
  // and trips the very guard it was meant to satisfy — measured; see
  // `clampDecimals`'s header. The "Bal … Max" line is behind `balance != null`,
  // so this is never a dead click.
  function setPct(bps: number) {
    if (bal.raw == null || bal.decimals == null) return;
    let v = (bal.raw * BigInt(bps)) / 10000n;
    if (isNativeIn && bps === 10000) { // keep a little ETH for gas on a buy
      const reserve = parseUnits("0.00005", bal.decimals);
      v = v > reserve ? v - reserve : 0n;
    }
    setAmount(formatUnits(v, bal.decimals));
  }

  // Resolve a quantity word the moment the balance it refers to arrives. It
  // cannot be resolved earlier and must not be resolved by the caller: "half"
  // is half of a number only this card has read. Clearing `pendingWord` in the
  // same pass makes it fire once — after that the field belongs to the user.
  useEffect(() => {
    if (!pendingWord || bal.raw == null || bal.decimals == null) return;
    const bps = wordToBps(pendingWord);
    if (bps != null) setPct(bps);
    setPendingWord("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWord, bal.raw, bal.decimals]);

  function flip() {
    setDirection(d => (d === "buy" ? "sell" : "buy"));
    // The input unit changes (ETH ↔ token), so neither the number NOR a pending
    // word means the same thing — "all my ETH" is not "all my USDG".
    setAmount(""); setPendingWord("");
  }

  // Watch the final swap tx until it mines.
  const { isSuccess: mined, isError: minedErr } = useWaitForTransactionReceipt({
    hash: txHash || undefined, chainId: RH_CHAIN_ID, query: { enabled: !!txHash },
  });
  useEffect(() => {
    if (mined && step === "broadcasting") setStep("done");
    if (minedErr && step === "broadcasting") { setStep("error"); setErr("Swap reverted on-chain."); }
  }, [mined, minedErr, step]);

  async function doSwap() {
    if (!account) { setErr("Connect your wallet"); setStep("error"); return; }
    if (!tokenReady) { setErr("Pick a token or paste a valid 0x address"); setStep("error"); return; }
    if (!(amt > 0)) { setErr("Enter an amount"); setStep("error"); return; }
    if (!hasPool || !quote?.pool) { setErr("No pool for this pair on Robinhood Chain yet"); setStep("error"); return; }
    // `valid` guards the CLICK; this guards the SIGNATURE. Same gate on purpose
    // — a stale render or keyboard submit must not reach a wallet prompt on an
    // unread or insufficient balance.
    if (gate !== "ok") {
      setErr(gate === "insufficient" ? `Amount exceeds your ${inSym} balance`
        : gate === "reading" ? "Still reading your balance — one moment"
        : "Couldn't read your balance — refusing to sign a swap that may not settle");
      setStep("error"); return;
    }
    setErr(""); setTxHash("");
    try {
      setStep("switching");
      try { await switchChainAsync({ chainId: RH_CHAIN_ID }); }
      catch { throw new Error("Switch to Robinhood Chain (4663) and try again"); }

      // Decimals — READ, never assumed, on BOTH sides. The input side is what
      // useSpendableBalance already read (native 18 or the token's own); the
      // output side is read fresh here (the ERC-20 on a buy, native ETH on a
      // sell). A wrong exponent is a wrong AMOUNT — off by 10^12 on USDG — so
      // this fails CLOSED like the balance gate: "couldn't read" ≠ "go ahead".
      const inDec = bal.decimals;
      if (inDec == null) throw new Error(`Could not read ${inSym} decimals on Robinhood Chain — try again.`);
      let outDec: number;
      if (isNativeIn) {
        // buy: output is the ERC-20 token.
        if (!rhPublicClient) throw new Error("No Robinhood Chain RPC — try again.");
        try {
          outDec = Number(await rhPublicClient.readContract({
            address: activeAddr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals",
          }));
        } catch { throw new Error(`Could not read ${outSym} decimals on Robinhood Chain — try again.`); }
      } else {
        // sell: output is native ETH — taken from the chain's own config, never
        // written down, so this file holds no decimals literal that can drift.
        const nativeDec = rhPublicClient?.chain?.nativeCurrency?.decimals;
        if (nativeDec == null) throw new Error("Could not read the chain's native decimals — try again.");
        outDec = nativeDec;
      }

      const amountInWei = parseUnits(clampDecimals(amount, inDec), inDec);
      const minOutBase = minOut != null ? parseUnits(minOut.toFixed(outDec), outDec) : 0n;

      setStep("preparing");
      const r = await fetch("/api/robinhood/router/swap-prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          router: RH_ROUTER, direction, token: activeAddr, fee: quote.pool.fee,
          amountIn: amountInWei.toString(), amountOutMinimum: minOutBase.toString(),
          recipient: account,
        }),
      });
      const prep = (await r.json()) as Prep;
      if (!r.ok || !prep.ok || !prep.swap) {
        const msg = typeof prep.error === "string" ? prep.error : prep.error?.message;
        throw new Error(msg || `Prepare failed (${r.status})`);
      }

      // Sell needs approve(router, amountIn) first; wait for it to mine so the
      // swap's wallet simulation sees the allowance (else "likely to fail").
      if (prep.approve) {
        setStep("approving");
        const approveHash = await sendTransactionAsync({
          to: prep.approve.to, data: prep.approve.data, value: BigInt(prep.approve.value), chainId: RH_CHAIN_ID,
        });
        if (rhPublicClient) {
          await rhPublicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1, timeout: 60_000 });
        }
      }

      setStep("swapping");
      const hash = await sendTransactionAsync({
        to: prep.swap.to, data: prep.swap.data, value: BigInt(prep.swap.value), chainId: RH_CHAIN_ID,
      });
      setTxHash(hash); setStep("broadcasting");
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Swap cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Swapped {fmt(amt)} {inSym} → {outSym} · {RH.short}
        </div>
        {txHash && (
          <a href={`${RH.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
        )}
        <button onClick={() => { setStep("idle"); setAmount(""); setTxHash(""); }}
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 ml-3">Swap again</button>
      </div>
    );
  }

  const previewOut = quoting ? "…" : (estimatedOut != null ? fmt(estimatedOut) : "0.0");

  return (
    <WalletCard title="CONVERT" chain="robinhood" note="via RH router">
      {/* Hardcoded `value` — see `onChain`. This card speaks 4663 only, so 4663
          is the only thing it may claim; picking Base REPLACES it upstream. */}
      {onChain && (
        <NetworkPicker label="NETWORK" disabled={busy} chains={CONVERT_CHAINS}
          value="robinhood" onChange={onChain} />
      )}

      {/* How a ticker the user typed became the address this card will sign
          against. Shown verbatim, above the field it explains: the hop happened
          off-screen, against a live index, and a symbol on 4663 does not
          identify a contract. */}
      {initialNote && (
        <p className="text-[9px] text-slate-500 leading-relaxed mb-2 break-all">{initialNote}</p>
      )}

      {/* Token — which ERC-20 is the non-ETH leg. ETH is the other leg, always,
          which is why only this side gets a picker and the two amount rows carry
          static symbol chips. */}
      <Picker label="TOKEN" disabled={busy} onClose={() => setQuery("")}
        summary={
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-white truncate">{tokenSym}</span>
            {!isCustom && curated?.sym === RH.stableSymbol && (
              <span className="text-[9px] text-slate-600 shrink-0">{RH.short} cash</span>
            )}
            {/* The address, whenever the label ISN'T already one. */}
            {isCustom && customSym && shortAddr && (
              <span className="text-[9px] text-slate-600 shrink-0">{shortAddr}</span>
            )}
          </span>
        }>
        {close => (
          <div>
            <div className="p-2 border-b border-[#13131f]">
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search symbol, or paste a token address"
                spellCheck={false} autoCapitalize="none" autoCorrect="off"
                className="w-full bg-[#050508] border border-[#1A1A2E] rounded-md px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-slate-700 focus:border-[#4FC3F740]" />
            </div>

            <div className="max-h-56 overflow-y-auto">
              {/* No `setQuery("")` in these handlers: the Picker's `onClose`
                  owns that reset for every dismissal path, and a second copy is
                  how the two drift. */}
              {pastedAddr && !CURATED.some(t => t.addr.toLowerCase() === pastedAddr.toLowerCase()) && (
                <PickerRow onClick={() => {
                  // `setCustomSym("")`: a caller's symbol captions the token it
                  // ARRIVED with and nothing else. Carrying it onto a pasted
                  // address would print a name over a contract that never
                  // claimed it.
                  setChoice("custom"); setCustomAddr(pastedAddr); setCustomSym("");
                  setAmount(""); setPendingWord(""); close();
                }}>
                  <span className="text-[11px] text-[#4FC3F7] flex-1 truncate">
                    Use {pastedAddr.slice(0, 6)}…{pastedAddr.slice(-4)}
                  </span>
                  <span className="text-[9px] text-slate-600">on {RH.short}</span>
                </PickerRow>
              )}

              {shownTokens.map(t => (
                <PickerRow key={t.addr} selected={!isCustom && choice === t.sym}
                  onClick={() => { setChoice(t.sym); setCustomSym(""); setAmount(""); setPendingWord(""); close(); }}>
                  <span className="text-[12px] text-white flex-1">{t.sym}</span>
                  <span className="text-[9px] text-slate-600">{t.addr.slice(0, 6)}…{t.addr.slice(-4)}</span>
                </PickerRow>
              ))}

              {shownTokens.length === 0 && !pastedAddr && (
                <div className="px-2.5 py-3 text-[10px] text-slate-500">
                  Nothing matches “{q}”. Paste the token&apos;s address to swap it anyway.
                </div>
              )}
            </div>

            {/* What this list IS, stated rather than implied. One curated row is
                not a claim that one token exists on 4663 — say so, or a short
                list reads as a complete one. */}
            <div className="px-2.5 py-1.5 border-t border-[#13131f] text-[9px] leading-relaxed text-slate-600">
              {RH.stableSymbol} is the only listed token — paste an address for anything else on {RH.short}.
            </div>
          </div>
        )}
      </Picker>

      {/* You pay. `!mb-0` beats Field's default `mb-3`: this box and the receive
          box clamp the flip control and sit tighter than the card's rhythm. */}
      <Field className="!mb-0" label="YOU PAY"
        right={balance != null && (
          // Digits from the token's OWN scale, not from which side it is on. A
          // 6-decimal token shown to 5 places is a number with two digits of
          // theatre on the end.
          <span className="text-[9px] text-slate-600">Bal {balance.toFixed(bal.decimals === 6 ? 2 : 5)}
            <button type="button" onClick={() => setPct(10000)} className="text-[#4FC3F7] ml-1">Max</button></span>
        )}>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => { setAmount(e.target.value); setPendingWord(""); }} placeholder="0.0"
            className="flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-slate-700 w-0" />
          <span className="text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E] shrink-0">{inSym}</span>
        </div>
        {pendingWord && (
          <div className="text-[9px] text-slate-500 mt-1">
            &ldquo;{pendingWord}&rdquo; — resolving against your {inSym} balance…
          </div>
        )}
        {overBalance && <div className="text-[9px] text-red-500 mt-1">Exceeds your {inSym} balance</div>}
      </Field>

      {/* Flip direction (buy ⇄ sell) */}
      <div className="flex justify-center my-1">
        <button type="button" onClick={flip} aria-label="Flip direction"
          className="text-[12px] text-slate-400 hover:text-[#4FC3F7] w-7 h-7 rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] leading-none">
          ⇅
        </button>
      </div>

      {/* You receive (estimate — settled on-chain) */}
      <Field className="!mb-1" label="YOU RECEIVE (EST)">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[16px] text-white truncate">{previewOut}</span>
          <span className="text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E] shrink-0">{outSym}</span>
        </div>
      </Field>

      {/* Meta: rate · slippage · min · pool */}
      <div className="text-[9px] text-slate-600 mb-2 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{rate != null ? `1 ${inSym} ≈ ${fmt(rate)} ${outSym}` : "rate —"}</span>
          <span className="shrink-0">Slippage {SLIPPAGE_PCT}%</span>
        </div>
        {minOut != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">min {fmt(minOut)} {outSym}</span>
            {quote?.pool && <span className="shrink-0">fee {(quote.pool.fee / 10000).toFixed(2)}%</span>}
          </div>
        )}
      </div>

      {gate === "unverified" && (
        <UnverifiedBalance symbol={inSym} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
      )}
      {tokenReady && quote?.ok && quote.hasPool === false && (
        <p className="text-[10px] text-amber-400 mb-2">No Uniswap V3 pool for {tokenSym}/WETH on Robinhood Chain yet.</p>
      )}
      {quote?.error && <p className="text-[10px] text-amber-400 mb-2">Quote error: {quote.error}</p>}
      {step === "broadcasting" && <p className="text-[10px] text-slate-400 mb-2">Broadcasting… waiting for the block.</p>}
      {step === "error" && <p className="text-[10px] text-amber-400 mb-2">{err}</p>}

      <ConfirmButton tone="blue" onClick={doSwap} disabled={!valid || busy}>
        {!isConnected ? "Connect your wallet"
          : busy
            ? (step === "switching" ? "Switch network…"
              : step === "preparing" ? "Preparing…"
              : step === "approving" ? "Approve in wallet…"
              : step === "swapping" ? "Confirm in wallet…"
              : "Broadcasting…")
            : !tokenReady ? "Pick a token"
            : gate === "unverified" ? "Balance unread — held"
            : quoting ? "Quoting…"
            : quote?.ok && quote.hasPool === false ? "No pool yet"
            : overBalance ? "Insufficient balance"
            : `Swap ${amt > 0 ? fmt(amt) : ""} ${inSym}`}
      </ConfirmButton>
      <CardNote>Robinhood Chain · you sign · non-custodial · 4663.</CardNote>
    </WalletCard>
  );
}
