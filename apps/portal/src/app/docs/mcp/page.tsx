import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "Install MCP · Docs · Blue Hub",
  description: "Configure Claude Desktop, Cursor, Cline, Windsurf to call Blue Hub MCP server.",
};

export default function MCPInstall() {
  return (
    <DocLayout
      title="Install MCP"
      intro="One config snippet per client. Free tier, no signup, no API key."
    >
      <h2 className="font-mono text-lg font-bold mt-6 mb-3">Claude Desktop</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Open <code className="text-[#4FC3F7]">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)
        or <code className="text-[#4FC3F7]">%APPDATA%/Claude/claude_desktop_config.json</code> (Windows).
        Add the <code className="text-[#4FC3F7]">blue-agent</code> server entry:
      </p>

      <CodeBlock
        hint="claude_desktop_config.json"
        code={`{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Quit Claude Desktop completely and reopen. The 🔧 icon near the input shows Blue Agent connected.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Claude Code (CLI)</h2>

      <CodeBlock
        hint="Terminal"
        code={`claude mcp add blue-agent \\
  --transport http \\
  https://blueagent.dev/api/mcp`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Cursor · Cline · Windsurf</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        These clients use the <code className="text-[#4FC3F7]">mcp-remote</code> bridge.
        Add to your MCP config:
      </p>

      <CodeBlock
        hint="mcp.json"
        code={`{
  "mcpServers": {
    "blue-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://blueagent.dev/api/mcp"]
    }
  }
}`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Verify it works</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        From any terminal — without installing anything:
      </p>

      <CodeBlock
        hint="curl"
        code={`curl -X POST https://blueagent.dev/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        You should see <code className="text-[#4FC3F7]">protocolVersion: &quot;2024-11-05&quot;</code>{" "}
        and the server info. If you do, the server is reachable from your network.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Transport details</h2>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-2 list-disc pl-5">
        <li>Streamable HTTP per the <strong>MCP 2025-03-26 spec</strong></li>
        <li>Content negotiation: <code className="text-[#4FC3F7]">Accept: application/json</code> for JSON, <code className="text-[#4FC3F7]">text/event-stream</code> for SSE</li>
        <li>CORS: <code className="text-[#4FC3F7]">Access-Control-Allow-Origin: *</code> — browser clients work</li>
        <li>Rate limit: 100 req/min/IP (free tier)</li>
      </ul>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-amber-400 mb-2">⚠️ Old SSE-only clients</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          If your client requires the legacy SSE transport (separate /sse + /messages endpoints),
          use <code className="text-[#4FC3F7]">mcp-remote</code> as a bridge.
          It speaks Streamable HTTP upstream and SSE downstream.
        </p>
      </div>
    </DocLayout>
  );
}
