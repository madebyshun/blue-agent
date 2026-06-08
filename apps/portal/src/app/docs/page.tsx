import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs — Blue Agent API",
  description: "Documentation for the Blue Hub API marketplace. Quickstart, MCP setup, x402 payment flow, builder registry.",
};

const DOC_SECTIONS = [
  {
    label: "GET STARTED",
    color: "#4FC3F7",
    items: [
      { href: "/docs/quickstart",  title: "Quickstart",          desc: "Call your first tool in 60 seconds" },
      { href: "/docs/mcp",         title: "Install MCP",          desc: "Claude Desktop · Cursor · Cline · mcp-remote" },
      { href: "/docs/concepts",    title: "Core concepts",        desc: "Tools · agents · MCP · x402 · credits" },
    ],
  },
  {
    label: "BUILDING WITH BLUE",
    color: "#A78BFA",
    items: [
      { href: "/docs/x402",         title: "x402 payment flow",   desc: "EIP-3009 USDC settlement on Base" },
      { href: "/docs/rest-api",     title: "REST API reference",  desc: "All x402 endpoints + auth" },
      { href: "/docs/mcp-protocol", title: "MCP protocol",        desc: "Streamable HTTP, JSON-RPC 2.0" },
    ],
  },
  {
    label: "FOR BUILDERS",
    color: "#34D399",
    items: [
      { href: "/docs/builders/submit",     title: "Submit a tool",      desc: "Register your API on Blue Hub" },
      { href: "/docs/builders/dashboard",  title: "Builder dashboard",  desc: "Track calls + USDC revenue" },
      { href: "/docs/builders/best-practices", title: "Best practices",  desc: "Pricing, schemas, uptime" },
    ],
  },
  {
    label: "REFERENCE",
    color: "#F59E0B",
    items: [
      { href: "/docs/staking",       title: "$BLUEAGENT staking",  desc: "Tiers, credits, discount" },
      { href: "/docs/rate-limits",   title: "Rate limits",          desc: "Free vs paid quotas" },
      { href: "/docs/errors",        title: "Error codes",          desc: "What 402, 429, 503 mean" },
    ],
  },
];

export default function DocsIndex() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2">📖 DOCS</p>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">Documentation</h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl mb-6 leading-relaxed">
            Everything you need to call Blue Agent tools, build with our API,
            and list your own tool on the marketplace.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search docs… (coming soon)"
              disabled
              className="flex-1 min-w-[260px] bg-[#0d0d12] border border-[#1A1A2E] rounded-xl px-4 py-3 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
            />
            <Link href="/docs/quickstart"
                  className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
              Quickstart →
            </Link>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DOC_SECTIONS.map(section => (
            <div key={section.label} className="rounded-2xl border p-6"
                 style={{ borderColor: `${section.color}25`, background: `${section.color}05` }}>
              <p className="font-mono text-[10px] tracking-widest mb-4" style={{ color: section.color }}>
                {section.label}
              </p>
              <ul className="space-y-3">
                {section.items.map(item => (
                  <li key={item.href}>
                    <Link href={item.href} className="block group">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-mono text-sm font-semibold text-white group-hover:opacity-80 transition-opacity">
                          {item.title}
                        </p>
                        <span className="font-mono text-[10px] opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: section.color }}>
                          →
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Status banner */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-mono text-xs font-bold mb-1">📝 Docs are in active development</p>
            <p className="font-mono text-[11px] text-slate-500">
              Quickstart, MCP, x402 pages are ready. Others are placeholders — content rolling out daily.
              Want a specific topic? Open an issue on GitHub.
            </p>
          </div>
          <a href="https://github.com/madebyshun/blue-agent/issues" target="_blank" rel="noopener noreferrer"
             className="shrink-0 font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all">
            Request a doc ↗
          </a>
        </div>
      </section>
    </>
  );
}
