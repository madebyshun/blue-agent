"use client";

/**
 * Builder dashboard — Hero + sections layout matching /x402 and /docs.
 * Fetches APIs registered to a given wallet from /api/me/apis.
 * Until wagmi is wired, the user pastes their address into a field.
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
  const [wallet, setWallet] = useState("");
  const [data,   setData]   = useState<Resp | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

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
    <>
      {/* Hero — matches /x402 + /docs */}
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-[#34D399]/30 bg-[#34D399]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
            <span className="font-mono text-[10px] text-[#34D399] tracking-widest">BUILDER DASHBOARD · WALLET-SCOPED</span>
          </div>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Track your APIs — <span className="text-[#34D399]">USDC earnings</span> in real-time
          </h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl mb-6 leading-relaxed">
            Connect your Base wallet to see APIs you&apos;ve registered, live call counts, and accrued
            USDC revenue. Data persists in our KV store; wallet connect (wagmi) lands next deploy —
            for now paste your address to load.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#load"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#34D399] to-[#10B981] text-[#050508] hover:scale-[1.02] transition-transform">
              Load your APIs ↓
            </a>
            <Link href="/submit"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-[#A78BFA]/40 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
              + Register new API
            </Link>
            <Link href="/docs/builders/dashboard"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/[0.02] transition-all">
              Read dashboard docs →
            </Link>
          </div>
        </div>
      </section>

      {/* Wallet load + stats */}
      <section id="load" className="max-w-5xl mx-auto px-6 py-16">
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">🔑 YOUR WALLET</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Paste your Base address</h2>

        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 mb-6">
          <div className="flex gap-2 mb-2">
            <input
              value={wallet}
              onChange={e => setWallet(e.target.value)}
              placeholder="0x…"
              className="flex-1 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#34D399]/40 transition-colors"
            />
            <button onClick={fetchMe} disabled={busy || !wallet}
              className="font-mono text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#34D399] text-[#050508] hover:bg-emerald-400 disabled:opacity-50 transition-colors">
              {busy ? "Loading…" : "Load APIs"}
            </button>
          </div>
          <p className="font-mono text-[10px] text-slate-700">
            Wallet connect (wagmi + Coinbase Smart Wallet) ships next deploy. For now: paste the address you used in <Link href="/submit" className="text-[#34D399] hover:underline">/submit</Link>.
          </p>
        </div>

        {err && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 mb-6">
            <p className="font-mono text-[11px] text-red-400">{err}</p>
          </div>
        )}

        {/* Stats grid — visible after load */}
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <StatCard label="APIs LISTED"      value={String(data.stats.apis)}              color="#4FC3F7" sub="across the catalog" />
              <StatCard label="LIFETIME CALLS"   value={data.stats.calls.toLocaleString()}    color="#A78BFA" sub="paid + free combined" />
              <StatCard label="USDC ACCRUED"     value={usdc(data.stats.revenue)}             color="#34D399" sub="80% builder share" />
            </div>

            <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-3 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                <code className="font-mono text-xs text-[#34D399]">{shortAddr(data.wallet)}</code>
                <span className="font-mono text-[10px] text-slate-600">connected via paste</span>
              </div>
              <a href={`https://basescan.org/address/${data.wallet}`} target="_blank" rel="noopener noreferrer"
                 className="font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                Basescan ↗
              </a>
            </div>
          </>
        )}
      </section>

      {/* APIs list */}
      {data && (
        <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">📡 YOUR APIs</p>
          <h2 className="font-mono text-2xl font-bold mb-6">
            {data.apis.length === 0 ? "No APIs registered yet" : `${data.apis.length} live ${data.apis.length === 1 ? "endpoint" : "endpoints"}`}
          </h2>

          {data.apis.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] p-10 text-center">
              <p className="text-3xl mb-3">📭</p>
              <p className="font-mono text-sm font-bold mb-2">This wallet has no registered APIs</p>
              <p className="font-mono text-[11px] text-slate-500 max-w-md mx-auto mb-5">
                Register your first API to start earning USDC on every call from AI agents.
              </p>
              <Link href="/submit"
                className="inline-block font-mono text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#A78BFA] text-[#050508] hover:bg-[#9d7ef0] transition-colors">
                Register your first API →
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0a0a0f] font-mono text-[10px] tracking-widest text-slate-600">
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
        </section>
      )}

      {/* Empty state before wallet loaded */}
      {!data && !err && (
        <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">📊 STATS PREVIEW</p>
          <h2 className="font-mono text-2xl font-bold mb-6">What you&apos;ll see once loaded</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 opacity-50">
            <StatCard label="APIs LISTED"    value="—" color="#4FC3F7" sub="across the catalog" />
            <StatCard label="LIFETIME CALLS" value="—" color="#A78BFA" sub="paid + free combined" />
            <StatCard label="USDC ACCRUED"   value="$—" color="#34D399" sub="80% builder share" />
          </div>

          <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] p-10 text-center">
            <p className="text-3xl mb-3">🔌</p>
            <p className="font-mono text-sm font-bold mb-2">Paste your wallet address above to load</p>
            <p className="font-mono text-[11px] text-slate-500 max-w-md mx-auto">
              Or if you haven&apos;t registered yet, start with your first API.
            </p>
          </div>
        </section>
      )}

      {/* Withdraw banner (Phase 4 placeholder) */}
      <section className="max-w-5xl mx-auto px-6 py-12 border-t border-[#1A1A2E]">
        <div className="rounded-2xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-sm font-bold text-[#F59E0B] mb-1">💎 Withdraw (Phase 4)</p>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed max-w-2xl">
              Currently USDC accrues against your wallet in our ledger. The splitter contract that auto-distributes
              80% to your wallet, 10% to stakers, 10% to treasury ships next phase — your accrued balance migrates over.
            </p>
          </div>
          <Link href="/docs/builders/dashboard"
            className="shrink-0 font-mono text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-colors">
            Read more →
          </Link>
        </div>
      </section>
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
      <p className="font-mono text-[10px] tracking-widest mb-2" style={{ color }}>{label}</p>
      <p className="font-mono text-3xl font-bold leading-none mb-1" style={{ color }}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-slate-700 mt-2">{sub}</p>}
    </div>
  );
}
