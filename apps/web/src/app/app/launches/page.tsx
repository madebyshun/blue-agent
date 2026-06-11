"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppPageHeader from "@/components/app/AppPageHeader";

const ACCENT = "#F59E0B";

// ── Types (mirror /api/launches) ───────────────────────────────────────────────

type Market = {
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  change24h: number | null;
};
type Launch = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  image?: string | null;
  website?: string | null;
  description?: string | null;
  feeRecipient: { type: string; value: string };
  txHash?: string | null;
  launchedAt: number;
  market: Market | null;
};
type FeedResponse = {
  ok: boolean;
  count: number;
  stats: { tracked: number; totalMarketCap: number; totalVolume24h: number };
  launches: Launch[];
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}
function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return "$" + n.toFixed(3);
  if (n >= 0.0001) return "$" + n.toFixed(6);
  return "$" + n.toExponential(2);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}
function fmtAge(ts: number): string {
  const s = Math.max(0, Date.now() - ts) / 1000;
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
function truncAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ── Token card ─────────────────────────────────────────────────────────────────

function LaunchCard({ l }: { l: Launch }) {
  const [copied, setCopied] = useState(false);
  const sym = (l.tokenSymbol || l.tokenName || "?").replace(/^\$/, "");
  const change = l.market?.change24h;
  const changeColor = change == null ? "#64748b" : change >= 0 ? "#22C55E" : "#EF4444";

  function copyAddr() {
    navigator.clipboard?.writeText(l.tokenAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="card-surface card-hover rounded-2xl p-4 flex flex-col gap-3">
      {/* Header: logo + name + age */}
      <div className="flex items-center gap-3">
        {l.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.image} alt={sym} className="w-10 h-10 rounded-xl object-cover shrink-0 bg-[#0d0d12]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
            style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
            {sym.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold text-white truncate">{l.tokenName || sym}</div>
          <div className="font-mono text-[11px] text-slate-500">${sym}</div>
        </div>
        <div className="font-mono text-[9px] text-slate-600 shrink-0">{fmtAge(l.launchedAt)} ago</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 font-mono">
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">PRICE</div>
          <div className="text-[11px] text-slate-200">{fmtPrice(l.market?.priceUsd)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">MCAP</div>
          <div className="text-[11px] text-slate-200">{fmtUsd(l.market?.marketCap)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">24H</div>
          <div className="text-[11px]" style={{ color: changeColor }}>{fmtPct(change)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">VOL 24H</div>
          <div className="text-[11px] text-slate-200">{fmtUsd(l.market?.volume24h)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">LIQ</div>
          <div className="text-[11px] text-slate-200">{fmtUsd(l.market?.liquidityUsd)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">FEE →</div>
          <div className="text-[11px] text-slate-400 truncate">
            {l.feeRecipient.type === "wallet" ? truncAddr(l.feeRecipient.value) : `${l.feeRecipient.value}`}
          </div>
        </div>
      </div>

      {/* Address + copy */}
      <button onClick={copyAddr}
        className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors self-start"
        title="Copy token address">
        <span>{truncAddr(l.tokenAddress)}</span>
        <span style={{ color: copied ? "#22C55E" : undefined }}>{copied ? "✓ copied" : "⧉"}</span>
      </button>

      {/* Links */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#1A1A2E]">
        <a href={`https://app.uniswap.org/swap?outputCurrency=${l.tokenAddress}&chain=base`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] px-2 py-1 rounded-lg border transition-colors"
          style={{ borderColor: `${ACCENT}30`, color: ACCENT }}>
          Trade ↗
        </a>
        <a href={`https://bankr.bot/launches/${l.tokenAddress}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] transition-colors">
          Bankr ↗
        </a>
        <a href={`https://basescan.org/token/${l.tokenAddress}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
          Basescan ↗
        </a>
        {l.website && (
          <a href={l.website} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Site ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LaunchesPage() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/launches")
      .then((r) => r.json())
      .then((d: FeedResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Failed to load launches"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const launches = data?.launches ?? [];

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">
      <AppPageHeader
        label="LAUNCHES"
        subtitle="Tokens launched through Blue Chat · live on Base"
        accent={ACCENT}
        right={
          <Link href="/app/chat" className="hover:text-[#F59E0B] transition-colors">
            + Launch a token →
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto relative">
        {/* Ambient glow */}
        <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[300px]">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${ACCENT}0A 0%, transparent 70%)` }} />
        </div>

        <div className="relative px-6 py-6 max-w-5xl mx-auto">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatChip label="TOKENS LAUNCHED" value={loading ? "…" : String(data?.count ?? 0)} />
            <StatChip label="TOTAL MCAP" value={loading ? "…" : fmtUsd(data?.stats.totalMarketCap)} />
            <StatChip label="24H VOLUME" value={loading ? "…" : fmtUsd(data?.stats.totalVolume24h)} />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
              <span className="text-xs text-slate-600">Loading launches…</span>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : launches.length === 0 ? (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-10 text-center">
              <div className="text-3xl mb-3">🚀</div>
              <p className="text-sm text-slate-400 mb-1">No tokens launched yet</p>
              <p className="text-[11px] text-slate-600 mb-4">
                Be the first — launch a token on Base in seconds through Blue Chat.
              </p>
              <Link href="/app/chat"
                className="inline-block font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all"
                style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
                Launch a token →
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {launches.map((l) => <LaunchCard key={l.tokenAddress} l={l} />)}
            </div>
          )}

          <p className="font-mono text-[9px] text-slate-700 text-center mt-8">
            Market data from DexScreener · 100B fixed supply · Uniswap V4 · gas sponsored by Bankr
          </p>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-4 py-3">
      <div className="font-mono text-[8px] text-slate-600 tracking-widest mb-1">{label}</div>
      <div className="font-mono text-lg font-bold" style={{ color: ACCENT }}>{value}</div>
    </div>
  );
}
