import { DocHeader, H2, P, CodeBlock, PrevNext } from "../_ui";
import { MCP_TOOLS } from "../_data";
import { groupMcpTools, formatUsdcMicros } from "./groups";

export const metadata = { title: "MCP Setup — Blue Agent Docs" };

// Grouped by price, not name prefix — see the header of ./groups.ts for the
// 2026-10-29 bug where every MCP v2 tool silently vanished from this page.
const GROUPS = groupMcpTools();

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
        const tools = g.tools;
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
                  <div className="flex items-baseline gap-2">
                    <code className="font-mono text-[12px] font-bold" style={{ color: g.color }}>{t.name}</code>
                    {t.priceMicros !== undefined && (
                      <span className="font-mono text-[10px] text-slate-400">{formatUsdcMicros(t.priceMicros)} / call</span>
                    )}
                  </div>
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
