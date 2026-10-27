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

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="font-mono text-[11px] text-[#94A3B8] hover:text-[#4FC3F7] transition-colors"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
      <p className="text-[12px] text-[#94A3B8]">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold text-[#E2E8F0] tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-[#64748B]">{sub}</p>
    </div>
  );
}

export default function ServicesDashboard({ rows, stats, receipts }: { rows: ServiceRow[]; stats: McpStats; receipts: McpReceipt[] | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [qs, setQs] = useState<keyof typeof QUICKSTART>("Claude Code");
  const [open, setOpen] = useState<ServiceRow | null>(null);
  const paidCount = rows.filter((r) => r.priceUsd > 0).length;
  const shown = useMemo(() => rows.filter((r) =>
    filter === "all" ? true : filter === "paid" ? r.priceUsd > 0 : filter === "free" ? r.priceUsd === 0 : r.group === filter), [rows, filter]);
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
    <div className="h-full overflow-y-auto font-mono [&_button]:font-mono [&_a]:font-mono [&_pre]:font-mono">
      <div className="mx-auto max-w-[1680px] px-6 py-6 lg:px-8 grid gap-5">
        {/* Hero */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[.14em] text-[#64748B]">// SERVICES</p>
            <h1 className="mt-1 text-[20px] font-semibold text-[#E2E8F0]">Blue Agent services</h1>
            <p className="mt-1.5 max-w-[760px] text-[12px] leading-[1.7] text-[#94A3B8]">
              Tokenized-stock data, token checks and unsigned transactions on Base 8453 and Robinhood Chain 4663.
              Paid per call in USDC over x402. No account, no API key.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <span className="rounded-full border border-[#1A1A2E] px-3 py-1 text-[12px] text-[#94A3B8]"><span className="text-[#34D399]">●</span> MCP live</span>
            <span className="rounded-full border border-[#1A1A2E] px-3 py-1 text-[12px] text-[#94A3B8]">{rows.length} tools · {paidCount} paid</span>
          </div>
        </div>

        {/* Stats — outside buyers only */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Paid calls · 30d" value={R ? String(settled) : "—"} sub="settled on Base" />
          <Stat label="Paying wallets · 30d" value={receipts ? String(payers) : "—"} sub="distinct payers" />
          <Stat label="Revenue · 30d" value={R ? usd(units / 1e6) : "—"} sub="USDC settled on Base" />
          <Stat label="Success rate" value={R && runs > 0 ? `${Math.round((settled / runs) * 1000) / 10}%` : "—"} sub="paid calls that returned" />
          <Stat label="Not charged on failure" value={R ? String(notCharged) : "—"} sub="failed runs, $0 taken" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] items-start">
          {/* Services table */}
          <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#1A1A2E] px-4 py-3">
              <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Services</h2>
              <span className="text-[11px] text-[#64748B]">{rows.length} tools · {paidCount} paid · {rows.length - paidCount} free</span>
              <div className="ml-auto flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                    className={`rounded-md px-2.5 py-1 text-[12px] ${filter === f.id ? "border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]" : "border border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] text-[#64748B]">
                    <th className="px-4 py-2.5 font-medium w-[38%]">Tool</th>
                    <th className="px-4 py-2.5 font-medium">Chains</th>
                    <th className="px-4 py-2.5 font-medium">Price</th>
                    <th className="px-4 py-2.5 font-medium">Calls · 30d</th>
                    <th className="px-4 py-2.5 font-medium">Success</th>
                    <th className="px-4 py-2.5 font-medium text-right">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.name} className="border-t border-[#1A1A2E] align-middle">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[13px] text-[#E2E8F0]">{r.name}</p>
                        <p className="mt-0.5 text-[12px] text-[#94A3B8]">{r.short}</p>
                      </td>
                      <td className="px-4 py-3">
                        {r.chains.map((c) => <span key={c} className="mr-1 rounded border border-[#1A1A2E] px-1.5 py-px text-[11px] text-[#94A3B8]">{c}</span>)}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {r.priceUsd > 0
                          ? <><span className="mr-1.5 rounded border border-[#16384a] px-1.5 py-px text-[10px] text-[#4FC3F7]">PAID</span><span className="font-semibold text-[#E2E8F0]">{usd(r.priceUsd)}</span></>
                          : <span className="rounded border border-[#14402f] px-1.5 py-px text-[10px] text-[#34D399]">FREE</span>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#E2E8F0] tabular-nums">{r.priceUsd > 0 ? (r.calls ?? "—") : "—"}</td>
                      <td className="px-4 py-3 text-[13px] text-[#E2E8F0] tabular-nums">{r.priceUsd > 0 && r.successPct !== null ? `${r.successPct}%` : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setOpen(r)} className="rounded-md border border-[#1A1A2E] bg-[#0F121A] px-2.5 py-1 text-[12px] text-[#E2E8F0] hover:border-[#2a3350]">Schema</button>
                          {r.tryPrompt
                            ? <Link href={`/chat?prefill=${encodeURIComponent(r.tryPrompt)}`} className="rounded-md bg-[#4FC3F7] px-2.5 py-1 text-[12px] font-semibold text-[#03131c] hover:opacity-90">Try it</Link>
                            : <span className="w-[52px]" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-5">
            {/* Quickstart */}
            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12]">
              <div className="flex items-center gap-2 border-b border-[#1A1A2E] px-4 py-3">
                <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Quickstart</h2>
                <div className="ml-auto flex gap-1">
                  {(Object.keys(QUICKSTART) as (keyof typeof QUICKSTART)[]).map((k) => (
                    <button key={k} type="button" onClick={() => setQs(k)}
                      className={`rounded-md px-2 py-1 text-[12px] ${qs === k ? "border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]" : "border border-transparent text-[#94A3B8]"}`}>{k}</button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2.5 px-4 py-3.5">
                <div className="flex justify-end"><Copy text={QUICKSTART[qs]} /></div>
                <pre className="whitespace-pre-wrap break-all rounded-lg border border-[#1A1A2E] bg-[#07080C] px-3 py-2.5 font-mono text-[12px] text-[#cbd5e1]">{QUICKSTART[qs]}</pre>
                {PAID_NOTES[qs]
                  ? <ol className="grid list-decimal gap-1.5 pl-4 text-[12px] leading-[1.6] text-[#94A3B8]">{PAID_NOTES[qs]!.map((n) => <li key={n}>{n}</li>)}</ol>
                  : <p className="text-[12px] leading-[1.6] text-[#64748B]">
                      Free tools work as soon as you connect. Paid tools answer with a price first: pay with an x402 MCP client,
                      or use the Pay from Claude Code tab. Set a cap in your client, for example 0.05 USDC per call and 1 USDC a day.
                    </p>}
              </div>
            </section>
            {/* Guarantees */}
            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
              <h2 className="mb-2.5 text-[13px] font-semibold text-[#E2E8F0]">Guarantees</h2>
              <ul className="grid gap-2 text-[13px] text-[#94A3B8]">
                {["Bad input is refused before any price", "Charged only after the tool returns", "Every payment settles on Base with a receipt", "Blue Agent never holds a key or your funds"].map((g) => (
                  <li key={g} className="flex gap-2"><span className="text-[#34D399]">✓</span>{g}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] items-start">
          {/* Chart */}
          <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12]">
            <div className="flex items-center gap-2 border-b border-[#1A1A2E] px-4 py-3">
              <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Paid calls</h2>
              <span className="text-[11px] text-[#64748B]">last 30 days · settled on Base</span>
            </div>
            {R ? (
              <>
                <div className="flex h-[180px] items-end gap-1.5 px-4 pt-4">
                  {series.map((d) => (
                    <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.n} paid`}>
                      <span className="block rounded-t-sm bg-[#1f6f93]" style={{ height: `${(d.n / peak) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 px-4 pb-3.5 pt-2 text-[11px] text-[#64748B]">
                  <span>{settled} paid call{settled === 1 ? "" : "s"} · {usd(units / 1e6)}</span>
                  {settled === 0 && <span className="ml-auto">No paid calls yet</span>}
                </div>
              </>
            ) : <p className="px-4 py-6 text-[13px] text-[#64748B]">Usage could not be read right now.</p>}
          </section>

          {/* Receipts */}
          <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12]">
            <div className="flex items-center gap-2 border-b border-[#1A1A2E] px-4 py-3">
              <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Receipts</h2>
              <span className="text-[11px] text-[#64748B]">latest paid calls</span>
            </div>
            {receipts === null && <p className="px-4 py-6 text-[13px] text-[#64748B]">Receipts could not be read right now.</p>}
            {receipts && receipts.length === 0 && <p className="px-4 py-6 text-[13px] text-[#64748B]">No paid calls yet. The first one will show here with its Base transaction.</p>}
            {receipts?.map((r, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[#1A1A2E] px-4 py-2.5 text-[12px] first:border-t-0">
                <span className={`h-2 w-2 rounded-full ${r.outcome === "settled" ? "bg-[#34D399]" : "bg-[#FBBF24]"}`} />
                <span className="truncate text-[#E2E8F0]">
                  <span className="font-mono">{r.tool}</span>
                  {r.outcome === "not_charged" && <span className="text-[#94A3B8]"> · not charged</span>}
                  <span className="text-[#64748B]"> · {short(r.payer)} · {ago(r.at)}</span>
                </span>
                {r.tx
                  ? <a href={`https://basescan.org/tx/${r.tx}`} target="_blank" rel="noreferrer" className="text-[#4FC3F7] hover:underline">{usd(r.units / 1e6)} ↗</a>
                  : <span className="text-[#64748B]">$0.00</span>}
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* Schema drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[#1A1A2E] bg-[#0B0D12] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <p className="font-mono text-[15px] text-[#E2E8F0]">{open.name}</p>
              <span className="text-[13px] text-[#94A3B8]">{open.priceUsd > 0 ? `${usd(open.priceUsd)} per call` : "Free"}</span>
              <button type="button" onClick={() => setOpen(null)} className="ml-auto text-[13px] text-[#94A3B8] hover:text-[#E2E8F0]">Close</button>
            </div>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.65] text-[#94A3B8]">{open.description}</p>
            <div className="mt-4 flex items-center justify-between"><p className="text-[12px] text-[#64748B]">Input schema</p><Copy text={JSON.stringify(open.schema, null, 2)} /></div>
            <pre className="mt-1.5 whitespace-pre-wrap break-all rounded-lg border border-[#1A1A2E] bg-[#07080C] px-3 py-2.5 font-mono text-[12px] text-[#cbd5e1]">{JSON.stringify(open.schema, null, 2)}</pre>
          </aside>
        </div>
      )}
    </div>
  );
}
