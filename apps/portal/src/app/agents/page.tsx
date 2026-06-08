import Link from "next/link";
import type { Metadata } from "next";
import InstallMcp from "../_marketplace/InstallMcp";

export const metadata: Metadata = {
  title: "For AI Agents — Blue Agent API",
  description: "Plug Blue Hub MCP server into Claude Desktop, Cursor, Cline. 50+ tools, one URL, no auth.",
};

export default function AgentsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 purple-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-2">🤖 FOR AI AGENTS</p>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            One URL, <span className="text-[#A78BFA]">50+ Base tools</span>
          </h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl mb-6 leading-relaxed">
            Any MCP-compatible AI client can call Blue Agent in 1 line of config — no auth,
            no API key, no signup. <code className="text-[#A78BFA]">tools/list</code> returns 50 first-party
            tools + every community-submitted tool, instantly.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#install" className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-[#A78BFA] text-[#050508] hover:bg-[#9d7ef0] transition-colors">
              Install MCP →
            </a>
            <Link href="/docs/mcp" className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/[0.02] transition-all">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* Why MCP */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-1">⚡ WHY USE BLUE AGENT VIA MCP</p>
        <h2 className="font-mono text-2xl font-bold mb-8">Built for AI-first calling</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { emoji: "🔓", title: "Zero auth",       desc: "No API key, no signup. Anonymous calls rate-limited per IP, paid calls signed with wallet." },
            { emoji: "📦", title: "Always fresh",    desc: "tools/list refreshes every call — community tools surface in real-time without redeploy." },
            { emoji: "💸", title: "x402 native",     desc: "Paid tools settle USDC on Base via EIP-3009. Free tools require zero crypto." },
            { emoji: "🧠", title: "Structured JSON", desc: "All tools return parseable JSON. No prompt-wrangling, no schema guessing." },
            { emoji: "⚡", title: "Streamable HTTP", desc: "Spec 2025-03-26 compliant. Works with mcp-remote bridge for older clients." },
            { emoji: "🔵", title: "Base-grounded",   desc: "34 skill files prevent hallucinated addresses. Chain ID 8453, USDC, Aerodrome, Uniswap v4." },
          ].map(f => (
            <div key={f.title} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
              <div className="text-2xl mb-3">{f.emoji}</div>
              <p className="font-mono text-sm font-bold mb-2">{f.title}</p>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Install (reuse landing component) */}
      <section id="install" className="border-t border-[#1A1A2E]">
        <InstallMcp />
      </section>

      {/* MCP method reference */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">📡 SUPPORTED METHODS</p>
        <h2 className="font-mono text-2xl font-bold mb-6">JSON-RPC 2.0</h2>
        <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
          {[
            { method: "initialize",                  desc: "Returns protocolVersion, server capabilities" },
            { method: "tools/list",                  desc: "Returns 50+ tool definitions with inputSchema" },
            { method: "tools/call",                  desc: "Execute a tool — name + arguments (free + paid)" },
            { method: "ping",                        desc: "Health check" },
            { method: "notifications/initialized",   desc: "Client-ready signal" },
          ].map(m => (
            <div key={m.method} className="grid grid-cols-[200px_1fr] gap-4 px-4 py-3 border-b border-[#1A1A2E] last:border-0">
              <code className="font-mono text-xs text-[#4FC3F7]">{m.method}</code>
              <span className="font-mono text-xs text-slate-400">{m.desc}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-slate-700 mt-3">
          Endpoint: <code className="text-slate-500">POST https://blueagent.dev/api/mcp</code> · CORS open
        </p>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E] text-center">
        <h2 className="font-mono text-2xl font-bold mb-3">Ready to plug in?</h2>
        <p className="font-mono text-sm text-slate-500 mb-6">Install in 30 seconds, call your first tool in 60.</p>
        <a href="#install"
           className="inline-block font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#A78BFA] text-[#050508] hover:scale-[1.02] transition-transform">
          Get the install config →
        </a>
      </section>
    </>
  );
}
