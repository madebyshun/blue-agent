"use client";

// BlueBank dashboard — the "account home" for the non-custodial Base neobank.
// Reuses the chat action cards (MoveToYieldCard / SendCard) for Earn + Send, and
// reads balances/positions on-chain (real data, no fabrication). Receive shows
// the address + Basename + QR. Activity is a placeholder until an indexer key
// is wired (we never fabricate transaction history).

import { useState, useEffect, type ReactNode } from "react";
import { useAccount, useReadContract, useBalance, useConnect } from "wagmi";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
import {
  YIELD_NETWORKS, ERC20_ABI, AAVE_POOL_ABI, ERC4626_ABI, VENUES, supplyApyPct,
  type YieldNetwork,
} from "@/lib/yield-execution";
import { MoveToYieldCard, SendCard } from "@/app/chat/components/ToolCards";
import { useBasename, shortAddr } from "@/lib/useBasename";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const compact = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

const fmtPrice = (n: number | null | undefined) =>
  n == null ? "—"
  : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  : `$${n.toFixed(n < 1e-4 ? 10 : 6).replace(/0+$/, "").replace(/\.$/, "")}`;

type Panel = "positions" | "earn" | "send" | "receive";

export default function BankPage() {
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;
  const { name } = useBasename(acct);
  const [network, setNetwork] = useState<YieldNetwork>("baseSepolia");
  const [panel, setPanel]     = useState<Panel>("positions");
  const [copied, setCopied]   = useState(false);

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

  // Wow data: Morpho 30d APY series + Base chain snapshot (both real, cached).
  const [hist, setHist] = useState<{ points: number[]; current: number | null } | null>(null);
  type Tok = { price: number | null; change24h: number | null; vol24h?: number | null } | null;
  type Snap = {
    tvlUsd: number | null; change7dPct: number | null; tvlSeries?: number[];
    dexVol24h?: number | null; dexVol7d?: number | null; blue?: Tok; cbbtc?: Tok;
  };
  const [snap, setSnap] = useState<Snap | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/morpho-history").then(r => r.json()).then(d => { if (!off) setHist({ points: d.points ?? [], current: d.current ?? null }); }).catch(() => {});
    fetch("/api/base-snapshot").then(r => r.json()).then(d => { if (!off) setSnap(d); }).catch(() => {});
    return () => { off = true; };
  }, []);

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

  const TABS: { id: Panel; label: string }[] = [
    { id: "positions", label: "Positions" },
    { id: "earn",      label: "Earn" },
    { id: "send",      label: "Send" },
    { id: "receive",   label: "Receive" },
  ];

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── Account / status sidebar (info, not page-nav) ─────────────────── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[#1A1A2E] bg-[#070710] overflow-y-auto">
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
          <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">View on Basescan ↗</a>
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

          {/* Top row: cash balance + action panel */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">

            {/* Left column: balance + Base market (stacked) */}
            <div className="lg:col-span-2 flex flex-col gap-4">

              {/* Cash balance */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">CASH BALANCE · {net.short}</div>
                <div className="font-mono text-4xl sm:text-5xl font-bold text-white">${usd(total)} <span className="text-base text-slate-500">USDC</span></div>
                <div className="font-mono text-[11px] text-slate-500 mt-2">
                  {usd(walletUsdc)} in wallet · {usd(inYield)} earning{ethBal != null ? ` · ${ethBal.toFixed(4)} ETH` : ""}
                </div>
                <div className="flex flex-wrap gap-2 mt-5">
                  <button onClick={() => setPanel("receive")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>⬇ Receive</button>
                  <button onClick={() => setPanel("send")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>➡ Send</button>
                  <button onClick={() => setPanel("earn")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>🌾 Earn</button>
                </div>
              </div>

              {/* Base market */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[10px] text-slate-500 tracking-widest">BASE MARKET</span>
                  <span className="font-mono text-[9px] text-slate-700">live · built by Coinbase</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Ticker label="$BLUEAGENT" price={fmtPrice(snap?.blue?.price)} change={snap?.blue?.change24h ?? null} />
                  <Ticker label="cbBTC" price={fmtPrice(snap?.cbbtc?.price)} change={snap?.cbbtc?.change24h ?? null} />
                </div>
                <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-3 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] text-slate-600 tracking-wide">BASE TVL · 30D</span>
                    <span className="font-mono text-[11px] text-white">
                      {snap?.tvlUsd != null ? compact(snap.tvlUsd) : "—"}{" "}
                      <span style={{ color: (snap?.change7dPct ?? 0) >= 0 ? "#34D399" : "#EF4444" }}>
                        {snap?.change7dPct != null ? `${snap.change7dPct >= 0 ? "+" : ""}${snap.change7dPct.toFixed(2)}%` : ""}
                      </span>
                    </span>
                  </div>
                  <Spark points={snap?.tvlSeries ?? []} color="#4FC3F7" height={40} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Mini label="24H DEX VOL" value={snap?.dexVol24h != null ? compact(snap.dexVol24h) : "—"} />
                  <Mini label="7D DEX VOL" value={snap?.dexVol7d != null ? compact(snap.dexVol7d) : "—"} />
                </div>
              </div>
            </div>

            {/* Action panel (tabbed; fills the right column instead of empty space) */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-3 flex flex-col">
              <div className="flex gap-1 mb-2">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setPanel(t.id)}
                    className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                    style={panel === t.id
                      ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                      : { color: "#64748b", border: "1px solid transparent" }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {panel === "positions" && (
                <div className="px-2 pb-2">
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
              {panel === "send" && <SendCard result={{ network }} account={acct} />}
              {panel === "receive" && (
                <div className="flex flex-col items-center text-center px-2 pb-2 pt-1">
                  <div className="bg-[#0a0a0f] p-1.5 rounded-xl border border-[#1A1A2E]">
                    <QRCodeSVG value={acct ?? ""} size={150} bgColor="#0a0a0f" fgColor="#e2e8f0" level="M" />
                  </div>
                  {name && <div className="font-mono text-[12px] text-[#4FC3F7] mt-3">{name}</div>}
                  <div className="font-mono text-[9px] text-slate-400 mt-1.5 break-all">{acct}</div>
                  <button onClick={copyAddr} className="font-mono text-[10px] px-3 py-1.5 rounded-lg mt-2.5" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                    {copied ? "✓ Copied" : "Copy address"}
                  </button>
                  <p className="font-mono text-[9px] text-slate-600 mt-2.5 leading-relaxed">Send only <b>USDC / ETH on Base</b> ({net.short}) here.</p>
                </div>
              )}
            </div>
          </div>

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

          {/* Row 3: Morpho APY chart (wide) + Base snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2 rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest">MORPHO · GAUNTLET USDC PRIME · 30D NET APY</div>
                <div className="font-mono text-[13px] font-bold text-[#A78BFA]">{hist?.current != null ? `${hist.current.toFixed(2)}%` : "—"}</div>
              </div>
              <Spark points={hist?.points ?? []} color="#A78BFA" height={64} />
              <div className="font-mono text-[9px] text-slate-600 mt-2">$442M TVL · curator Gauntlet · verified ERC-4626 · live via Morpho API</div>
            </div>
            <Card title="BASE SNAPSHOT" note="live · DefiLlama">
              <StatLine label="Chain TVL" value={snap?.tvlUsd != null ? `$${(snap.tvlUsd / 1e9).toFixed(2)}B` : "—"} />
              <StatLine label="7d change" value={snap?.change7dPct != null ? `${snap.change7dPct >= 0 ? "+" : ""}${snap.change7dPct.toFixed(2)}%` : "—"} color={snap && (snap.change7dPct ?? 0) >= 0 ? "#34D399" : "#EF4444"} />
              <StatLine label="24h DEX vol" value={compact(snap?.dexVol24h)} />
              <StatLine label="Best USDC APY" value={bestApy != null ? `${bestApy.toFixed(2)}%` : "—"} color="#34D399" />
              <StatLine label="Custody" value="You hold keys" color="#A78BFA" />
            </Card>
          </div>

          {/* Activity */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">ACTIVITY · {net.short}</div>
            <p className="font-mono text-[11px] text-slate-600">
              On-chain history view coming soon. Your full transaction history is live on{" "}
              <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7]">Basescan ↗</a>
            </p>
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

function Ticker({ label, price, change }: { label: string; price: string; change: number | null }) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-3 py-2">
      <div className="font-mono text-[9px] text-slate-500">{label}</div>
      <div className="font-mono text-[13px] font-bold text-slate-100 mt-0.5 truncate">{price}</div>
      <div className="font-mono text-[10px] mt-0.5" style={{ color: change == null ? "#64748b" : up ? "#34D399" : "#EF4444" }}>
        {change == null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}% 24h`}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-3 py-2">
      <div className="font-mono text-[9px] text-slate-500">{label}</div>
      <div className="font-mono text-[13px] font-bold text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}

function StatLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#13131f] last:border-0 font-mono text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span style={{ color: color ?? "#e2e8f0" }}>{value}</span>
    </div>
  );
}

// Dependency-free area sparkline.
function Spark({ points, color, height = 48 }: { points: number[]; color: string; height?: number }) {
  if (!points || points.length < 2) return <div className="font-mono text-[10px] text-slate-700" style={{ height }}>loading chart…</div>;
  const w = 100, h = height;
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / range) * h).toFixed(2)}`);
  const line = "M" + coords.join(" L");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
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
          <p className="font-mono text-[11px] text-slate-500 mb-5">Connect a wallet to start — no signup, no KYC, no custody.</p>
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

// Connect-wallet CTA — reuses wagmi connectors (same as the sidebar WalletBar),
// de-duped, rendered as a prominent button + picker for the landing hero.
function ConnectButton() {
  const { connectors, connect, isPending } = useConnect();
  const [open, setOpen] = useState(false);
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
      <button onClick={() => setOpen(o => !o)} disabled={isPending}
        className="w-full font-mono text-[13px] font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
        style={{ background: "#4FC3F7", color: "#050508" }}>
        {isPending ? "Connecting…" : "Connect Wallet"}
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
