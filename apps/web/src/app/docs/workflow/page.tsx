import Link from "next/link";
import { DocHeader, H2, P, Callout, PrevNext } from "../_ui";

export const metadata = { title: "Founder Console Workflow — Blue Agent Docs" };

const STEPS = [
  { n: "1", cmd: "blue idea",  price: "$0.05", color: "#4FC3F7",
    title: "Idea", what: "Turn a rough concept into a fundable brief.",
    out: "Problem, why now, why Base, MVP scope, risks, and a 24-hour plan." },
  { n: "2", cmd: "blue build", price: "$0.50", color: "#A78BFA",
    title: "Build", what: "Get the technical blueprint.",
    out: "Architecture, stack, folder structure, files, integrations, and a test plan." },
  { n: "3", cmd: "blue audit", price: "$1.00", color: "#f87171",
    title: "Audit", what: "Security and product risk review before you ship.",
    out: "Critical issues (reentrancy, oracle, MEV), suggested fixes, and a go/no-go verdict." },
  { n: "4", cmd: "blue ship",  price: "$0.10", color: "#34D399",
    title: "Ship", what: "Deploy with confidence.",
    out: "Deployment checklist, verification steps, release notes, and a monitoring plan." },
  { n: "5", cmd: "blue raise", price: "$0.20", color: "#fbbf24",
    title: "Raise", what: "Tell the story investors fund.",
    out: "Market framing, why this wins, traction, the ask, and a Base investor map." },
];

export default function WorkflowDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Getting Started"
        title="Founder Console Workflow"
        lead="Blue Agent is workflow-first. Five commands take a Base project from a rough idea to a fundraise — each one grounded in verified Base knowledge, each callable from the CLI, Blue Chat, or MCP."
      />

      <P>
        The whole loop is <strong className="text-slate-200">idea → build → audit → ship → raise</strong>. Run them in order for a new
        project, or jump to the one you need. Every step is a paid x402 tool — you pay per call in USDC on Base, no subscription.
      </P>

      <div className="space-y-4 my-8">
        {STEPS.map((s) => (
          <div key={s.cmd} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[13px] font-bold shrink-0"
                style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}40` }}>{s.n}</div>
              <code className="font-mono text-sm font-bold" style={{ color: s.color }}>{s.cmd}</code>
              <span className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded px-1.5 py-0.5">{s.price}</span>
            </div>
            <div className="pl-10">
              <div className="font-bold text-white text-sm mb-1">{s.title} — <span className="text-slate-400 font-normal font-mono text-[12px]">{s.what}</span></div>
              <div className="font-mono text-[11px] text-slate-500 leading-relaxed"><span className="text-slate-600">Returns:</span> {s.out}</div>
            </div>
          </div>
        ))}
      </div>

      <H2 id="ways">Run it your way</H2>
      <P>
        Each command works the same across surfaces: the <Link href="/docs/commands" className="text-[#4FC3F7] underline">CLI</Link>{" "}
        (<code className="text-slate-300">blue idea &quot;…&quot;</code>), <Link href="/docs/blue-chat" className="text-[#4FC3F7] underline">Blue Chat</Link>{" "}
        slash commands (<code className="text-slate-300">/idea</code>), or the <Link href="/docs/mcp" className="text-[#4FC3F7] underline">MCP server</Link> in your IDE.
      </P>

      <Callout color="#34D399" title="Try it now">
        Open <Link href="/app/chat" className="text-[#34D399] underline">Blue Chat</Link> and type{" "}
        <code className="text-slate-300">/idea a DeFi protocol for Base</code> to see the first step in action.
      </Callout>

      <PrevNext current="/docs/workflow" />
    </article>
  );
}
