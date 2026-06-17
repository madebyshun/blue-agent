"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
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
  const [showLaunch, setShowLaunch] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/launches")
      .then((r) => r.json())
      .then((d: FeedResponse) => setData(d))
      .catch(() => setError("Failed to load launches"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const launches = data?.launches ?? [];

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">
      {showLaunch && <LaunchModal onClose={() => setShowLaunch(false)} onLaunched={load} />}
      <AppPageHeader
        label="LAUNCHES"
        subtitle="Tokens launched through Blue Chat · live on Base"
        accent={ACCENT}
        right={
          <button onClick={() => setShowLaunch(true)} className="hover:text-[#F59E0B] transition-colors">
            + Launch a token →
          </button>
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
              <button onClick={() => setShowLaunch(true)}
                className="inline-block font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all"
                style={{ background: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>
                Launch a token →
              </button>
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
  const { address, isConnected } = useAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<"idle" | "launching" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [out, setOut] = useState<{ tokenAddress?: string | null; basescan?: string | null; uniswap?: string | null; bankr?: string | null } | null>(null);

  const cleanName = name.trim();
  const cleanSymbol = symbol.replace(/^\$/, "").trim();

  async function launch() {
    if (!cleanName || step === "launching") return;
    setStep("launching"); setErr("");
    try {
      const res = await fetch("/api/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenName: cleanName,
          tokenSymbol: cleanSymbol || undefined,
          description: description.trim() || undefined,
          // 57% creator fee → your wallet when connected, else defaults to @blueagent_.
          feeRecipientType: isConnected && address ? "wallet" : "x",
          feeRecipientValue: isConnected && address ? address : "blueagent_",
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
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3 font-mono text-[10px]">
              <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
                <div className="text-slate-600 mb-0.5">SUPPLY</div><div className="text-slate-300">100B fixed</div>
              </div>
              <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
                <div className="text-slate-600 mb-0.5">CREATOR FEE</div><div className="text-[#22C55E]">57% of 1.2%</div>
              </div>
            </div>

            <p className="font-mono text-[9px] text-slate-600 mb-3 leading-relaxed">
              Creator fees → <span className="text-slate-400">{isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)} (your wallet)` : "@blueagent_ (connect wallet to claim)"}</span>. Deploys a <span className="text-amber-400">real, irreversible</span> token on Base via Bankr · gas sponsored.
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
