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
import BaseTvlChart from "./BaseTvlChart";
import { ApyCompareChart } from "./BaseProtocolCharts";
import BaseTokensCard from "./BaseTokensCard";
import QrScanner from "./QrScanner";
import { parsePaymentQr, buildPaymentUri, type ParsedPayment } from "@/lib/payment-qr";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}



type Panel = "positions" | "earn" | "send" | "receive";

export default function BankPage() {
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;
  const { name } = useBasename(acct);
  const { disconnect } = useDisconnect();
  const [network, setNetwork] = useState<YieldNetwork>("baseSepolia");
  const [panel, setPanel]     = useState<Panel>("positions");
  const [actionOpen, setActionOpen] = useState(false);
  const [copied, setCopied]   = useState(false);
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

  // Real on-chain activity (USDC/ETH transfers, classified) via Etherscan V2.
  type ActItem = { hash: string; ts: number; label: string; dir: "in" | "out"; asset: string; amount: number; counterparty: string };
  const [activity, setActivity] = useState<{ items: ActItem[]; needsKey?: boolean } | null>(null);
  useEffect(() => {
    if (!acct) return;
    let off = false;
    fetch(`/api/activity?address=${acct}&network=${network}`).then(r => r.json()).then(d => { if (!off) setActivity(d); }).catch(() => {});
    return () => { off = true; };
  }, [acct, network]);

  const inYield = (aavePos ?? 0) + (morphoPos ?? 0);
  const total   = (walletUsdc ?? 0) + inYield;
  const projAnnual  = bestApy != null ? inYield * (bestApy / 100) : null;

  function copyAddr() {
    if (!acct) return;
    navigator.clipboard?.writeText(acct).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  if (!isConnected) {
    return <BankLanding bestApy={bestApy} />;
  }

  const TABS: { id: Panel; label: string; icon: string; desc: string }[] = [
    { id: "positions", label: "Positions", icon: "📊", desc: "Your yield" },
    { id: "earn",      label: "Earn",      icon: "🌾", desc: "Grow USDC" },
    { id: "send",      label: "Send",      icon: "➡",  desc: "Pay anyone" },
    { id: "receive",   label: "Receive",   icon: "⬇",  desc: "Get paid" },
  ];

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── Account / status sidebar (info, not page-nav) ─────────────────── */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-[#1A1A2E] bg-[#070710] overflow-y-auto">
        <div className="px-4 py-4 border-b border-[#1A1A2E]">
          <div className="font-mono text-[12px] tracking-widest text-[#4FC3F7] font-bold">🔵 BLUEBANK</div>
          <div className="font-mono text-[9px] text-[#34D399] mt-1">● Banking services · LIVE</div>
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
          <div className="font-mono text-[11px] text-slate-300 truncate">{name || shortAddr(acct)}</div>
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
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full">

          {/* Header */}
          <div className="mb-5">
            <h1 className="font-mono text-lg font-bold text-white">Your account on Base</h1>
            <p className="font-mono text-[11px] text-slate-500 mt-0.5">{name || shortAddr(acct)} · <span className="text-[#34D399]">non-custodial</span> · you hold the keys</p>
          </div>

          {/* Top row: cash balance + action panel — FIXED height so switching the
              right-panel tab (Positions/Earn/Send/Receive) never reflows the page. */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4 lg:h-[440px]">

            {/* Cash balance + primary actions (stacked, fill the card) */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 flex flex-col lg:h-full">
              <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">CASH BALANCE · {net.short}</div>
              <div className="font-mono text-4xl font-bold text-white">${usd(total)} <span className="text-base text-slate-500">USDC</span></div>
              <div className="font-mono text-[11px] text-slate-500 mt-2">
                {usd(walletUsdc)} in wallet · {usd(inYield)} earning{ethBal != null ? ` · ${ethBal.toFixed(4)} ETH` : ""}
              </div>
              <button onClick={addCash} disabled={onrampBusy || !isConnected}
                className="font-mono text-[12px] font-bold px-4 py-2.5 rounded-xl mt-4 disabled:opacity-50"
                style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
                {onrampBusy ? "Starting…" : "💵 Add cash · card / bank → USDC"}
              </button>
              {onrampMsg && <div className="font-mono text-[9px] text-amber-400 mt-1">{onrampMsg}</div>}
              <div className="font-mono text-[9px] text-slate-600 mt-1">via Coinbase · available in select regions · or fund with Receive</div>
              <div className="flex flex-col gap-2 mt-3 flex-1 min-h-0">
                {TABS.map(tb => (
                  <button key={tb.id} onClick={() => openAction(tb.id)}
                    className="flex-1 flex items-center gap-3 px-4 rounded-xl border border-[#1A1A2E] bg-[#0d0d12] hover:border-[#4FC3F7]/40 transition-colors text-left">
                    <span className="text-lg leading-none">{tb.icon}</span>
                    <div>
                      <div className="font-mono text-[12px] text-slate-200">{tb.label}</div>
                      <div className="font-mono text-[9px] text-slate-600">{tb.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* BASE MARKET — selectable top tokens + per-token price chart */}
            <BaseTokensCard />

            {/* BASE TVL — compact interactive chart */}
            <BaseTvlChart />

          </div>

          {/* Action modal — Positions / Earn / Send / Receive (opened from the hero) */}
          {actionOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setActionOpen(false)} />
              <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl max-h-[88vh] flex flex-col">
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
                        <button onClick={copyAddr} className="font-mono text-[11px] px-4 py-2 rounded-lg mt-3" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                          {copied ? "✓ Copied" : "Copy address"}
                        </button>
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

          {/* Row 2: Assets · Rates · Projection */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

            {/* A. Your Assets */}
            <Card title={`YOUR ASSETS · ${net.short}`}>
              <AssetRow label="USDC" sub="in wallet" usd={walletUsdc} color="#4FC3F7" />
              <AssetRow label="aUSDC" sub="Aave v3" usd={aavePos} color="#34D399" />
              {morphoVnet && <AssetRow label="Morpho" sub="Gauntlet USDC Prime" usd={morphoPos} color="#A78BFA" />}
              <div className="flex items-center justify-between py-2">
                <div><div className="font-mono text-[12px] text-slate-200">ETH</div><div className="font-mono text-[9px] text-slate-600">gas</div></div>
                <div className="font-mono text-[12px] text-slate-300">{ethBal != null ? ethBal.toFixed(4) : "—"}</div>
              </div>
            </Card>

            {/* B. Rates on Base */}
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

            {/* C. Yield projection */}
            <Card title="YIELD PROJECTION" note="estimate">
              {inYield > 0 ? (
                <>
                  <div className="font-mono text-[26px] font-bold text-[#34D399]">${usd(projAnnual)}<span className="text-sm text-slate-500"> /yr</span></div>
                  <div className="font-mono text-[10px] text-slate-500 mt-1">${usd((projAnnual ?? 0) / 12)} /mo · on ${usd(inYield)} at {bestApy?.toFixed(2)}%</div>
                  <p className="font-mono text-[9px] text-slate-600 mt-3 leading-relaxed">Projected at the current best safe rate. Real yield accrues live in your aUSDC.</p>
                </>
              ) : (
                <>
                  <div className="font-mono text-[13px] text-slate-300">Your USDC is idle.</div>
                  <p className="font-mono text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                    Supplying <b>${usd(walletUsdc)}</b> at {bestApy != null ? `${bestApy.toFixed(1)}%` : "~5%"} would earn ≈{" "}
                    <span className="text-[#34D399]">${usd((walletUsdc ?? 0) * ((bestApy ?? 5) / 100))}/yr</span>.
                  </p>
                  <button onClick={() => setPanel("earn")} className="font-mono text-[11px] px-3 py-1.5 rounded-lg mt-3" style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>🌾 Put it to work</button>
                </>
              )}
            </Card>
          </div>

          {/* USDC supply APY — Aave vs Morpho vs Moonwell (the one yield chart, tied to Earn) */}
          <div className="mb-4">
            <ApyCompareChart />
          </div>

          {/* Activity — real on-chain history (Etherscan V2) */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] text-slate-500 tracking-widest">ACTIVITY · {net.short}</div>
              <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">Basescan ↗</a>
            </div>
            {activity?.items?.length ? (
              <div>
                {activity.items.map(it => (
                  <a key={`${it.hash}-${it.ts}-${it.asset}`} href={`${net.explorer}/tx/${it.hash}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between py-2 border-b border-[#13131f] last:border-0 hover:bg-[#0d0d12] -mx-2 px-2 rounded transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px]"
                        style={{ background: it.dir === "in" ? "#34D39915" : "#EF444415", color: it.dir === "in" ? "#34D399" : "#EF4444" }}>{it.dir === "in" ? "↘" : "↗"}</span>
                      <div>
                        <div className="font-mono text-[11px] text-slate-200">{it.label} <span className="text-slate-600">{shortAddr(it.counterparty)}</span></div>
                        <div className="font-mono text-[9px] text-slate-600">{relTime(it.ts)}</div>
                      </div>
                    </div>
                    <div className="font-mono text-[11px]" style={{ color: it.dir === "in" ? "#34D399" : "#e2e8f0" }}>
                      {it.dir === "in" ? "+" : "−"}{it.amount.toLocaleString("en-US", { maximumFractionDigits: it.asset === "ETH" ? 5 : 2 })} {it.asset}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[11px] text-slate-600">
                {activity?.needsKey
                  ? <>Live history needs an Etherscan key (set <span className="text-slate-400">ETHERSCAN_API_KEY</span>). View full history on <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7]">Basescan ↗</a></>
                  : <>No transactions yet on {net.short}. Your USDC / ETH activity will appear here.</>}
              </p>
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
