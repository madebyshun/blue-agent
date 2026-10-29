// /app/services/[tool] — one MCP tool's public profile: price, measured
// reliability (lib/service-score), latency, its own Base receipts, and its
// ERC-8004 reputation (lib/erc8004). Every number comes from the receipt book
// or the chain; anything unreadable renders "—", a thin sample "n<5".
import Link from "next/link";
import { notFound } from "next/navigation";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";
import { readMcpStats, readMcpReceipts } from "@/lib/mcp-receipts";
import { scoreService, MIN_RUNS } from "@/lib/service-score";
import { readReputation, BLUE_AGENT_ID, ERC8004_REPUTATION } from "@/lib/erc8004";
import { META } from "../meta";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return { title: `${tool} — Blue Agent services` };
}

const usd = (n: number) => (n === 0 || n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
      <p className="text-[14px] text-[#94A3B8]">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold text-[#E2E8F0] tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] text-[#64748B]">{sub}</p>
    </div>
  );
}

export default async function ToolProfile({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = MCP_TOOLS.find((x) => x.name === tool);
  if (!t) notFound();
  const m = META[tool];
  const units = MCP_PRICES[tool] ?? 0;
  const [stats, receipts, rep] = await Promise.all([
    readMcpStats(30), readMcpReceipts(500), units ? readReputation(tool) : Promise.resolve(null),
  ]);
  const s = stats.byTool[tool];
  const sc = scoreService(s);
  const R = stats.readable;
  const mine = (receipts ?? []).filter((r) => r.tool === tool).slice(0, 15);

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_button]:font-mono [&_a]:font-mono [&_pre]:font-mono">
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="text-[14px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SERVICES</span>
        <span className="text-[13px] text-[#64748B]">{tool} · measured from its own Base receipts</span>
        <Link href="/services" className="ml-auto text-[13px] text-[#94A3B8] hover:text-[#E2E8F0] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">← All services</Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-5 py-[18px] grid gap-5 w-full">
        <div>
          <Link href="/services" className="text-[13px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7] lg:hidden">← SERVICES</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[18px] font-semibold text-[#E2E8F0]">{tool}</h1>
            {units
              ? <span className="rounded border border-[#16384a] px-1.5 py-px text-[13px] text-[#4FC3F7]">PAID {usd(units / 1e6)}</span>
              : <span className="rounded border border-[#14402f] px-1.5 py-px text-[13px] text-[#34D399]">FREE</span>}
            {m?.chains.map((c) => <span key={c} className="rounded border border-[#1A1A2E] px-1.5 py-px text-[13px] text-[#94A3B8]">{c}</span>)}
          </div>
          <p className="mt-1.5 max-w-[820px] text-[13px] leading-[1.7] text-[#94A3B8] font-prose">{t.description}</p>
        </div>

        {units ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Tile label="Trust score" value={!R ? "—" : sc.score === null ? `n<${MIN_RUNS}` : String(sc.score)} sub={R ? sc.verdict : "receipts unreadable"} />
              <Tile label="Paid calls · 30d" value={R ? String(s?.settled ?? 0) : "—"} sub="settled on Base" />
              <Tile label="Not charged · 30d" value={R ? String(s?.notCharged ?? 0) : "—"} sub="failed runs, $0 taken" />
              <Tile label="Avg run time" value={R && sc.avgMs !== null ? `${(sc.avgMs / 1000).toFixed(1)}s` : "—"} sub="handler, paid calls" />
              <Tile
                label="ERC-8004 rating"
                value={!rep || !rep.registered ? "—" : !rep.readable ? "—" : rep.average === null ? "none yet" : `${Math.round(rep.average)}/100`}
                sub={!rep?.registered ? "identity not registered yet" : `${rep.count} on-chain ratings · Base`}
              />
            </div>
            <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5 text-[14px] leading-[1.7] text-[#64748B]">
              Trust score = 95% lower bound of paid runs that returned a result, computed from the receipts below. It needs {MIN_RUNS}+ runs; until then it shows n&lt;{MIN_RUNS}, not a number.
              {BLUE_AGENT_ID !== null && <> Ratings are read from the ERC-8004 reputation registry <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${ERC8004_REPUTATION}`} target="_blank" rel="noreferrer">{short(ERC8004_REPUTATION)}</a> on Base, posted by the wallets that paid.</>}
            </section>
            <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] overflow-hidden">
              <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[12px] font-medium tracking-[0.14em] text-[#64748B]">RECEIPTS</h2>
              {receipts === null ? <p className="px-4 py-3 text-[14px] text-[#64748B]">Receipts unreadable right now.</p>
                : mine.length === 0 ? <p className="px-4 py-3 text-[14px] text-[#64748B]">No paid calls yet.</p>
                : <ul>{mine.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[14px] first:border-t-0">
                      <span className={r.outcome === "settled" ? "text-[#34D399]" : "text-[#94A3B8]"}>{r.outcome === "settled" ? `paid ${usd(r.units / 1e6)}` : "not charged"}</span>
                      <span className="text-[#94A3B8]">{short(r.payer)}</span>
                      {typeof r.ms === "number" && <span className="text-[#64748B]">{(r.ms / 1000).toFixed(1)}s</span>}
                      <span className="text-[#64748B]">{r.at.slice(0, 16).replace("T", " ")}Z</span>
                      {r.tx && r.outcome === "settled" && <Link className="ml-auto text-[#94A3B8] hover:text-[#4FC3F7]" href={`/services/rate/${r.tx}`}>rate</Link>}
                      {r.tx && <a className={r.outcome === "settled" ? "text-[#4FC3F7]" : "ml-auto text-[#4FC3F7]"} href={`https://basescan.org/tx/${r.tx}`} target="_blank" rel="noreferrer">{short(r.tx)} ↗</a>}
                    </li>))}</ul>}
            </section>
          </>
        ) : (
          <p className="text-[15px] text-[#94A3B8]">Free tool: no payment, so no receipts or score. Connect the MCP server and call it.</p>
        )}

        <section className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]">
          <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[12px] font-medium tracking-[0.14em] text-[#64748B]">INPUT SCHEMA</h2>
          <pre className="whitespace-pre-wrap break-all px-4 py-3 text-[14px] text-[#cbd5e1]">{JSON.stringify(t.inputSchema, null, 2)}</pre>
        </section>
      </div>
      </div>
    </div>
  );
}
