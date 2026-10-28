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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-[#1A1A2E] bg-[#0B0D12] px-3.5 py-3">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#64748B]">{label}</p>
      <p className="mt-1.5 font-mono text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">{sub}</p>
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

export default function ExchangeView({ ex, totalPaid, ours, oursPayTo, agentId }: {
  ex: Exchange; totalPaid: number; ours: ProviderRow | null; oursPayTo: string; agentId: number | null;
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
        <div className="px-5 py-[18px] space-y-6 mx-auto w-full max-w-6xl">

          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Stat label={`x402 volume · ${window}`} value={R ? usd(volume) : "—"} sub="USDC settled on Base 8453, gross" />
              <Stat label={`Sellers paid · ${window}`} value={R ? String(totalPaid) : "—"} sub={R ? `${multi} with 2+ paying wallets` : "indexing"} />
              <Stat label={`Paid calls · ${window}`} value={R ? calls.toLocaleString("en-US") : "—"} sub="EIP-3009 settlements" />
              <Stat label="Sellers listed" value={ex.providersListed ? ex.providersListed.toLocaleString("en-US") : "—"} sub={`CDP Bazaar · ${ex.listUpdatedAt ? ex.listUpdatedAt.slice(0, 10) : "—"}`} />
            </div>
            <p className="font-mono text-[10px] leading-[1.7] text-[#64748B]">
              <span className="text-[#94A3B8]">Measured:</span> USDC paid to a seller&apos;s payTo in a transaction that also used the payer&apos;s EIP-3009 authorization, the way x402 settles.
              Plain transfers are not counted. Gross inflow: a seller&apos;s own test wallets cannot be told apart, so nothing is subtracted on a guess.
              Window: {ex.daysCovered} day{ex.daysCovered === 1 ? "" : "s"} indexed since {ymd(ex.firstDay)}{ex.lagBlocks !== null ? ` · ${ex.lagBlocks.toLocaleString("en-US")} blocks behind head` : ""}.
            </p>
          </section>

          <section>
            <p className="mb-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#64748B]">// Listed on Blue Agent</p>
            <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3">
              <div className="min-w-0">
                <Link href="/services" className="font-mono text-[13px] font-semibold text-[#E2E8F0] hover:text-[#4FC3F7]">Blue Agent</Link>
                <p className="font-mono text-[10.5px] text-[#94A3B8]">Stock tokens, token checks and unsigned transactions on Base 8453 and Robinhood Chain 4663. MCP + x402.</p>
                <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">{agentId !== null && <>ERC-8004 #{agentId} · </>}payTo {short(oursPayTo)}</p>
              </div>
              <div className="ml-auto text-right font-mono text-[10.5px]">
                <p className="text-[#E2E8F0]">{R ? `${usd(ours?.usd ?? 0)} · ${ours?.paidCalls ?? 0} paid calls from outside wallets` : "—"}</p>
                <p className="text-[#64748B]">{R ? `team tests: ${ours?.teamCalls ?? 0} calls, ${usd(ours?.teamUsd ?? 0)}, not counted` : ""}</p>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#64748B]">// Sellers</p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search host, description or 0x payTo…"
                  className="w-[260px] rounded-[7px] border border-[#1A1A2E] bg-[#07080C] px-2.5 py-[5px] font-mono text-[10.5px] text-[#E2E8F0] outline-none focus:border-[#2a3350]" />
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="rounded-[7px] border border-[#1A1A2E] bg-[#07080C] px-2 py-[5px] font-mono text-[10.5px] text-[#E2E8F0]">
                  <option value="usd">Most volume</option>
                  <option value="calls">Most calls</option>
                  <option value="payers">Most paying wallets</option>
                </select>
                <label className="flex items-center gap-1.5 font-mono text-[10px] text-[#94A3B8]">
                  <input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} /> single-payer sellers
                </label>
              </div>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[#1A1A2E] bg-[#0B0D12]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse font-mono">
                  <thead>
                    <tr className="text-left text-[9.5px] uppercase tracking-[0.1em] text-[#64748B]">
                      <th className="px-4 py-2.5 font-medium w-[46%]">Seller</th>
                      <th className="px-4 py-2.5 font-medium">Volume · {window}</th>
                      <th className="px-4 py-2.5 font-medium">Paid calls</th>
                      <th className="px-4 py-2.5 font-medium">Paying wallets</th>
                      <th className="px-4 py-2.5 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!R ? (
                      <tr><td colSpan={5} className="px-4 py-4 text-[10.5px] text-[#64748B]">{ex.readable ? "Indexing the first day of Base blocks. Check back shortly." : "Index unreadable right now."}</td></tr>
                    ) : shown.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-4 text-[10.5px] text-[#64748B]">No seller matches.</td></tr>
                    ) : shown.map((r) => (
                      <tr key={r.payTo} className="border-t border-[#1A1A2E] align-middle hover:bg-[#0F121A]">
                        <td className="px-4 py-2.5">
                          <Link href={`/exchange/${r.payTo}`} className="text-[12px] font-semibold text-[#E2E8F0] hover:text-[#4FC3F7]">{r.hosts[0] ?? short(r.payTo)}</Link>
                          <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[#94A3B8]">{r.title || "—"}</p>
                          <p className="text-[9.5px] text-[#64748B]">x402 · {r.resources} endpoint{r.resources === 1 ? "" : "s"} · {short(r.payTo)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] font-semibold text-[#E2E8F0] tabular-nums">{usd(r.usd)} <span className="text-[9.5px] font-normal text-[#64748B]">measured</span></td>
                        <td className="px-4 py-2.5 text-[11.5px] text-[#E2E8F0] tabular-nums">{r.paidCalls.toLocaleString("en-US")}</td>
                        <td className="px-4 py-2.5 text-[11.5px] text-[#E2E8F0] tabular-nums">{r.payers >= 2000 ? "2,000+" : r.payers}</td>
                        <td className="px-4 py-2.5"><Spark s={r.series.slice(ex.firstIndex)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {R && (
                <p className="border-t border-[#1A1A2E] px-4 py-2.5 font-mono text-[10px] text-[#64748B]">
                  Showing {shown.length} of {totalPaid} paid sellers. Machine-readable: <Link className="text-[#4FC3F7]" href="/api/hub/providers" prefetch={false}>/api/hub/providers</Link>
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
