import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "REST API reference · Docs · Blue Hub",
  description: "All Blue Agent REST endpoints — call any registered API via /api/x402/[id] with USDC payment.",
};

export default function RestApi() {
  return (
    <DocLayout
      title="REST API reference"
      intro="Call any registered API as a standard HTTP POST. x402 USDC settlement on the first call."
    >
      <h2 className="font-mono text-lg font-bold mt-6 mb-3">Base URL</h2>
      <CodeBlock
        hint="Base URL"
        code={`https://blueagent.dev/api`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Endpoints</h2>

      <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_2fr] gap-3 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0d0d12] font-mono text-[10px] text-slate-600 tracking-widest">
          <span>METHOD</span>
          <span>PATH</span>
          <span>DESCRIPTION</span>
        </div>
        {[
          { method: "POST", path: "/api/mcp",          desc: "MCP JSON-RPC 2.0 — initialize, tools/list, tools/call" },
          { method: "GET",  path: "/api/mcp",          desc: "Discovery JSON (or SSE stream if Accept: text/event-stream)" },
          { method: "POST", path: "/api/x402/[id]",    desc: "Call any registered API by id. First call returns 402, retry with X-Payment header" },
          { method: "GET",  path: "/api/usage",        desc: "Public lifetime call counts per API (cached 60s)" },
          { method: "POST", path: "/api/register-api", desc: "Submit a new API to the marketplace (coming soon)" },
          { method: "GET",  path: "/api/catalog",      desc: "Public catalog JSON for AI scrapers (coming soon)" },
        ].map(e => (
          <div key={`${e.method}-${e.path}`} className="grid grid-cols-[80px_1fr_2fr] gap-3 px-4 py-3 border-b border-[#1A1A2E] last:border-0 items-baseline">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded text-center w-fit"
                  style={{
                    background: e.method === "GET" ? "#34D39915" : "#4FC3F715",
                    color:      e.method === "GET" ? "#34D399"   : "#4FC3F7",
                  }}>
              {e.method}
            </span>
            <code className="font-mono text-xs text-slate-300 truncate">{e.path}</code>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{e.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Calling a tool — direct REST</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Skip MCP if you want plain HTTP. Each registered API is reachable at{" "}
        <code className="text-[#4FC3F7]">/api/x402/[id]</code>:
      </p>

      <CodeBlock
        hint="curl"
        code={`curl -X POST https://blueagent.dev/api/x402/honeypot-check \\
  -H 'Content-Type: application/json' \\
  -d '{ "token": "0x..." }'

# → 402 Payment Required + payment instructions
# Sign EIP-3009, retry with X-Payment header
# See: /docs/x402`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Calling a tool — via MCP</h2>
      <CodeBlock
        hint="JSON-RPC"
        code={`POST /api/mcp
{
  "jsonrpc": "2.0",
  "id":      1,
  "method":  "tools/call",
  "params": {
    "name":      "honeypot_check",
    "arguments": { "token": "0x..." }
  }
}`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        MCP names use underscores (<code className="text-[#4FC3F7]">honeypot_check</code>),
        REST paths use hyphens (<code className="text-[#4FC3F7]">honeypot-check</code>).
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Status codes</h2>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-2 list-disc pl-5">
        <li><code className="text-[#4FC3F7]">200</code> — success, JSON response body</li>
        <li><code className="text-[#4FC3F7]">400</code> — invalid request body</li>
        <li><code className="text-amber-400">402</code> — payment required, see <code className="text-[#4FC3F7]">accepts</code> array</li>
        <li><code className="text-[#4FC3F7]">404</code> — tool id not registered</li>
        <li><code className="text-amber-400">429</code> — rate limit (100 req/min/IP)</li>
        <li><code className="text-red-400">503</code> — upstream tool service unavailable</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">CORS</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        All endpoints set <code className="text-[#4FC3F7]">Access-Control-Allow-Origin: *</code>.
        Browser-side calls work without proxying.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Examples by language</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        See per-API code samples — open any API on the{" "}
        <Link href="/marketplace" className="text-[#4FC3F7] hover:underline">marketplace</Link> and pick the language tab.
      </p>
    </DocLayout>
  );
}
