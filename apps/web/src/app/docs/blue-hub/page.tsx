import { DocHeader, H2, P, CardGrid, PrevNext, Callout } from "../_ui";
import { X402_SUITE, CORE_COMMANDS } from "../_data";

export const metadata = { title: "Blue Hub — Blue Agent Docs" };

export default function BlueHubDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Hub"
        lead="72 AI tools for Base — security, market, onchain, and multi-agent consensus. Pay per call in USDC on Base via x402: no keys, no subscription."
      />

      <P>
        Every tool is callable three ways: from the <a href="/hub" className="text-[#4FC3F7] underline">Hub UI</a>,
        from the <a href="https://api.blueagent.dev/docs" className="text-[#4FC3F7] underline">x402 API</a>, or from any MCP client.
        The 5 core commands plus an extended <code className="font-mono text-[#4FC3F7]">blue-*</code> suite.
      </P>

      <H2 id="core">5 core commands</H2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-5">
        {CORE_COMMANDS.map((c) => (
          <div key={c.cmd} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 text-center" style={{ boxShadow: `0 0 20px ${c.color}08` }}>
            <div className="font-mono text-sm font-bold mb-1" style={{ color: c.color }}>blue {c.cmd}</div>
            <div className="font-mono text-[10px] text-slate-600 mb-2">{c.desc}</div>
            <div className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded-lg px-2 py-1">{c.price}</div>
          </div>
        ))}
      </div>

      <H2 id="suite">Extended blue-* suite</H2>
      <CardGrid cols={4}>
        {X402_SUITE.map((t) => (
          <div key={t.id} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4" style={{ boxShadow: `0 0 20px ${t.color}06` }}>
            <div className="flex items-center justify-between mb-2">
              <code className="font-mono text-[12px] font-bold" style={{ color: t.color }}>{t.id}</code>
              <span className="font-mono text-[9px] text-slate-500 border border-[#1A1A2E] rounded px-1.5 py-0.5">{t.price}</span>
            </div>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </CardGrid>

      <Callout color="#fbbf24" title="Always-current catalog">
        72 tools total. Discover the live catalog with <code className="text-[#4FC3F7]">blue-registry</code> or at{" "}
        <a href="https://api.blueagent.dev/docs" className="text-[#fbbf24] underline">api.blueagent.dev/docs</a>.
      </Callout>

      <PrevNext current="/docs/blue-hub" />
    </article>
  );
}
