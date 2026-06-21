"use client";

// BlueBank dashboard — 3-column layout: sidebar | center | right panel.
// Non-custodial Base neobank: real on-chain balances (wagmi), live yield rates
// (DefiLlama), real transactions (Moralis). Nothing is fabricated.

import { useState, useEffect, useRef } from "react";
import { useAccount, useReadContract, useBalance, useConnect, useDisconnect } from "wagmi";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  YIELD_NETWORKS, ERC20_ABI, AAVE_POOL_ABI, ERC4626_ABI, VENUES, supplyApyPct,
  type YieldNetwork,
} from "@/lib/yield-execution";
import { MoveToYieldCard, SendCard } from "@/app/chat/components/ToolCards";
import { useBasename, shortAddr } from "@/lib/useBasename";
import QrScanner from "./QrScanner";
import SwapCard from "./SwapCard";
import { parsePaymentQr, buildPaymentUri, type ParsedPayment } from "@/lib/payment-qr";
import OrdersPanel from "./OrdersPanel";
import { B20_ENABLED } from "@/lib/orders";
import TransactionHistory, { type WalletTx } from "./TransactionHistory";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Panel = "positions" | "earn" | "send" | "receive" | "convert" | "orders";

export default function BankPage() {
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;
  const { name } = useBasename(acct);
  const [fname, setFname] = useState<string | null>(null);
  useEffect(() => {
    if (!acct || name) { setFname(null); return; }
    fetch(`https://hub.pinata.cloud/v1/userDataByVerification?address=${acct}`)
      .then(r => r.json())
      .then(d => {
        const messages = d?.messages ?? [];
        const fid = messages[0]?.data?.fid;
        if (!fid) return;
        return fetch(`https://hub.pinata.cloud/v1/userDataByFid?fid=${fid}&user_data_type=6`)
          .then(r2 => r2.json())
          .then(d2 => {
            const v = d2?.messages?.[0]?.data?.userDataBody?.value;
            if (v) setFname(v);
          });
      })
      .catch(() => null);
  }, [acct, name]);
  const { disconnect } = useDisconnect();
  const [network, setNetwork] = useState<YieldNetwork>("baseSepolia");
  const [panel, setPanel]     = useState<Panel>("positions");
  const [actionOpen, setActionOpen] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const openAction = (p: Panel) => {
    if (p === "send") { setScanPrefill(null); setScanKey(k => k + 1); }
    setPanel(p); setActionOpen(true);
  };

  // Scan-to-pay
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<ParsedPayment | null>(null);
  const [scanKey, setScanKey] = useState(0);
  function handleScan(text: string): string | void {
    const p = parsePaymentQr(text);
    if (!p || !p.to) return "Not a Base address or payment QR";
    setScanPrefill(p);
    setScanKey(k => k + 1);
    setPanel("send");
    setScanOpen(false);
    setActionOpen(true);
  }

  // Receive request
  const [reqAmount, setReqAmount] = useState("");
  const [reqAsset, setReqAsset] = useState<"USDC" | "ETH">("USDC");

  // Coinbase Onramp — add cash
  const [onrampBusy, setOnrampBusy] = useState(false);
  const [onrampMsg, setOnrampMsg]   = useState("");
  async function addCash() {
    if (!acct) return;
    setOnrampBusy(true); setOnrampMsg("");
    try {
      const j = await fetch(`/api/onramp/session?address=${acct}`).then(r => r.json());
      if (j.needsKey) { setOnrampMsg("Add cash needs a CDP key"); return; }
      if (j.error || !j.sessionToken) { setOnrampMsg(j.error || "couldn't start onramp"); return; }
      const url = `https://pay.coinbase.com/buy/select-asset?sessionToken=${encodeURIComponent(j.sessionToken)}&defaultAsset=USDC&defaultNetwork=base&presetFiatAmount=25&fiatCurrency=USD`;
      window.open(url, "_blank", "popup,width=470,height=720");
    } catch { setOnrampMsg("onramp failed"); }
    finally { setOnrampBusy(false); }
  }

  // Coinbase Offramp — cash out
  const [cashOutBusy, setCashOutBusy] = useState(false);
  async function cashOut() {
    if (!acct) return;
    setCashOutBusy(true); setOnrampMsg("");
    try {
      const j = await fetch(`/api/onramp/session?address=${acct}`).then(r => r.json());
      if (j.needsKey) { setOnrampMsg("Cash out needs a CDP key"); return; }
      if (j.error || !j.sessionToken) { setOnrampMsg(j.error || "couldn't start cash out"); return; }
      const url = `https://pay.coinbase.com/v3/sell/input?sessionToken=${encodeURIComponent(j.sessionToken)}&defaultAsset=USDC&defaultNetwork=base&fiatCurrency=USD`;
      window.open(url, "_blank", "popup,width=470,height=720");
    } catch { setOnrampMsg("cash out failed"); }
    finally { setCashOutBusy(false); }
  }

  const net = YIELD_NETWORKS[network];
  const chainId = net.chainId;
  const morphoVnet = VENUES.morpho.nets[network];

  // ── Live on-chain reads ──────────────────────────────────────────────────
  const { data: walletRaw } = useReadContract({
    address: net.usdc, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct },
  });
  const { data: ethRaw } = useBalance({ address: acct, chainId, query: { enabled: !!acct } });
  const { data: aaveRaw } = useReadContract({
    address: net.aUsdc, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct },
  });
  const { data: aaveReserve } = useReadContract({
    address: net.pool, abi: AAVE_POOL_ABI, functionName: "getReserveData",
    args: [net.usdc], chainId,
  });
  const { data: morphoRaw } = useReadContract({
    address: morphoVnet?.target, abi: ERC4626_ABI, functionName: "maxWithdraw",
    args: acct ? [acct] : undefined, chainId,
    query: { enabled: !!acct && !!morphoVnet },
  });

  const walletUsdc = walletRaw != null ? Number(formatUnits(walletRaw as bigint, net.usdcDecimals)) : null;
  const ethBal     = ethRaw ? Number(formatUnits(ethRaw.value, ethRaw.decimals)) : null;
  const aavePos    = aaveRaw != null ? Number(formatUnits(aaveRaw as bigint, 6)) : null;
  const morphoPos  = morphoRaw != null ? Number(formatUnits(morphoRaw as bigint, 6)) : null;
  const aaveApy    = aaveReserve ? supplyApyPct((aaveReserve as { currentLiquidityRate: bigint }).currentLiquidityRate) : null;

  // ── Best yield rate (DefiLlama) ──────────────────────────────────────────
  type Rate = { project: string; label: string; apy: number };
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/rates").then(r => r.json()).then(d => { if (!off) setRates((d?.rates as Rate[]) ?? []); }).catch(() => {});
    return () => { off = true; };
  }, []);
  const bestApy   = rates && rates.length ? rates[0].apy : null;
  const morphoApy = rates?.find(r => r.project === "morpho-blue")?.apy ?? null;

  // Morpho 30d APY sparkline for sidebar
  const [hist, setHist] = useState<{ points: number[]; current: number | null } | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/morpho-history").then(r => r.json()).then(d => { if (!off) setHist({ points: d.points ?? [], current: d.current ?? null }); }).catch(() => {});
    return () => { off = true; };
  }, []);

  // ── Real wallet history (Moralis) ────────────────────────────────────────
  type TxStats = { transferCountMonth: number; netFlowUsdcMonth: number; gasSavedUsd: number | null };
  const [txData, setTxData] = useState<{ transactions: WalletTx[]; stats?: TxStats; needsKey?: boolean; error?: string } | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError]     = useState(false);
  const [txReload, setTxReload]   = useState(0);
  useEffect(() => {
    if (!acct) { setTxData(null); return; }
    let off = false;
    setTxLoading(true); setTxError(false);
    fetch(`/api/wallet/transactions?address=${acct}&network=${network}`)
      .then(r => r.json())
      .then(d => { if (!off) { setTxData(d); setTxLoading(false); } })
      .catch(() => { if (!off) { setTxError(true); setTxLoading(false); } });
    return () => { off = true; };
  }, [acct, network, txReload]);

  const inYield = (aavePos ?? 0) + (morphoPos ?? 0);
  const total   = (walletUsdc ?? 0) + inYield;

  // Stats from real wallet history (this calendar month)
  const netFlowMonth      = txData?.stats?.netFlowUsdcMonth ?? 0;
  const transferCountMonth = txData?.stats?.transferCountMonth ?? 0;

  // ── AI Chat popup ────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]       = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  async function sendChat(input: string) {
    if (!input.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: input.trim() };
    const historySnapshot = [...chatMessages, userMsg];
    setChatMessages(historySnapshot);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historySnapshot,
          system: `You are BlueAgent Banking assistant. User: ${name ?? shortAddr(acct)}. Balance: $${usd(total)} · USDC: $${usd(walletUsdc)} · In yield: $${usd(inYield)} at ${bestApy?.toFixed(1) ?? "—"}%. ETH: ${ethBal?.toFixed(4) ?? "—"}. Answer concisely in 2-3 sentences. Focus on Base DeFi and banking.`,
          model: "fast",
        }),
      });
      if (!res.ok || !res.body) throw new Error("no body");
      // SSE stream — accumulate text_delta events
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { type?: string; delta?: { text?: string } };
            if (parsed.type === "text_delta" && parsed.delta?.text) {
              accumulated += parsed.delta.text;
              setChatMessages(prev => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { role: "assistant", content: accumulated };
                return msgs;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
      if (!accumulated) {
        setChatMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { role: "assistant", content: "Sorry, couldn't get a response. Try again." };
          return msgs;
        });
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function copyAddr() {
    if (!acct) return;
    navigator.clipboard?.writeText(acct).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  function sharePayLink() {
    if (!acct) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const qs = new URLSearchParams({ asset: reqAsset, network });
    if (parseFloat(reqAmount) > 0) qs.set("amount", reqAmount);
    const url = `${origin}/pay/${acct}?${qs.toString()}`;
    const title = parseFloat(reqAmount) > 0 ? `Pay me ${reqAmount} ${reqAsset} on Base` : "Pay me on Base";
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); });
    }
  }

  if (!isConnected) {
    return <BankLanding bestApy={bestApy} />;
  }

  const TABS: { id: Panel; label: string; icon: string; desc: string }[] = [
    { id: "positions", label: "Positions", icon: "📊", desc: "Your yield" },
    { id: "earn",      label: "Earn",      icon: "🌾", desc: "Grow USDC" },
    { id: "send",      label: "Send",      icon: "➡",  desc: "Pay anyone" },
    { id: "receive",   label: "Receive",   icon: "⬇",  desc: "Get paid" },
    { id: "convert",   label: "Convert",   icon: "⇅",  desc: "Swap tokens" },
    ...(B20_ENABLED ? [{ id: "orders" as Panel, label: "Orders", icon: "🧾", desc: "Get paid in B20" }] : []),
  ];

  // ── Portfolio allocation (for pie chart) ─────────────────────────────────
  const stableTotal   = (walletUsdc ?? 0) + (aavePos ?? 0) + (morphoPos ?? 0);
  const ethUsd        = (ethBal ?? 0) * 2500;
  const portfolioTotal = stableTotal + ethUsd;
  const portfolioData = [
    { name: "Stablecoin", value: stableTotal, color: "#4FC3F7" },
    { name: "ETH",        value: ethUsd,      color: "#94A3B8" },
  ].filter(d => d.value > 0);

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 h-full border-r border-[#1A1A2E] bg-[#050508] overflow-y-auto">
        <div className="px-5 h-14 flex items-center border-b border-[#1A1A2E] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse shrink-0 mr-2" />
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUEBANK</p>
        </div>

        {/* Earning widget */}
        <div className="m-3 rounded-xl border border-[#1A1A2E] bg-gradient-to-b from-[#0d1117] to-[#0a0a0f] p-3.5">
          <div className="font-mono text-[9px] text-slate-500 tracking-wide">EARNING</div>
          <div className="font-mono text-[20px] font-bold text-[#34D399] mt-0.5">${usd(inYield)}</div>
          <div className="font-mono text-[9px] text-slate-600 mt-0.5 mb-2">
            best rate {bestApy != null ? `${bestApy.toFixed(1)}%` : "—"} · via Aave · Morpho
          </div>
          <Spark points={hist?.points ?? []} color="#34D399" height={28} />
          <div className="font-mono text-[8px] text-slate-700 mt-1">Morpho USDC · 30d APY trend</div>
        </div>

        <div className="flex-1" />

        {/* Network */}
        <div className="px-3 pb-3">
          <div className="font-mono text-[9px] text-slate-600 mb-1.5">NETWORK</div>
          <div className="flex gap-1">
            {(["baseSepolia", "base"] as const).map(nk => (
              <button key={nk} onClick={() => setNetwork(nk)}
                className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                style={network === nk
                  ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                  : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                {nk === "base" ? "Mainnet" : "Sepolia"}
              </button>
            ))}
          </div>
        </div>

        {/* Account chip */}
        <div className="px-4 py-3 border-t border-[#1A1A2E]">
          <div className="font-mono text-[11px] text-slate-300 truncate">{name ?? fname ?? shortAddr(acct)}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">Basescan ↗</a>
            <span className="text-slate-700 text-[9px]">·</span>
            <button onClick={() => disconnect()}
              className="font-mono text-[9px] text-slate-600 hover:text-red-400 transition-colors">Disconnect</button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Page header */}
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3 border-b border-[#1A1A2E] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Identicon address={acct} />
            <div className="min-w-0">
              <p className="font-mono text-[13px] text-white truncate">Welcome back, <span className="text-[#4FC3F7]">{name ?? fname ?? shortAddr(acct)}</span></p>
              <p className="font-mono text-[9px] text-slate-600 truncate">Your account on Base · you hold the keys</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {["Non-custodial", "Base", "Passkey"].map(c => (
              <span key={c} className="font-mono text-[9px] px-2 py-1 rounded-md text-slate-400" style={{ border: "1px solid #1A1A2E", background: "#0d0d12" }}>{c}</span>
            ))}
            {new Date() >= new Date("2026-06-25") && (
              <span className="font-mono text-[9px] px-2 py-1 rounded-md font-bold" style={{ color: "#4FC3F7", border: "1px solid #4FC3F730", background: "#4FC3F710" }}>⚡ Beryl</span>
            )}
          </div>
        </div>

        {/* Body — center + right panel */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── CENTER — scrollable ───────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* ── Balance hero ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
              <div className="font-mono text-[9px] text-slate-500 mb-1">TOTAL BALANCE · {net.short}</div>
              <div className="font-mono text-[36px] font-bold text-[#34D399] leading-none">
                ${usd(total)}
              </div>
              {netFlowMonth !== 0 && (
                <div className="font-mono text-[10px] mt-1"
                  style={{ color: netFlowMonth >= 0 ? "#34D399" : "#EF4444" }}>
                  {netFlowMonth >= 0 ? "+" : "−"}${usd(Math.abs(netFlowMonth))} this month
                  {transferCountMonth > 0 && ` · ${transferCountMonth} transfers`}
                </div>
              )}

              {/* Asset pills */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {(walletUsdc ?? 0) > 0 && <AssetPill label="USDC" value={`$${usd(walletUsdc)}`} color="#4FC3F7" />}
                {(aavePos ?? 0) > 0   && <AssetPill label="aUSDC" value={`$${usd(aavePos)}`} color="#34D399" />}
                {(morphoPos ?? 0) > 0 && <AssetPill label="Morpho" value={`$${usd(morphoPos)}`} color="#A78BFA" />}
                {ethBal != null        && <AssetPill label="ETH" value={ethBal.toFixed(4)} color="#94A3B8" />}
              </div>

              {/* Primary CTAs */}
              <div className="flex gap-2 mt-2">
                <button onClick={() => openAction("receive")}
                  className="flex-1 font-mono text-[11px] font-bold py-2.5 rounded-xl transition-colors"
                  style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
                  ⬇ Receive
                </button>
                <button onClick={() => openAction("send")}
                  className="flex-1 font-mono text-[11px] font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                  style={{ background: "#4FC3F7", color: "#050508" }}>
                  ➡ Send
                </button>
              </div>

              {/* Secondary actions — icon only, no Add cash (moved below) */}
              <div className="flex gap-1 mt-1.5">
                {TABS.filter(t => !["send", "receive"].includes(t.id)).map(tb => (
                  <button key={tb.id} onClick={() => openAction(tb.id)}
                    className="flex-1 font-mono text-[9px] py-1 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 hover:border-[#4FC3F7]/20 flex flex-col items-center gap-0.5 transition-colors"
                    style={{ background: "#050508" }}>
                    <span>{tb.icon}</span>
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Add cash — compact row below hero */}
            <div className="flex gap-2 mb-3">
              <button onClick={addCash} disabled={onrampBusy || !isConnected}
                className="flex-1 font-mono text-[10px] font-bold py-1.5 rounded-xl disabled:opacity-40 transition-opacity hover:opacity-80"
                style={{ background: "#4FC3F708", color: "#4FC3F7", border: "1px solid #4FC3F720" }}>
                {onrampBusy ? "Starting…" : "💵 Add cash"}
              </button>
              <button onClick={cashOut} disabled={cashOutBusy || !isConnected}
                className="flex-1 font-mono text-[10px] py-1.5 rounded-xl text-slate-500 disabled:opacity-40 transition-opacity hover:text-slate-300"
                style={{ border: "1px solid #1A1A2E" }}>
                {cashOutBusy ? "…" : "🏦 Cash out"}
              </button>
            </div>
            {onrampMsg && <div className="font-mono text-[9px] text-amber-400 -mt-1.5 mb-3">{onrampMsg}</div>}

            {/* ── AI Copilot ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-500">🤖 AI COPILOT</span>
                  <span className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                    BlueAgent
                  </span>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                {/* Idle USDC */}
                {(walletUsdc ?? 0) > 100 && inYield === 0 && bestApy != null && (
                  <AISuggestion icon="📈"
                    text={`$${usd(walletUsdc)} USDC idle. Earn ${bestApy.toFixed(1)}% on Aave/Morpho.`}
                    action="Earn now" onAction={() => openAction("earn")} color="#34D399" />
                )}
                {/* Earning */}
                {inYield > 0 && bestApy != null && (
                  <AISuggestion icon="✅"
                    text={`$${usd(inYield)} earning ${bestApy.toFixed(1)}% · +$${((inYield * bestApy / 100) / 12).toFixed(0)}/month`}
                    color="#34D399" />
                )}
                {/* Low ETH */}
                {ethBal != null && ethBal < 0.005 && (
                  <AISuggestion icon="⛽"
                    text="ETH balance low — may not have enough for gas fees."
                    color="#F87171" />
                )}
                {/* Beryl B20 */}
                {new Date() >= new Date("2026-06-25") && (
                  <AISuggestion icon="⚡"
                    text="B20 payments live. Send with memo for onchain invoice tracking."
                    action="Try B20" onAction={() => openAction("orders")} color="#4FC3F7" />
                )}
                {/* Fallback */}
                {(walletUsdc ?? 0) === 0 && inYield === 0 && (
                  <AISuggestion icon="💡"
                    text="Add USDC to start earning yield on Base."
                    action="Add cash" onAction={addCash} color="#F59E0B" />
                )}
              </div>

              <button onClick={() => setChatOpen(true)}
                className="w-full font-mono text-[10px] font-bold py-2 rounded-xl transition-opacity hover:opacity-80"
                style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                💬 Ask BlueAgent
              </button>
            </div>

            {/* ── Onchain Activity ──────────────────────────────────── */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-3">ONCHAIN ACTIVITY</div>
              <div className="grid grid-cols-3 gap-2">
                <StatMini
                  label="TRANSFERS"
                  value={transferCountMonth || "—"}
                  sub="this month"
                  color="#4FC3F7"
                />
                <StatMini
                  label="GAS SAVED"
                  value={transferCountMonth > 0 ? `$${(transferCountMonth * 0.001 * 2500).toFixed(2)}` : "—"}
                  sub="vs mainnet est."
                  color="#34D399"
                />
                <StatMini
                  label="NET FLOW"
                  value={netFlowMonth !== 0 ? `${netFlowMonth >= 0 ? "+" : "−"}$${usd(Math.abs(netFlowMonth))}` : "—"}
                  sub="USDC this month"
                  color={netFlowMonth >= 0 ? "#34D399" : "#F87171"}
                />
              </div>
            </div>

            {/* ── Wallet Identity ───────────────────────────────────── */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-3">WALLET IDENTITY</div>
              <div className="flex flex-wrap gap-1.5">
                <IdentityChip label="Smart Wallet" active={true} color="#4FC3F7" />
                <IdentityChip label="Passkey" active={true} color="#34D399" />
                <IdentityChip label={name ?? fname ?? "No Basename"} active={!!(name ?? fname)} color="#A78BFA" />
                <IdentityChip label="Non-custodial" active={true} color="#34D399" />
                <IdentityChip label="Base" active={true} color="#4FC3F7" />
              </div>
            </div>

            {/* Transaction history — fills remaining center */}
            <TransactionHistory
              transactions={txData?.transactions ?? []}
              loading={txLoading}
              error={txError}
              needsKey={txData?.needsKey}
              onRetry={() => setTxReload(k => k + 1)}
              explorer={net.explorer}
              address={acct}
            />

            {/* Action modal */}
            {actionOpen && (
              <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] p-4">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setActionOpen(false)} />
                <div className="relative z-10 w-full max-w-md h-[580px] max-h-[85vh] rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl flex flex-col">
                  <div className="flex items-center gap-1 p-3 border-b border-[#1A1A2E] shrink-0">
                    {TABS.map(tb => (
                      <button key={tb.id} onClick={() => { if (tb.id === "send") { setScanPrefill(null); setScanKey(k => k + 1); } setPanel(tb.id); }}
                        className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                        style={panel === tb.id
                          ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                          : { color: "#64748b", border: "1px solid transparent" }}>
                        {tb.label}
                      </button>
                    ))}
                    <button onClick={() => setActionOpen(false)} className="ml-1 w-7 h-7 rounded-md font-mono text-[13px] text-slate-500 hover:text-white hover:bg-[#1A1A2E] shrink-0">✕</button>
                  </div>

                  <div className="overflow-y-auto p-4 min-h-0">
                    {panel === "positions" && (
                      <div>
                        <PositionRow label="Aave v3" pos={aavePos} apy={aaveApy} onManage={() => setPanel("earn")} />
                        <PositionRow label="Morpho · Gauntlet USDC Prime" pos={morphoPos} apy={morphoApy}
                          disabled={!morphoVnet} disabledNote="mainnet only" onManage={() => setPanel("earn")} />
                        <div className="mt-3 rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-3">
                          <div className="font-mono text-[9px] text-slate-600 mb-1.5">BEST SAFE RATE · BASE</div>
                          {rates && rates.length ? rates.slice(0, 3).map((r, i) => (
                            <div key={r.project} className="flex items-center justify-between py-0.5 font-mono text-[10px]">
                              <span className={i === 0 ? "text-[#34D399]" : "text-slate-400"}>{i === 0 ? "★ " : "  "}{r.label}</span>
                              <span className={i === 0 ? "text-[#34D399]" : "text-slate-300"}>{r.apy.toFixed(2)}%</span>
                            </div>
                          )) : <div className="font-mono text-[10px] text-slate-600">loading…</div>}
                        </div>
                        <button onClick={() => setPanel("earn")}
                          className="w-full font-mono text-[12px] font-bold py-2.5 rounded-xl mt-3"
                          style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>
                          🌾 {inYield > 0 ? "Manage yield" : "Start earning"}
                        </button>
                        <p className="font-mono text-[9px] text-slate-600 mt-2 leading-relaxed px-0.5">
                          Supply idle USDC into Aave or Morpho — non-custodial, you sign, withdraw anytime.
                        </p>
                      </div>
                    )}
                    {panel === "earn" && <MoveToYieldCard result={{ network }} account={acct} />}
                    {panel === "convert" && <SwapCard account={acct} />}
                    {panel === "orders" && <OrdersPanel />}
                    {panel === "send" && (
                      <div>
                        <button onClick={() => setScanOpen(true)}
                          className="w-full font-mono text-[11px] font-bold py-2 rounded-xl mb-3 flex items-center justify-center gap-2"
                          style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                          📷 Scan to pay
                        </button>
                        {scanPrefill && (
                          <div className="font-mono text-[9px] text-[#34D399] mb-2">
                            ✓ scanned{scanPrefill.amount ? ` · request ${scanPrefill.amount} ${scanPrefill.asset ?? "USDC"}` : ""} — confirm + sign below
                          </div>
                        )}
                        <SendCard key={scanKey}
                          result={{
                            network: scanPrefill?.network ?? network,
                            to: scanPrefill?.to,
                            amount: scanPrefill?.amount,
                            asset: scanPrefill?.asset,
                          }}
                          account={acct} />
                      </div>
                    )}
                    {panel === "receive" && (
                      <div>
                        <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3">RECEIVE · {net.short}</div>
                        <div className="flex items-center gap-1.5 mb-3">
                          <div className="flex gap-1">
                            {(["USDC", "ETH"] as const).map(a => (
                              <button key={a} onClick={() => setReqAsset(a)}
                                className="font-mono text-[10px] px-2.5 py-1.5 rounded-lg transition-colors"
                                style={reqAsset === a
                                  ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                                  : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                                {a}
                              </button>
                            ))}
                          </div>
                          <input value={reqAmount} onChange={e => setReqAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                            inputMode="decimal" placeholder="amount (optional)"
                            className="flex-1 bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-slate-200 placeholder:text-slate-700 outline-none" />
                          {reqAmount && (
                            <button onClick={() => setReqAmount("")} className="font-mono text-[10px] px-2 py-1.5 rounded-lg text-slate-500 hover:text-white border border-[#1A1A2E]">✕</button>
                          )}
                        </div>
                        <div className="flex flex-col items-center text-center">
                          <div className="bg-white p-2.5 rounded-xl">
                            <QRCodeSVG value={acct ? buildPaymentUri({ to: acct, amount: reqAmount, asset: reqAsset, network }) : ""} size={180} bgColor="#ffffff" fgColor="#0a0a0f" level="M" />
                          </div>
                          {parseFloat(reqAmount) > 0 && (
                            <div className="font-mono text-[12px] text-[#34D399] mt-3 font-bold">requesting {reqAmount} {reqAsset}</div>
                          )}
                          {name && <div className="font-mono text-[13px] text-[#4FC3F7] mt-2">{name}</div>}
                          <div className="font-mono text-[9px] text-slate-400 mt-1.5 break-all px-2">{acct}</div>
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={copyAddr} className="font-mono text-[11px] px-4 py-2 rounded-lg" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                              {copied ? "✓ Copied" : "Copy address"}
                            </button>
                            <button onClick={sharePayLink} className="font-mono text-[11px] px-4 py-2 rounded-lg" style={{ background: "#34D39910", color: "#34D399", border: "1px solid #34D39930" }}>
                              {linkCopied ? "✓ Link copied" : "🔗 Share pay link"}
                            </button>
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-2.5 mt-4">
                          <p className="font-mono text-[9px] text-slate-500 leading-relaxed">
                            {parseFloat(reqAmount) > 0
                              ? <>Payment-request QR — a payer scanning it (BlueBank <b className="text-slate-300">Scan to pay</b>, or any EIP-681 wallet) gets <b className="text-slate-300">{reqAmount} {reqAsset}</b> prefilled.</>
                              : <>Scan the QR with any wallet, or set an amount above to make a payment request. <b className="text-slate-300">USDC / ETH on Base</b> ({net.short}) only.</>}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Scan-to-pay camera overlay */}
            {scanOpen && <QrScanner onResult={handleScan} onClose={() => setScanOpen(false)} />}

          </div>

          {/* ── RIGHT PANEL — hidden on mobile ───────────────────────── */}
          <aside className="hidden xl:flex flex-col w-64 shrink-0 border-l border-[#1A1A2E] overflow-y-auto p-4 gap-3">

            {/* 1. Your Assets */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">WALLET</div>
              <AssetRow label="USDC" sub="in wallet" usd={walletUsdc} color="#4FC3F7" />
              <AssetRow label="aUSDC" sub={`Aave · ${aaveApy != null ? `${aaveApy.toFixed(1)}%` : bestApy != null ? `${bestApy.toFixed(1)}%` : "—"} APY`} usd={aavePos} color="#34D399" />
              {(morphoPos ?? 0) > 0 && (
                <AssetRow label="Morpho" sub={`Gauntlet · ${morphoApy != null ? `${morphoApy.toFixed(1)}%` : "—"} APY`} usd={morphoPos} color="#A78BFA" />
              )}
              <div className="flex items-center justify-between py-2 border-t border-[#1A1A2E] mt-1">
                <div>
                  <div className="font-mono text-[11px] text-slate-200">ETH</div>
                  <div className="font-mono text-[9px] text-slate-600">gas</div>
                </div>
                <div className="font-mono text-[11px] text-slate-300">{ethBal != null ? ethBal.toFixed(4) : "—"}</div>
              </div>
            </div>

            {/* 2. Portfolio Allocation (pie chart) */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">PORTFOLIO ALLOCATION</div>
              {portfolioData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={100}>
                    <PieChart>
                      <Pie data={portfolioData} cx="50%" cy="50%"
                        innerRadius={28} outerRadius={44}
                        dataKey="value" paddingAngle={2}>
                        {portfolioData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`$${usd(v as number)}`, ""]}
                        contentStyle={{ background: "#0a0a0f", border: "1px solid #1A1A2E", fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-3 justify-center mt-1">
                    {portfolioData.map(d => (
                      <div key={d.name} className="flex items-center gap-1 font-mono text-[9px] text-slate-400">
                        <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        {d.name} {portfolioTotal > 0 ? Math.round(d.value / portfolioTotal * 100) : 0}%
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="font-mono text-[10px] text-slate-600 py-2">No assets yet</div>
              )}
            </div>

            {/* 3. Yield Center */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[9px] text-slate-500">⭐ EARN</span>
                {bestApy != null && (
                  <span className="font-mono text-[9px] text-[#34D399]">Best: {bestApy.toFixed(1)}%</span>
                )}
              </div>
              {rates && rates.length ? rates.slice(0, 3).map((r, i) => (
                <div key={r.project}
                  className="flex items-center justify-between py-1.5 border-b border-[#1A1A2E] last:border-0">
                  <span className="font-mono text-[10px]" style={{ color: i === 0 ? "#34D399" : "#94A3B8" }}>
                    {i === 0 ? "★ " : ""}{r.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold" style={{ color: i === 0 ? "#34D399" : "#94A3B8" }}>
                      {r.apy.toFixed(2)}%
                    </span>
                    {i === 0 && (
                      <button onClick={() => openAction("earn")}
                        className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                        style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39930" }}>
                        Earn →
                      </button>
                    )}
                  </div>
                </div>
              )) : <div className="font-mono text-[10px] text-slate-600">loading rates…</div>}
              {(walletUsdc ?? 0) > 100 && inYield === 0 && bestApy != null && (
                <div className="mt-2 p-2 rounded-lg font-mono"
                  style={{ background: "#F59E0B08", border: "1px solid #F59E0B20" }}>
                  <div className="text-[9px] text-[#F59E0B]">💡 Idle cash detected</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    +${(((walletUsdc ?? 0) * bestApy / 100) / 12).toFixed(0)}/month potential
                  </div>
                </div>
              )}
            </div>

            {/* 4. Base Ecosystem */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">BASE APPS</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: "Aerodrome", url: "https://aerodrome.finance",    color: "#EF4444" },
                  { name: "Moonwell",  url: "https://moonwell.fi",          color: "#A78BFA" },
                  { name: "Morpho",    url: "https://morpho.org",           color: "#4FC3F7" },
                  { name: "Uniswap",   url: "https://app.uniswap.org",      color: "#FF007A" },
                  { name: "Aave",      url: "https://app.aave.com",         color: "#B6509E" },
                  { name: "Compound",  url: "https://app.compound.finance", color: "#00D395" },
                ].map(p => (
                  <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[8px] py-1.5 px-1 rounded-lg text-center hover:opacity-80 transition-opacity"
                    style={{ background: `${p.color}10`, color: p.color, border: `1px solid ${p.color}25` }}>
                    {p.name}
                  </a>
                ))}
              </div>
            </div>

            {/* 5. Add cash */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">ADD CASH</div>
              <div className="font-mono text-[10px] text-slate-400 mb-2">Buy USDC with card or bank</div>
              <button onClick={addCash} disabled={onrampBusy || !isConnected}
                className="w-full font-mono text-[10px] font-bold py-2 rounded-lg disabled:opacity-40"
                style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                {onrampBusy ? "Starting…" : "💵 Add cash"}
              </button>
              <button onClick={cashOut} disabled={cashOutBusy || !isConnected}
                className="w-full font-mono text-[10px] py-1.5 rounded-lg mt-1 text-slate-500 disabled:opacity-40"
                style={{ border: "1px solid #1A1A2E" }}>
                {cashOutBusy ? "…" : "🏦 Cash out"}
              </button>
            </div>

            {/* 6. Beryl — date-gated */}
            {new Date() >= new Date("2026-06-25") && (
              <div className="rounded-xl p-3" style={{ background: "#4FC3F708", border: "1px solid #4FC3F730" }}>
                <div className="font-mono text-[9px] text-[#4FC3F7] font-bold mb-1">⚡ Beryl is live</div>
                <div className="font-mono text-[9px] text-slate-400 space-y-0.5">
                  <div>→ B20 payments with memo</div>
                  <div>→ L1 withdrawals: 5 days (was 7)</div>
                </div>
                <button onClick={() => openAction("orders")}
                  className="w-full font-mono text-[9px] font-bold py-1.5 rounded-lg mt-2"
                  style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                  Try B20 payments →
                </button>
              </div>
            )}

          </aside>

        </div>
      </main>

      {/* ── AI Chat popup — fixed bottom-right ──────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-4 right-4 z-[60] w-80 h-[420px] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1A1A2E] shrink-0"
            style={{ background: "#4FC3F708" }}>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
              <span className="font-mono text-[11px] text-[#4FC3F7] font-bold">BlueAgent</span>
              <span className="font-mono text-[9px] text-slate-600">Banking mode</span>
            </div>
            <button onClick={() => setChatOpen(false)}
              className="font-mono text-slate-500 hover:text-white text-sm w-6 h-6 flex items-center justify-center rounded">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] text-slate-600 mb-2">Ask anything about your wallet:</div>
                {["What's my best yield option?", "How do I send USDC?", "Show my balance breakdown"].map(q => (
                  <button key={q} onClick={() => sendChat(q)}
                    className="w-full text-left font-mono text-[10px] px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                    style={{ background: "#0d0d12", border: "1px solid #1A1A2E" }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`font-mono text-[10px] p-2 rounded-lg leading-relaxed ${
                m.role === "user"
                  ? "ml-6 bg-[#4FC3F715] text-[#4FC3F7] border border-[#4FC3F730]"
                  : "mr-6 bg-[#0d0d12] text-slate-300 border border-[#1A1A2E]"
              }`}>
                {m.content || (m.role === "assistant" && <span className="text-slate-600 animate-pulse">▌</span>)}
              </div>
            ))}
            {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
              <div className="font-mono text-[10px] text-slate-600 p-2">thinking…</div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-2.5 border-t border-[#1A1A2E] shrink-0">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat(chatInput)}
              placeholder="Ask anything…"
              className="flex-1 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40"
            />
            <button onClick={() => sendChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
              className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: "#4FC3F7", color: "#050508" }}>
              →
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Identicon({ address }: { address?: string }) {
  const hue = (s: string, fallback: number) => {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n % 360 : fallback;
  };
  const a = address ?? "0x000000";
  const h1 = hue(a.slice(2, 6), 200);
  const h2 = hue(a.slice(-4), 280);
  return (
    <span className="w-8 h-8 rounded-full shrink-0 border border-[#1A1A2E]"
      style={{ background: `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 45%))` }} />
  );
}

function AssetPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="font-mono text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
      <span className="text-slate-500">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function AssetRow({ label, sub, usd: val, color }: { label: string; sub: string; usd: number | null; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#13131f] last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <div>
          <div className="font-mono text-[12px] text-slate-200">{label}</div>
          <div className="font-mono text-[9px] text-slate-600">{sub}</div>
        </div>
      </div>
      <div className="font-mono text-[12px] text-slate-300">{val != null ? `$${usd(val)}` : "—"}</div>
    </div>
  );
}

function AISuggestion({ icon, text, action, onAction, color }: {
  icon: string; text: string; action?: string; onAction?: () => void; color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-lg"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm shrink-0">{icon}</span>
        <span className="font-mono text-[10px] text-slate-300 truncate">{text}</span>
      </div>
      {action && onAction && (
        <button onClick={onAction}
          className="font-mono text-[9px] px-2 py-1 rounded-md shrink-0 font-bold"
          style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
          {action}
        </button>
      )}
    </div>
  );
}

function StatMini({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#050508] p-2.5">
      <div className="font-mono text-[9px] text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-[14px] font-bold" style={{ color }}>{value}</div>
      <div className="font-mono text-[8px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function IdentityChip({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <div className="font-mono text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1"
      style={active
        ? { background: `${color}15`, border: `1px solid ${color}30`, color }
        : { background: "#0d0d12", border: "1px solid #1A1A2E", color: "#475569" }}>
      {active && <span className="text-[8px]">✓</span>}
      {label}
    </div>
  );
}

// Dependency-free area sparkline for the sidebar
function Spark({ points, color, height = 48, fill = false }: { points: number[]; color: string; height?: number; fill?: boolean }) {
  if (!points || points.length < 2)
    return <div className="font-mono text-[10px] text-slate-700" style={fill ? { width: "100%" } : { height }}>loading chart…</div>;
  const w = 100, h = 48;
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / range) * h).toFixed(2)}`);
  const line = "M" + coords.join(" L");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={fill ? { width: "100%", height: "100%" } : { width: "100%", height }}>
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PositionRow({ label, pos, apy, onManage, disabled, disabledNote }: {
  label: string; pos: number | null; apy: number | null; onManage: () => void; disabled?: boolean; disabledNote?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#13131f] last:border-0">
      <div>
        <div className="font-mono text-[12px] text-slate-200">{label}</div>
        <div className="font-mono text-[10px] text-slate-600">
          {disabled ? <span className="text-slate-700">{disabledNote}</span>
            : <>{pos != null ? `${pos.toFixed(2)} USDC` : "—"}{apy != null && <span className="text-[#34D399]"> · ~{apy.toFixed(2)}%</span>}</>}
        </div>
      </div>
      {!disabled && (
        <button onClick={onManage} className="font-mono text-[10px] px-2.5 py-1 rounded-md text-[#4FC3F7]" style={{ border: "1px solid #4FC3F730" }}>
          Manage
        </button>
      )}
    </div>
  );
}

// ── Landing hero (shown until the wallet connects) ───────────────────────────
function BankLanding({ bestApy }: { bestApy: number | null }) {
  const apyText = bestApy != null ? `~${bestApy.toFixed(1)}%` : "up to ~5%";
  const features: { icon: string; title: string; body: string }[] = [
    { icon: "🔑", title: "Sign in with Face ID — no seed phrase", body: "Coinbase Smart Wallet: a passkey-secured account you create in one tap. Recoverable, no 12-word phrase to lose." },
    { icon: "📈", title: `Earn ${apyText} APY on idle USDC`, body: "Live rates across blue-chip lending (Aave · Morpho). Your USDC works while you sleep — no lockups." },
    { icon: "➡", title: "Send to any wallet or name.base", body: "Pay anyone on Base by address or Basename. Instant, 24/7, no cut-off times." },
    { icon: "🔒", title: "Non-custodial — you hold the keys", body: "You sign every transaction from your own wallet. BlueBank never holds your keys or funds." },
    { icon: "🌐", title: "On-chain, withdraw anytime", body: "Your money lives on Base, not in a silo. Pull it out whenever you want, in one click." },
  ];
  return (
    <div className="min-h-full bg-[#050508] flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-center">
        <div>
          <div className="font-mono text-[13px] tracking-widest text-[#4FC3F7] font-bold mb-3">🔵 BLUEBANK</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
            Banking that you<br />actually own.
          </h1>
          <p className="font-mono text-[12px] text-slate-400 leading-relaxed mb-5 max-w-md">
            Hold USDC, earn real yield, and move money on Base — <span className="text-slate-200">non-custodial</span>.
            You hold the keys; BlueBank only prepares the transaction, you sign it.
          </p>
          <div className="space-y-3">
            {features.map(f => (
              <div key={f.title} className="flex gap-3">
                <span className="text-base shrink-0">{f.icon}</span>
                <div>
                  <div className="font-mono text-[12px] text-slate-200">{f.title}</div>
                  <div className="font-mono text-[10px] text-slate-600 leading-relaxed">{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
          <div className="font-mono text-[14px] font-bold text-white mb-1">Open your account</div>
          <p className="font-mono text-[11px] text-slate-500 mb-5">Sign in with Face ID — no signup, no KYC, no custody. Your keys are secured by a passkey, not a seed phrase.</p>
          <ConnectButton />
          <div className="flex items-center gap-2 my-4">
            <div className="h-px flex-1 bg-[#1A1A2E]" /><span className="font-mono text-[9px] text-slate-700">SECURED BY YOU</span><div className="h-px flex-1 bg-[#1A1A2E]" />
          </div>
          <div className="flex items-center justify-center gap-4 font-mono text-[9px] text-slate-600">
            <span>🔒 Non-custodial</span><span>·</span><span>⛓ On Base</span><span>·</span><span>↩ Withdraw anytime</span>
          </div>
          <p className="font-mono text-[9px] text-slate-700 text-center mt-4">Powered by Base · Aave v3 · Morpho</p>
        </div>
      </div>
    </div>
  );
}

// Connect-wallet CTA
function ConnectButton() {
  const { connectors, connect, isPending } = useConnect();
  const [open, setOpen] = useState(false);

  const coinbase = connectors.find(c => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase"));

  const seen = new Set<string>();
  const wallets = connectors.filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const icon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("coinbase")) return "🔵";
    if (n.includes("metamask")) return "🦊";
    if (n.includes("rabby")) return "🐰";
    if (n.includes("phantom")) return "👻";
    return "💼";
  };

  return (
    <div className="relative">
      {coinbase && (
        <>
          <button onClick={() => connect({ connector: coinbase })} disabled={isPending}
            className="w-full font-mono text-[13px] font-bold py-3 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "#4FC3F7", color: "#050508" }}>
            {isPending ? "Connecting…" : <>🔵 Create a free wallet</>}
          </button>
          <div className="flex items-center justify-center gap-2 mt-2 font-mono text-[9px] text-slate-500">
            <span>Face ID</span><span>·</span><span>no seed phrase</span><span>·</span><span>no app to install</span>
          </div>
        </>
      )}
      <button onClick={() => setOpen(o => !o)} disabled={isPending}
        className="w-full font-mono text-[11px] text-slate-400 hover:text-slate-200 py-2.5 mt-3 rounded-xl border border-[#1A1A2E] transition-colors disabled:opacity-60">
        I already have a wallet
      </button>
      {open && (
        <>
          <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-[#1A1A2E] bg-[#0A0A12] shadow-2xl overflow-hidden">
            <p className="font-mono text-[10px] text-slate-600 px-3 pt-3 pb-2 tracking-widest">SELECT WALLET</p>
            {wallets.map(c => (
              <button key={c.uid} onClick={() => { connect({ connector: c }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#1A1A2E] transition-colors">
                <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">{icon(c.name)}</span>
                <span className="font-mono text-xs text-slate-200">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
