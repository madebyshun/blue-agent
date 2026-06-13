import Link from "next/link";
import { DocHeader, P, CodeBlock, Callout, PrevNext } from "../_ui";
import { SKILLS_DOCS } from "../_data";

export const metadata = { title: "Skills — Blue Agent Docs" };

export default function SkillsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="CLI Reference"
        title="Skills"
        lead="Markdown files that ground the LLM in verified Base knowledge — so commands return real addresses and real patterns, not generic advice."
      />

      <P>
        Run <code className="font-mono text-[#4FC3F7]">blue init</code> to install them to{" "}
        <code className="font-mono text-white">~/.blue-agent/skills/</code>. Load order:{" "}
        <code className="text-white">BLUE_AGENT_SKILLS_DIR</code> → <code className="text-white">~/.blue-agent/skills/</code> → monorepo <code className="text-white">skills/</code>.
      </P>

      <CodeBlock title="install skills" badge="$ blue init">{`$ blue init
✓ 40 skill files installed to ~/.blue-agent/skills/`}</CodeBlock>

      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-6">
        {SKILLS_DOCS.map((s) => (
          <div key={s.file} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3 hover:bg-[#0a0a0f] transition-colors">
            <code className="font-mono text-[11px] text-[#4FC3F7] shrink-0 sm:w-64">{s.file}</code>
            <span className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.desc}</span>
          </div>
        ))}
      </div>

      <Callout color="#34D399" title="Add your own">
        Drop a <code className="text-slate-300">.md</code> file in <code className="text-slate-300">skills/</code> and register it in{" "}
        <code className="text-[#4FC3F7]">packages/core/src/registry.ts</code>. See{" "}
        <Link href="/docs/develop" className="text-[#34D399] underline">For Developers</Link>.
      </Callout>

      <PrevNext current="/docs/skills" />
    </article>
  );
}
