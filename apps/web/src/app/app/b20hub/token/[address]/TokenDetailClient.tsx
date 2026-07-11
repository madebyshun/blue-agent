"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { B20HUB_HOOK, B20HUB_BUYBACK } from "@/lib/b20hub/constants";

const POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc" as const;

interface PoolInfo {
  poolId:            string;
  feeTier:           number;
  feeLabel:          string;
  creator:           string;
  lpTokenIdA:        string;
  lpNftOwner?:       string | null;
  slot0?:            { sqrtPriceX96: string; tick: number; protocolFee: number; lpFee: number } | null;
  computedPriceUsd?: number | null;
  computedMcapUsd?:  number | null;
  ethPriceUsd?:      number | null;
}
interface PoolResponse {
  ok: boolean;
  isB20?: boolean;
  name?: string;
  symbol?: string;
  totalSupply?: string;
  decimals?: number;
  pool?: PoolInfo | null;
  error?: string;
}
interface MarketData {
  priceUsd?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  liquidityUsd?: number | null;
  change24h?: number | null;
}

export default function TokenDetailClient({ address }: { address: `0x${string}` }) {
  const [data,   setData]   = useState<PoolResponse | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [error,  setError]  = useState("");

  useEffect(() => {
    let alive = true;
    // Server-side probe: single JSON round-trip, 30s cache.
    fetch(`/api/b20hub/pool/${address}`)
      .then((r) => r.json())
      .then((d: PoolResponse) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError((e as Error).message || "Failed to load"); });

    // Market data from the feed endpoint (also cached).
    fetch("/api/b20hub/tokens")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const t = (d.tokens ?? []).find(
          (x: { tokenAddress: string; market?: MarketData }) =>
            x.tokenAddress.toLowerCase() === address.toLowerCase(),
        );
        setMarket(t?.market ?? null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [address]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="font-mono text-sm text-red-400">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] py-16 text-center">
        <div className="inline-block w-2 h-2 rounded-full bg-[#4FC3F7] animate-pulse" />
        <p className="font-mono text-[10px] text-slate-600 mt-3">Loading token…</p>
      </div>
    );
  }
  if (data.ok === false) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="font-mono text-sm text-red-400">{data.error || "Failed to load token"}</p>
      </div>
    );
  }
  if (!data.isB20) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="font-mono text-sm text-amber-400 mb-1">Not a B20 token</p>
        <p className="font-mono text-[11px] text-slate-500">
          <code className="text-slate-300">isB20({address.slice(0, 8)}…)</code>{" "}
          returned <span className="text-red-400">false</span> at the factory.
        </p>
      </div>
    );
  }

  const supplyWhole =
    data.totalSupply != null && data.decimals != null
      ? Number(BigInt(data.totalSupply)) / Math.pow(10, data.decimals)
      : 0;
  const sym = (data.symbol ?? "?").replace(/^\$/, "");

  return (
    <div className="space-y-6">
      <HeaderCard sym={sym} name={data.name ?? sym} address={address} pool={data.pool ?? null} supplyWhole={supplyWhole} />

      <div className="grid md:grid-cols-2 gap-4">
        <MarketCard market={market} pool={data.pool ?? null} />
        <PoolCard pool={data.pool ?? null} />
      </div>

      <ActionsCard address={address} pool={data.pool ?? null} />
      <ContractCard address={address} pool={data.pool ?? null} />
    </div>
  );
}

function HeaderCard({ sym, name, address, pool, supplyWhole }: {
  sym: string; name: string; address: string; pool: PoolInfo | null; supplyWhole: number;
}) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 flex items-start gap-4">
      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
        style={{ background: "#4FC3F715", border: "1px solid #4FC3F740", color: "#4FC3F7" }}>
        {sym.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h1 className="font-mono text-xl font-bold">{name || sym}</h1>
          <span className="font-mono text-sm text-slate-500">${sym}</span>
        </div>
        <div className="flex gap-2 mb-2 flex-wrap">
          <Badge label="B20 Asset" color="#4FC3F7" />
          <Badge label="Base" color="#0052FF" />
          {pool && <Badge label={`V4 · ${pool.feeLabel}`} color="#FF007A" />}
          {pool && <Badge label="LP Locked" color="#22C55E" />}
        </div>
        <p className="font-mono text-[10px] text-slate-600 break-all">{address}</p>
        <p className="font-mono text-[11px] text-slate-400 mt-2">
          Supply: <span className="text-slate-200">{supplyWhole.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}

function MarketCard({ market, pool }: { market: MarketData | null; pool: PoolInfo | null }) {
  // Prefer onchain-native price / mcap (works instantly at launch — pump.fun
  // / Bankr pattern). DexScreener data adds 24h vol / change / liq, which
  // are meaningless until real trades happen anyway.
  const priceUsd = market?.priceUsd ?? pool?.computedPriceUsd ?? null;
  const mcapUsd  = market?.marketCap ?? pool?.computedMcapUsd  ?? null;
  const usingOnchain = market?.marketCap == null && pool?.computedMcapUsd != null;
  const changeColor = market?.change24h == null ? "#64748B" : market.change24h >= 0 ? "#22C55E" : "#EF4444";
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">Market</p>
        <p className="font-mono text-[9px] text-slate-600">
          {usingOnchain
            ? `onchain · ETH=$${pool?.ethPriceUsd?.toFixed(0) ?? "?"}`
            : market?.marketCap != null ? "via DexScreener" : "—"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="PRICE"    value={priceUsd == null ? "—" : "$" + priceUsd.toExponential(2)} />
        <Stat label="MCAP"     value={fmtUsd(mcapUsd)} />
        <Stat label="24H VOL"  value={fmtUsd(market?.volume24h)} />
        <Stat label="24H %"    value={fmtPct(market?.change24h)} color={changeColor} />
        <Stat label="LIQ"      value={fmtUsd(market?.liquidityUsd)} />
      </div>
      {usingOnchain && (
        <p className="font-mono text-[9px] text-slate-600 mt-3 leading-relaxed">
          Computed from pool sqrtPrice × CoinGecko ETH spot — this is the
          real onchain mcap. Third-party wallets (Base App, Coinbase Wallet,
          DexScreener) may still show $0 until their aggregators finish
          indexing V4-hook pools — that&apos;s an aggregator limitation,
          not a contract issue.
        </p>
      )}
    </div>
  );
}

function PoolCard({ pool }: { pool: PoolInfo | null }) {
  if (!pool) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">Pool</p>
        <p className="font-mono text-xs text-amber-400 mb-1">Not a B20HUB pool</p>
        <p className="font-mono text-[10px] text-slate-500 leading-relaxed">
          The B20HUB hook doesn&apos;t track a pool for this token at any
          standard fee tier. Might be a plain-B20 launch, launched under
          an earlier hook, or the index is still catching up (refresh in
          ~30s).
        </p>
      </div>
    );
  }
  const lpLocked = pool.lpNftOwner?.toLowerCase() === B20HUB_HOOK.toLowerCase();
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">B20HUB Pool</p>
      <div className="space-y-2 text-[11px] font-mono">
        <Row label="Fee tier"    value={pool.feeLabel} />
        <Row label="Creator"     value={pool.creator.slice(0, 8) + "…" + pool.creator.slice(-6)} />
        <Row label="Position A"  value={"#" + pool.lpTokenIdA} />
        <Row label="Current tick" value={pool.slot0 ? pool.slot0.tick.toString() : "—"} />
        <Row label="LP status"   value={lpLocked ? "🔒 Locked in hook" : "⚠ NFT not held by hook"} color={lpLocked ? "#22C55E" : "#F59E0B"} />
      </div>
    </div>
  );
}

function ActionsCard({ address, pool }: { address: string; pool: PoolInfo | null }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">Actions</p>
      <div className="flex flex-wrap gap-2">
        <a href={`https://app.uniswap.org/swap?chain=base&outputCurrency=${address}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs font-bold px-4 py-2 rounded-lg" style={{ background: "#FF007A", color: "white" }}>
          🦄 Trade on Uniswap
        </a>
        {pool && (
          <Link href={`/app/b20hub/claim?token=${address}`}
            className="font-mono text-xs font-bold px-4 py-2 rounded-lg" style={{ background: "#34D399", color: "#050508" }}>
            🔷 Claim Creator Fees
          </Link>
        )}
        <a href={`https://basescan.org/token/${address}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300">
          Basescan ↗
        </a>
        <a href={`https://dexscreener.com/base/${address}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300">
          DexScreener ↗
        </a>
      </div>
    </div>
  );
}

function ContractCard({ address, pool }: { address: string; pool: PoolInfo | null }) {
  const rows: Array<{ l: string; v: string; href?: string; internal?: boolean }> = [
    { l: "Token",         v: address,                           href: `https://basescan.org/address/${address}` },
    { l: "Creator",       v: pool?.creator ?? "—",              href: pool?.creator ? `/app/b20hub/creator/${pool.creator}` : undefined, internal: true },
    { l: "Hook",          v: B20HUB_HOOK,                       href: `https://basescan.org/address/${B20HUB_HOOK}` },
    { l: "BuyBack",       v: B20HUB_BUYBACK,                    href: `https://basescan.org/address/${B20HUB_BUYBACK}` },
    { l: "PosMgr LP NFT", v: pool?.lpTokenIdA ? "#" + pool.lpTokenIdA : "—", href: pool?.lpTokenIdA ? `https://basescan.org/token/${POSITION_MANAGER}?a=${pool.lpTokenIdA}` : undefined },
  ];
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">Onchain addresses</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase">{r.l}</span>
            {r.href ? (
              r.internal ? (
                <Link href={r.href} className="font-mono text-[10px] text-[#4FC3F7] hover:underline break-all">
                  {r.v}
                </Link>
              ) : (
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-[#4FC3F7] hover:underline break-all">
                  {r.v} ↗
                </a>
              )
            ) : (
              <span className="font-mono text-[10px] text-slate-400 break-all">{r.v}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── utilities ────────────────────────────────────────────────────────────────
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold" style={{ color: color ?? "#e2e8f0" }}>{value}</span>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-1">{label}</div>
      <div className="font-mono text-sm font-bold tabular-nums" style={{ color: color ?? "#e2e8f0" }}>{value}</div>
    </div>
  );
}
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}
function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000)     return "$" + (v / 1_000).toFixed(1) + "K";
  if (v >= 1)         return "$" + v.toFixed(2);
  if (v > 0)          return "$" + v.toExponential(2);
  return "$0";
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
