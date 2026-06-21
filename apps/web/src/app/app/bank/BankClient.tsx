"use client";

// BlueBank dashboard — 3-column layout: sidebar | center | right panel.
// Non-custodial Base neobank: real on-chain balances (wagmi), live yield rates
// (DefiLlama), real transactions (Moralis). Nothing is fabricated.

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useBalance, useConnect, useDisconnect } from "wagmi";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
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
  const netFlowMonth = txData?.stats?.netFlowUsdcMonth ?? 0;

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

            {/* Balance hero */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-4">
              <div className="font-mono text-[9px] text-slate-500 mb-1">CASH BALANCE · {net.short}</div>
              <div className="font-mono text-[32px] font-bold text-[#34D399] leading-none">
                ${usd(total)}
              </div>
              {netFlowMonth !== 0 && (
                <div className="font-mono text-[10px] mt-1"
                  style={{ color: netFlowMonth >= 0 ? "#34D399" : "#EF4444" }}>
                  {netFlowMonth >= 0 ? "+" : "−"}${usd(Math.abs(netFlowMonth))} this month
                </div>
              )}

              {/* Primary CTAs */}
              <div className="flex gap-2 mt-3">
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

              {/* Secondary actions — icon row */}
              <div className="flex gap-1 mt-2">
                {TABS.filter(t => !["send", "receive"].includes(t.id)).map(tb => (
                  <button key={tb.id} onClick={() => openAction(tb.id)}
                    className="flex-1 font-mono text-[9px] py-1.5 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 hover:border-[#4FC3F7]/20 flex flex-col items-center gap-0.5 transition-colors"
                    style={{ background: "#050508" }}>
                    <span>{tb.icon}</span>
                    {tb.label}
                  </button>
                ))}
                <button onClick={addCash} disabled={onrampBusy || !isConnected}
                  className="flex-1 font-mono text-[9px] py-1.5 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 hover:border-[#4FC3F7]/20 flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40"
                  style={{ background: "#050508" }}>
                  <span>💵</span>
                  {onrampBusy ? "…" : "Add"}
                </button>
              </div>
              {onrampMsg && <div className="font-mono text-[9px] text-amber-400 mt-1.5">{onrampMsg}</div>}
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

            {/* Your Assets */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">YOUR ASSETS</div>
              <AssetRow label="USDC" sub="in wallet" usd={walletUsdc} color="#4FC3F7" />
              <AssetRow label="aUSDC" sub={`Aave · ${aaveApy != null ? `${aaveApy.toFixed(1)}%` : "—"} APY`} usd={aavePos} color="#34D399" />
              {morphoVnet && <AssetRow label="Morpho" sub="Gauntlet USDC" usd={morphoPos} color="#A78BFA" />}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  <div>
                    <div className="font-mono text-[12px] text-slate-200">ETH</div>
                    <div className="font-mono text-[9px] text-slate-600">gas</div>
                  </div>
                </div>
                <div className="font-mono text-[12px] text-slate-300">{ethBal != null ? ethBal.toFixed(4) : "—"}</div>
              </div>
            </div>

            {/* Rates on Base */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">RATES ON BASE · DefiLlama</div>
              {rates && rates.length ? rates.slice(0, 3).map((r, i) => (
                <div key={r.project} className="flex items-center justify-between py-1">
                  <span className="font-mono text-[10px]" style={{ color: i === 0 ? "#34D399" : "#64748B" }}>
                    {i === 0 ? "★ " : ""}{r.label}
                  </span>
                  <span className="font-mono text-[10px] font-bold" style={{ color: i === 0 ? "#34D399" : "#94A3B8" }}>
                    {r.apy.toFixed(2)}%
                  </span>
                </div>
              )) : <div className="font-mono text-[10px] text-slate-600">loading rates…</div>}
              {bestApy != null && (
                <button onClick={() => openAction("earn")}
                  className="w-full font-mono text-[10px] font-bold py-1.5 rounded-lg mt-2"
                  style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39930" }}>
                  Earn {bestApy.toFixed(1)}% →
                </button>
              )}
            </div>

            {/* Add cash */}
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">ADD CASH</div>
              <div className="font-mono text-[10px] text-slate-400 mb-2">Buy USDC with card or bank account</div>
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

          </aside>

        </div>
      </main>
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
