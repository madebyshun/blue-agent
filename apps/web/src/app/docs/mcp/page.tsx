import { DocHeader, H2, P, CodeBlock, PrevNext } from "../_ui";
import { MCP_TOOLS } from "../_data";

export const metadata = { title: "MCP Setup — Blue Agent Docs" };

// ⚠️ This page groups BY NAME PREFIX, so a tool with no `blue_`/`hub_`/`b20_`
// prefix renders nowhere at all — silently, since `.filter()` cannot report a
// tool it never matched. Any new MCP tool must carry one of these three.
//
// `blue_` was labelled "Console commands" until 2026-09-26, which stopped being
// true when the 85 → 18 cut left only two console commands in it (build, audit)
// alongside the registry, the paid door, and three execution primitives. The
// label now describes what the group IS rather than what it once held.
const GROUPS = [
  { key: "blue_", label: "Agent core — discovery, execution, console", color: "#4FC3F7" },
  { key: "hub_",  label: "Live reads — chain data and safety checks",  color: "#A78BFA" },
  { key: "b20_",  label: "B20 calldata builder",                       color: "#22C55E" },
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
              {/* `t.description`, not `t.desc`. The hand-copied snapshot this page
                  used to render invented a `desc` key; the MCP wire format the
                  server actually returns has always been `description`. Nobody
                  noticed because the snapshot was the only thing typing the page
                  — the drift became a compile error the moment /docs/mcp started
                  reading the real manifest, which is the point of the extraction. */}
              {tools.map((t) => (
                <div key={t.name} className="px-5 py-3">
                  <code className="font-mono text-[12px] font-bold" style={{ color: g.color }}>{t.name}</code>
                  <p className="font-mono text-[10px] text-slate-500 leading-relaxed mt-0.5">{t.description}</p>
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
