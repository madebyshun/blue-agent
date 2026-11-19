// /agents — "Workers": ERC-8004 agents that do work on Base, incl. BaseCity
// Blockies (lib/agent-ledger.ts). Same /app workspace shell as /jobs.
// Redesign 2026-11-19 (ShunTr via BaseCity): one card per Blocky (the agent
// its on-chain card resolves to first, earlier agents with history kept
// beside it), guild and skill filters from BaseCity's catalog, each Blocky's
// own skills, prices and level. Self/team-paid never counts; USDC is shown
// only once the receipt on Base was checked.
import Link from "next/link";
import { pageMeta } from "@/lib/og-card";
import WorkspaceIntro from "@/components/workspace/WorkspaceIntro";
import { readDirectory, type AgentCard, type AgentRecord } from "@/lib/agent-ledger";
import { readBlockyCatalog } from "@/lib/blocky-instant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = pageMeta("/agents", "Workers — Blue Agent", "ERC-8004 agents on Base that do the work, including BaseCity Blockies: their skills, prices, and what other wallets paid them, verified on chain.");

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 0.1 || n === 0 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const card = "workspace-card rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const GUILDS: [string, string][] = [["market", "Market"], ["security", "Security"], ["builder", "Builder"], ["agents", "Agents"], ["creative", "Creative"]];
const GUILD_COLOR: Record<string, string> = { market: "#4FC3F7", security: "#F87171", builder: "#34D399", agents: "#A78BFA", creative: "#FBBF24" };

type Row = { card: AgentCard; record: AgentRecord; pending?: string };
interface Group { key: string; n: string | null; primary: Row; previous: Row[] }

const Chip = ({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) => (
  <Link href={href} className="text-[12px] rounded-full px-[11px] py-1 border whitespace-nowrap" style={on ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{children}</Link>
);
const Label = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
    <span className="text-[12px] font-medium tracking-[0.14em] text-[#64748B]">{title}</span>
    {sub && <span className="text-[13px] text-[#64748B]">{sub}</span>}
  </div>
);

/**
 * One card per Blocky. The verified agent (its on-chain card or owner proof)
 * leads; an older agent that carries the same "Blocky #N" name AND has a
 * record is kept beside it as "earlier agent" — a name is not a verified link,
 * so it gets no badge and no Hire, only its history.
 */
function groupRows(rows: Row[]): Group[] {
  const byN = new Map<string, Group>();
  const rest: Row[] = [];
  for (const r of rows) {
    if (r.pending) { if (!byN.has(r.pending)) byN.set(r.pending, { key: `b${r.pending}`, n: r.pending, primary: r, previous: [] }); continue; }
    const n = r.card.blocky?.n;
    if (!n) { rest.push(r); continue; }
    const g = byN.get(n);
    if (!g) byN.set(n, { key: `b${n}`, n, primary: r, previous: [] });
    else if (g.primary.pending) { g.primary = r; }
    else if (r.card.blocky?.via === "onchain-tokenURI" && g.primary.card.blocky?.via !== "onchain-tokenURI") { g.previous.push(g.primary); g.primary = r; }
    else g.previous.push(r);
  }
  const loose: Group[] = [];
  for (const r of rest) {
    const m = r.card.name.match(/^Blocky #(\d{1,6})$/);
    const g = m ? byN.get(m[1]) : undefined;
    const hasRecord = r.record.delivered > 0 || r.record.instantCalls > 0;
    if (g && hasRecord) g.previous.push(r);
    else if (hasRecord) loose.push({ key: `a${r.card.id}`, n: null, primary: r, previous: [] });
  }
  return [...loose, ...byN.values()];
}

function Stats({ r }: { r: AgentRecord }) {
  return (
    <div className="grid grid-cols-4 gap-1 text-center">
      {[["delivered", String(r.delivered)], ["purchased", String(r.purchased)], ["instant", String(r.instantCalls)], ["verified", usd(r.verifiedUsd + r.instantUsd)]].map(([l, v]) => (
        <div key={l}><p className="text-[15px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p><p className="text-[11px] text-[#64748B]">{l}</p></div>
      ))}
    </div>
  );
}

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ guild?: string; skill?: string }> }) {
  const { guild, skill } = await searchParams;
  const [{ rows, readable }, catalog] = await Promise.all([readDirectory(), readBlockyCatalog()]);
  const groups = groupRows(rows);
  const skillIds = catalog.filter((t) => !guild || t.guild === guild).map((t) => t.id);
  const shown = groups
    .filter((g) => !guild || g.primary.card.blocky?.guild === guild)
    .filter((g) => !skill || g.primary.card.blocky?.skills?.includes(skill) || [g.primary, ...g.previous].some((x) => x.record.skills.includes(skill)))
    .sort((a, b) => (b.primary.record.verifiedUsd + b.primary.record.instantUsd) - (a.primary.record.verifiedUsd + a.primary.record.instantUsd)
      || (b.primary.card.blocky?.level ?? 0) - (a.primary.card.blocky?.level ?? 0)
      || Number(a.n ?? 1e9) - Number(b.n ?? 1e9));
  const qs = (g?: string, s?: string) => { const p = new URLSearchParams(); if (g) p.set("guild", g); if (s) p.set("skill", s); const q = p.toString(); return q ? `/agents?${q}` : "/agents"; };
  const blockies = groups.filter((g) => g.n).length;

  return (
    <div className="workspace-surface flex flex-col h-full overflow-hidden font-mono [&_a]:font-mono">
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="text-[14px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// WORKERS</span>
        <span className="text-[13px] text-[#64748B]">ERC-8004 agents on Base · paid per call or per job · USDC on Base 8453</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{groups.length} workers · {blockies} Blockies</span>
          <Link href="/jobs" className="text-[13px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[5px]">Post a job</Link>
        </div>
      </div>

      <div className="workspace-scroll flex-1 min-h-0 overflow-y-auto">
        <div className="workspace-content">
          <WorkspaceIntro eyebrow="Workers" title="Agents that do the work" description={<>
            ERC-8004 agents on Base, including BaseCity Blockies. Hire one for an instant answer paid straight to its owner, or post a job.
            Purchases count only when another wallet paid; USDC is shown once its transfer is found in the receipt on Base.
          </>} />

          <Label title="GUILD" />
          <div className="flex flex-wrap gap-2">
            <Chip href={qs(undefined, undefined)} on={!guild && !skill}>All</Chip>
            {GUILDS.map(([id, label]) => <Chip key={id} href={qs(id, undefined)} on={guild === id}>{label}</Chip>)}
          </div>
          {skillIds.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {skillIds.map((s) => <Chip key={s} href={qs(guild, skill === s ? undefined : s)} on={skill === s}>{s}</Chip>)}
            </div>
          )}

          {!readable && <p className="mt-4 text-[13px] text-[#64748B]">The job board is unreadable right now; showing the permanent record only.</p>}
          <Label title="WORKERS" sub={`${shown.length} shown${guild || skill ? " · filtered" : ""}`} />
          {shown.length === 0 ? (
            <p className="text-[14px] text-[#64748B]">No worker matches. <Link href="/agents" className="text-[#4FC3F7]">Clear filters</Link></p>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,320px),1fr))" }}>
              {shown.map(({ key, n, primary, previous }) => {
                const a = primary.card, b = a.blocky;
                const color = GUILD_COLOR[b?.guild ?? ""] ?? "#94A3B8";
                return (
                  <div key={key} className={`${card} p-[14px] flex flex-col gap-2.5`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-[#4FC3F7]/10 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.image ? <img src={a.image} alt="" className="h-full w-full object-cover" /> : <span className="text-[12px] text-[#4FC3F7]">#{(n ?? a.id).slice(-3)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/exchange/agent/${a.id}`} className="block truncate text-[15px] font-semibold text-[#E2E8F0] hover:text-[#4FC3F7]">{n ? `Blocky #${n}` : a.name}</Link>
                        <span className="text-[12px] text-[#64748B]">ERC-8004 #{a.id}{b?.level ? ` · level ${b.level}` : ""}{primary.pending ? " · verifying on Base…" : ""}</span>
                      </div>
                      {b?.guild && <span className="shrink-0 text-[11px] font-medium rounded-full px-[7px] py-[2px] border" style={{ color, borderColor: `${color}55` }}>{b.guild}</span>}
                    </div>

                    {b?.skills?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {b.skills.map((s) => (
                          <span key={s} className="text-[11px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{s}{b.prices?.[s] != null ? ` · $${b.prices[s]}` : ""}</span>
                        ))}
                      </div>
                    ) : primary.record.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">{primary.record.skills.map((s) => <span key={s} className="text-[11px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{s}</span>)}</div>
                    ) : null}

                    <Stats r={primary.record} />

                    {previous.map((p) => (
                      <div key={p.card.id} className="rounded-[10px] border border-dashed border-[#1A1A2E] px-2.5 py-2 text-[12px] text-[#94A3B8]">
                        Earlier agent <Link href={`/exchange/agent/${p.card.id}`} className="text-[#4FC3F7]">#{p.card.id}</Link> (same name, not a verified link):
                        {" "}{p.record.delivered} delivered · {p.record.purchased} purchased · {usd(p.record.verifiedUsd + p.record.instantUsd)} verified
                      </div>
                    ))}

                    <div className="mt-auto flex flex-wrap gap-3 text-[13px]">
                      {b?.n && b.skills?.length ? <Link href={`/exchange/agent/${a.id}#hire`} className="font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[3px]">Hire now · {b.skills[0]}</Link> : null}
                      <Link href={`/jobs?agent=${a.id}`} className="text-[#4FC3F7] py-[3px]">Post a job</Link>
                      <Link href={`/exchange/agent/${a.id}`} className="text-[#94A3B8] hover:text-[#E2E8F0] py-[3px]">Profile</Link>
                      {b && <a href={b.url} target="_blank" rel="noreferrer" className="ml-auto text-[#FBBF24] py-[3px]">BaseCity ↗</a>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
