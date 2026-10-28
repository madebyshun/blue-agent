"use client";

// Client half of /exchange: search, filter, sort. Every number arrives
// measured from the server (lib/hub/exchange); nothing is computed here but sums.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Exchange, ProviderRow } from "@/lib/hub/exchange";
import ExchangeHeader from "./ExchangeHeader";

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ymd = (d: string | null) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : "—");

const BORDER = "#1A1A2E";
const SURFACE = "#0D0D14";

function Label({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
      <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{title}</span>
      {sub && <span className="font-mono text-[10px] text-[#475569]">{sub}</span>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[14px] p-[14px] border" style={{ borderColor: BORDER, background: SURFACE }}>
      <p className="font-mono text-[9.5px] tracking-[0.12em] text-[#64748B]">{label}</p>
      <p className="mt-1.5 font-mono text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{value}</p>
      <p className="mt-0.5 font-mono text-[9.5px] text-[#475569]">{sub}</p>
    </div>
  );
}

function Spark({ s }: { s: number[] }) {
  const max = Math.max(...s, 0);
  if (max <= 0) return <span className="font-mono text-[10px] text-[#64748B]">—</span>;
  const tail = s.slice(-14);
  return (
    <span className="inline-flex h-4 items-end gap-px">
      {tail.map((v, i) => <span key={i} className="w-[3px] bg-[#1f6f93]" style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />)}
    </span>
  );
}

export default function ExchangeView({ ex, totalPaid, ours, oursPayTo, agentId, agents, identitiesChecked, live, probesChecked }: {
  ex: Exchange; totalPaid: number; ours: ProviderRow | null; oursPayTo: string; agentId: number | null;
  /** payTo → ERC-8004 agent id it currently owns (lib/hub/exchange refreshSellerIdentities). */
  agents: Record<string, string>; identitiesChecked: number;
  /** payTo → time its endpoint last quoted USDC on Base to that payTo (probeSellers). */
  live: Record<string, string>; probesChecked: number;
}) {
  const [q, setQ] = useState("");
  const [single, setSingle] = useState(false);
  const [sort, setSort] = useState<"usd" | "calls" | "payers">("usd");
  const R = ex.readable && ex.daysCovered > 0;
  const volume = ex.rows.reduce((s, r) => s + r.usd, 0);
  const calls = ex.rows.reduce((s, r) => s + r.paidCalls, 0);
  const multi = ex.rows.filter((r) => r.payers >= 2).length;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ex.rows
      .filter((r) => r.payTo !== oursPayTo)
      .filter((r) => single || r.payers >= 2)
      .filter((r) => !t || r.payTo.includes(t) || r.hosts.some((h) => h.includes(t)) || r.title.toLowerCase().includes(t))
      .sort((a, b) => sort === "usd" ? b.usd - a.usd : sort === "calls" ? b.paidCalls - a.paidCalls : b.payers - a.payers)
      .slice(0, 200);
  }, [ex.rows, q, single, sort, oursPayTo]);
  const window = `${ex.daysCovered}d`;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">
      <ExchangeHeader active="sellers" chip={ex.providersListed ? `${ex.providersListed.toLocaleString("en-US")} listed · ${totalPaid} paid · ${window}` : undefined} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] mx-auto w-full max-w-6xl">

          {/* Search + sort */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[440px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search host, description or 0x payTo…"
                className="w-full bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg pl-9 pr-3 py-2 font-mono text-[11.5px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none transition-colors" />
            </div>
            {([["usd", "Most volume"], ["calls", "Most calls"], ["payers", "Most wallets"]] as const).map(([id, label]) => {
              const on = sort === id;
              return (
                <button key={id} type="button" onClick={() => setSort(id)}
                  className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
                  style={on ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}>
                  {label}
                </button>
              );
            })}
            <button type="button" onClick={() => setSingle(!single)}
              className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
              style={single ? { color: "#E2E8F0", borderColor: "#2a3350", background: "#0F121A" } : { color: "#64748B", borderColor: BORDER, background: "transparent" }}>
              {single ? "✓ " : ""}single-payer sellers
            </button>
          </div>

          <Label title={`MEASURED · ${window.toUpperCase()}`} sub={`USDC settled on Base 8453 · ${ex.daysCovered} day${ex.daysCovered === 1 ? "" : "s"} indexed since ${ymd(ex.firstDay)}${ex.lagBlocks !== null ? ` · ${ex.lagBlocks.toLocaleString("en-US")} blocks behind head` : ""}`} />
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
            <Stat label="X402 VOLUME" value={R ? usd(volume) : "—"} sub="gross, every listed seller" />
            <Stat label="SELLERS PAID" value={R ? String(totalPaid) : "—"} sub={R ? `${multi} with 2+ paying wallets` : "indexing"} />
            <Stat label="PAID CALLS" value={R ? calls.toLocaleString("en-US") : "—"} sub="EIP-3009 settlements" />
            <Stat label="SELLERS LISTED" value={ex.providersListed ? ex.providersListed.toLocaleString("en-US") : "—"} sub={`CDP Bazaar · ${ex.listUpdatedAt ? ex.listUpdatedAt.slice(0, 10) : "—"}`} />
          </div>

          <Label title="LISTED ON BLUE AGENT" sub="our own tools · receipts and trust scores on Services" />
          <Link href="/services" className="flex flex-wrap items-center gap-4 rounded-[14px] px-4 py-[13px] border transition-colors hover:border-[#4FC3F7]/45"
            style={{ borderColor: "rgba(79,195,247,.22)", background: "rgba(79,195,247,.035)" }}>
            <div className="min-w-0">
              <p className="font-mono text-[12px] font-semibold text-[#E2E8F0]">Blue Agent</p>
              <p className="mt-0.5 font-prose text-[10.5px] text-[#94A3B8]">Stock tokens, token checks and unsigned transactions on Base 8453 and Robinhood Chain 4663. MCP + x402.</p>
              <p className="mt-1 font-mono text-[9px] text-[#475569]">{agentId !== null && <>ERC-8004 #{agentId} · </>}payTo {short(oursPayTo)}</p>
            </div>
            <div className="ml-auto text-right font-mono">
              <p className="text-[12px] font-semibold text-[#E2E8F0]">{R ? usd(ours?.usd ?? 0) : "—"}</p>
              <p className="text-[9.5px] text-[#64748B]">{R ? `${ours?.paidCalls ?? 0} paid calls from outside wallets` : ""}</p>
              <p className="text-[9px] text-[#475569]">{R ? `team tests: ${ours?.teamCalls ?? 0} calls, ${usd(ours?.teamUsd ?? 0)}, not counted` : ""}</p>
            </div>
          </Link>

          <Label title={`SELLERS · ${shown.length}`} sub={single ? "every paid seller" : "with 2+ paying wallets"} />
          {!R ? (
            <p className="font-mono text-[10.5px] text-[#64748B]">{ex.readable ? "Indexing the first day of Base blocks. Check back shortly." : "Index unreadable right now."}</p>
          ) : shown.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-mono text-[13px] text-[#94A3B8]">No sellers found</p>
              <p className="font-mono text-[10px] text-[#475569] mt-1">Try a different search, or include single-payer sellers</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {shown.map((r, i) => (
                <Link key={r.payTo} href={`/exchange/${r.payTo}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-[14px] border transition-colors hover:border-[#4FC3F7]/45"
                  style={{ borderColor: BORDER, background: SURFACE }}>
                  <span className="w-6 shrink-0 font-mono text-[9.5px] text-[#475569] tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-mono text-[12px] font-semibold text-[#E2E8F0]">{r.hosts[0] ?? short(r.payTo)}</span>
                      {live[r.payTo] && <span title={`Endpoint quoted USDC on Base to this payTo, checked ${live[r.payTo].slice(0, 10)}`} className="shrink-0 font-mono text-[8.5px] font-medium text-[#34D399] border border-[#34D399]/30 rounded-full px-[7px] py-[2px]">✓ live 402</span>}
                      {agents[r.payTo] && <span className="shrink-0 font-mono text-[8.5px] font-medium text-[#A78BFA] border border-[#A78BFA]/30 rounded-full px-[7px] py-[2px]">ERC-8004 #{agents[r.payTo]}</span>}
                    </span>
                    <p className="truncate font-prose text-[10.5px] text-[#94A3B8]">{r.title || "—"}</p>
                    <p className="font-mono text-[9px] text-[#475569]">x402 · {r.resources} endpoint{r.resources === 1 ? "" : "s"} · {short(r.payTo)}</p>
                  </div>
                  <div className="hidden sm:block shrink-0"><Spark s={r.series.slice(ex.firstIndex)} /></div>
                  <div className="w-[92px] shrink-0 text-right font-mono">
                    <p className="text-[12px] font-semibold text-[#E2E8F0] tabular-nums">{usd(r.usd)}</p>
                    <p className="text-[9px] text-[#475569]">measured</p>
                  </div>
                  <div className="hidden md:block w-[110px] shrink-0 text-right font-mono text-[9.5px] text-[#94A3B8] tabular-nums">
                    <p>{r.paidCalls.toLocaleString("en-US")} calls</p>
                    <p>{r.payers >= 2000 ? "2,000+" : r.payers} wallets</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {R && (
            <p className="font-mono text-[9.5px] text-[#475569] mt-4 leading-relaxed">
              Measured: USDC paid to a seller&apos;s payTo in a transaction that also used the payer&apos;s EIP-3009 authorization, the way x402 settles.
              Plain transfers are not counted. Gross inflow: a seller&apos;s own test wallets cannot be told apart, so nothing is subtracted on a guess.
              Live 402: {Object.keys(live).length} of {probesChecked} sellers checked answered with a USDC quote on Base to their own payTo (unpaid probe, a slice a day).
              ERC-8004: {Object.keys(agents).length} seller{Object.keys(agents).length === 1 ? "" : "s"} hold an agent identity on Base, of {identitiesChecked} checked so far (the check walks the list a slice a day).
              Showing {shown.length} of {totalPaid} paid sellers. Machine-readable: <Link className="text-[#4FC3F7]" href="/api/hub/providers" prefetch={false}>/api/hub/providers</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
