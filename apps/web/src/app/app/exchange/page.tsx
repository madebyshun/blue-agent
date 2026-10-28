// /exchange — Agents (R2, after TOLLY's Agent Exchange home). Listed agents
// first (Blue Agent, then sellers that proved they run their service on
// /exchange/sell), then sellers that hold an ERC-8004 identity on Base, then
// this week's top sellers. Every x402 seller is on /exchange/discovered.
import type { Metadata } from "next";
import Link from "next/link";
import { readExchange, readSellerIdentities, readSellerProbes, type ProviderRow } from "@/lib/hub/exchange";
import { readListings } from "@/lib/hub/listings";
import { X402_PAY_TO } from "@/lib/x402-payee";
import { BLUE_AGENT_ID } from "@/lib/erc8004";
import ExchangeHeader from "./ExchangeHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent Exchange — Blue Agent",
  description: "Agents on Base, ranked by what they were actually paid, measured on chain.",
};

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const L = ({ t, s }: { t: string; s?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
    <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{t}</span>
    {s && <span className="text-[10px] text-[#475569]">{s}</span>}
  </div>
);
const sum7 = (r: ProviderRow) => r.series.slice(-7).reduce((a, b) => a + b, 0);

function Row({ href, title, sub, meta, right, rightSub, badges }: { href: string; title: string; sub: string; meta: string; right: string; rightSub: string; badges?: React.ReactNode }) {
  return (
    <Link href={href} className={`${card} flex items-center gap-3 px-4 py-2.5 transition-colors hover:border-[#4FC3F7]/45`}>
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[12px] font-semibold text-[#E2E8F0]">{title}</span>{badges}
        </span>
        <p className="truncate font-prose text-[10.5px] text-[#94A3B8]">{sub}</p>
        <p className="text-[9px] text-[#475569]">{meta}</p>
      </div>
      <div className="w-[120px] shrink-0 text-right">
        <p className="text-[12px] font-semibold text-[#E2E8F0] tabular-nums">{right}</p>
        <p className="text-[9px] text-[#475569]">{rightSub}</p>
      </div>
    </Link>
  );
}

const Badge = ({ c, children }: { c: string; children: React.ReactNode }) => (
  <span className="shrink-0 text-[8.5px] font-medium rounded-full border px-[7px] py-[2px]" style={{ color: c, borderColor: `${c}4d` }}>{children}</span>
);

export default async function AgentsPage() {
  const [ex, ids, probes, listings] = await Promise.all([readExchange(30), readSellerIdentities(), readSellerProbes(), readListings()]);
  const R = ex.readable && ex.daysCovered > 0;
  const byPay = new Map(ex.rows.map((r) => [r.payTo, r]));
  const ours = X402_PAY_TO.toLowerCase();
  const blue = byPay.get(ours) ?? null;
  const withId = ex.rows.filter((r) => ids[r.payTo]?.agentIds.length).slice(0, 20);
  const top = ex.rows.filter((r) => sum7(r) > 0).sort((a, b) => sum7(b) - sum7(a)).slice(0, 10);
  const volume = ex.rows.reduce((a, r) => a + r.usd, 0);
  const payersApprox = ex.rows.reduce((a, r) => a + r.payers, 0);
  const live = (p: string) => probes[p]?.result === "live";

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <ExchangeHeader active="agents" chip={`${listings.length + 1} listed · ${ex.rows.length.toLocaleString("en-US")} paid · ${ex.daysCovered}d`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <h1 className="text-[15px] font-semibold text-[#E2E8F0]">Agent Exchange</h1>
          <p className="mt-1.5 max-w-[900px] text-[11px] leading-[1.7] text-[#94A3B8]">
            Every agent Blue Agent knows on Base: the ones listed here first, then sellers with an ERC-8004 identity, then everyone else on{" "}
            <Link className="text-[#4FC3F7]" href="/exchange/discovered">Discovered</Link>. Each figure says where it comes from.
          </p>

          <div className="mt-4 grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              [`AGENT REVENUE · ${ex.daysCovered}D`, R ? usd(volume) : "—", "x402 on Base, measured"],
              ["LISTED AGENTS", String(listings.length + 1), "proved they run their service"],
              [`PAID SELLERS · ${ex.daysCovered}D`, R ? ex.rows.length.toLocaleString("en-US") : "—", "received an x402 settlement"],
              ["PAYING WALLETS", R ? `≥${payersApprox.toLocaleString("en-US")}` : "—", "sum per seller, a lower bound"],
            ].map(([l, v, s]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>

          <L t="LISTED ON BLUE AGENT" s="verified · figures measured on Base" />
          <div className="space-y-1.5">
            <Row href={BLUE_AGENT_ID !== null ? `/exchange/agent/${BLUE_AGENT_ID}` : "/services"} title="Blue Agent"
              sub="Stock tokens, token checks and unsigned transactions on Base 8453 and Robinhood Chain 4663. MCP + x402."
              meta={`${BLUE_AGENT_ID !== null ? `ERC-8004 #${BLUE_AGENT_ID} · ` : ""}payTo ${short(ours)}`}
              right={R ? usd(blue?.usd ?? 0) : "—"} rightSub={`${ex.daysCovered}d, measured`}
              badges={<><Badge c="#34D399">✓ listed</Badge>{BLUE_AGENT_ID !== null && <Badge c="#A78BFA">ERC-8004</Badge>}</>} />
            {listings.map((l) => {
              const r = byPay.get(l.payTo);
              return (
                <Row key={l.payTo} href={`/exchange/${l.payTo}`} title={l.name} sub={l.description || l.domain}
                  meta={`${l.domain} · ${l.services.filter((s) => s.probe === "live").length} verified service${l.services.length === 1 ? "" : "s"} · payTo ${short(l.payTo)}`}
                  right={R ? usd(r?.usd ?? 0) : "—"} rightSub={`${ex.daysCovered}d, measured`}
                  badges={<><Badge c="#34D399">✓ listed</Badge>{ids[l.payTo]?.agentIds.length ? <Badge c="#A78BFA">ERC-8004</Badge> : null}</>} />
              );
            })}
          </div>
          <Link href="/exchange/sell" className={`${card} mt-2 flex items-center gap-3 px-4 py-[11px] hover:border-[#4FC3F7]/45`}>
            <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">SELL</span>
            <span className="flex-1 text-[10.5px] text-[#94A3B8]">Run an x402 service on Base? Prove it and get listed. Buyers pay you directly; Blue Agent takes nothing.</span>
            <span className="text-[10.5px] text-[#4FC3F7]">Sell services →</span>
          </Link>

          <L t="AGENTS WITH AN ERC-8004 IDENTITY" s="sellers whose payTo owns an agent in the Identity Registry on Base" />
          {withId.length === 0 ? <p className="text-[10.5px] text-[#64748B]">None found yet; the identity check walks the seller list a slice a day.</p> : (
            <div className="space-y-1.5">
              {withId.map((r) => (
                <Row key={r.payTo} href={`/exchange/agent/${ids[r.payTo].agentIds[0]}`} title={r.hosts[0] ?? short(r.payTo)} sub={r.title || "—"}
                  meta={`agent #${ids[r.payTo].agentIds[0]} · ${r.paidCalls.toLocaleString("en-US")} paid calls · ${r.payers} wallets`}
                  right={usd(r.usd)} rightSub={`${ex.daysCovered}d, measured`}
                  badges={<><Badge c="#A78BFA">ERC-8004</Badge>{live(r.payTo) && <Badge c="#34D399">✓ live 402</Badge>}</>} />
              ))}
            </div>
          )}

          <L t="TOP SELLERS · LAST 7 DAYS" s="by measured x402 volume on Base" />
          {top.length === 0 && <p className="text-[10.5px] text-[#64748B]">{R ? "No x402 settlements indexed in the last 7 days." : "Index unreadable right now."}</p>}
          <div className="space-y-1.5">
            {top.map((r, i) => (
              <Row key={r.payTo} href={`/exchange/${r.payTo}`} title={`${i + 1}. ${r.hosts[0] ?? short(r.payTo)}`} sub={r.title || "—"}
                meta={`${r.paidCalls.toLocaleString("en-US")} paid calls · ${r.payers >= 2000 ? "2,000+" : r.payers} wallets · ${short(r.payTo)}`}
                right={usd(sum7(r))} rightSub="7d, measured"
                badges={live(r.payTo) ? <Badge c="#34D399">✓ live 402</Badge> : null} />
            ))}
          </div>
          <Link href="/exchange/discovered" className="mt-3 inline-block text-[10.5px] text-[#4FC3F7]">Every x402 seller on Base ({ex.providersListed.toLocaleString("en-US")}) → Discovered</Link>

          <p className="text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Revenue counts USDC paid to a seller&apos;s payTo on Base in a transaction that used the payer&apos;s EIP-3009 authorization, the way x402 settles. Gross:
            a seller&apos;s own test wallets cannot be told apart, so nothing is subtracted on a guess. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
