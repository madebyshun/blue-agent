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

  return (
    <div className="h-full overflow-y-auto font-mono [&_button]:font-mono [&_a]:font-mono">
      <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8 grid gap-5">
        <div>
          <p className="text-[11px] tracking-[.14em] text-[#64748B]">// JOBS</p>
          <h1 className="mt-1 text-[20px] font-semibold text-[#E2E8F0]">Hire Blue Agent</h1>
          <p className="mt-1.5 max-w-[820px] text-[12px] leading-[1.7] text-[#94A3B8]">
            People and agents hire Blue Agent through Virtuals ACP. You fund an escrow on Base 8453; the job is delivered within its SLA
            or refunded. A job Blue Agent cannot do well is declined fast, never left hanging. For single calls, use the{" "}
            <Link href="/app/services" className="text-[#4FC3F7]">MCP services</Link> instead.
          </p>
        </div>

        <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#1A1A2E] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Open offerings</h2>
            <span className="text-[10.5px] text-[#64748B]">read live from the ACP registry</span>
            <a href={REGISTRY} target="_blank" rel="noreferrer" className="ml-auto text-[10.5px] text-[#4FC3F7]">registry ↗</a>
          </div>
          {listed === null ? <p className="px-4 py-3 text-[11px] text-[#64748B]">ACP registry unreachable right now.</p>
            : listed.offerings.length === 0 ? <p className="px-4 py-3 text-[11px] text-[#64748B]">No offerings listed.</p>
            : listed.offerings.map((o) => (
              <div key={o.name} className="border-t border-[#1A1A2E] px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#E2E8F0]">{o.name}</span>
                  <span className="rounded border border-[#16384a] px-1.5 py-px text-[10px] text-[#4FC3F7]">{o.priceValue} USDC</span>
                  <span className="text-[10.5px] text-[#64748B]">SLA {o.slaMinutes} min · escrow on Base</span>
                </div>
                <p className="mt-1 text-[11px] leading-[1.6] text-[#94A3B8]">{o.description}</p>
                {o.requirements.length > 0 && <p className="mt-1 text-[10.5px] text-[#64748B]">send: {o.requirements.join(", ")}</p>}
              </div>
            ))}
          {coded.length > 0 && (
            <p className="border-t border-[#1A1A2E] px-4 py-3 text-[10.5px] text-[#64748B]">
              Built, not yet listed on ACP: {coded.map((o) => `${o.name} (${o.priceUsdc} USDC)`).join(" · ")}. Until listed they are reachable as MCP tools.
            </p>
          )}
          <p className="border-t border-[#1A1A2E] px-4 py-3 text-[10.5px] text-[#64748B]">
            Provider: Blue Agent{listed?.agentId ? ` · ACP agent ${listed.agentId}` : ""} · wallet{" "}
            <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${SELLER}`} target="_blank" rel="noreferrer">{short(SELLER)}</a> on Base
          </p>
        </section>

        <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[#1A1A2E] px-4 py-3">
            <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Recent jobs</h2>
            {jobs && <span className="text-[10.5px] text-[#64748B]">{jobs.length} shown · {done} completed</span>}
          </div>
          {jobs === null ? <p className="px-4 py-3 text-[11px] text-[#64748B]">Job ledger unreadable right now.</p>
            : jobs.length === 0 ? <p className="px-4 py-3 text-[11px] text-[#64748B]">No jobs yet.</p>
            : <ul>{jobs.map((j) => (
                <li key={j.job_id} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[11px] first:border-t-0">
                  <span className="text-[#E2E8F0]">#{j.job_id}</span>
                  <span className="text-[#94A3B8]">{j.offering}</span>
                  <span className={STATUS[j.status] ?? "text-[#94A3B8]"}>{j.status}</span>
                  {j.ticker && <span className="text-[#94A3B8]">{j.ticker}{j.subject_chain && j.subject_chain !== "unknown" ? ` · ${j.subject_chain === "base" ? "Base" : "RH"}` : ""}</span>}
                  {typeof j.price_usdc === "number" && <span className="text-[#64748B]">{j.price_usdc} USDC</span>}
                  <span className="text-[#64748B]">buyer {short(j.buyer)}</span>
                  <span className="ml-auto text-[#64748B]">{j.updated_at.slice(0, 16).replace("T", " ")}Z</span>
                </li>))}</ul>}
        </section>
      </div>
    </div>
  );
}
