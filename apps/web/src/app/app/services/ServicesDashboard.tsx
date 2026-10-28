"use client";

// Client half of /app/services — see page.tsx. Everything numeric arrives from
// the server already measured; this file only filters, opens a schema and copies.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { McpStats, McpReceipt } from "@/lib/mcp-receipts";

export interface ServiceRow {
  name: string;
  short: string;
  chains: string[];
  group: "stocks" | "safety" | "transactions" | "market" | "catalog";
  priceUsd: number;
  calls: number | null;
  successPct: number | null;
  schema: Record<string, unknown>;
  description: string;
  tryPrompt: string | null;
  /** Trust score 0-100 (lib/service-score); null = insufficient data. */
  score: number | null;
}

const MCP_URL = "https://blueagent.dev/api/mcp";
const QUICKSTART: Record<string, string> = {
  "Claude Code": `claude mcp add --transport http blue-agent ${MCP_URL}`,
  Cursor: JSON.stringify({ mcpServers: { "blue-agent": { url: MCP_URL } } }, null, 2),
  HTTP: `curl -s ${MCP_URL} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  // Paid tools from Claude Code: most MCP clients stop at the PaymentRequired
  // result, so the x402-aware stdio bridge (packages/x402-client, 2205baa7)
  // signs the quoted EIP-3009 authorization locally and retries. Not on npm
  // yet, so it is built from the public repo — verified from a clean clone
  // 2026-10-27 (install + build, then initialize and tools/list → 13 tools).
  "Pay from Claude Code": [
    "git clone --depth 1 https://github.com/madebyshun/blue-agent",
    "cd blue-agent/packages/x402-client && npm install && npm run build",
    `claude mcp add blue-agent-paid -e BUYER_PRIVATE_KEY=0xYOUR_DEMO_WALLET_KEY -- node "$PWD/dist/mcp-stdio.js"`,
  ].join("\n"),
};
const PAID_NOTES: Partial<Record<keyof typeof QUICKSTART, string[]>> = {
  "Pay from Claude Code": [
    "Use a separate wallet holding only a little USDC on Base. The key stays on your machine: the bridge signs each payment locally, for exactly the price the tool quoted.",
    "Then ask Claude: \"Is NVDA cheaper on Base or on Robinhood Chain right now?\" It calls stock_signal, pays $0.01, and the bridge prints the Basescan link of the payment.",
    "A call that fails is not charged.",
  ],
};
const FILTERS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "free", label: "Free" },
  { id: "stocks", label: "Stocks" },
  { id: "safety", label: "Safety" },
  { id: "transactions", label: "Transactions" },
] as const;

const usd = (n: number) => (n === 0 || n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

const BORDER = "#1A1A2E";
const SURFACE = "#0D0D14";
const GROUPS: { id: ServiceRow["group"]; title: string; sub: string }[] = [
  { id: "stocks", title: "STOCKS", sub: "tokenized stocks on Base and Robinhood Chain" },
  { id: "safety", title: "SAFETY", sub: "checked on chain before money moves" },
  { id: "transactions", title: "TRANSACTIONS", sub: "unsigned, the caller signs" },
  { id: "market", title: "MARKET", sub: "live market data" },
  { id: "catalog", title: "CATALOG", sub: "the rest of the x402 catalog, one call away" },
];

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="font-mono text-[10px] text-[#94A3B8] hover:text-[#4FC3F7] transition-colors"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

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

export default function ServicesDashboard({ rows, stats, receipts }: { rows: ServiceRow[]; stats: McpStats; receipts: McpReceipt[] | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [qs, setQs] = useState<keyof typeof QUICKSTART>("Claude Code");
  const [open, setOpen] = useState<ServiceRow | null>(null);
  const paidCount = rows.filter((r) => r.priceUsd > 0).length;
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" ? true : filter === "paid" ? r.priceUsd > 0 : filter === "free" ? r.priceUsd === 0 : r.group === filter)
      .filter((r) => !t || r.name.includes(t) || r.short.toLowerCase().includes(t));
  }, [rows, filter, search]);
  const R = stats.readable;
  // Every paid call counts here (ShunTr, 2026-10-27): no outside/team split on the page.
  const settled = stats.outside.settled + stats.team.settled;
  const notCharged = stats.outside.notCharged + stats.team.notCharged;
  const units = stats.outside.units + stats.team.units;
  const runs = settled + notCharged;
  const since = Date.now() - 30 * 86_400_000;
  const payers = new Set((receipts ?? []).filter((r) => r.outcome === "settled" && r.payer && Date.parse(r.at) >= since).map((r) => r.payer)).size;
  const series = stats.series.map((d) => ({ day: d.day, n: d.outside + d.team }));
  const peak = Math.max(1, ...series.map((d) => d.n));

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">
      {/* `// SERVICES` header — desktop only; below lg the MobileTopBar prints the title. */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SERVICES</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">what agents pay Blue Agent for · MCP + x402 · no account, no API key</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">
            <span className="text-[#34D399]">●</span> MCP live · {rows.length} tools · {paidCount} paid
          </span>
          <Link href="/exchange" className="font-mono text-[10.5px] text-[#94A3B8] hover:text-[#E2E8F0] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px] transition-colors">Exchange →</Link>
          <a href="#connect" className="font-mono text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[5px] transition-colors">+ Connect MCP</a>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">

          {/* Search + filters */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[440px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…"
                className="w-full bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg pl-9 pr-3 py-2 font-mono text-[11.5px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none transition-colors" />
            </div>
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                  className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
                  style={on ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}>
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Stats */}
          <Label title="LAST 30 DAYS" sub="every paid call, settled on Base 8453" />
          <div className="grid gap-2.5 grid-cols-2 md:grid-cols-5">
            <Stat label="PAID CALLS" value={R ? String(settled) : "—"} sub="settled on Base" />
            <Stat label="PAYING WALLETS" value={receipts ? String(payers) : "—"} sub="distinct payers" />
            <Stat label="REVENUE" value={R ? usd(units / 1e6) : "—"} sub="USDC settled on Base" />
            <Stat label="SUCCESS RATE" value={R && runs > 0 ? `${Math.round((settled / runs) * 1000) / 10}%` : "—"} sub="paid calls that returned" />
            <Stat label="NOT CHARGED" value={R ? String(notCharged) : "—"} sub="failed runs, $0 taken" />
          </div>

          {/* Tools, grouped */}
          {shown.length === 0 && (
            <div className="text-center py-12">
              <p className="font-mono text-[13px] text-[#94A3B8]">No tools found</p>
              <p className="font-mono text-[10px] text-[#475569] mt-1">Try a different search or filter</p>
            </div>
          )}
          {GROUPS.map((g) => {
            const items = shown.filter((r) => r.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id}>
                <Label title={g.title} sub={g.sub} />
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
                  {items.map((r) => (
                    <div key={r.name} className="rounded-[14px] p-[14px] border transition-colors hover:border-[#4FC3F7]/45 flex flex-col"
                      style={{ borderColor: r.priceUsd > 0 ? "rgba(79,195,247,.22)" : BORDER, background: r.priceUsd > 0 ? "rgba(79,195,247,.035)" : SURFACE }}>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/services/${r.name}`} className="font-mono text-[12px] font-semibold text-[#E2E8F0] hover:text-[#4FC3F7]">{r.name}</Link>
                        {r.priceUsd > 0
                          ? <span className="font-mono text-[8.5px] font-medium text-[#4FC3F7] border border-[#4FC3F7]/30 rounded-full px-[7px] py-[2px] shrink-0">{usd(r.priceUsd)} / call</span>
                          : <span className="font-mono text-[8.5px] font-medium text-[#34D399] border border-[#34D399]/30 rounded-full px-[7px] py-[2px] shrink-0">free</span>}
                      </div>
                      <p className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-2 flex-1">{r.short}</p>
                      <div className="flex flex-wrap gap-[5px] mt-[10px]">
                        {r.chains.map((c) => <span key={c} className="font-mono text-[8.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{c === "RH" ? "Robinhood 4663" : "Base 8453"}</span>)}
                      </div>
                      <div className="font-mono text-[9px] text-[#475569] mt-[9px]">
                        {r.priceUsd > 0
                          ? <>{R ? `${r.calls ?? 0} paid · 30d` : "—"} · trust {r.score !== null ? r.score : "n<5"}</>
                          : "no fee"}
                      </div>
                      <div className="flex items-center gap-3 mt-[9px]">
                        <button type="button" onClick={() => setOpen(r)} className="font-mono text-[10px] text-[#94A3B8] hover:text-[#4FC3F7]">schema</button>
                        <Link href={`/services/${r.name}`} className="font-mono text-[10px] text-[#94A3B8] hover:text-[#4FC3F7]">profile</Link>
                        {r.tryPrompt && <Link href={`/chat?prefill=${encodeURIComponent(r.tryPrompt)}`} className="ml-auto font-mono text-[10px] text-[#4FC3F7] hover:underline">try in chat →</Link>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Connect */}
          <div id="connect" />
          <Label title="CONNECT" sub="free tools work as soon as you connect; paid tools quote a price first" />
          <div className="rounded-[14px] border p-[14px]" style={{ borderColor: BORDER, background: SURFACE }}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(Object.keys(QUICKSTART) as (keyof typeof QUICKSTART)[]).map((k) => {
                const on = qs === k;
                return (
                  <button key={k} type="button" onClick={() => setQs(k)}
                    className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
                    style={on ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}>
                    {k}
                  </button>
                );
              })}
              <span className="ml-auto"><Copy text={QUICKSTART[qs]} /></span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2.5 font-mono text-[11px] text-[#cbd5e1]">{QUICKSTART[qs]}</pre>
            {PAID_NOTES[qs]
              ? <ol className="mt-3 grid list-decimal gap-1.5 pl-4 font-mono text-[10.5px] leading-[1.6] text-[#94A3B8]">{PAID_NOTES[qs]!.map((n) => <li key={n}>{n}</li>)}</ol>
              : <p className="mt-3 font-mono text-[10.5px] leading-[1.6] text-[#64748B]">
                  Paid tools answer with a price first: pay with an x402 MCP client, or use the Pay from Claude Code tab.
                  Set a cap in your client, for example 0.05 USDC per call and 1 USDC a day.
                </p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#1A1A2E] pt-3">
              {["Bad input is refused before any price", "Charged only after the tool returns", "Every payment settles on Base with a receipt", "Blue Agent never holds a key or your funds"].map((g) => (
                <span key={g} className="font-mono text-[10px] text-[#94A3B8]"><span className="text-[#34D399]">✓</span> {g}</span>
              ))}
            </div>
          </div>

          {/* Activity */}
          <Label title="ACTIVITY" sub="paid calls per day and the latest receipts" />
          <div className="grid gap-2.5 lg:grid-cols-2">
            <div className="rounded-[14px] border p-[14px]" style={{ borderColor: BORDER, background: SURFACE }}>
              {R ? (
                <>
                  <div className="flex h-[140px] items-end gap-1">
                    {series.map((d) => (
                      <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.n} paid`}>
                        <span className="block rounded-t-sm bg-[#1f6f93]" style={{ height: `${(d.n / peak) * 100}%` }} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-[#64748B]">{settled} paid call{settled === 1 ? "" : "s"} · {usd(units / 1e6)} · 30 days</p>
                </>
              ) : <p className="font-mono text-[10.5px] text-[#64748B]">Usage could not be read right now.</p>}
            </div>
            <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: BORDER, background: SURFACE }}>
              {receipts === null && <p className="px-[14px] py-[14px] font-mono text-[10.5px] text-[#64748B]">Receipts could not be read right now.</p>}
              {receipts && receipts.length === 0 && <p className="px-[14px] py-[14px] font-mono text-[10.5px] text-[#64748B]">No paid calls yet. The first one will show here with its Base transaction.</p>}
              {receipts?.map((r, i) => (
                <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[#1A1A2E] px-[14px] py-2 font-mono text-[10.5px] first:border-t-0">
                  <span className={`h-1.5 w-1.5 rounded-full ${r.outcome === "settled" ? "bg-[#34D399]" : "bg-[#FBBF24]"}`} />
                  <span className="truncate text-[#E2E8F0]">
                    {r.tool}
                    {r.outcome === "not_charged" && <span className="text-[#94A3B8]"> · not charged</span>}
                    <span className="text-[#64748B]"> · {short(r.payer)} · {ago(r.at)}</span>
                  </span>
                  {r.tx
                    ? <span className="flex items-center gap-2.5">
                        {r.outcome === "settled" && <Link href={`/services/rate/${r.tx}`} className="text-[#94A3B8] hover:text-[#4FC3F7]">rate</Link>}
                        <a href={`https://basescan.org/tx/${r.tx}`} target="_blank" rel="noreferrer" className="text-[#4FC3F7] hover:underline">{usd(r.units / 1e6)} ↗</a>
                      </span>
                    : <span className="text-[#64748B]">$0.00</span>}
                </div>
              ))}
            </div>
          </div>

          <a href="/jobs" className="flex items-center gap-3 mt-[24px] border border-[#1A1A2E] rounded-[14px] px-4 py-[13px] bg-[#0D0D14] hover:border-[#4FC3F7]/45 transition-colors">
            <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">HIRE</span>
            <span className="flex-1 font-mono text-[10.5px] text-[#94A3B8]">Bigger jobs go through Virtuals ACP: escrow on Base, delivered within its SLA or refunded.</span>
            <span className="font-mono text-[10.5px] text-[#4FC3F7]">Jobs →</span>
          </a>
        </div>
      </div>

      {/* Schema drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-[#1A1A2E] bg-[#0a0a0f] p-5 font-mono" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <p className="text-[11px] tracking-widest text-[#4FC3F7]">// {open.name.toUpperCase()}</p>
              <span className="text-[10.5px] text-[#94A3B8]">{open.priceUsd > 0 ? `${usd(open.priceUsd)} per call` : "Free"}</span>
              <button type="button" onClick={() => setOpen(null)} className="ml-auto text-[13px] text-slate-500 hover:text-white">✕</button>
            </div>
            <p className="mt-3 whitespace-pre-line text-[10.5px] leading-[1.65] text-[#94A3B8]">{open.description}</p>
            <div className="mt-4 flex items-center justify-between"><p className="text-[9.5px] tracking-[0.14em] text-[#64748B]">INPUT SCHEMA</p><Copy text={JSON.stringify(open.schema, null, 2)} /></div>
            <pre className="mt-1.5 whitespace-pre-wrap break-all rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2.5 text-[11px] text-[#cbd5e1]">{JSON.stringify(open.schema, null, 2)}</pre>
          </aside>
        </div>
      )}
    </div>
  );
}
