// /exchange/[payTo] — one x402 seller on Base 8453: its endpoints and prices
// (CDP Bazaar), its measured x402 inflow by day (lib/hub/exchange), and its
// Virtuals ACP listing when the same wallet is an ACP agent. Unknown → "—".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readExchange, readProviderDetail, readSellerIdentities, readSellerProbes, recentPayments } from "@/lib/hub/exchange";
import { readAgentReputation } from "@/lib/erc8004";
import { X402_PAY_TO } from "@/lib/x402-payee";
import ExchangeHeader from "../ExchangeHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ payTo: string }> }): Promise<Metadata> {
  const { payTo } = await params;
  return { title: `${payTo.slice(0, 10)}… — Agent Exchange` };
}

interface Acp { id: string; name: string; offerings: { name: string; priceValue: string }[] }
async function readAcp(wallet: string): Promise<Acp | null> {
  try {
    const r = await fetch(`https://api.acp.virtuals.io/agents/wallet/${wallet}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.data ?? j;
    if (!d?.id) return null;
    return { id: String(d.id), name: String(d.name ?? ""), offerings: (d.offerings ?? []).filter((o: { isHidden?: boolean }) => !o.isHidden).map((o: { name: string; priceValue: string }) => ({ name: o.name, priceValue: String(o.priceValue) })) };
  } catch {
    return null;
  }
}

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default async function SellerPage({ params }: { params: Promise<{ payTo: string }> }) {
  const { payTo: raw } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) notFound();
  const payTo = raw.toLowerCase();
  const [ex, detail, acp, ids, probes, recent] = await Promise.all([readExchange(30), readProviderDetail(payTo), readAcp(payTo), readSellerIdentities(), readSellerProbes(), recentPayments(payTo)]);
  const probe = probes[payTo] ?? null;
  const ident = ids[payTo] ?? null;
  const agentId = ident?.agentIds[0] ?? null;
  const rep = agentId ? await readAgentReputation(BigInt(agentId)) : null;
  const row = ex.rows.find((r) => r.payTo === payTo) ?? null;
  if (!row && !detail && payTo !== X402_PAY_TO.toLowerCase()) notFound();
  const R = ex.readable && ex.daysCovered > 0;
  const series = (row?.series ?? []).slice(ex.firstIndex);
  // 24h = the last FULL indexed day vs the one before it. Today is still
  // filling and the first indexed day began mid-backfill, so neither counts.
  const full = series.slice(1, -1);
  const d1 = full.length >= 1 ? full[full.length - 1] : null;
  const d0 = full.length >= 2 ? full[full.length - 2] : null;
  const delta = d1 !== null && d0 ? Math.round(((d1 - d0) / d0) * 1000) / 10 : null;
  const peak = Math.max(0.0001, ...series);
  const name = detail?.hosts[0] ?? row?.hosts[0] ?? short(payTo);

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <ExchangeHeader active={null} chip={`seller · ${short(payTo)}`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-5 py-[18px] grid gap-5 mx-auto w-full max-w-6xl">
        <div>
          <Link href="/exchange" className="text-[10px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7]">← SELLERS</Link>
          <h1 className="mt-1 text-[15px] font-semibold text-[#E2E8F0]">{name}</h1>
          <p className="mt-1 text-[11px] text-[#94A3B8]">
            payTo <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${payTo}`} target="_blank" rel="noreferrer">{payTo}</a> · Base 8453
            {payTo === X402_PAY_TO.toLowerCase() && <> · this is Blue Agent, see <Link className="text-[#4FC3F7]" href="/services">services</Link></>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            [`Volume · ${ex.daysCovered}d`, R ? usd(row?.usd ?? 0) : "—", "USDC settled, gross, measured"],
            ["Last full day", R && d1 !== null ? usd(d1) : "—", delta === null ? "no prior day to compare" : `${delta >= 0 ? "+" : ""}${delta}% vs the day before`],
            ["Paid calls", R ? String(row?.paidCalls ?? 0) : "—", "EIP-3009 settlements"],
            ["Paying wallets", R ? String(row?.payers ?? 0) : "—", "distinct payers"],
            ["Endpoints listed", detail ? String(detail.total) : "—", detail ? `Bazaar · ${detail.updatedAt.slice(0, 10)}` : "not on the Bazaar list"],
          ].map(([l, v, s]) => (
            <div key={l} className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-3.5 py-3">
              <p className="text-[9.5px] uppercase tracking-[0.12em] text-[#64748B]">{l}</p>
              <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
              <p className="mt-1 text-[10.5px] text-[#64748B]">{s}</p>
            </div>
          ))}
        </div>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
          <h2 className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">CHECKS</h2>
          <ul className="mt-2 grid gap-1.5 text-[11px]">
            {[
              [probe?.result === "live", "Endpoint quotes USDC on Base 8453 to this payTo",
                probe ? `${probe.result === "live" ? "passed" : probe.result.replace("_", " ")}${probe.status ? ` (HTTP ${probe.status})` : ""} · unpaid probe ${probe.at.slice(0, 10)}` : "not probed yet (a slice of sellers a day)"],
              [(row?.paidCalls ?? 0) > 0, "Completed paid work", R ? `${row?.paidCalls ?? 0} settlements in ${ex.daysCovered} day${ex.daysCovered === 1 ? "" : "s"}, from ${row?.payers ?? 0} wallet${(row?.payers ?? 0) === 1 ? "" : "s"}` : "index unreadable"],
              [!!agentId, "ERC-8004 identity owned by this payTo", agentId ? `agent #${agentId}` : ident ? "none found" : "not checked yet"],
              [false, "Operator proof (domain file, signed claim)", "not offered yet"],
            ].map(([ok, label, sub]) => (
              <li key={String(label)} className="flex items-baseline gap-2">
                <span className={ok ? "text-[#34D399]" : "text-[#475569]"}>{ok ? "✓" : "·"}</span>
                <span className="text-[#E2E8F0]">{label}</span>
                <span className="text-[10px] text-[#64748B]">{sub}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] overflow-hidden">
          <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">LIVE ACTIVITY · LAST ~67 MIN · READ FROM BASE</h2>
          {recent === null ? <p className="px-4 py-3 text-[11px] text-[#64748B]">The chain did not answer right now.</p>
            : recent.length === 0 ? <p className="px-4 py-3 text-[11px] text-[#64748B]">No x402 settlements in the last ~2,000 blocks.</p>
            : <ul>{recent.map((p) => (
                <li key={p.tx + p.from} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2 text-[10.5px] first:border-t-0">
                  <span className="text-[#34D399]">earned {usd(p.usd)}</span>
                  <span className="text-[#94A3B8]">from {short(p.from)}</span>
                  <span className="text-[#475569]">block {Number(p.block).toLocaleString("en-US")}</span>
                  <a className="ml-auto text-[#4FC3F7]" href={`https://basescan.org/tx/${p.tx}`} target="_blank" rel="noreferrer">{short(p.tx)} ↗</a>
                </li>))}</ul>}
        </section>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
          <h2 className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">X402 INFLOW BY DAY</h2>
          {R && series.some((v) => v > 0) ? (
            <div className="mt-3 flex h-24 items-end gap-1">
              {series.map((v, i) => <div key={i} title={usd(v)} className="flex-1 bg-[#1f6f93]" style={{ height: `${Math.max(2, (v / peak) * 100)}%` }} />)}
            </div>
          ) : <p className="mt-2 text-[11px] text-[#64748B]">No x402 settlements measured in the indexed window ({ex.daysCovered} days).</p>}
        </section>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] overflow-hidden">
          <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">ENDPOINTS (CDP BAZAAR)</h2>
          {!detail ? <p className="px-4 py-3 text-[11px] text-[#64748B]">Not listed on the Bazaar.</p>
            : <ul>{detail.resources.map((r, i) => (
                <li key={i} className="border-t border-[#1A1A2E] px-4 py-2.5 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <span className="break-all text-[#E2E8F0]">{r.url}</span>
                    <span className="ml-auto rounded border border-[#16384a] px-1.5 py-px text-[10px] text-[#4FC3F7]">{r.priceUsd === null ? "price —" : `${usd(r.priceUsd)} / call`}</span>
                  </div>
                  {r.description && <p className="mt-0.5 text-[10.5px] text-[#94A3B8]">{r.description}</p>}
                </li>))}</ul>}
          {detail && detail.total > detail.resources.length && <p className="border-t border-[#1A1A2E] px-4 py-2.5 text-[10.5px] text-[#64748B]">Showing {detail.resources.length} of {detail.total}.</p>}
        </section>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
          <h2 className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">ERC-8004 IDENTITY</h2>
          {agentId ? (
            <div className="mt-2 text-[11px] text-[#94A3B8]">
              <p>This payTo owns agent <a className="text-[#4FC3F7]" href={`https://erc-8004.quicknode.com/agents/base-mainnet/${agentId}`} target="_blank" rel="noreferrer">#{agentId}</a> in the Identity Registry on Base 8453.</p>
              <p className="mt-1">Reputation: {!rep?.readable ? "—" : rep.average === null ? "no ratings yet" : `${Math.round(rep.average)}/100 from ${rep.count} rating${rep.count === 1 ? "" : "s"}`} <span className="text-[#475569]">(all raters; not filtered to payers)</span></p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#64748B]">{ident ? `No agent identity owned by this payTo (checked ${ident.checkedAt.slice(0, 10)}).` : "Not checked yet: the identity walk covers a slice of sellers a day."}</p>
          )}
        </section>

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
          <h2 className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">VIRTUALS ACP</h2>
          {acp ? (
            <div className="mt-2 text-[11px] text-[#94A3B8]">
              <p>Same wallet is ACP agent <span className="text-[#E2E8F0]">{acp.name}</span> ({acp.id})</p>
              {acp.offerings.length > 0 && <p className="mt-1">Offerings: {acp.offerings.map((o) => `${o.name} (${o.priceValue} USDC)`).join(" · ")}</p>}
            </div>
          ) : <p className="mt-2 text-[11px] text-[#64748B]">This wallet is not a Virtuals ACP agent, or the registry did not answer.</p>}
        </section>
      </div>
      </div>
    </div>
  );
}
