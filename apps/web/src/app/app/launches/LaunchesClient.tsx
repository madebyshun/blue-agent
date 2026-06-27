"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";

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

// A6 — Creator label helper
function fmtCreator(fee: { type: string; value: string }): string {
  if (fee.type === "x") return "@" + fee.value;
  return truncAddr(fee.value);
}

// A8 — Mini sparkline SVG (5-point simulated from change24h)
function Sparkline({ price, change24h }: { price: number; change24h: number | null }) {
  if (price <= 0 || change24h == null) return null;
  // Simulate 5 points: start at price/(1+change/100), end at price
  const end = price;
  const start = price / (1 + change24h / 100);
  // Interpolate with a slight curve in the middle
  const pts = [
    start,
    start + (end - start) * 0.15 + (end - start) * 0.05 * Math.sin(0.5),
    start + (end - start) * 0.4 + (end - start) * 0.08 * Math.sin(1.2),
    start + (end - start) * 0.75 + (end - start) * 0.04 * Math.sin(2.0),
    end,
  ];
  const minPt = Math.min(...pts);
  const maxPt = Math.max(...pts);
  const range = maxPt - minPt || 1;
  const W = 64;
  const H = 20;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((v - minPt) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = coords.join(" ");
  const color = change24h >= 0 ? "#22C55E" : "#EF4444";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

// A5 — Hot badge
function HotBadge() {
  return (
    <span
      className="absolute top-2.5 right-2.5 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md"
      style={{ background: "#F59E0B20", color: "#F59E0B", border: "1px solid #F59E0B40" }}
    >
      🔥 HOT
    </span>
  );
}

// ── In-app Trade button ─────────────────────────────────────────────────────────
// Replaces the old external Uniswap deep-link. Routes into Blue Chat with a
// pre-filled (NOT auto-sent) trade prompt so the user never leaves BlueAgent —
// the LLM then guides price/liquidity/swap. Bankr's /wallet/swap API operates on
// Bankr's own custodial wallet (not the user's connected EOA), so it's the wrong
// tool for "let the connected user trade"; the chat redirect is the right path.

function buildTradeUrl(l: Launch): string {
  const sym = (l.tokenSymbol || l.tokenName || "token").replace(/^\$/, "");
  const msg = `I want to buy $${sym} (${l.tokenAddress}) on Base. What's the current price, liquidity, and the safest way to swap into it?`;
  return `/app/chat?prefill=${encodeURIComponent(msg)}`;
}

function TradeButton({ l, compact }: { l: Launch; compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(buildTradeUrl(l))}
      title="Trade in Blue Chat"
      className={compact
        ? "px-2 py-0.5 rounded border text-[9px] transition-colors hover:opacity-90"
        : "font-mono text-[10px] px-2 py-1 rounded-lg border transition-colors hover:opacity-90"}
      style={{ borderColor: `${ACCENT}30`, color: ACCENT }}
    >
      Trade →
    </button>
  );
}

// ── Token card ─────────────────────────────────────────────────────────────────

function LaunchCard({ l }: { l: Launch }) {
  const [copied, setCopied] = useState(false);
  const sym = (l.tokenSymbol || l.tokenName || "?").replace(/^\$/, "");
  const change = l.market?.change24h;
  const changeColor = change == null ? "#64748b" : change >= 0 ? "#22C55E" : "#EF4444";
  const isHot = (l.market?.volume24h ?? 0) > 10000;

  function copyAddr() {
    navigator.clipboard?.writeText(l.tokenAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="card-surface card-hover rounded-2xl p-4 flex flex-col gap-3 relative">
      {/* A5 */}
      {isHot && <HotBadge />}

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
        <div className="font-mono text-[9px] text-slate-600 shrink-0 pr-1">{fmtAge(l.launchedAt)} ago</div>
      </div>

      {/* A8 — Sparkline */}
      {l.market?.priceUsd != null && (
        <div className="flex justify-end">
          <Sparkline price={l.market.priceUsd} change24h={l.market.change24h} />
        </div>
      )}

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
        {/* A6 — Creator */}
        <div>
          <div className="text-[8px] text-slate-600 tracking-widest mb-0.5">CREATOR</div>
          <div className="text-[11px] text-slate-400 truncate">
            {fmtCreator(l.feeRecipient)}
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
        <TradeButton l={l} />
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

// ── List row (A1) ──────────────────────────────────────────────────────────────

function LaunchRow({ l }: { l: Launch }) {
  const [copied, setCopied] = useState(false);
  const sym = (l.tokenSymbol || l.tokenName || "?").replace(/^\$/, "");
  const change = l.market?.change24h;
  const changeColor = change == null ? "#64748b" : change >= 0 ? "#22C55E" : "#EF4444";
  const isHot = (l.market?.volume24h ?? 0) > 10000;

  function copyAddr() {
    navigator.clipboard?.writeText(l.tokenAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="grid items-center gap-3 px-4 py-2.5 border-b border-[#1A1A2E] hover:bg-[#0d0d16] transition-colors font-mono text-[11px]"
      style={{ gridTemplateColumns: "180px 90px 100px 70px 100px 50px 1fr" }}>
      {/* Logo + Name */}
      <div className="flex items-center gap-2 min-w-0">
        {l.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.image} alt={sym} className="w-6 h-6 rounded-md object-cover shrink-0 bg-[#0d0d12]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
            style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
            {sym.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-white font-bold truncate text-[11px] flex items-center gap-1">
            {l.tokenName || sym}
            {isHot && <span style={{ color: ACCENT }}>🔥</span>}
          </div>
          <div className="text-slate-600 text-[9px]">${sym}</div>
        </div>
      </div>
      {/* Price */}
      <div className="text-slate-200 tabular-nums">{fmtPrice(l.market?.priceUsd)}</div>
      {/* MCAP */}
      <div className="text-slate-200 tabular-nums">{fmtUsd(l.market?.marketCap)}</div>
      {/* 24H% */}
      <div style={{ color: changeColor }} className="tabular-nums">{fmtPct(change)}</div>
      {/* Volume */}
      <div className="text-slate-200 tabular-nums">{fmtUsd(l.market?.volume24h)}</div>
      {/* Age */}
      <div className="text-slate-600 tabular-nums">{fmtAge(l.launchedAt)}</div>
      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TradeButton l={l} compact />
        <a href={`https://bankr.bot/launches/${l.tokenAddress}`}
          target="_blank" rel="noopener noreferrer"
          className="px-2 py-0.5 rounded border border-[#4FC3F730] text-[#4FC3F7] text-[9px] transition-colors">
          Bankr ↗
        </a>
        <button onClick={copyAddr}
          className="px-2 py-0.5 rounded border border-[#1A1A2E] text-[9px] text-slate-600 hover:text-slate-300 transition-colors">
          {copied ? "✓" : truncAddr(l.tokenAddress)}
        </button>
      </div>
    </div>
  );
}

// ── List header (A1) ──────────────────────────────────────────────────────────

function ListHeader({
  sort,
  onSort,
}: {
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const col = (label: string, key: SortKey | null, style?: string) => (
    <div
      className={`font-mono text-[8px] tracking-widest text-slate-600 select-none ${key ? "cursor-pointer hover:text-slate-400 transition-colors" : ""} ${style ?? ""}`}
      onClick={key ? () => onSort(key) : undefined}
    >
      {label}
      {key && sort === key && <span className="ml-0.5" style={{ color: ACCENT }}>▼</span>}
    </div>
  );
  return (
    <div className="grid items-center gap-3 px-4 py-2 border-b border-[#1A1A2E] bg-[#07070b]"
      style={{ gridTemplateColumns: "180px 90px 100px 70px 100px 50px 1fr" }}>
      {col("NAME", null)}
      {col("PRICE", "price")}
      {col("MCAP", "mcap")}
      {col("24H%", "change")}
      {col("VOLUME", "volume")}
      {col("AGE", "age")}
      {col("ACTIONS", null)}
    </div>
  );
}

// ── Sort / Filter / Search types ───────────────────────────────────────────────

type SortKey = "newest" | "volume" | "mcap" | "change" | "price" | "age";
type FilterTab = "all" | "live" | "new" | "hot" | "mine";
type ViewMode = "grid" | "list";

const SORT_OPTIONS: { label: string; key: SortKey }[] = [
  { label: "Newest", key: "newest" },
  { label: "Volume", key: "volume" },
  { label: "MCAP", key: "mcap" },
  { label: "24H%", key: "change" },
];

const FILTER_TABS: { label: string; key: FilterTab }[] = [
  { label: "All", key: "all" },
  { label: "Live", key: "live" },
  { label: "New", key: "new" },
  { label: "Hot 🔥", key: "hot" },
  { label: "My Tokens 👤", key: "mine" },
];

function applyFilter(launches: Launch[], tab: FilterTab): Launch[] {
  switch (tab) {
    case "live":
      return launches.filter((l) => l.market?.priceUsd != null);
    case "new":
      return launches.filter((l) => l.launchedAt > Date.now() - 86400000);
    case "hot":
      return launches.filter((l) => (l.market?.volume24h ?? 0) > 10000);
    default:
      return launches;
  }
}

function applySort(launches: Launch[], key: SortKey): Launch[] {
  const copy = [...launches];
  switch (key) {
    case "newest":
      return copy.sort((a, b) => b.launchedAt - a.launchedAt);
    case "volume":
      return copy.sort((a, b) => (b.market?.volume24h ?? 0) - (a.market?.volume24h ?? 0));
    case "mcap":
      return copy.sort((a, b) => (b.market?.marketCap ?? 0) - (a.market?.marketCap ?? 0));
    case "change":
      return copy.sort((a, b) => (b.market?.change24h ?? -Infinity) - (a.market?.change24h ?? -Infinity));
    case "price":
      return copy.sort((a, b) => (b.market?.priceUsd ?? 0) - (a.market?.priceUsd ?? 0));
    case "age":
      return copy.sort((a, b) => a.launchedAt - b.launchedAt);
  }
}

function applySearch(launches: Launch[], q: string): Launch[] {
  if (!q.trim()) return launches;
  const lower = q.toLowerCase();
  return launches.filter(
    (l) =>
      l.tokenName?.toLowerCase().includes(lower) ||
      l.tokenSymbol?.toLowerCase().includes(lower)
  );
}

function isTestToken(l: Launch): boolean {
  return (
    l.tokenName?.toLowerCase() === "test" ||
    l.tokenSymbol?.toLowerCase() === "test"
  );
}

// ── Auto-refresh countdown dot (A7) ───────────────────────────────────────────

function RefreshDot({ countdown }: { countdown: number }) {
  // countdown: 0-30, fill proportion
  const pct = countdown / 30;
  return (
    <span
      title={`Auto-refresh in ${countdown}s`}
      className="inline-flex items-center gap-1 font-mono text-[9px] text-slate-700 select-none"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full transition-colors"
        style={{
          background: pct > 0.5 ? "#22C55E" : pct > 0.15 ? ACCENT : "#EF4444",
          opacity: 0.7,
        }}
      />
      {countdown}s
    </span>
  );
}

// ── My Tokens (creator-fee dashboard) ───────────────────────────────────────────
// Lists tokens the CONNECTED wallet launched, with unclaimed creator fees pulled
// live from Bankr's public Doppler creator-fees endpoint (via /api/my-tokens).
// Claim Fees is an ONCHAIN tx: /api/claim-fees builds Bankr's calldata, the user
// signs it from their own wallet (wagmi). ZERO fabricated USD — raw amounts only.

type MyToken = {
  tokenAddress: string;
  name: string;
  symbol: string;
  share: string | null;
  token0Label: string | null;
  token1Label: string | null;
  claimable: { token0: string; token1: string };
  claimed: { token0: string; token1: string; count: number };
  hasClaimable: boolean;
};
type MyTokensResponse = { ok: boolean; address: string; tokens: MyToken[]; error?: string };
type ClaimTx = { to: string; data: string; chainId: number; gasEstimate?: string; description?: string };
type ClaimResponse = { ok: boolean; transactions: ClaimTx[]; error?: string };

// Compact amount formatter for raw token strings (no USD invented).
function fmtAmt(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}

function MyTokenCard({ t, owner, onClaimed }: { t: MyToken; owner: string; onClaimed: () => void }) {
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<"idle" | "building" | "signing" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);

  const sym = (t.symbol || t.name || "?").replace(/^\$/, "");
  const busy = status === "building" || status === "signing";

  function copyAddr() {
    navigator.clipboard?.writeText(t.tokenAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  async function claim() {
    if (busy) return;
    setStatus("building"); setMsg(""); setTxHash("");
    try {
      const res = await fetch("/api/claim-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryAddress: owner, tokenAddress: t.tokenAddress }),
      });
      const d = (await res.json()) as ClaimResponse;
      if (!d.ok || d.transactions.length === 0) {
        setMsg(d.error || "Nothing to claim."); setStatus("error"); return;
      }
      // Make sure we're on Base before signing.
      try { await switchChainAsync({ chainId: 8453 }); } catch { /* user may already be on Base */ }
      setStatus("signing");
      let last = "";
      for (const tx of d.transactions) {
        last = await sendTransactionAsync({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          chainId: 8453,
        });
      }
      setTxHash(last);
      setStatus("done");
      setMsg("Fees claimed.");
      setTimeout(onClaimed, 2500); // refresh balances after the tx settles
    } catch (e) {
      const m = (e as Error).message || "Claim failed.";
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setMsg(cancelled ? "Claim cancelled." : m.slice(0, 120));
      setStatus("error");
    }
  }

  return (
    <div className="card-surface rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
          style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
          {sym.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold text-white truncate">{t.name || sym}</div>
          <div className="font-mono text-[11px] text-slate-500">${sym}</div>
        </div>
        {t.share && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-md shrink-0"
            style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
            {t.share} fee
          </span>
        )}
      </div>

      {/* Unclaimed fees */}
      <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3">
        <div className="font-mono text-[8px] text-slate-600 tracking-widest mb-1.5">UNCLAIMED FEES</div>
        <div className="grid grid-cols-2 gap-2 font-mono">
          <div>
            <div className="text-[13px] font-bold text-slate-100 tabular-nums">{fmtAmt(t.claimable.token0)}</div>
            <div className="text-[9px] text-slate-600">{t.token0Label ?? "token0"}</div>
          </div>
          <div>
            <div className="text-[13px] font-bold text-slate-100 tabular-nums">{fmtAmt(t.claimable.token1)}</div>
            <div className="text-[9px] text-slate-600">{t.token1Label ?? "token1"}</div>
          </div>
        </div>
        {t.claimed.count > 0 && (
          <div className="font-mono text-[9px] text-slate-600 mt-2 pt-2 border-t border-[#1A1A2E]">
            Claimed {t.claimed.count}× already
          </div>
        )}
      </div>

      {/* Address */}
      <button onClick={copyAddr}
        className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors self-start"
        title="Copy token address">
        <span>{truncAddr(t.tokenAddress)}</span>
        <span style={{ color: copied ? "#22C55E" : undefined }}>{copied ? "✓ copied" : "⧉"}</span>
      </button>

      {/* Claim status */}
      {status !== "idle" && (
        <div className="font-mono text-[10px]"
          style={{ color: status === "done" ? "#22C55E" : status === "error" ? "#EF4444" : ACCENT }}>
          {status === "building" && "Building claim…"}
          {status === "signing" && "Confirm in your wallet…"}
          {status === "done" && (
            <span>
              ✓ {msg}{" "}
              {txHash && (
                <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="underline hover:opacity-80">view tx ↗</a>
              )}
            </span>
          )}
          {status === "error" && `⚠ ${msg}`}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#1A1A2E]">
        <button
          onClick={claim}
          disabled={busy || !t.hasClaimable}
          className="font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40"
          style={{ borderColor: `${ACCENT}40`, color: ACCENT, background: `${ACCENT}10` }}
          title={t.hasClaimable ? "Claim creator fees" : "No unclaimed fees yet"}>
          {busy ? "Claiming…" : t.hasClaimable ? "Claim Fees" : "No fees yet"}
        </button>
        <a href={`/app/b20?address=${t.tokenAddress}`}
          className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
          Scanner →
        </a>
        <a href={`https://bankr.bot/launches/${t.tokenAddress}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] transition-colors">
          Bankr ↗
        </a>
        <a href={`https://basescan.org/token/${t.tokenAddress}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] px-2 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
          Basescan ↗
        </a>
      </div>
    </div>
  );
}

function MyTokensView({ onLaunch }: { onLaunch: () => void }) {
  const { address, isConnected } = useAccount();
  const [tokens, setTokens] = useState<MyToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!address) return;
    setLoading(true); setErr("");
    fetch(`/api/my-tokens?address=${address}`)
      .then((r) => r.json())
      .then((d: MyTokensResponse) => {
        if (d.ok) setTokens(d.tokens);
        else { setErr(d.error || "Failed to load your tokens."); setTokens([]); }
      })
      .catch(() => setErr("Failed to load your tokens."))
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => { if (isConnected && address) load(); }, [isConnected, address, load]);

  // Not connected → connect gate.
  if (!isConnected || !address) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-10 text-center">
        <div className="text-3xl mb-3">👤</div>
        <p className="text-sm text-slate-400 mb-1">Connect your wallet</p>
        <p className="text-[11px] text-slate-600">
          See the tokens you&apos;ve launched and claim your creator fees.
        </p>
      </div>
    );
  }

  if (loading && !tokens) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
        <span className="text-xs text-slate-600">Loading your tokens…</span>
      </div>
    );
  }

  if (err && (!tokens || tokens.length === 0)) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
        <p className="text-sm text-red-400 mb-3">{err}</p>
        <button onClick={load}
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (tokens && tokens.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-10 text-center">
        <div className="text-3xl mb-3">🚀</div>
        <p className="text-sm text-slate-400 mb-1">No tokens launched yet</p>
        <p className="text-[11px] text-slate-600 mb-4">
          Launch a token on Base in seconds — you keep the 57% creator fee.
        </p>
        <button onClick={onLaunch}
          className="inline-block font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all"
          style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
          Launch a token →
        </button>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {(tokens ?? []).map((t) => (
        <MyTokenCard key={t.tokenAddress} t={t} owner={address} onClaimed={load} />
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LaunchesPage() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLaunch, setShowLaunch] = useState(false);

  // A1 — view mode
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // A2 — sort
  const [sort, setSort] = useState<SortKey>("newest");

  // A3 — filter tab
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  // A4 — search
  const [search, setSearch] = useState("");

  // A7 — auto-refresh countdown
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);

  // A9 — show test tokens toggle
  const [showTest, setShowTest] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/launches")
      .then((r) => r.json())
      .then((d: FeedResponse) => setData(d))
      .catch(() => setError("Failed to load launches"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // A7 — 30s auto-refresh + countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = 30;
        setCountdown(30);
        load();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [load]);

  // Reset countdown on manual load
  const manualLoad = useCallback(() => {
    countdownRef.current = 30;
    setCountdown(30);
    load();
  }, [load]);

  // Derived list: filter test → filter tab → search → sort
  const allLaunches = data?.launches ?? [];
  const withoutTest = showTest ? allLaunches : allLaunches.filter((l) => !isTestToken(l));
  const filtered = applyFilter(withoutTest, filterTab);
  const searched = applySearch(filtered, search);
  const launches = applySort(searched, sort);

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">
      {showLaunch && <LaunchModal onClose={() => setShowLaunch(false)} onLaunched={manualLoad} />}

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-[#1A1A2E] shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// LAUNCHES</p>
          <p className="font-mono text-[10px] text-slate-700 truncate mt-1">Fair launch on Base via Bankr</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* A7 — refresh dot */}
          <RefreshDot countdown={countdown} />
          {/* A1 — view toggle */}
          <div className="flex items-center rounded-lg border border-[#1A1A2E] overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className="px-2 py-1.5 font-mono text-[10px] transition-colors"
              style={{
                background: viewMode === "grid" ? `${ACCENT}18` : "transparent",
                color: viewMode === "grid" ? ACCENT : "#64748b",
              }}
              title="Grid view"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="px-2 py-1.5 font-mono text-[10px] transition-colors"
              style={{
                background: viewMode === "list" ? `${ACCENT}18` : "transparent",
                color: viewMode === "list" ? ACCENT : "#64748b",
              }}
              title="List view"
            >
              ≡
            </button>
          </div>
          <button
            onClick={() => setShowLaunch(true)}
            className="font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all shrink-0 hover:opacity-90"
            style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}
          >
            Launch Token →
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {/* Ambient glow */}
        <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[300px]">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${ACCENT}0A 0%, transparent 70%)` }} />
        </div>

        <div className="relative px-4 sm:px-6 py-6">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatChip label="TOKENS LAUNCHED" value={loading ? "…" : String(data?.count ?? 0)} />
            <StatChip label="TOTAL MCAP" value={loading ? "…" : fmtUsd(data?.stats.totalMarketCap)} />
            <StatChip label="24H VOLUME" value={loading ? "…" : fmtUsd(data?.stats.totalVolume24h)} />
          </div>

          {/* A3 — Filter tabs */}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {FILTER_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilterTab(t.key)}
                className="font-mono text-[10px] px-3 py-1 rounded-full border transition-colors"
                style={{
                  background: filterTab === t.key ? `${ACCENT}15` : "transparent",
                  color: filterTab === t.key ? ACCENT : "#64748b",
                  borderColor: filterTab === t.key ? `${ACCENT}40` : "#1A1A2E",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* A4 Search + A2 Sort row — hidden in My Tokens (operates on public feed) */}
          {filterTab !== "mine" && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {/* A4 — search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search token name or symbol…"
              className="flex-1 min-w-[180px] bg-[#0a0a0f] border border-[#1A1A2E] focus:border-[#F59E0B]/30 rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-300 placeholder:text-slate-700 outline-none transition-colors"
            />
            {/* A2 — sort */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-mono text-[9px] text-slate-700 mr-1">SORT</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  className="font-mono text-[9px] px-2 py-1 rounded-md border transition-colors"
                  style={{
                    background: sort === opt.key ? `${ACCENT}15` : "transparent",
                    color: sort === opt.key ? ACCENT : "#64748b",
                    borderColor: sort === opt.key ? `${ACCENT}40` : "#1A1A2E",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {filterTab === "mine" ? (
            <MyTokensView onLaunch={() => setShowLaunch(true)} />
          ) : loading ? (
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
              <p className="text-sm text-slate-400 mb-1">
                {search || filterTab !== "all" ? "No tokens match your filters" : "No tokens launched yet"}
              </p>
              <p className="text-[11px] text-slate-600 mb-4">
                {search || filterTab !== "all"
                  ? "Try adjusting your search or filter."
                  : "Be the first — launch a token on Base in seconds through Blue Chat."}
              </p>
              {!search && filterTab === "all" && (
                <button onClick={() => setShowLaunch(true)}
                  className="inline-block font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all"
                  style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
                  Launch a token →
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {launches.map((l) => <LaunchCard key={l.tokenAddress} l={l} />)}
            </div>
          ) : (
            /* List view */
            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <ListHeader sort={sort} onSort={setSort} />
              <div>
                {launches.map((l) => <LaunchRow key={l.tokenAddress} l={l} />)}
              </div>
            </div>
          )}

          {/* A9 — Show test tokens toggle */}
          <div className="flex justify-center mt-6">
            <button
              onClick={() => setShowTest((v) => !v)}
              className="font-mono text-[9px] text-slate-700 hover:text-slate-500 transition-colors flex items-center gap-1.5"
            >
              <span
                className="inline-block w-3 h-3 rounded border border-[#1A1A2E] flex items-center justify-center"
                style={{ background: showTest ? `${ACCENT}20` : "transparent" }}
              >
                {showTest && <span style={{ color: ACCENT, fontSize: 8, lineHeight: 1 }}>✓</span>}
              </span>
              Show test tokens
            </button>
          </div>

          <p className="font-mono text-[9px] text-slate-700 text-center mt-4">
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

// ── Launch modal ─────────────────────────────────────────────────────────────
// Same deploy path as the chat /launch card (POST /api/launch-token → Bankr
// launchpad, gas sponsored, 57% creator fee → the user's wallet). Inline UX so
// the user never leaves /app/launches.

function ModalField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] text-slate-600 mb-1">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#F59E0B]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors" />
    </div>
  );
}

function LaunchModal({ onClose, onLaunched }: { onClose: () => void; onLaunched: () => void }) {
  const { address } = useAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [feeRecipient, setFeeRecipient] = useState("");
  const [step, setStep] = useState<"idle" | "launching" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [out, setOut] = useState<{ tokenAddress?: string | null; basescan?: string | null; uniswap?: string | null; bankr?: string | null } | null>(null);

  // Fee recipient is left BLANK by default → the 57% creator fee routes to
  // @blueagent_ (see `fee || "blueagent_"` in launch()). The user can opt to
  // redirect it to their own wallet/handle by filling the field.

  const cleanName = name.trim();
  const cleanSymbol = symbol.replace(/^\$/, "").trim();

  async function launch() {
    if (!cleanName || step === "launching") return;
    setStep("launching"); setErr("");
    try {
      const fee = feeRecipient.trim();
      const tw = twitter.trim().replace(/^@/, "");
      const res = await fetch("/api/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenName: cleanName,
          tokenSymbol: cleanSymbol || undefined,
          description: description.trim() || undefined,
          image: image.trim() || undefined,
          website: website.trim() || undefined,
          tweetUrl: tw ? `https://x.com/${tw}` : undefined,
          // 57% creator fee → the entered wallet, else default to @blueagent_.
          feeRecipientType: fee ? "wallet" : "x",
          feeRecipientValue: fee || "blueagent_",
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error ?? `Launch failed (${res.status})`); setStep("error"); return; }
      setOut({ tokenAddress: d.tokenAddress ?? null, basescan: d.basescan ?? null, uniswap: d.uniswap ?? null, bankr: d.bankr ?? null });
      setStep("done");
      onLaunched();
    } catch (e) {
      setErr((e as Error).message); setStep("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={step === "launching" ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-mono text-sm font-bold" style={{ color: ACCENT }}>🚀 Launch a token</div>
          <button onClick={onClose} disabled={step === "launching"}
            className="font-mono text-slate-600 hover:text-white text-xl leading-none disabled:opacity-40">×</button>
        </div>

        {step === "done" ? (
          <div className="rounded-xl border p-4" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
            <div className="font-mono text-[12px] font-bold mb-1" style={{ color: "#22C55E" }}>${cleanSymbol || cleanName} launched on Base</div>
            {out?.tokenAddress && <div className="font-mono text-[10px] text-slate-400 mb-3 break-all">{out.tokenAddress}</div>}
            <div className="flex flex-wrap gap-2 mb-3">
              {out?.bankr && <a href={out.bankr} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7]">Bankr ↗</a>}
              {out?.basescan && <a href={out.basescan} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white">Basescan ↗</a>}
              {out?.uniswap && <a href={out.uniswap} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#F59E0B30] text-[#F59E0B]">Trade ↗</a>}
            </div>
            <button onClick={onClose} className="w-full font-mono text-[12px] font-bold py-2 rounded-lg" style={{ background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E40" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0" style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
                {(cleanSymbol || cleanName).slice(0, 2).toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-white truncate">{cleanName || "Your token name"}</div>
                <div className="font-mono text-[11px] text-slate-500">${cleanSymbol || "TICKER"}</div>
              </div>
            </div>

            <div className="space-y-2.5 mb-4">
              <ModalField label="TOKEN NAME *" value={name} onChange={setName} placeholder="e.g. Blue Agent" />
              <ModalField label="TICKER" value={symbol} onChange={setSymbol} placeholder="auto from name" />
              <ModalField label="DESCRIPTION" value={description} onChange={setDescription} placeholder="One-line pitch (optional)" />

              {/* Token image — URL + live preview */}
              <div>
                <div className="font-mono text-[9px] text-slate-600 mb-1">TOKEN IMAGE (URL)</div>
                <div className="flex items-center gap-2">
                  {image.trim() && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.trim()} alt="logo" className="w-9 h-9 rounded-lg object-cover bg-[#0d0d12] shrink-0 border border-[#1A1A2E]"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
                  )}
                  <input value={image} onChange={e => setImage(e.target.value)} placeholder="https://…/logo.png"
                    className="flex-1 min-w-0 bg-[#050508] border border-[#1A1A2E] focus:border-[#F59E0B]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors" />
                </div>
              </div>

              <ModalField label="WEBSITE (optional)" value={website} onChange={setWebsite} placeholder="https://… (optional)" />
              <ModalField label="TWITTER (optional)" value={twitter} onChange={setTwitter} placeholder="@handle (optional)" />
              <ModalField label="FEE RECIPIENT · 57% creator fee" value={feeRecipient} onChange={setFeeRecipient}
                placeholder={address ? "your wallet — or 0x… / blank → @blueagent_" : "0x… — or blank → @blueagent_"} />
            </div>


            <p className="font-mono text-[9px] text-slate-600 mb-3 leading-relaxed">
              Deploys a <span className="text-amber-400">real, irreversible</span> token on Base via Bankr · 100B fixed supply · gas sponsored. Leave fee recipient blank to default to @blueagent_.
            </p>

            {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

            <button onClick={launch} disabled={step === "launching" || !cleanName}
              className="w-full font-mono text-[12px] font-bold py-2.5 rounded-lg transition-all disabled:opacity-50"
              style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
              {step === "launching" ? "Launching…" : `🚀 Launch $${cleanSymbol || "TOKEN"} on Base`}
            </button>
            <p className="font-mono text-[9px] text-slate-700 mt-1.5 text-center">
              {cleanName ? "Bankr allows 1 launch/min per wallet." : "Enter a token name to launch."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
