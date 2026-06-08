export default function HowItWorks() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
      <div className="text-center mb-12">
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">⚡ HOW IT WORKS</p>
        <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Two paths, one marketplace</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* For Developers */}
        <div className="rounded-2xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" />
            <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">FOR DEVELOPERS</p>
          </div>
          <h3 className="font-mono text-lg font-bold mb-4">Call an API in 3 lines</h3>
          <Steps steps={[
            { n: "01", title: "Pick a tool",       desc: "Browse 50+ APIs in the marketplace" },
            { n: "02", title: "Sign x402 payment", desc: "USDC on Base · 1 wallet click · EIP-3009" },
            { n: "03", title: "Get JSON result",   desc: "Structured output, agent-ready, instant" },
          ]} color="#4FC3F7" />
          <a href="#install"
             className="inline-block mt-6 font-mono text-[11px] text-[#4FC3F7] hover:underline">
            See REST + MCP install →
          </a>
        </div>

        {/* For AI Agents */}
        <div className="rounded-2xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
            <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest">FOR AI AGENTS</p>
          </div>
          <h3 className="font-mono text-lg font-bold mb-4">Connect via MCP, no setup</h3>
          <Steps steps={[
            { n: "01", title: "Add 1 URL to config", desc: "blueagent.dev/api/mcp · zero auth" },
            { n: "02", title: "Auto-discover tools", desc: "tools/list returns all 50 + community" },
            { n: "03", title: "Call any tool",       desc: "Streamable HTTP · spec 2025-03-26" },
          ]} color="#A78BFA" />
          <a href="#install"
             className="inline-block mt-6 font-mono text-[11px] text-[#A78BFA] hover:underline">
            Install MCP config →
          </a>
        </div>
      </div>
    </div>
  );
}

function Steps({ steps, color }: { steps: { n: string; title: string; desc: string }[]; color: string }) {
  return (
    <div className="space-y-4">
      {steps.map((s) => (
        <div key={s.n} className="flex gap-3 items-start">
          <span className="font-mono text-xs font-bold w-8 shrink-0 opacity-60" style={{ color }}>
            {s.n}
          </span>
          <div>
            <p className="font-mono text-xs font-semibold text-white">{s.title}</p>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed mt-0.5">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
