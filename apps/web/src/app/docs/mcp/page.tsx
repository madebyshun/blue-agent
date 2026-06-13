import { DocHeader, H2, P, CodeBlock, PrevNext } from "../_ui";

const MCP_TOOLS = [
  "blue_idea", "blue_build", "blue_audit", "blue_research", "blue_monitor", "blue_compose",
  "blue_registry", "blue_stream", "hub_ecosystem", "hub_token_pick", "hub_honeypot", "hub_market_fit",
];

export const metadata = { title: "MCP Setup — Blue Agent Docs" };

export default function McpDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Platform"
        title="MCP Setup"
        lead="Load Blue Agent tools directly into Claude Code, Cursor, or Claude Desktop via the Model Context Protocol — nothing to install."
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
      <P>
        Optional local package: <code className="text-slate-300">npm i -g @blueagent/skill</code>.
      </P>

      <H2 id="tools">Available MCP tools · 56</H2>
      <P>Core commands + the blue-* suite + 50+ Hub tools (security · market · onchain · agent clusters).</P>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 my-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {MCP_TOOLS.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="text-[#4FC3F7] text-xs">·</span>
              <code className="font-mono text-[11px] text-white">{t}</code>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-slate-600 text-xs">·</span>
            <span className="font-mono text-[11px] text-slate-600">+44 more</span>
          </div>
        </div>
      </div>

      <PrevNext current="/docs/mcp" />
    </article>
  );
}
