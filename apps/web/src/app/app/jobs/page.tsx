// /app/jobs — Blue Agent's job board: work any person or agent can hire it for
// through Virtuals ACP, paid into ACP escrow on Base 8453 and released only on
// delivery. We never hold the buyer's funds; the escrow contract does.
//
// The offerings list is read LIVE from the ACP registry, not from code: what
// is coded (lib/blue-hood/acp-offerings) and what is listed on the dashboard
// have drifted before, and only a listed offering can actually be hired.
import Link from "next/link";
import { listRecentJobs } from "@/lib/blue-hood/acp-jobs";
import { ACP_OFFERINGS } from "@/lib/blue-hood/acp-offerings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs — Blue Agent" };

const SELLER = "0x884fbdd5cf193e7f87cba76419e526d8f4df7a9b";
const REGISTRY = `https://api.acp.virtuals.io/agents/wallet/${SELLER}`;

interface Listed { name: string; description: string; priceValue: string; slaMinutes: number; requirements: string[] }

async function readListed(): Promise<{ agentId: string | null; offerings: Listed[] } | null> {
  try {
    const r = await fetch(REGISTRY, { next: { revalidate: 600 }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.data ?? j;
    return {
      agentId: d.id ?? null,
      offerings: (d.offerings ?? []).filter((o: { isHidden?: boolean }) => !o.isHidden).map((o: Record<string, unknown>) => {
        let req: string[] = [];
        try {
          const s = typeof o.requirements === "string" ? JSON.parse(o.requirements) : o.requirements;
          req = Array.isArray(s?.required) ? s.required : [];
        } catch { /* schema unreadable: show none */ }
        return { name: String(o.name), description: String(o.description ?? ""), priceValue: String(o.priceValue ?? "?"), slaMinutes: Number(o.slaMinutes ?? 0), requirements: req };
      }),
    };
  } catch {
    return null;
  }
}

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const STATUS: Record<string, string> = {
  completed: "text-[#34D399]", submitted: "text-[#4FC3F7]", funded: "text-[#4FC3F7]",
  rejected: "text-[#F87171]", expired: "text-[#94A3B8]", seen: "text-[#64748B]", budget_set: "text-[#64748B]",
};

export default async function JobsPage() {
  const [listed, jobs] = await Promise.all([readListed(), listRecentJobs(20)]);
  const listedNames = new Set((listed?.offerings ?? []).map((o) => o.name.replace(/[-_]/g, "")));
  const coded = ACP_OFFERINGS.filter((o) => !listedNames.has(o.name.replace(/[-_]/g, "")));
  const done = (jobs ?? []).filter((j) => j.status === "completed").length;

  const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
  const Label = ({ title, sub }: { title: string; sub?: string }) => (
    <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
      <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{title}</span>
      {sub && <span className="text-[10px] text-[#475569]">{sub}</span>}
    </div>
  );
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// JOBS</span>
        <span className="text-[10.5px] text-[#64748B]">hire Blue Agent through Virtuals ACP · escrow on Base 8453 · delivered within its SLA or refunded</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{listed ? `${listed.offerings.length} listed` : "registry —"}{jobs ? ` · ${done} completed` : ""}</span>
          <Link href="/services" className="text-[10.5px] text-[#94A3B8] hover:text-[#E2E8F0] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">Single calls → Services</Link>
          <a href={REGISTRY} target="_blank" rel="noreferrer" className="text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[5px]">ACP registry ↗</a>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <p className="text-[10.5px] leading-[1.7] text-[#94A3B8] lg:hidden">
            Hire Blue Agent through Virtuals ACP: escrow on Base 8453, delivered within its SLA or refunded.
          </p>

          <Label title="OPEN OFFERINGS" sub="read live from the ACP registry" />
          {listed === null ? <p className="text-[10.5px] text-[#64748B]">ACP registry unreachable right now.</p>
            : listed.offerings.length === 0 ? <p className="text-[10.5px] text-[#64748B]">No offerings listed.</p>
            : (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
                {listed.offerings.map((o) => (
                  <div key={o.name} className="rounded-[14px] p-[14px] border flex flex-col" style={{ borderColor: "rgba(79,195,247,.22)", background: "rgba(79,195,247,.035)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[#E2E8F0]">{o.name}</span>
                      <span className="shrink-0 text-[8.5px] font-medium text-[#4FC3F7] border border-[#4FC3F7]/30 rounded-full px-[7px] py-[2px]">{o.priceValue} USDC</span>
                    </div>
                    <p className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-2 flex-1">{o.description}</p>
                    <div className="flex flex-wrap gap-[5px] mt-[10px]">
                      <span className="text-[8.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">SLA {o.slaMinutes} min</span>
                      <span className="text-[8.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">escrow · Base 8453</span>
                    </div>
                    {o.requirements.length > 0 && <div className="text-[9px] text-[#475569] mt-[9px]">send: {o.requirements.join(", ")}</div>}
                  </div>
                ))}
              </div>
            )}
          {coded.length > 0 && (
            <p className="mt-2.5 text-[9.5px] text-[#475569]">
              Built, not yet listed on ACP: {coded.map((o) => `${o.name} (${o.priceUsdc} USDC)`).join(" · ")}. Until listed they are reachable as MCP tools.
            </p>
          )}

          <Label title={`RECENT JOBS${jobs ? ` · ${jobs.length}` : ""}`} sub={jobs ? `${done} completed` : undefined} />
          {jobs === null ? <p className="text-[10.5px] text-[#64748B]">Job ledger unreadable right now.</p>
            : jobs.length === 0 ? <p className="text-[10.5px] text-[#64748B]">No jobs yet.</p>
            : (
              <div className="space-y-1.5">
                {jobs.map((j) => (
                  <div key={j.job_id} className={`${card} flex flex-wrap items-center gap-3 px-4 py-2.5 text-[10.5px]`}>
                    <span className="text-[#E2E8F0]">#{j.job_id}</span>
                    <span className="text-[#94A3B8]">{j.offering}</span>
                    <span className={STATUS[j.status] ?? "text-[#94A3B8]"}>{j.status}</span>
                    {j.ticker && <span className="text-[#94A3B8]">{j.ticker}{j.subject_chain && j.subject_chain !== "unknown" ? ` · ${j.subject_chain === "base" ? "Base" : "RH"}` : ""}</span>}
                    {typeof j.price_usdc === "number" && <span className="text-[#64748B]">{j.price_usdc} USDC</span>}
                    <span className="text-[#64748B]">buyer {short(j.buyer)}</span>
                    <span className="ml-auto text-[#64748B]">{j.updated_at.slice(0, 16).replace("T", " ")}Z</span>
                  </div>
                ))}
              </div>
            )}

          <p className="text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Provider: Blue Agent{listed?.agentId ? ` · ACP agent ${listed.agentId}` : ""} · wallet{" "}
            <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${SELLER}`} target="_blank" rel="noreferrer">{short(SELLER)}</a> on Base.
            Blue Agent never holds the buyer&apos;s funds; the ACP escrow contract does.
          </p>
        </div>
      </div>
    </div>
  );
}
