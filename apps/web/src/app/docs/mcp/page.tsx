import { DocHeader, H2, P, CodeBlock, PrevNext } from "../_ui";
import { MCP_TOOLS } from "../_data";

export const metadata = { title: "MCP Setup — Blue Agent Docs" };

const GROUPS = [
  { key: "blue_", label: "Console commands",      color: "#4FC3F7" },
  { key: "hub_",  label: "Hub tools",             color: "#A78BFA" },
  { key: "b20_",  label: "B20 token tools",       color: "#22C55E" },
];

export default function McpDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Platform"
        title="MCP Setup"
        lead={`Load Blue Agent's ${MCP_TOOLS.length} tools directly into Claude Code, Cursor, or Claude Desktop via the Model Context Protocol — nothing to install.`}
      />

      <H2 id="remote">No install — remote URL</H2>
      <P>Point your client at the remote MCP server. Add it in 30 seconds:</P>
      <CodeBlock title="Claude Code / Cursor / Desktop config" badge="MCP">{`{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}`}</CodeBlock>
      <P>Optional local package: <code className="text-slate-300">npm i -g @blueagent/skill</code>.</P>

      <H2 id="tools">Available tools · {MCP_TOOLS.length}</H2>
      {GROUPS.map((g) => {
        const tools = MCP_TOOLS.filter((t) => t.name.startsWith(g.key));
        return (
          <section key={g.key} className="my-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: g.color }}>{g.label}</span>
              <span className="font-mono text-[10px] text-slate-600">{tools.length}</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E]">
              {tools.map((t) => (
                <div key={t.name} className="px-5 py-3">
                  <code className="font-mono text-[12px] font-bold" style={{ color: g.color }}>{t.name}</code>
                  <p className="font-mono text-[10px] text-slate-500 leading-relaxed mt-0.5">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <PrevNext current="/docs/mcp" />
    </article>
  );
}
