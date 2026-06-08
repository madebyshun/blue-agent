"use client";

/**
 * Builder dashboard client — fetches APIs registered to a given wallet
 * from /api/me/apis. Until wagmi is wired, the user pastes their address
 * into a field; once wallet connect lands this becomes automatic.
 */

import Link from "next/link";
import { useState } from "react";

interface API {
  id:             string;
  name:           string;
  provider:       string;
  description:    string;
  category:       string;
  endpoint:       string;
  price:          string;
  priceUSDC:      number;
  builderAddress: string;
  submittedAt:    number;
  verified:       boolean;
  aiReady:        boolean;
  callCount?:     number;
  revenueTotal?:  number;
}

interface Resp {
  wallet: string;
  stats:  { apis: number; calls: number; revenue: number };
  apis:   API[];
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
function shortAddr(a: string)  { return a.slice(0, 6) + "…" + a.slice(-4); }
function usdc(units: number)   { return `$${(units / 1_000_000).toFixed(4)}`; }
function relTime(ms: number) {
  const d = Date.now() - ms;
  if (d < 60_000)    return "just now";
  if (d < 3600_000)  return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function DashboardClient() {
  const [wallet, setWallet]   = useState("");
  const [data,   setData]     = useState<Resp | null>(null);
  const [busy,   setBusy]     = useState(false);
  const [err,    setErr]      = useState<string | null>(null);

  async function fetchMe() {
    if (!ADDR_RE.test(wallet)) {
      setErr("Enter a valid Base address (0x…40 hex chars).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/apis?wallet=${wallet}`);
      const d = await res.json() as Resp | { error: string };
      if (!res.ok) throw new Error((d as { error: string }).error);
      setData(d as Resp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 sm:px-8 py-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="font-mono text-[11px] text-slate-600 mt-1">Track APIs you&apos;ve registered · monitor calls · accrued USDC</p>
        </div>
        <Link href="/submit"
          className="font-mono text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
          + Register another
        </Link>
      </div>

      {/* Wallet input (will be replaced by wagmi connect) */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 mb-6">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">YOUR WALLET</p>
        <div className="flex gap-2">
          <input
            value={wallet}
            onChange={e => setWallet(e.target.value)}
            placeholder="0x…"
            className="flex-1 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
          />
          <button onClick={fetchMe} disabled={busy || !wallet}
            className="font-mono text-xs font-semibold px-4 py-2 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] disabled:opacity-50 transition-colors">
            {busy ? "…" : "Load"}
          </button>
        </div>
        <p className="font-mono text-[10px] text-slate-700 mt-2">
          Paste your Base address · wallet connect (wagmi) lands next deploy
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 mb-4">
          <p className="font-mono text-[11px] text-red-400">{err}</p>
        </div>
      )}

      {/* Stats + APIs */}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Stat label="APIs"            value={String(data.stats.apis)}              accent="#4FC3F7" />
            <Stat label="LIFETIME CALLS"  value={data.stats.calls.toLocaleString()}    accent="#A78BFA" />
            <Stat label="USDC EARNED"     value={usdc(data.stats.revenue)}             accent="#34D399" sub="80% builder share" />
          </div>

          <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-3 mb-6 flex items-center justify-between">
            <code className="font-mono text-xs text-[#4FC3F7]">{shortAddr(data.wallet)}</code>
            <a href={`https://basescan.org/address/${data.wallet}`} target="_blank" rel="noopener noreferrer"
               className="font-mono text-[10px] text-slate-600 hover:text-slate-400">Basescan ↗</a>
          </div>

          {data.apis.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 border-b border-[#1A1A2E] bg-[#0a0a0f] text-[10px] tracking-widest text-slate-600">
                <span>API</span>
                <span>STATUS</span>
                <span className="text-right">CALLS</span>
                <span className="text-right">USDC</span>
                <span className="text-right">SUBMITTED</span>
              </div>
              {data.apis.map(a => (
                <div key={a.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-[#1A1A2E] last:border-0 items-center">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold truncate">{a.name}</p>
                    <p className="font-mono text-[10px] text-slate-600 truncate">{a.description}</p>
                  </div>
                  {a.verified ? (
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
                  ) : (
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/5">pending</span>
                  )}
                  <span className="font-mono text-xs font-semibold text-right tabular-nums">{(a.callCount ?? 0).toLocaleString()}</span>
                  <span className="font-mono text-xs font-semibold text-[#34D399] text-right tabular-nums">{usdc(a.revenueTotal ?? 0)}</span>
                  <span className="font-mono text-[10px] text-slate-600 text-right">{relTime(a.submittedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!data && !err && (
        <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] p-8 text-center">
          <p className="text-3xl mb-3">📭</p>
          <p className="font-mono text-sm font-bold mb-2">Paste your wallet to view registered APIs</p>
          <p className="font-mono text-[11px] text-slate-500 max-w-md mx-auto mb-5">
            Or, if you haven&apos;t registered yet, start with your first API.
          </p>
          <Link href="/submit"
            className="inline-block font-mono text-sm font-semibold px-5 py-2.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-colors">
            Register an API →
          </Link>
        </div>
      )}

      <p className="font-mono text-[10px] text-slate-700 text-center mt-6">
        Dashboard data persists in KV · live splitter ships with Phase 4
      </p>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4">
      <p className="font-mono text-[10px] tracking-widest mb-1" style={{ color: accent }}>{label}</p>
      <p className="font-mono text-2xl font-bold leading-none" style={{ color: accent }}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-slate-700 mt-1">{sub}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] p-8 text-center">
      <p className="text-3xl mb-3">📭</p>
      <p className="font-mono text-sm font-bold mb-2">No APIs registered yet from this wallet</p>
      <p className="font-mono text-[11px] text-slate-500 max-w-md mx-auto mb-5">
        Register your first API to start earning USDC on every call from AI agents.
      </p>
      <Link href="/submit"
        className="inline-block font-mono text-sm font-semibold px-5 py-2.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-colors">
        Register your first API →
      </Link>
    </div>
  );
}
