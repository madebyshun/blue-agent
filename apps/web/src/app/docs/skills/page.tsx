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
      {/* The "+ 5 Aeon skills documented separately" sentence and its link to
          /docs/aeon-skills went on 2026-09-25: those five files were vendored
          from BankrBot/skills and are deleted, so the count is now just this
          list. Do not re-derive a total from a set that no longer ships. */}
      <P>
        These are the {SKILLS_DOCS.length} skill files that ship with the CLI.
      </P>

      {/* Interpolated, never a literal. This said "✓ 40 skill files installed"
          (SKILLS_DOCS.length + 5 Aeon skills, both numbers since changed), then
          carried no count at all while SKILLS_DOCS and packages/builder/skills
          disagreed by three files — at which point no number was true. The sets
          were reconciled on 2026-09-25 and skills-truth-check.ts now fails if they
          diverge, so SKILLS_DOCS.length is what `blue init` actually copies. If
          you are tempted to freeze this number: the check is what makes it honest,
          not the digit. */}
      <CodeBlock title="install skills" badge="$ blue init">{`$ blue init
✓ ${SKILLS_DOCS.length} skill files installed to ~/.blue-agent/skills/`}</CodeBlock>

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
