"use client";

// BlueBank dashboard — the "account home" for the non-custodial Base neobank.
// Reuses the chat action cards (MoveToYieldCard / SendCard) for Earn + Send, and
// reads balances/positions on-chain (real data, no fabrication). Receive shows
// the address + Basename + QR. Activity is a placeholder until an indexer key
// is wired (we never fabricate transaction history).

import { useState, useEffect, type ReactNode } from "react";
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
    if (p === "send") { setScanPrefill(null); setScanKey(k => k + 1); } // fresh Send
    setPanel(p); setActionOpen(true);
  };

  // Scan-to-pay — read a payment QR (address / name.base / EIP-681 request),
  // prefill the Send card, and let the user confirm + sign (non-custodial).
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<ParsedPayment | null>(null);
  const [scanKey, setScanKey] = useState(0); // remounts SendCard with new prefill
  function handleScan(text: string): string | void {
    const p = parsePaymentQr(text);
    if (!p || !p.to) return "Not a Base address or payment QR";
    setScanPrefill(p);
    setScanKey(k => k + 1);
    setPanel("send");
    setScanOpen(false);
    setActionOpen(true);
  }

  // Receive as a payment request — encode an amount into the QR (EIP-681) so a
  // payer scanning it gets the amount prefilled, not just the bare address.
  const [reqAmount, setReqAmount] = useState("");
  const [reqAsset, setReqAsset] = useState<"USDC" | "ETH">("USDC");

  // Add cash — Coinbase Onramp (buy USDC on Base with card/Apple Pay/bank).
  // USDC is delivered straight to the user's own wallet (non-custodial). Mainnet.
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

  // Cash out — Coinbase Offramp (sell USDC on Base → card / bank). Reuses the
  // same CDP session token, which initializes either the buy or the sell flow.
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
  const morphoVnet = VENUES.morpho.nets[network]; // mainnet only

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

  // ── Best-rate (DefiLlama) for the stat row + Morpho APY ───────────────────
  type Rate = { project: string; label: string; apy: number };
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/rates").then(r => r.json()).then(d => { if (!off) setRates((d?.rates as Rate[]) ?? []); }).catch(() => {});
    return () => { off = true; };
  }, []);
  const bestApy   = rates && rates.length ? rates[0].apy : null;
  const morphoApy = rates?.find(r => r.project === "morpho-blue")?.apy ?? null;

  // Morpho 30d APY series for the sidebar EARNING sparkline (real, cached).
  const [hist, setHist] = useState<{ points: number[]; current: number | null } | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/morpho-history").then(r => r.json()).then(d => { if (!off) setHist({ points: d.points ?? [], current: d.current ?? null }); }).catch(() => {});
    return () => { off = true; };
  }, []);

  // Real wallet history (Moralis, categorized) — feeds the transaction list AND
  // the balance "this month" delta + gas-saved stat (stats computed server-side
  // from the same transfers, never fabricated). We just render.
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
  const projAnnual  = bestApy != null ? inYield * (bestApy / 100) : null;

  // Stats derived from real wallet history (this calendar month).
  const gasSavedUsd        = txData?.stats?.gasSavedUsd ?? null;
  const transferCountMonth = txData?.stats?.transferCountMonth ?? 0;
  const netFlowMonth       = txData?.stats?.netFlowUsdcMonth ?? 0;

  function copyAddr() {
    if (!acct) return;
    navigator.clipboard?.writeText(acct).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  // Share a payment-request link — turns this Receive request into a /pay/<addr>
  // URL a payer can open from Telegram/Zalo and settle in one tap. Native share
  // sheet on mobile, clipboard fallback on desktop. Carries amount/asset/network.
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
    // B20 orders/invoices — only when B20 mainnet payments are enabled.
    ...(B20_ENABLED ? [{ id: "orders" as Panel, label: "Orders", icon: "🧾", desc: "Get paid in B20" }] : []),
  ];

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── Account / status sidebar (info, not page-nav) ─────────────────── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 h-full border-r border-[#1A1A2E] bg-[#050508] overflow-y-auto">
        <div className="px-5 h-14 flex items-center border-b border-[#1A1A2E] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse shrink-0 mr-2" />
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUEBANK</p>
        </div>

        {/* Earning widget (BlueBank's "savings" card) */}
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

      {/* ── Content — single page ────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Page header — personalized greeting + trust chips (identity, not nav) */}
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full">


          {/* Top row: cash balance + quick actions (left) + assets & rates (right) */}
          <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mb-4">

            {/* Left column: Cash Balance card + compact Quick Actions grid */}
            <div className="flex flex-col gap-3">

              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">CASH BALANCE · {net.short}</div>
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-2xl font-bold text-white">${usd(total)} <span className="text-sm text-slate-500">USDC</span></div>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {usd(walletUsdc)} in wallet · {usd(inYield)} earning{ethBal != null ? ` · ${ethBal.toFixed(4)} ETH` : ""}
                    </div>
                    {netFlowMonth !== 0 && (
                      <div className="font-mono text-[11px]" style={{ color: netFlowMonth >= 0 ? "#34D399" : "#EF4444" }}>
                        {netFlowMonth >= 0 ? "+" : "−"}${usd(Math.abs(netFlowMonth))} USDC this month
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => openAction("receive")}
                      className="font-mono text-[11px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors"
                      style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
                      ⬇ Receive
                    </button>
                    <button onClick={() => openAction("send")}
                      className="font-mono text-[11px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-opacity hover:opacity-90"
                      style={{ background: "#4FC3F7", color: "#050508" }}>
                      ➡ Send
                    </button>
                  </div>
                </div>

                <button onClick={addCash} disabled={onrampBusy || !isConnected}
                  className="w-full font-mono text-[12px] font-bold px-4 py-2.5 rounded-xl mt-1 disabled:opacity-50"
                  style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
                  {onrampBusy ? "Starting…" : "💵 Add cash · card / bank → USDC"}
                </button>
                {onrampMsg && <div className="font-mono text-[9px] text-amber-400 mt-1">{onrampMsg}</div>}
                <div className="font-mono text-[9px] text-slate-600 mt-1">via Coinbase · available in select regions · or fund with Receive</div>
              </div>

              {/* Quick Actions — compact 2×2, fills left column to match right */}
              <div className="grid grid-cols-2 gap-2 flex-1">
                {TABS.filter(t => t.id !== "send" && t.id !== "receive").map(tb => (
                  <button key={tb.id} onClick={() => openAction(tb.id)}
                    className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-3 py-3 flex items-center gap-2.5 hover:border-[#4FC3F7]/40 hover:bg-[#0d0d14] transition-all text-left">
                    <span className="text-base leading-none shrink-0">{tb.icon}</span>
                    <div className="font-mono text-[11px] font-medium text-slate-200">{tb.label}</div>
                  </button>
                ))}
                <button onClick={cashOut} disabled={cashOutBusy || !isConnected}
                  className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-3 py-3 flex items-center gap-2.5 hover:border-[#4FC3F7]/40 hover:bg-[#0d0d14] transition-all text-left disabled:opacity-50">
                  <span className="text-base leading-none shrink-0">🏦</span>
                  <div className="font-mono text-[11px] font-medium text-slate-200">{cashOutBusy ? "Starting…" : "Cash out"}</div>
                </button>
              </div>

            </div>

            {/* Right column: Your Assets + Rates on Base */}
            <div className="flex flex-col gap-4">

              <Card title={`YOUR ASSETS · ${net.short}`}>
                <AssetRow label="USDC" sub="in wallet" usd={walletUsdc} color="#4FC3F7" />
                <AssetRow label="aUSDC" sub="Aave v3" usd={aavePos} color="#34D399" />
                {morphoVnet && <AssetRow label="Morpho" sub="Gauntlet USDC Prime" usd={morphoPos} color="#A78BFA" />}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-mono text-[12px] text-slate-200">ETH</div>
                    <div className="font-mono text-[9px] text-slate-600">gas</div>
                  </div>
                  <div className="font-mono text-[12px] text-slate-300">{ethBal != null ? ethBal.toFixed(4) : "—"}</div>
                </div>
              </Card>

              <Card title="RATES ON BASE" note="live · DefiLlama">
                {rates && rates.length ? rates.slice(0, 4).map((r, i) => {
                  const max = Math.max(...rates.map(x => x.apy)) || 1;
                  return (
                    <div key={r.project} className="py-1">
                      <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                        <span className={i === 0 ? "text-[#34D399]" : "text-slate-400"}>{i === 0 ? "★ " : ""}{r.label}</span>
                        <span className={i === 0 ? "text-[#34D399]" : "text-slate-300"}>{r.apy.toFixed(2)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#13131f] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.apy / max) * 100}%`, background: i === 0 ? "#34D399" : "#4FC3F7" }} />
                      </div>
                    </div>
                  );
                }) : <div className="font-mono text-[10px] text-slate-600">loading rates…</div>}
              </Card>

            </div>

          </div>

          {/* Stats row — gas saved (est.) · best APY · always-on */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <StatCard icon="💡" label="Gas saved" value={gasSavedUsd != null ? `$${usd(gasSavedUsd)}` : "—"}
              sub={`${transferCountMonth} transfer${transferCountMonth === 1 ? "" : "s"} · est.`} />
            <StatCard icon="📈" label="Best APY" value={bestApy != null ? `${bestApy.toFixed(1)}%` : "—"}
              sub="Earn on idle USDC" />
            <StatCard icon="🔗" label="24/7" value="On-chain" sub="Not in a silo" />
          </div>

          {/* Yield prominence — encourage when idle, show position when earning */}
          {bestApy != null && (
            <div className="rounded-2xl border p-4 mb-4 flex items-center justify-between gap-3"
              style={{ borderColor: "#34D39930", background: "linear-gradient(90deg,#34D39912,#0a0a0f 65%)" }}>
              <div className="min-w-0">
                <div className="font-mono text-[13px] font-bold text-[#34D399]">📈 Earning {bestApy.toFixed(1)}% APY</div>
                <div className="font-mono text-[10px] text-slate-500 mt-0.5 truncate">
                  {inYield > 0
                    ? <>${usd(inYield)} growing inside your bank · via Aave on Base</>
                    : <>Your USDC grows right inside your bank · via Aave on Base</>}
                </div>
              </div>
              <button onClick={() => openAction("earn")}
                className="font-mono text-[11px] font-bold px-4 py-2 rounded-xl shrink-0"
                style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
                Earn →
              </button>
            </div>
          )}

          {/* Action modal — Positions / Earn / Send / Receive (opened from the hero) */}
          {actionOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] p-4">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setActionOpen(false)} />
              <div className="relative z-10 w-full max-w-md h-[580px] max-h-[85vh] rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl flex flex-col">
                {/* Tabs + close */}
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

                      {/* Request a specific amount → encodes an EIP-681 payment QR */}
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

          {/* Transaction history — moved up: most users care about activity first */}
          <div className="mb-4">
            <TransactionHistory
              transactions={txData?.transactions ?? []}
              loading={txLoading}
              error={txError}
              needsKey={txData?.needsKey}
              onRetry={() => setTxReload(k => k + 1)}
              explorer={net.explorer}
              address={acct}
            />
          </div>

          {/* Yield projection — below activity, for power users */}
          {bestApy != null && (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest">YIELD PROJECTION</div>
                <div className="font-mono text-[9px] text-slate-700">estimate</div>
              </div>
              {inYield > 0 ? (
                <>
                  <div className="font-mono text-[26px] font-bold text-[#34D399]">${usd(projAnnual)}<span className="text-sm text-slate-500"> /yr</span></div>
                  <div className="font-mono text-[10px] text-slate-500 mt-1">${usd((projAnnual ?? 0) / 12)} /mo · on ${usd(inYield)} at {bestApy.toFixed(2)}%</div>
                  <p className="font-mono text-[9px] text-slate-600 mt-3 leading-relaxed">Projected at the current best safe rate. Real yield accrues live in your aUSDC.</p>
                </>
              ) : (
                <>
                  <div className="font-mono text-[13px] text-slate-300">Your USDC is idle.</div>
                  <p className="font-mono text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                    Supplying <b>${usd(walletUsdc)}</b> at {bestApy.toFixed(1)}% would earn ≈{" "}
                    <span className="text-[#34D399]">${usd((walletUsdc ?? 0) * (bestApy / 100))}/yr</span>.
                  </p>
                  <button onClick={() => openAction("earn")} className="font-mono text-[11px] px-3 py-1.5 rounded-lg mt-3" style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>🌾 Put it to work</button>
                </>
              )}
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}

// ── Small UI primitives ──────────────────────────────────────────────────────
function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest">{title}</div>
        {note && <div className="font-mono text-[9px] text-slate-700">{note}</div>}
      </div>
      {children}
    </div>
  );
}

// Deterministic gradient avatar derived from the wallet address — a tiny,
// dependency-free identicon so every account looks distinct in the greeting.
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

// Compact stat tile for the hero stats row (gas saved / APY / 24-7).
function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-3">
      <div className="font-mono text-[9px] text-slate-500 tracking-wide flex items-center gap-1"><span>{icon}</span>{label}</div>
      <div className="font-mono text-[15px] sm:text-[18px] font-bold text-white mt-1 truncate">{value}</div>
      <div className="font-mono text-[8px] sm:text-[9px] text-slate-600 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function AssetRow({ label, sub, usd: val, color }: { label: string; sub: string; usd: number | null; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#13131f] last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <div><div className="font-mono text-[12px] text-slate-200">{label}</div><div className="font-mono text-[9px] text-slate-600">{sub}</div></div>
      </div>
      <div className="font-mono text-[12px] text-slate-300">{val != null ? `$${usd(val)}` : "—"}</div>
    </div>
  );
}

// Dependency-free area sparkline. `fill` makes it stretch to its container height.
function Spark({ points, color, height = 48, fill = false }: { points: number[]; color: string; height?: number; fill?: boolean }) {
  if (!points || points.length < 2)
    return <div className="font-mono text-[10px] text-slate-700" style={fill ? { width: "100%" } : { height }}>loading chart…</div>;
  const w = 100, h = 48; // internal coordinate space; svg stretches via preserveAspectRatio
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
        {/* Left — marketing */}
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

        {/* Right — connect card */}
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

// Connect-wallet CTA — Smart Wallet (Coinbase, passkey/Face ID, no seed phrase)
// as the first-class "create account" path, with an "I already have a wallet"
// picker (MetaMask/Rabby/Coinbase extension via EIP-6963) as the secondary path.
function ConnectButton() {
  const { connectors, connect, isPending } = useConnect();
  const [open, setOpen] = useState(false);

  // The Coinbase connector (preference "all") surfaces Coinbase Smart Wallet —
  // a passkey-secured smart-contract account: no seed phrase, recoverable, and
  // Paymaster-ready for gasless transactions.
  const coinbase = connectors.find(c => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase"));

  // De-dupe the rest for the "existing wallet" picker.
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
      {/* Primary — create / sign in with Coinbase Smart Wallet */}
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

      {/* Secondary — connect an existing wallet */}
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
