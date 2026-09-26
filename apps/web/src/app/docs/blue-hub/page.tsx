import Link from "next/link";
import { DocHeader, H2, P, PrevNext, Callout } from "../_ui";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const metadata = { title: "Blue Hub — Blue Agent Docs" };

// Display metadata for the raw category tags on AGENT_TOOLS, in render order.
const CAT_META: { key: string; label: string; icon: string; color: string }[] = [
  { key: "intelligence",   label: "Market Intelligence", icon: "📈", color: "#4FC3F7" },
  { key: "security",       label: "Security",            icon: "🛡️", color: "#f87171" },
  { key: "on-chain",       label: "On-chain",            icon: "⛓", color: "#34D399" },
  { key: "builder",        label: "Builder Tools",       icon: "🏗️", color: "#A78BFA" },
  { key: "earn",           label: "Earn / DeFi",         icon: "🌾", color: "#fbbf24" },
  { key: "Base DeFi",      label: "DeFi",                icon: "💧", color: "#fbbf24" },
  { key: "trading",        label: "Trading",             icon: "💹", color: "#34D399" },
  { key: "agent-economy",  label: "Agent Network",       icon: "🤝", color: "#A78BFA" },
  { key: "base-ecosystem", label: "Base Ecosystem",      icon: "🔵", color: "#4FC3F7" },
  { key: "content",        label: "Content",             icon: "✍️", color: "#E879F9" },
  { key: "alerts",         label: "Alerts",              icon: "🔔", color: "#f87171" },
];

export default function BlueHubDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Hub"
        lead={`${AGENT_TOOLS.length} AI tools for Base — security, market intelligence, on-chain, builder, and agent-network. Paid per call in USDC via x402.`}
      />

      <P>
        Every tool uses live data (never fabricated numbers) and is callable three ways: the{" "}
        <a href="/hub" className="text-[#4FC3F7] underline">Hub UI</a>, the{" "}
        <a href="/docs/api" className="text-[#4FC3F7] underline">x402 API</a>, or any MCP client.
      </P>

      {/* A "Multi-persona tools" section lived here until 2026-09-27. It said a
          few high-stakes tools ran Blue, Aeon and MiroShark and weighted their
          answers into one verdict — carefully hedged in its own body ("prompt
          personas on a single Virtuals endpoint", "no voting protocol") and
          still an H2 selling three names. Aeon and MiroShark are retired
          (ShunTr), so there is nothing left for the hedge to hedge.
          Do not restore it. If several passes ever run again, describe what
          they READ, not who they are — a roster invites a reader to count
          parties, and the hedge below the header never catches up with the
          header itself. */}
      <H2 id="passes">Multi-step tools</H2>
      <P>
        Some tools (deep analysis, the launch simulators) chain several passes
        before answering, each narrowing the last. That is{" "}
        <strong>one agent on one endpoint</strong> — more steps, not more
        opinions. No second model, no second vendor, nothing casting a vote.
        The catalog&apos;s per-tool <code className="text-[#4FC3F7]">agents</code>{" "}
        field reports what runs, and reads{" "}
        <code className="text-[#4FC3F7]">[&quot;blue&quot;]</code> for every tool.
      </P>

      <H2 id="catalog">Full catalog</H2>
      {CAT_META.map((cat) => {
        const tools = AGENT_TOOLS.filter((t) => t.category === cat.key);
        if (!tools.length) return null;
        return (
          <section key={cat.key} className="my-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{cat.icon}</span>
              <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: cat.color }}>{cat.label}</span>
              <span className="font-mono text-[10px] text-slate-600">{tools.length}</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E]">
              {tools.map((t) => (
                <div key={t.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 mb-0.5">
                    <span className="font-mono text-[12px] font-bold text-slate-200">{t.name}</span>
                    <span className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded px-1.5 py-0.5 shrink-0">{t.price}</span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-500 leading-relaxed">{t.description}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <Callout color="#fbbf24" title="Pricing & API">
        Pay-per-call in USDC on Base — no keys, no subscription. See <Link href="/docs/x402" className="text-[#fbbf24] underline">x402 Tools</Link> for
        the core command suite, or the <a href="https://blueagent.dev/.well-known/openapi.json" className="text-[#fbbf24] underline">OpenAPI spec</a>.
      </Callout>

      <PrevNext current="/docs/blue-hub" />
    </article>
  );
}
