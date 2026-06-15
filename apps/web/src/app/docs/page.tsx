import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, PrevNext, Callout } from "./_ui";
import { STATS, PRODUCTS, FOUNDATION } from "./_data";

export const metadata = {
  title: "Blue Agent Docs — Overview",
  description: "Blue Agent is the Base-native founder console: 24 CLI commands, 40 skills, 68 Hub tools, 56 MCP tools — all grounded in verified Base knowledge.",
};

export default function DocsOverview() {
  return (
    <article>
      <DocHeader
        eyebrow="Introduction"
        title="Blue Agent"
        lead="The Base-native founder console. Think, build, audit, ship, and raise on Base — powered by Bankr LLM and monetized with x402 micropayments. Everything is grounded in verified Base knowledge: no hallucinated addresses, no generic advice."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] my-8">
        {STATS.map((s) => (
          <div key={s.label} className="bg-[#0d0d12] px-4 py-5 text-center">
            <div className="font-mono text-xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="font-mono text-[10px] text-slate-600 tracking-widest">{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <H2>What is Blue Agent?</H2>
      <P>
        Blue Agent is an AI agent layer built on Base. It is not just a chatbot — it is a full economic actor:
        it holds a wallet, executes onchain transactions, and powers a growing ecosystem of tools and services.
        This console is the AI-native workflow for Base builders: <strong className="text-slate-200">idea → build → audit → ship → raise</strong>.
      </P>

      <H2>The ecosystem</H2>
      <P>Four products, one agent — all built on Base, all powered by Bankr LLM and x402.</P>
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
        Start with the <Link href="/docs/quickstart" className="text-[#34D399] underline">Quickstart</Link> to install the CLI and run your
        first command in 60 seconds — or open <Link href="/app/chat" className="text-[#34D399] underline">Blue Chat</Link> for zero-install access.
      </Callout>

      <PrevNext current="/docs" />
    </article>
  );
}
