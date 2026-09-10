"use client";

// Send — in-app NON-CUSTODIAL transfer on Robinhood Chain (chainId 4663).
//
// Why this exists and is not the Base `SendCard`: that card types its own
// network as `YieldNetwork` (base | baseSepolia) and initialises it with
// `result.network === "base" ? "base" : "baseSepolia"`, so handing it
// "robinhood" does not degrade — it renders a Base Sepolia form under a
// Robinhood heading and would move the wrong funds on the wrong chain. See the
// `can.send` note in lib/wallet/chains.ts. This is the 4663-native equivalent:
// it speaks Robinhood Chain directly, reuses the SAME proven endpoint the chat
// card uses (/api/robinhood/router/send-prepare), and follows the same
// fail-closed balance rule as every other spend surface (useSpendableBalance +
// resolveSpend). Two assets: USDG (the chain's cash) and native ETH (its gas).
//
// The server only builds calldata — the user signs from their own wallet. No
// keys server-side, no funds touched.

import { useEffect, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress } from "viem";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";

const RH = WALLET_CHAINS.robinhood;
const RH_CHAIN_ID = RH.chainId; // 4663
const USDG = RH.stable; // 0x5fc5…d168, 6 decimals — read on-chain, never assumed

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

// Shape the send-prepare route returns (mirrors the chat card's PrepareResponse).
type PrepareResponse = {
  ok?: boolean;
  error?: string;
  tx?: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
  meta?: { kind: "native" | "erc20"; from: `0x${string}`; symbol: string; decimals: number; amountWei: string };
};

export default function RhSendCard({ account }: { account?: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [asset, setAsset] = useState<"USDG" | "ETH">("USDG");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<
    "idle" | "preparing" | "switching" | "signing" | "broadcasting" | "done" | "error"
  >("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");

  const isNative = asset === "ETH";
  const symbol = isNative ? "ETH" : RH.stableSymbol;

  // Balance of the sending asset, WITH its scale, through the one hook — so
  // "still reading" and "could not read" stay distinct and the gate fails
  // closed. USDG is 6 decimals; assuming 18 here is the exact bug the shared
  // hook was written to kill (see useSpendableBalance.ts).
  const bal = useSpendableBalance({
    holder: account, native: isNative, token: isNative ? undefined : USDG, chainId: RH_CHAIN_ID,
  });
  const balance = bal.balance;

  const recip = recipient.trim();
  const recipIsAddr = isAddress(recip);
  const amt = parseFloat(amount);

  // FAIL-CLOSED. `over` alone is false on an unread balance; resolveSpend
  // supplies the half that refuses to sign when the balance is merely unknown.
  const gate = resolveSpend({
    loading: bal.loading, received: bal.received, failed: bal.failed,
    over: balance != null && amt > balance,
  });
  const overBalance = gate === "insufficient";
  const valid = recipIsAddr && amt > 0 && gate === "ok";
  const busy = step === "preparing" || step === "switching" || step === "signing" || step === "broadcasting";

  function setMax() {
    if (balance == null) return; // the "Bal … Max" line is behind `balance != null`
    setAmount(String(isNative ? Math.max(0, balance - 0.00005) : balance)); // keep a little ETH for gas
  }

  // Watch the tx on the RH RPC until it mines.
  const { isSuccess: mined, isError: minedErr } = useWaitForTransactionReceipt({
    hash: txHash || undefined, chainId: RH_CHAIN_ID, query: { enabled: !!txHash },
  });
  useEffect(() => {
    if (mined && step === "broadcasting") setStep("done");
    if (minedErr && step === "broadcasting") { setStep("error"); setErr("Transaction reverted on-chain."); }
  }, [mined, minedErr, step]);

  async function send() {
    if (!account) { setErr("Connect your wallet"); setStep("error"); return; }
    if (!recipIsAddr) { setErr("Enter a valid 0x address"); setStep("error"); return; }
    if (!(amt > 0)) { setErr("Enter an amount"); setStep("error"); return; }
    // `valid` guards the CLICK; this guards the SIGNATURE. Same gate on purpose
    // — a stale render or keyboard submit must not reach a wallet prompt on an
    // unread or insufficient balance.
    if (gate !== "ok") {
      setErr(gate === "insufficient" ? `Amount exceeds your ${symbol} balance`
        : gate === "reading" ? "Still reading your balance — one moment"
        : "Couldn't read your balance — refusing to sign a transfer that may not settle");
      setStep("error"); return;
    }
    setErr(""); setTxHash("");
    try {
      setStep("preparing");
      const r = await fetch("/api/robinhood/router/send-prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAddress: account, toAddress: recip,
          token: isNative ? "ETH" : USDG, amount: String(amount),
        }),
      });
      const j = (await r.json()) as PrepareResponse;
      if (!r.ok || !j.ok || !j.tx) throw new Error(j.error || `Prepare failed (${r.status})`);

      setStep("switching");
      try { await switchChainAsync({ chainId: RH_CHAIN_ID }); }
      catch { throw new Error("Switch to Robinhood Chain (4663) and try again"); }

      setStep("signing");
      const hash = await sendTransactionAsync({
        to: j.tx.to, data: j.tx.data, value: BigInt(j.tx.value), chainId: RH_CHAIN_ID,
      });
      setTxHash(hash); setStep("broadcasting");
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Send cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Sent {fmt(amt)} {symbol} · {RH.short}
        </div>
        <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">to {recip}</div>
        {txHash && (
          <a href={`${RH.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
        )}
        <button onClick={() => { setStep("idle"); setAmount(""); setRecipient(""); setTxHash(""); }}
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 ml-3">Send again</button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest font-bold">SEND · {RH.short}</span>
        <span className="font-mono text-[9px] text-slate-600">{RH.label} · 4663</span>
      </div>

      {/* Asset — the chain's cash (USDG) or its gas token (ETH). */}
      <div className="flex gap-1 mb-2">
        {(["USDG", "ETH"] as const).map(a => (
          <button key={a} onClick={() => { setAsset(a); setAmount(""); }}
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
            style={asset === a
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#64748b", border: "1px solid #1A1A2E" }}>
            {a}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] text-slate-600">YOU SEND</span>
          {balance != null && (
            <span className="font-mono text-[9px] text-slate-600">Bal {balance.toFixed(isNative ? 5 : 2)}
              <button type="button" onClick={setMax} className="text-[#4FC3F7] ml-1">Max</button></span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0"
            className="flex-1 bg-transparent font-mono text-[16px] text-white outline-none placeholder:text-slate-700 w-0" />
          <span className="font-mono text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E]">{symbol}</span>
        </div>
        {overBalance && <div className="font-mono text-[9px] text-red-500 mt-1">Exceeds your {symbol} balance</div>}
      </div>

      {/* Recipient — a raw 0x address. Basenames are a Base concept (resolved by
          the Base L2 resolver) and are deliberately not offered here, so this
          card holds no cross-chain resolver dependency. */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mt-1 mb-3">
        <div className="font-mono text-[9px] text-slate-600 mb-1">RECIPIENT</div>
        <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x… address"
          spellCheck={false} autoCapitalize="none" autoCorrect="off"
          className="w-full bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-slate-700" />
        {recip.length > 0 && !recipIsAddr && (
          <div className="font-mono text-[9px] text-amber-400 mt-1">Enter a valid 0x address on Robinhood Chain.</div>
        )}
      </div>

      {gate === "unverified" && (
        <UnverifiedBalance symbol={symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
      )}
      {step === "broadcasting" && <p className="font-mono text-[10px] text-slate-400 mb-2">Broadcasting… waiting for the block.</p>}
      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <button onClick={send} disabled={!valid || busy}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
        {!isConnected ? "Connect your wallet"
          : busy
            ? (step === "preparing" ? "Preparing…"
              : step === "switching" ? "Switch network…"
              : step === "signing" ? "Confirm in wallet…"
              : "Broadcasting…")
            : gate === "unverified" ? "Balance unread — held"
            : overBalance ? "Insufficient balance"
            : `Send ${amt > 0 ? fmt(amt) : ""} ${symbol}`}
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">Robinhood Chain · you sign · non-custodial · 4663.</p>
    </div>
  );
}
