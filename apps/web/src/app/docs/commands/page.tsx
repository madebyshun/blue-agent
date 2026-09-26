import { DocHeader, H2, P, PrevNext } from "../_ui";
import { CORE_COMMANDS, COMMANDS_DOCS } from "../_data";

/* The lead hard-typed "18 CLI commands across Workflow, Setup, Chat, Reputation,
   Alerts, and Tasks" until 2026-09-26. The count happened to be right, which is
   exactly why it was worth deriving: the sibling literal on /docs/quickstart read
   "40 skill files" against a real 34, and nothing told them apart until someone
   counted both. The group list was the more urgent half — TASKS was renamed
   "TASKS (local only)" in this same commit, so a hand-written list of group names
   would have started contradicting the headings rendered ten lines below it.
   It also said "grounded in verified Base knowledge" — one chain, on a CLI whose
   skills and commands cover Base 8453 and Robinhood Chain 4663. Hard rule #1. */
const CLI_COMMAND_COUNT = COMMANDS_DOCS.reduce((n, g) => n + g.items.length, 0);
const GROUP_LIST = COMMANDS_DOCS.map((g) => g.group[0] + g.group.slice(1).toLowerCase()).join(", ");

export const metadata = { title: "Commands — Blue Agent Docs" };

export default function CommandsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="CLI Reference"
        title="Commands"
        lead={`${CLI_COMMAND_COUNT} CLI commands across ${GROUP_LIST} — grounded in verified addresses on Base 8453 and Robinhood Chain 4663. Install with npm i -g @blueagent/cli.`}
      />

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

      {COMMANDS_DOCS.map((group) => (
        <section key={group.group}>
          <H2 id={group.group.toLowerCase()}>{group.group[0] + group.group.slice(1).toLowerCase()}</H2>
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
            {group.items.map((item) => (
              <div key={item.cmd} className="px-5 py-4">
                <code className="font-mono text-sm font-semibold text-white block mb-1">{item.cmd}</code>
                <p className="font-mono text-[11px] text-slate-500 mb-2 leading-relaxed">{item.desc}</p>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-slate-700 shrink-0">eg:</span>
                  <code className="font-mono text-[10px] text-[#4FC3F7]">{item.example}</code>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 🔴 Said "The 5 workflow commands also run inside Blue Chat as slash
          commands, and through the MCP server in your IDE" until 2026-09-26.
          BOTH halves were false, and each is contradicted by a comment in the
          file that owns the answer.
          Slash commands: `api/chat/route.ts:2358` — "Only /credits and /help
          remain as slash commands." Typing /idea into Blue Chat does nothing.
          MCP: `lib/mcp-tools.ts` declares 7 `blue_` tools and only TWO of the
          five are there (blue_build, blue_audit). Line 323 spells out why —
          "blue_idea / blue_ship / blue_raise are deliberately NOT loaded here —
          they ship as Claude Skills in the blue-agent plugin, where progressive
          disclosure costs no context." Verified on disk:
          packages/claude-plugin/blue-agent/skills/{blue-idea,blue-ship,blue-raise}.
          That is the 85→18 manifest cut working as designed, and the docs kept
          advertising the pre-cut surface. A sentence like this one ages every
          time a manifest is trimmed, so it names the mechanism, not a count. */}
      <P>
        All 5 run in the CLI, and each is a paid x402 tool. In your IDE the MCP server loads{" "}
        <code className="font-mono text-[#4FC3F7]">blue_build</code> and{" "}
        <code className="font-mono text-[#4FC3F7]">blue_audit</code>; idea, ship and raise ship as Claude
        Skills in the blue-agent plugin instead, so they cost no context until you use one. Blue Chat has no
        slash command for them — it keeps only <code className="font-mono text-slate-400">/credits</code> and{" "}
        <code className="font-mono text-slate-400">/help</code>.
      </P>

      <PrevNext current="/docs/commands" />
    </article>
  );
}
