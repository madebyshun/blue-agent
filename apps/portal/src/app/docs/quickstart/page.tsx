import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "Quickstart · Docs · Blue Hub",
  description: "Call your first Blue Agent API in 60 seconds. Install MCP, list tools, run blue-idea.",
};

export default function Quickstart() {
  return (
    <DocLayout
      title="Quickstart"
      intro="Three steps. Free. No signup required."
    >
      <h2 className="font-mono text-lg font-bold mt-6 mb-3">1. Install the MCP server</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Open your AI client&apos;s config file and add the Blue Agent server.
        Works with Claude Desktop, Cursor, Cline, Windsurf, and any MCP-compatible app.
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
        Save and restart your client. Blue Agent appears in the tools panel within seconds.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">2. Discover available APIs</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Your AI client now sees every API registered on Blue Agent. Try asking:
      </p>

      <CodeBlock
        hint="Prompt to your AI client"
        code={`What Blue Agent tools are available?`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Or call <code className="text-[#4FC3F7]">tools/list</code> directly from any MCP client:
      </p>

      <CodeBlock
        hint="curl"
        code={`curl -X POST https://blueagent.dev/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">3. Call your first tool</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Free tools (like <code className="text-[#4FC3F7]">blue_idea</code>) work immediately.
        Paid tools return HTTP 402 with USDC payment details — see{" "}
        <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">x402 payment flow</Link> for that path.
      </p>

      <CodeBlock
        hint="curl — free call"
        code={`curl -X POST https://blueagent.dev/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "blue_idea",
      "arguments": { "prompt": "USDC streaming payroll for Base DAOs" }
    }
  }'`}
      />

      <div className="rounded-xl border border-[#34D399]/20 bg-[#34D399]/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-[#34D399] mb-2">✓ That&apos;s it</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          Your AI client can now use 30+ Blue Agent APIs as native tools.
          Ready for more? Browse the <Link href="/marketplace" className="text-[#4FC3F7] hover:underline">marketplace</Link>,
          learn the <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">payment flow</Link>,
          or <Link href="/submit" className="text-[#4FC3F7] hover:underline">register your own API</Link>.
        </p>
      </div>
    </DocLayout>
  );
}
