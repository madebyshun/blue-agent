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
// (token → ETH). Token→token multi-hop returns NO_ROUTE server-side and is not
// offered here.
//
// The server only builds calldata + a display estimate; the real output is
// bounded on-chain by amountOutMinimum (a 3% slippage floor off that estimate),
// and the user signs from their own wallet. No keys server-side, no funds
// touched. Balances fail CLOSED via useSpendableBalance + resolveSpend, and each
// token's own decimals are READ on-chain (never assumed) on BOTH sides — USDG is
// 6 decimals, and assuming 18 is the exact bug the shared hook was written to
// kill (see useSpendableBalance.ts).

import { useEffect, useRef, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, usePublicClient, useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress, parseUnits } from "viem";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
import { clampDecimals } from "@/lib/wallet/amount";
import { ERC20_ABI } from "@/lib/yield-execution";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";

const RH = WALLET_CHAINS.robinhood;
const RH_CHAIN_ID = RH.chainId; // 4663

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

export default function RhSwapCard({ account }: { account?: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  // Public client on RH — waits for the approve to mine before the swap, so the
  // wallet simulates the swap against a non-zero allowance (else "likely to
  // fail"), and reads the OUT-side decimals fresh at sign time.
  const rhPublicClient = usePublicClient({ chainId: RH_CHAIN_ID });

  const [direction, setDirection] = useState<"buy" | "sell">("buy"); // buy = ETH → token
  const [choice, setChoice] = useState<string>(CURATED[0].sym);      // curated sym | "custom"
  const [customAddr, setCustomAddr] = useState("");
  const [amount, setAmount] = useState("");
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
  const tokenSym = isCustom
    ? (tokenReady ? `${activeAddr.slice(0, 6)}…${activeAddr.slice(-4)}` : "token")
    : (curated?.sym ?? "token");

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

  function setMax() {
    if (balance == null) return; // the "Bal … Max" line is behind `balance != null`
    setAmount(String(isNativeIn ? Math.max(0, balance - 0.00005) : balance)); // keep a little ETH for gas on a buy
  }

  function flip() {
    setDirection(d => (d === "buy" ? "sell" : "buy"));
    setAmount(""); // the input unit changes (ETH ↔ token), so the number no longer means the same thing
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
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest font-bold">SWAP · {RH.short}</span>
        <span className="font-mono text-[9px] text-slate-600">{RH.label} · 4663</span>
      </div>

      {/* Token — which ERC-20 is the non-ETH leg. ETH is the other leg, always. */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {CURATED.map(t => (
          <button key={t.sym} onClick={() => { setChoice(t.sym); setAmount(""); }}
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
            style={choice === t.sym
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#64748b", border: "1px solid #1A1A2E" }}>
            {t.sym}
          </button>
        ))}
        <button onClick={() => { setChoice("custom"); setAmount(""); }}
          className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
          style={isCustom
            ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
            : { color: "#64748b", border: "1px solid #1A1A2E" }}>
          Custom
        </button>
      </div>
      {isCustom && (
        <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-2">
          <div className="font-mono text-[9px] text-slate-600 mb-1">TOKEN ADDRESS</div>
          <input value={customAddr} onChange={e => setCustomAddr(e.target.value)} placeholder="0x… token on Robinhood Chain"
            spellCheck={false} autoCapitalize="none" autoCorrect="off"
            className="w-full bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-slate-700" />
          {custom.length > 0 && !tokenReady && (
            <div className="font-mono text-[9px] text-amber-400 mt-1">Enter a valid 0x address on Robinhood Chain.</div>
          )}
        </div>
      )}

      {/* You pay */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] text-slate-600">YOU PAY</span>
          {balance != null && (
            <span className="font-mono text-[9px] text-slate-600">Bal {balance.toFixed(isNativeIn ? 5 : 2)}
              <button type="button" onClick={setMax} className="text-[#4FC3F7] ml-1">Max</button></span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0"
            className="flex-1 bg-transparent font-mono text-[16px] text-white outline-none placeholder:text-slate-700 w-0" />
          <span className="font-mono text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E]">{inSym}</span>
        </div>
        {overBalance && <div className="font-mono text-[9px] text-red-500 mt-1">Exceeds your {inSym} balance</div>}
      </div>

      {/* Flip direction (buy ⇄ sell) */}
      <div className="flex justify-center my-1">
        <button type="button" onClick={flip} aria-label="Flip direction"
          className="font-mono text-[12px] text-slate-400 hover:text-[#4FC3F7] w-7 h-7 rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] leading-none">
          ⇅
        </button>
      </div>

      {/* You receive (estimate — settled on-chain) */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-1">
        <div className="font-mono text-[9px] text-slate-600 mb-1">YOU RECEIVE (EST)</div>
        <div className="flex items-center gap-2">
          <span className="flex-1 font-mono text-[16px] text-white truncate">{previewOut}</span>
          <span className="font-mono text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E]">{outSym}</span>
        </div>
      </div>

      {/* Meta: rate · slippage · min · pool */}
      <div className="font-mono text-[9px] text-slate-600 mb-2 space-y-0.5 mt-1">
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
        <p className="font-mono text-[10px] text-amber-400 mb-2">No Uniswap V3 pool for {tokenSym}/WETH on Robinhood Chain yet.</p>
      )}
      {quote?.error && <p className="font-mono text-[10px] text-amber-400 mb-2">Quote error: {quote.error}</p>}
      {step === "broadcasting" && <p className="font-mono text-[10px] text-slate-400 mb-2">Broadcasting… waiting for the block.</p>}
      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <button onClick={doSwap} disabled={!valid || busy}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
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
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">Robinhood Chain · you sign · non-custodial · 4663.</p>
    </div>
  );
}
