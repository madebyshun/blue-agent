// /hub/agents/[payTo] — one x402 seller on Base 8453: its endpoints and prices
// (CDP Bazaar), its measured x402 inflow by day (lib/hub/exchange), and its
// Virtuals ACP listing when the same wallet is an ACP agent. Unknown → "—".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readExchange, readProviderDetail } from "@/lib/hub/exchange";
import { X402_PAY_TO } from "@/lib/x402-payee";

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
  const [ex, detail, acp] = await Promise.all([readExchange(30), readProviderDetail(payTo), readAcp(payTo)]);
  const row = ex.rows.find((r) => r.payTo === payTo) ?? null;
  if (!row && !detail && payTo !== X402_PAY_TO.toLowerCase()) notFound();
  const R = ex.readable && ex.daysCovered > 0;
  const series = (row?.series ?? []).slice(ex.firstIndex);
  const peak = Math.max(0.0001, ...series);
  const name = detail?.hosts[0] ?? row?.hosts[0] ?? short(payTo);

  return (
    <div className="h-full overflow-y-auto font-mono [&_a]:font-mono">
      <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8 grid gap-5">
        <div>
          <Link href="/app/hub/agents" className="text-[11px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7]">// AGENT EXCHANGE</Link>
          <h1 className="mt-1 text-[20px] font-semibold text-[#E2E8F0]">{name}</h1>
          <p className="mt-1 text-[11px] text-[#94A3B8]">
            payTo <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${payTo}`} target="_blank" rel="noreferrer">{payTo}</a> · Base 8453
            {payTo === X402_PAY_TO.toLowerCase() && <> · this is Blue Agent, see <Link className="text-[#4FC3F7]" href="/app/services">services</Link></>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [`Volume · ${ex.daysCovered}d`, R ? usd(row?.usd ?? 0) : "—", "USDC settled, gross, measured"],
            ["Paid calls", R ? String(row?.paidCalls ?? 0) : "—", "EIP-3009 settlements"],
            ["Paying wallets", R ? String(row?.payers ?? 0) : "—", "distinct payers"],
            ["Endpoints listed", detail ? String(detail.total) : "—", detail ? `Bazaar · ${detail.updatedAt.slice(0, 10)}` : "not on the Bazaar list"],
          ].map(([l, v, s]) => (
            <div key={l} className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
              <p className="text-[11px] text-[#94A3B8]">{l}</p>
              <p className="mt-1.5 text-[20px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
              <p className="mt-1 text-[10.5px] text-[#64748B]">{s}</p>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-[#E2E8F0]">x402 inflow by day</h2>
          {R && series.some((v) => v > 0) ? (
            <div className="mt-3 flex h-24 items-end gap-1">
              {series.map((v, i) => <div key={i} title={usd(v)} className="flex-1 bg-[#1f6f93]" style={{ height: `${Math.max(2, (v / peak) * 100)}%` }} />)}
            </div>
          ) : <p className="mt-2 text-[11px] text-[#64748B]">No x402 settlements measured in the indexed window ({ex.daysCovered} days).</p>}
        </section>

        <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] overflow-hidden">
          <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[13px] font-semibold text-[#E2E8F0]">Endpoints (CDP Bazaar)</h2>
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

        <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Virtuals ACP</h2>
          {acp ? (
            <div className="mt-2 text-[11px] text-[#94A3B8]">
              <p>Same wallet is ACP agent <span className="text-[#E2E8F0]">{acp.name}</span> ({acp.id})</p>
              {acp.offerings.length > 0 && <p className="mt-1">Offerings: {acp.offerings.map((o) => `${o.name} (${o.priceValue} USDC)`).join(" · ")}</p>}
            </div>
          ) : <p className="mt-2 text-[11px] text-[#64748B]">This wallet is not a Virtuals ACP agent, or the registry did not answer.</p>}
        </section>
      </div>
    </div>
  );
}
