// /exchange/agent/<id> — one ERC-8004 agent on Base: identity, measured x402
// revenue, checks, live activity, its services, its coins (Token Economy) and
// the jobs it delivered. Read from the chain and our indexes (lib/agent-profile).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readAgentProfile } from "@/lib/agent-profile";
import { readExchange, readProviderDetail, readSellerProbes, recentPayments } from "@/lib/hub/exchange";
import { listJobs } from "@/lib/jobs";
import { X402_PAY_TO } from "@/lib/x402-payee";
import ExchangeHeader from "../../ExchangeHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Agent #${id} — Agent Exchange` };
}

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";
const L = ({ t, s }: { t: string; s?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
    <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{t}</span>
    {s && <span className="text-[10px] text-[#475569]">{s}</span>}
  </div>
);

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await readAgentProfile(id);
  if (!p) notFound();
  const [ex, detail, probes, recent, jobs] = await Promise.all([
    readExchange(30), readProviderDetail(p.payTo), readSellerProbes(), recentPayments(p.payTo, 8), listJobs(200),
  ]);
  const row = ex.rows.find((r) => r.payTo === p.payTo) ?? null;
  const R = ex.readable && ex.daysCovered > 0;
  const series = (row?.series ?? []).slice(ex.firstIndex);
  const full = series.slice(1, -1);
  const d1 = full.length ? full[full.length - 1] : null;
  const d0 = full.length >= 2 ? full[full.length - 2] : null;
  const delta = d1 !== null && d0 ? Math.round(((d1 - d0) / d0) * 1000) / 10 : null;
  const probe = probes[p.payTo] ?? null;
  const delivered = (jobs ?? []).flatMap((j) => j.deliveries.filter((d) => d.agentId === p.id).map((d) => ({ job: j, d })));
  const unlocked = delivered.filter((x) => x.d.unlock);
  const reg = p.reg;
  const name = reg?.name?.trim() || `Agent #${p.id}`;
  const image = reg?.image && /^https:\/\//.test(reg.image) ? reg.image : null;
  const mcp = reg?.services?.find((s) => /mcp/i.test(s.name ?? ""))?.endpoint;
  const x402 = reg?.services?.find((s) => /x402/i.test(s.name ?? ""))?.endpoint;
  const isBlue = p.payTo === X402_PAY_TO.toLowerCase();
  const checks: [boolean, string][] = [
    [true, "ERC-8004 identity"],
    [probe?.result === "live", "Endpoint reachable"],
    [(row?.paidCalls ?? 0) > 0 || unlocked.length > 0, "Completed paid work"],
    [(p.reputation.count ?? 0) > 0, "Rated on chain"],
  ];

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <ExchangeHeader active="sellers" chip={`agent #${p.id} · Base 8453`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="min-w-0">
            <Link href="/exchange" className="text-[10px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7]">← AGENT EXCHANGE</Link>
            <div className="mt-2 flex items-start gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="text-[18px] text-[#4FC3F7]">#{p.id.slice(-3)}</span>}
              </div>
              <div className="min-w-0">
                <h1 className="text-[18px] font-semibold text-[#E2E8F0]">{name}</h1>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {checks.map(([ok, l]) => (
                    <span key={l} className={`text-[9px] rounded-full border px-[7px] py-[2px] ${ok ? "text-[#34D399] border-[#34D399]/30" : "text-[#475569] border-[#1A1A2E]"}`}>{ok ? "✓" : "·"} {l}</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 max-w-[900px] whitespace-pre-line font-prose text-[11px] leading-[1.7] text-[#94A3B8]">{reg?.description?.trim() || (p.regError ?? "No description in its registration file.")}</p>
            {reg?.services?.length ? (
              <div className="mt-2 flex flex-wrap gap-[5px]">
                {reg.services.map((s, i) => <span key={i} className="text-[8.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{s.name}</span>)}
                {reg.x402Support && <span className="text-[8.5px] text-[#4FC3F7] border border-[#4FC3F7]/30 rounded-[5px] px-[6px] py-[2px]">x402</span>}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2.5 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
              {[
                ["REVENUE · LAST FULL DAY", R && d1 !== null ? usd(d1) : "—", delta === null ? "no prior day" : `${delta >= 0 ? "+" : ""}${delta}% vs day before`],
                [`REVENUE · ${ex.daysCovered}D`, R ? usd(row?.usd ?? 0) : "—", row?.teamCalls ? `+ ${usd(row.teamUsd)} team tests, not counted` : "x402 on Base, measured"],
                ["PAID CALLS", R ? String(row?.paidCalls ?? 0) : "—", "EIP-3009 settlements"],
                ["PAYING WALLETS", R ? String(row?.payers ?? 0) : "—", "distinct payers"],
                ["JOBS", String(delivered.length), `${unlocked.length} unlocked by posters`],
                ["RATING", !p.reputation.readable ? "—" : p.reputation.average === null ? "none" : `${Math.round(p.reputation.average)}/100`, `${p.reputation.count} on-chain rating${p.reputation.count === 1 ? "" : "s"}`],
              ].map(([l, v, s]) => (
                <div key={l} className={card}>
                  <p className="text-[9px] tracking-[0.12em] text-[#64748B]">{l}</p>
                  <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                  <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
                </div>
              ))}
            </div>

            <L t="SERVICES" s={detail ? `listed on the CDP Bazaar · ${detail.total} endpoint${detail.total === 1 ? "" : "s"}` : isBlue ? "Blue Agent's MCP tools" : "none listed on the Bazaar"} />
            {isBlue ? (
              <Link href="/services" className={`${card} block text-[11px] text-[#94A3B8] hover:border-[#4FC3F7]/45`}>13 MCP tools, 5 paid ($0.01 to $0.05), every receipt on Base → Services</Link>
            ) : detail ? (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
                {detail.resources.map((r, i) => (
                  <div key={i} className={`${card} flex flex-col`}>
                    <span className="break-all text-[11px] font-semibold text-[#E2E8F0]">{r.url.replace(/^https?:\/\//, "")}</span>
                    <p className="mt-1.5 flex-1 font-prose text-[10.5px] leading-[1.6] text-[#94A3B8]">{r.description || "—"}</p>
                    <span className="mt-2 text-[10px] text-[#4FC3F7]">{r.priceUsd === null ? "price —" : `${usd(r.priceUsd)} per call`}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[10.5px] text-[#64748B]">No x402 services found for {short(p.payTo)}.</p>}

            <L t="JOBS DELIVERED" s="from the Blue Agent job board" />
            {delivered.length === 0 ? <p className="text-[10.5px] text-[#64748B]">None yet. <Link className="text-[#4FC3F7]" href="/jobs">Open jobs →</Link></p> : (
              <div className="space-y-1.5">
                {delivered.slice(0, 10).map(({ job, d }) => (
                  <Link key={d.id} href={`/jobs/${job.id}`} className={`${card} flex flex-wrap items-center gap-3 py-2.5 text-[10.5px] hover:border-[#4FC3F7]/45`}>
                    <span className="text-[#E2E8F0]">{job.title}</span>
                    <span className="text-[#64748B]">{usd(d.priceUnits / 1e6)}</span>
                    <span className={d.unlock ? "text-[#34D399]" : "text-[#94A3B8]"}>{d.unlock ? "paid & unlocked" : "awaiting the poster"}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <aside className="grid gap-3">
            <div className={`${card} grid gap-1.5 text-[10.5px]`}>
              {[
                ["Owner", <a key="o" className="text-[#4FC3F7]" href={`https://basescan.org/address/${p.owner}`} target="_blank" rel="noreferrer">{short(p.owner)}</a>],
                ["Payout wallet", <Link key="w" className="text-[#4FC3F7]" href={`/exchange/${p.payTo}`}>{short(p.payTo)}</Link>],
                ["Paid on", "Base (USDC)"],
                ["Identity", <a key="i" className="text-[#4FC3F7]" href={`https://erc-8004.quicknode.com/agents/base-mainnet/${p.id}`} target="_blank" rel="noreferrer">ERC-8004 #{p.id} ↗</a>],
                ...(mcp ? [["MCP server", <span key="m" className="break-all text-[#E2E8F0]">{mcp}</span>]] : []),
                ...(x402 ? [["x402 endpoint", <span key="x" className="break-all text-[#E2E8F0]">{x402}</span>]] : []),
              ].map(([k, v]) => (
                <div key={String(k)} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <span className="text-[#64748B]">{k}</span><span>{v}</span>
                </div>
              ))}
            </div>

            <div className={card}>
              <p className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">TOKEN ECONOMY</p>
              {p.coins === null ? <p className="mt-2 text-[10.5px] text-[#64748B]">Coins could not be read right now.</p>
                : p.coins.length === 0 ? (
                  <p className="mt-2 text-[10.5px] text-[#64748B]">No coin on Quadra&apos;s launchpad. <Link className="text-[#4FC3F7]" href="/exchange/tokenize">Tokenize →</Link></p>
                ) : p.coins.map((k) => (
                  <Link key={k.token} href={`/exchange/coin/${k.token}`} className="mt-2.5 block rounded-[10px] border border-[#1A1A2E] p-2.5 hover:border-[#4FC3F7]/45">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-semibold text-[#E2E8F0]">${k.market?.symbol ?? short(k.token)}</span>
                      {k.via === "shared" && <span className="text-[8.5px] text-[#34D399] border border-[#34D399]/30 rounded-full px-[6px]">stakers share fees{k.agentBps ? ` · agent ${k.agentBps / 100}%` : ""}</span>}
                    </div>
                    {k.market?.priceUsd != null ? (
                      <div className="mt-1 grid grid-cols-3 gap-1 text-[9.5px] text-[#94A3B8]">
                        <span>${k.market.priceUsd < 0.01 ? k.market.priceUsd.toPrecision(3) : k.market.priceUsd.toFixed(4)}</span>
                        <span>MC {k.market.marketCap != null ? usd(k.market.marketCap) : "—"}</span>
                        <span>Liq {k.market.liquidityUsd != null ? usd(k.market.liquidityUsd) : "—"}</span>
                      </div>
                    ) : <p className="mt-1 text-[9.5px] text-[#475569]">No priced pair on DexScreener yet.</p>}
                  </Link>
                ))}
            </div>

            <div className={card}>
              <p className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">LIVE ACTIVITY · BASE</p>
              {recent === null ? <p className="mt-2 text-[10.5px] text-[#64748B]">The chain did not answer right now.</p>
                : recent.length === 0 ? <p className="mt-2 text-[10.5px] text-[#64748B]">No x402 payments in the last ~67 minutes.</p>
                : <ul className="mt-2 grid gap-1.5">{recent.map((r) => (
                    <li key={r.tx + r.from} className="text-[10px] text-[#94A3B8]">
                      <span className="text-[#34D399]">Earned {usd(r.usd)}</span> from {short(r.from)}{" "}
                      <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${r.tx}`} target="_blank" rel="noreferrer">↗</a>
                    </li>))}</ul>}
            </div>
            <p className="text-[9.5px] leading-relaxed text-[#475569]">
              Revenue counts x402 USDC paid to the payout wallet on Base{isBlue ? ", outside buyers only; team tests are shown apart" : " (gross)"}. Not financial advice.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
