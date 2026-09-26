import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, PrevNext, Callout } from "./_ui";
import { STATS, PRODUCTS, FOUNDATION } from "./_data";
import { TOOL_COUNT } from "@/lib/agent-tools";

export const metadata = {
  title: "BlueAgent Docs — The onchain Agent OS",
  description: `BlueAgent: ${TOOL_COUNT} AI tools, Blue Chat, Blue Feed — built for Base builders and autonomous agents. x402 native, pay per call.`,
};

export default function DocsOverview() {
  return (
    <article>
      <DocHeader
        eyebrow="Introduction"
        title="Blue Agent"
        lead={`The onchain Agent OS. ${TOOL_COUNT} AI tools, Blue Chat, and live Base intelligence — built for builders and autonomous agents. x402 native, no API key needed.`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] my-8">
        {STATS.map((s) => (
          <div key={s.label} className="bg-[#0d0d12] px-4 py-5 text-center">
            <div className="font-mono text-xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="font-mono text-[10px] text-slate-600 tracking-widest">{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Said "an AI agent layer built on Base" and "live Base intelligence"
          until 2026-09-26 — one chain, on a page whose own product cards name
          two. Hard rule #1: state the chain, every time, and there are two here.
          Both chain ids are spelled out rather than left as names, because an
          address or an RPC call is meaningless without one and these two share
          no state. */}
      <H2>What is BlueAgent?</H2>
      <P>
        BlueAgent is an agent on <strong className="text-slate-200">Virtuals</strong> that works onchain across{" "}
        <strong className="text-slate-200">Base 8453</strong> and{" "}
        <strong className="text-slate-200">Robinhood Chain 4663</strong>. It is not just a chatbot — it holds a
        wallet, reads both chains live, and hands you transactions you sign yourself. Ask it in chat, or call any
        of its {TOOL_COUNT} tools directly over x402.
      </P>

      {/* Said "Four products, one agent — all built on Base" until 2026-09-26,
          and was wrong three ways at once. PRODUCTS held THREE entries, so the
          count had drifted off a list sitting six lines below it — the same
          shape as the MCP header claiming 111 while AGENT_TOOLS held 110, fixed
          the same morning. It also named one chain while two of the three cards
          underneath it said Base AND Robinhood Chain. And "products" was the
          real damage: it framed three brand names as a menu to choose from,
          which a first-time reader cannot do, because nothing on the page tells
          them what a "Blue Hood" is. The count is derived now so it cannot drift
          again, and the framing is "ways in" because only one of them is a door. */}
      <H2>Where to start</H2>
      <P>
        One agent, {PRODUCTS.length} ways in — across Base 8453 and Robinhood Chain 4663, all x402 native.
        Chat is the door: it already calls the other two for you.
      </P>
      <CardGrid cols={2}>
        {PRODUCTS.map((p) => (
          <Card key={p.name} title={p.name} color={p.color} href={p.link}>
            {p.desc}
            <span className="block mt-2 font-mono text-[10px]" style={{ color: p.color }}>{p.label}</span>
          </Card>
        ))}
      </CardGrid>

      <H2>Foundation</H2>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 my-5">
        <div className="grid sm:grid-cols-3 gap-6">
          {FOUNDATION.map((f) => (
            <div key={f.label} className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: f.color }} />
              <div>
                <div className="font-bold text-white text-sm mb-0.5">{f.label}</div>
                <div className="font-mono text-[11px] text-slate-500">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Callout color="#34D399" title="New here?">
        Open <Link href="/app/chat" className="text-[#34D399] underline">Blue Chat</Link> for zero-install access, or browse the{" "}
        <Link href="/app/hub" className="text-[#34D399] underline">Hub</Link>&apos;s {TOOL_COUNT} pay-per-call tools. The{" "}
        <Link href="/docs/quickstart" className="text-[#34D399] underline">Quickstart</Link> gets you running in 60 seconds.
      </Callout>

      <PrevNext current="/docs" />
    </article>
  );
}
