"use client";
// Chat card for the `robinhood_swap` tool. Executes a real, tiny-friendly swap
// on Robinhood Chain (chainId 4663) via the deployed RobinhoodSwapRouter
// (0x3bb0…d23D). Everything happens client-side under the user's own wallet:
//   1. GET /api/robinhood/swap/quote → pool detection + display-only estimate
//   2. POST /api/robinhood/router/swap-prepare → tx calldata + optional approve
//   3. User signs approve (sell only), then the swap tx.
// Non-custodial: server holds no keys, on-chain math bounds the final amount.

import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain, useSendTransaction, useReadContract, useBalance } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ERC20_ABI } from "@/lib/yield-execution";
import { ConnectButton } from "@/components/ConnectModal";

const RH_ROUTER = "0x3bb0e9E3dB75faDC5f1f8b7D7B9D761Ef15cd23D" as const;
const RH_CHAIN_ID = 4663;
const RH_EXPLORER = "https://robinhoodchain.blockscout.com";

/** Marker shape the /api/chat handler emits for `robinhood_swap`. */
export interface RobinhoodSwapResult {
  kind: "robinhood_swap";
  direction?: "buy" | "sell";
  token_address?: string;
  token_symbol?: string;
  token_name?: string;
  /** Human-readable amount: ETH for buy, token for sell. */
  amount?: string | number;
  /** Server-side resolution notes (e.g. "resolved via GeckoTerminal"). */
  note?: string;
  /** Server-side error to display inline (e.g. token not found). */
  error?: string;
}

type Quote = {
  ok?: boolean;
  hasPool?: boolean;
  note?: string;
  pool?: { address: `0x${string}`; fee: 100 | 500 | 3000 | 10000; liquidity: string; token0: `0x${string}`; token1: `0x${string}` };
  price?: { tokenUsd: number | null; ethUsd: number | null };
  estimate?: { amountIn: number; direction: "buy" | "sell"; amountOut: number | null };
  error?: string;
};

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function RobinhoodSwapCard({ result }: { result: RobinhoodSwapResult }) {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const direction = result.direction === "sell" ? "sell" : "buy";
  const token = (result.token_address || "").trim() as `0x${string}` | "";
  const tokenSym = (result.token_symbol || "").replace(/^\$/, "") || "TOKEN";
  const initialAmt = result.amount != null ? String(result.amount) : "";

  const [amount, setAmount] = useState(initialAmt);
  const [slippagePct, setSlippagePct] = useState(3);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [step, setStep] = useState<"idle" | "approving" | "swapping" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState("");

  // Balances (native ETH for buy, ERC-20 for sell).
  const { data: nativeBal } = useBalance({
    address, chainId: RH_CHAIN_ID, query: { enabled: !!address && direction === "buy" },
  });
  const { data: tokenBal } = useReadContract({
    address: token || undefined, abi: ERC20_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: RH_CHAIN_ID,
    query: { enabled: !!address && direction === "sell" && !!token },
  });
  const balance = direction === "buy"
    ? (nativeBal ? Number(formatUnits(nativeBal.value, 18)) : null)
    : (tokenBal != null ? Number(formatUnits(tokenBal as bigint, 18)) : null);

  const amt = parseFloat(amount);
  const overBalance = balance != null && amt > balance;

  // Debounced quote fetch — same shape as /launches modal.
  const reqId = useRef(0);
  useEffect(() => {
    if (!token || !amount || !Number.isFinite(amt) || amt <= 0) { setQuote(null); return; }
    const id = ++reqId.current;
    setLoadingQuote(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ token, direction, amount: String(amt) });
      fetch(`/api/robinhood/swap/quote?${qs}`)
        .then(r => r.json())
        .then((j: Quote) => { if (id === reqId.current) { setQuote(j); setLoadingQuote(false); } })
        .catch(() => { if (id === reqId.current) { setQuote({ error: "quote failed" }); setLoadingQuote(false); } });
    }, 400);
    return () => clearTimeout(t);
  }, [token, direction, amount, amt]);

  const hasPool = quote?.ok && quote?.hasPool;
  const estimatedOut = quote?.estimate?.amountOut ?? null;
  const inSym = direction === "buy" ? "ETH" : tokenSym;
  const outSym = direction === "buy" ? tokenSym : "ETH";
  const rate = estimatedOut != null && amt > 0 ? estimatedOut / amt : null;
  const minOut = estimatedOut != null ? estimatedOut * (1 - slippagePct / 100) : null;
  const canSwap = !!address && hasPool && amt > 0 && !overBalance && !loadingQuote && step !== "approving" && step !== "swapping";
  const busy = step === "approving" || step === "swapping";

  async function doSwap() {
    if (!address) { setErr("Connect your wallet"); setStep("error"); return; }
    if (!token) { setErr("Missing token address"); setStep("error"); return; }
    if (!hasPool || !quote?.pool) { setErr("No pool available"); setStep("error"); return; }
    if (!amt || amt <= 0) { setErr("Enter an amount"); setStep("error"); return; }
    setErr(""); setTxHash("");
    try {
      try { await switchChainAsync({ chainId: RH_CHAIN_ID }); } catch {
        throw new Error("Switch to Robinhood Chain (4663) and try again");
      }
      const amountInWei = parseUnits(amount, 18);
      const minOutBase = minOut != null ? parseUnits(minOut.toFixed(18), 18) : 0n;

      const prepRes = await fetch("/api/robinhood/router/swap-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          router: RH_ROUTER,
          direction,
          token,
          fee: quote.pool.fee,
          amountIn: amountInWei.toString(),
          amountOutMinimum: minOutBase.toString(),
          recipient: address,
        }),
      });
      const prep = await prepRes.json();
      if (!prep.ok) throw new Error(prep.error || "Prepare failed");

      if (prep.approve) {
        setStep("approving");
        await sendTransactionAsync({
          to: prep.approve.to as `0x${string}`,
          data: prep.approve.data as `0x${string}`,
          value: 0n,
          chainId: RH_CHAIN_ID,
        });
      }
      setStep("swapping");
      const hash = await sendTransactionAsync({
        to: prep.swap.to as `0x${string}`,
        data: prep.swap.data as `0x${string}`,
        value: BigInt(prep.swap.value),
        chainId: RH_CHAIN_ID,
      });
      setTxHash(hash);
      setStep("done");
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Swap cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  // Server-side failure to resolve token → show plain error card.
  if (result.error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 font-mono text-[11px] text-amber-300">
        <div className="font-bold mb-1">Can&apos;t prepare Robinhood swap</div>
        <div className="text-amber-200/80">{result.error}</div>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 font-mono text-[11px] text-slate-400">
        Missing token address — ask again with the token contract or a symbol I can look up.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 font-mono text-[11px] text-slate-300 max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-white text-[12px] font-bold">
            {direction === "buy" ? "Buy" : "Sell"} {tokenSym} on Robinhood Chain
          </div>
          <div className="text-slate-600 text-[10px]">
            via RobinhoodSwapRouter · you sign · non-custodial · chainId 4663
          </div>
        </div>
        {!isConnected && <ConnectButton label="Connect" />}
      </div>

      {step === "done" ? (
        <div className="rounded-lg border p-3" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
          <div className="font-bold mb-1" style={{ color: "#22C55E" }}>
            ✓ Swap sent to Robinhood Chain
          </div>
          {txHash && (
            <a href={`${RH_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-[10px] px-2 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
          )}
        </div>
      ) : (
        <>
          {/* Amount */}
          <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-slate-600">YOU PAY</span>
              {balance != null && (
                <span className="text-[9px] text-slate-600">
                  Bal {balance.toFixed(5)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0"
                className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-slate-700 w-0" />
              <span className="text-[10px] text-slate-200 px-2 py-1 border border-[#1A1A2E] rounded-lg">{inSym}</span>
            </div>
            {overBalance && <div className="text-[9px] text-red-500 mt-1">Exceeds your {inSym} balance</div>}
          </div>

          {/* Estimated out */}
          <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-2">
            <div className="text-[9px] text-slate-600 mb-1">YOU RECEIVE (est.)</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-[15px] text-white w-0 truncate">
                {loadingQuote ? <span className="text-slate-600">…</span>
                  : estimatedOut != null ? fmtNum(estimatedOut)
                  : <span className="text-slate-700">0.0</span>}
              </div>
              <span className="text-[10px] text-slate-200 px-2 py-1 border border-[#1A1A2E] rounded-lg">{outSym}</span>
            </div>
          </div>

          {rate != null && (
            <div className="text-[9px] text-slate-500 mb-1 flex items-center justify-between">
              <span>1 {inSym} ≈ {fmtNum(rate)} {outSym}</span>
              {minOut != null && <span className="text-slate-600">min {fmtNum(minOut)} {outSym}</span>}
            </div>
          )}
          <div className="text-[9px] text-slate-600 mb-2 flex items-center justify-between">
            <span>Slippage</span>
            <span>
              {[1, 3, 5].map((p) => (
                <button key={p} onClick={() => setSlippagePct(p)}
                  className="ml-1 px-1.5 py-0.5 rounded border transition-colors"
                  style={slippagePct === p
                    ? { background: "#F59E0B20", color: "#F59E0B", borderColor: "#F59E0B40" }
                    : { color: "#64748b", borderColor: "#1A1A2E" }}>
                  {p}%
                </button>
              ))}
            </span>
          </div>

          {quote?.pool && (
            <div className="text-[9px] text-slate-600 mb-2">
              Pool <a href={`${RH_EXPLORER}/address/${quote.pool.address}`} target="_blank" rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-200 underline">{quote.pool.address.slice(0, 6)}…{quote.pool.address.slice(-4)}</a>
              {" · "}fee {(quote.pool.fee / 10000).toFixed(2)}%
            </div>
          )}

          {loadingQuote && <p className="text-[9px] text-slate-600 mb-2">Checking pools + prices…</p>}
          {quote?.ok && quote.hasPool === false && (
            <p className="text-[10px] text-amber-400 mb-2">
              No Uniswap V3 pool for {tokenSym}/WETH on Robinhood Chain yet. The deployer needs to seed one.
            </p>
          )}
          {quote?.error && <p className="text-[10px] text-amber-400 mb-2">Quote error: {quote.error}</p>}
          {step === "error" && <p className="text-[10px] text-amber-400 mb-2">{err}</p>}

          <button onClick={doSwap} disabled={!canSwap || busy}
            className="w-full text-[12px] font-bold py-2.5 rounded-lg transition-all disabled:opacity-50"
            style={direction === "buy"
              ? { background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E40" }
              : { background: "#EF444415", color: "#EF4444", border: "1px solid #EF444440" }}>
            {!isConnected ? "Connect your wallet"
              : busy ? (step === "approving" ? "Approve in wallet…" : "Confirm in wallet…")
              : quote?.hasPool === false ? "No pool yet"
              : overBalance ? "Insufficient balance"
              : direction === "buy"
                ? `Buy ${tokenSym}${amt > 0 ? ` with ${fmtNum(amt)} ETH` : ""}`
                : `Sell ${amt > 0 ? fmtNum(amt) : ""} ${tokenSym}`}
          </button>
        </>
      )}
    </div>
  );
}
