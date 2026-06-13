import { DocHeader, H2, P, PrevNext } from "../_ui";
import { CORE_COMMANDS, COMMANDS_DOCS } from "../_data";

export const metadata = { title: "Commands — Blue Agent Docs" };

export default function CommandsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="CLI Reference"
        title="Commands"
        lead="22 CLI commands across Workflow, Setup, and Tasks — all grounded in verified Base knowledge. Install with npm i -g @blueagent/cli."
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

      <P>The 5 workflow commands also run inside Blue Chat as slash commands, and through the MCP server in your IDE.</P>

      <PrevNext current="/docs/commands" />
    </article>
  );
}
