import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "MCP protocol details · Docs · Blue Hub",
  description: "JSON-RPC 2.0 method reference for Blue Hub MCP server. initialize, tools/list, tools/call, ping.",
};

export default function MCPProtocol() {
  return (
    <DocLayout
      title="MCP protocol details"
      intro="JSON-RPC 2.0 over Streamable HTTP. Spec: MCP 2025-03-26. This page documents every method Blue Hub MCP server supports."
    >

      <h2 className="font-mono text-lg font-bold mt-6 mb-3">Endpoint</h2>
      <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-4 py-3 flex items-center gap-3 my-3">
        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#4FC3F7]/15 text-[#4FC3F7] shrink-0">POST</span>
        <code className="font-mono text-xs text-slate-300 flex-1">https://blueagent.dev/api/mcp</code>
      </div>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Content-Type:</strong> <code className="text-[#4FC3F7]">application/json</code></li>
        <li><strong>Accept:</strong> <code className="text-[#4FC3F7]">application/json</code> (default) or <code className="text-[#4FC3F7]">text/event-stream</code> (SSE)</li>
        <li><strong>CORS:</strong> <code className="text-[#4FC3F7]">*</code> — works from browsers</li>
        <li><strong>Rate limit:</strong> 100 req/min/IP</li>
        <li><strong>Auth:</strong> none for read methods · x402 USDC for paid <code className="text-[#4FC3F7]">tools/call</code></li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Envelope</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Every request and response wraps a JSON-RPC 2.0 envelope.
      </p>
      <CodeBlock hint="Request envelope" code={`{
  "jsonrpc": "2.0",
  "id":      <number | string>,
  "method":  "<method-name>",
  "params":  { ... }
}`} />
      <CodeBlock hint="Success response" code={`{
  "jsonrpc": "2.0",
  "id":      <same id>,
  "result":  { ... }
}`} />
      <CodeBlock hint="Error response" code={`{
  "jsonrpc": "2.0",
  "id":      <same id>,
  "error":   { "code": -32600, "message": "..." }
}`} />

      {/* ── initialize ───────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3"><code className="text-[#4FC3F7]">initialize</code></h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Handshake. Returns protocol version + server capabilities. Call first.
      </p>
      <CodeBlock hint="Request" code={`{
  "jsonrpc": "2.0",
  "id":      1,
  "method":  "initialize",
  "params":  {
    "protocolVersion": "2024-11-05",
    "capabilities":    {}
  }
}`} />
      <CodeBlock hint="Response" code={`{
  "jsonrpc": "2.0",
  "id":      1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities":    { "tools": {} },
    "serverInfo": {
      "name":    "blue-agent",
      "version": "1.0.0"
    }
  }
}`} />

      {/* ── notifications/initialized ─────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3"><code className="text-[#4FC3F7]">notifications/initialized</code></h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Fire-and-forget notification from client → server signalling the handshake completed.
        Server returns no body (just <code className="text-[#4FC3F7]">202 Accepted</code>).
      </p>
      <CodeBlock hint="Request (no id — notifications are one-way)" code={`{
  "jsonrpc": "2.0",
  "method":  "notifications/initialized"
}`} />

      {/* ── tools/list ────────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3"><code className="text-[#4FC3F7]">tools/list</code></h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Returns every API registered on Blue Agent — first-party + community submissions.
        AI clients call this once after <code className="text-[#4FC3F7]">initialize</code> and re-call on user action.
      </p>
      <CodeBlock hint="Request" code={`{
  "jsonrpc": "2.0",
  "id":      2,
  "method":  "tools/list"
}`} />
      <CodeBlock hint="Response (truncated to 1 tool)" code={`{
  "jsonrpc": "2.0",
  "id":      2,
  "result": {
    "tools": [{
      "name":        "honeypot_check",
      "description": "Detect rug-pull / honeypot patterns before trade.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "token": { "type": "string", "description": "Token contract address on Base" }
        },
        "required": ["token"]
      }
    }]
  }
}`} />
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        <strong>Naming:</strong> MCP tool names use <code className="text-[#4FC3F7]">snake_case</code>{" "}
        (e.g. <code className="text-[#4FC3F7]">honeypot_check</code>); marketplace slugs use <code className="text-[#4FC3F7]">kebab-case</code> (<code className="text-[#4FC3F7]">honeypot-check</code>).
        Same tool, two display conventions.
      </p>

      {/* ── tools/call ────────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3"><code className="text-[#4FC3F7]">tools/call</code></h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Invoke a tool by name. <strong>Free tools</strong> return the result inline. <strong>Paid tools</strong>{" "}
        return an x402 payment-required envelope inside the result body — see{" "}
        <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">x402 payment flow</Link>.
      </p>
      <CodeBlock hint="Request — free tool (blue_idea)" code={`{
  "jsonrpc": "2.0",
  "id":      3,
  "method":  "tools/call",
  "params": {
    "name":      "blue_idea",
    "arguments": { "prompt": "USDC streaming payroll for Base DAOs" }
  }
}`} />
      <CodeBlock hint="Response — free tool" code={`{
  "jsonrpc": "2.0",
  "id":      3,
  "result": {
    "content": [{
      "type": "text",
      "text": "# Blue Idea Brief\\n\\n## Problem\\n..."
    }]
  }
}`} />
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        For paid tools, the <code className="text-[#4FC3F7]">content[].text</code> field contains the x402 instructions
        (JSON-encoded). MCP doesn&apos;t have a payment field, so we inline it. Client SDKs that wrap x402 will
        detect and surface this.
      </p>

      {/* ── ping ──────────────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3"><code className="text-[#4FC3F7]">ping</code></h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Liveness check. Returns an empty result object.
      </p>
      <CodeBlock hint="Request" code={`{
  "jsonrpc": "2.0",
  "id":      4,
  "method":  "ping"
}`} />

      {/* ── Error codes ───────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3">Error codes</h2>
      <div className="rounded-xl border border-[#1A1A2E] overflow-hidden my-4">
        <div className="grid grid-cols-[120px_180px_1fr] gap-3 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0d0d12] font-mono text-[10px] text-slate-600 tracking-widest">
          <span>CODE</span>
          <span>JSON-RPC NAME</span>
          <span>WHEN</span>
        </div>
        {[
          { code: "-32700", name: "Parse error",      when: "Request body wasn't valid JSON" },
          { code: "-32600", name: "Invalid request",  when: "Envelope missing jsonrpc / method" },
          { code: "-32601", name: "Method not found", when: "Unknown method (typo in name)" },
          { code: "-32602", name: "Invalid params",   when: "Missing required argument (e.g. prompt)" },
          { code: "-32603", name: "Internal error",   when: "Upstream tool service failed — see HTTP body" },
        ].map(e => (
          <div key={e.code} className="grid grid-cols-[120px_180px_1fr] gap-3 px-4 py-3 border-b border-[#1A1A2E] last:border-0 items-baseline">
            <code className="font-mono text-xs text-amber-400">{e.code}</code>
            <p className="font-mono text-xs text-slate-300">{e.name}</p>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{e.when}</p>
          </div>
        ))}
      </div>

      {/* ── Streamable HTTP ────────────────────────────────────────────────── */}
      <h2 className="font-mono text-lg font-bold mt-10 mb-3">Streamable HTTP (SSE)</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        For clients that want server-streamed responses (or use the legacy <code className="text-[#4FC3F7]">mcp-remote</code> bridge),
        set the request <code className="text-[#4FC3F7]">Accept</code> header:
      </p>
      <CodeBlock hint="SSE request" code={`POST https://blueagent.dev/api/mcp
Accept: text/event-stream
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }`} />
      <CodeBlock hint="SSE response" code={`Content-Type: text/event-stream

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}

`} />
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Server emits a single <code className="text-[#4FC3F7]">message</code> event per JSON-RPC response.
        Connection closes after each request — no long-poll, no server-initiated messages yet.
      </p>

      <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-[#4FC3F7] mb-2">SDK shortcuts</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          Most clients (Claude Desktop, Cursor, mcp-remote) handle all of this for you — just point them at the URL.
          The protocol details here are useful if you&apos;re building a custom MCP client or debugging.
        </p>
      </div>
    </DocLayout>
  );
}
