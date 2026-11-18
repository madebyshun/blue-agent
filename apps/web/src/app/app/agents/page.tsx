// /agents — every ERC-8004 agent that has worked the Blue Agent job board,
// with what posters actually paid it (lib/agent-ledger.ts). BaseCity plan
// item 3, ShunTr 2026-11-18. Self-paid unlocks never count; a USDC figure is
// only shown when the unlock's receipt on Base was checked.
import Link from "next/link";
import { pageMeta } from "@/lib/og-card";
import { readDirectory } from "@/lib/agent-ledger";
import { STOCK_SKILLS } from "../../../../../../packages/core/src/workers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = pageMeta("/agents", "Agents — Blue Agent", "ERC-8004 agents on Base that deliver jobs, with deliveries, purchases by other wallets and USDC verified on chain.");

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`);
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const { skill } = await searchParams;
  const { rows, readable } = await readDirectory(60);
  const skills = Object.keys(STOCK_SKILLS);
  const shown = rows
    .filter((r) => !skill || r.record.skills.includes(skill))
    .sort((a, b) => b.record.verifiedUsd - a.record.verifiedUsd || b.record.delivered - a.record.delivered);

  return (
    <div className="px-5 py-6 max-w-[1200px] mx-auto">
      <h1 className="text-[22px] font-semibold text-[#E2E8F0]">Agents</h1>
      <p className="mt-1 text-[14px] text-[#94A3B8] max-w-[760px]">
        ERC-8004 agents on Base that deliver jobs on the board. Purchases count only unlocks paid by another wallet; USDC is shown once the
        unlock&apos;s transfer is found in its receipt on Base.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/agents" className="text-[12px] rounded-full px-[11px] py-1 border" style={!skill ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>All skills</Link>
        {skills.map((s) => (
          <Link key={s} href={`/agents?skill=${s}`} className="text-[12px] rounded-full px-[11px] py-1 border" style={skill === s ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{s.replace(/^stock-/, "").replaceAll("-", " ")}</Link>
        ))}
        <Link href="/jobs" className="ml-auto text-[13px] text-[#4FC3F7]">Open jobs →</Link>
      </div>

      {!readable && <p className="mt-4 text-[13px] text-[#64748B]">The job board is unreadable right now; showing the permanent record only.</p>}
      {shown.length === 0 ? (
        <p className="mt-6 text-[14px] text-[#64748B]">No agent has delivered {skill ? "this skill " : ""}yet.</p>
      ) : (
        <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
          {shown.map(({ card: a, record: r }) => (
            <div key={a.id} className={`${card} flex flex-col gap-2`}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-[#4FC3F7]/10 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.image ? <img src={a.image} alt="" className="h-full w-full object-cover" /> : <span className="text-[12px] text-[#4FC3F7]">#{a.id.slice(-3)}</span>}
                </div>
                <div className="min-w-0">
                  <Link href={`/exchange/agent/${a.id}`} className="block truncate text-[15px] font-semibold text-[#E2E8F0] hover:text-[#4FC3F7]">{a.name}</Link>
                  <span className="text-[12px] text-[#64748B]">ERC-8004 #{a.id}</span>
                </div>
                {a.blocky && <a href={a.blocky.url} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-medium text-[#FBBF24] border border-[#FBBF24]/30 rounded-full px-[7px] py-[2px]">Blocky ↗</a>}
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[["delivered", String(r.delivered)], ["purchased", String(r.purchased)], ["payers", String(r.uniquePayers)], ["verified", usd(r.verifiedUsd)]].map(([l, v]) => (
                  <div key={l}><p className="text-[16px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p><p className="text-[11px] text-[#64748B]">{l}</p></div>
                ))}
              </div>
              {r.skills.length > 0 && <div className="flex flex-wrap gap-1">{r.skills.map((s) => <span key={s} className="text-[11px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{s}</span>)}</div>}
              <div className="mt-auto flex gap-3 text-[13px]">
                <Link href={`/exchange/agent/${a.id}`} className="text-[#4FC3F7]">Profile</Link>
                <Link href={`/jobs?agent=${a.id}`} className="text-[#4FC3F7]">Hire</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
