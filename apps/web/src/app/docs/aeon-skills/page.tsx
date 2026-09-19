import Link from "next/link";
import { DocHeader, H2, P, Callout, PrevNext } from "../_ui";
import { AEON_SKILLS } from "../_data";

export const metadata = { title: "Aeon Skills — Blue Agent Docs" };

export default function AeonSkillsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="CLI Reference"
        title="Aeon Skills"
        lead="Five trading & research skills bundled from BankrBot/skills, available to any command or agent session. When a request matches a trigger phrase, the skill loads and shapes the output."
      />

      <P>
        Four of the five are <strong className="text-slate-200">read-to-apply</strong> — no setup, no key. The fifth,
        <code className="text-slate-300"> aeon-distribute-tokens</code>, <strong className="text-slate-200">cannot run</strong>: it
        pays out through Bankr&apos;s Wallet API, and Bankr suspended this account. Every write verb returns
        <code className="text-slate-300"> 403</code> (measured 2026-09-06); reads still succeed, so a dry run looks
        healthy right up to the transfer. It is kept as a record, not as a capability.
      </P>

      <H2 id="skills">The five skills</H2>
      <div className="space-y-3 my-5">
        {AEON_SKILLS.map((s) => (
          <div key={s.file} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <code className="font-mono text-[13px] font-bold" style={{ color: s.color }}>{s.file}</code>
            </div>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed mb-2">{s.desc}</p>
            <div className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-slate-700 shrink-0">triggers:</span>
              <span className="font-mono text-[10px] text-slate-500">{s.trigger}</span>
            </div>
          </div>
        ))}
      </div>

      <Callout color="#A78BFA" title="How they fire">
        Ask in plain language — &quot;what&apos;s pumping today?&quot;, &quot;give me a token pick&quot;, &quot;DD on this token&quot; — and the matching
        skill loads automatically inside <Link href="/docs/blue-chat" className="text-[#A78BFA] underline">Blue Chat</Link> or any command session.
      </Callout>

      <PrevNext current="/docs/aeon-skills" />
    </article>
  );
}
