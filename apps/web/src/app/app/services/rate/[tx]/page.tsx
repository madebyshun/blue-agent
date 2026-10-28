// /services/rate/<tx> — rate one settled paid call on the ERC-8004 Reputation
// Registry, from the wallet that paid for it. The page only prepares the call;
// the buyer's wallet signs. A tx we have no settled receipt for is a 404.
import { notFound } from "next/navigation";
import Link from "next/link";
import { findMcpReceipt } from "@/lib/mcp-receipts";
import { BLUE_AGENT_ID, feedbackUri } from "@/lib/erc8004";
import RateClient from "./RateClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rate a call — Blue Agent" };

export default async function RatePage({ params }: { params: Promise<{ tx: string }> }) {
  const { tx } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) notFound();
  const r = await findMcpReceipt(tx);
  if (r === undefined) {
    return <p className="p-6 font-mono text-[11px] text-[#64748B]">Receipts could not be read right now. Try again in a minute.</p>;
  }
  if (!r || r.outcome !== "settled" || BLUE_AGENT_ID === null) notFound();
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono">
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SERVICES</span>
        <span className="text-[10.5px] text-[#64748B]">rate a paid call · ERC-8004 reputation on Base 8453</span>
        <Link href={`/services/${r.tool}`} className="ml-auto text-[10.5px] text-[#94A3B8] hover:text-[#E2E8F0] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">← {r.tool}</Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <RateClient
            agentId={BLUE_AGENT_ID.toString()}
            tool={r.tool}
            tx={r.tx!}
            payer={r.payer}
            units={r.units}
            at={r.at}
            feedbackURI={feedbackUri(r.tx!)}
          />
        </div>
      </div>
    </div>
  );
}
