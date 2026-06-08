import Link from "next/link";

const TIERS = [
  { name: "Guest",   need: "No wallet",         credits: "30 / day",    discount: "—",   color: "#475569" },
  { name: "Starter", need: "500K $BLUEAGENT",  credits: "500 / day",   discount: "—",   color: "#4FC3F7" },
  { name: "Pro",     need: "2M $BLUEAGENT",    credits: "2,000 / day", discount: "20%", color: "#A78BFA" },
  { name: "Max",     need: "10M $BLUEAGENT",   credits: "∞",           discount: "40%", color: "#F59E0B" },
];

const DISTRIBUTION = [
  { name: "Smithery",      url: "https://smithery.ai",        soon: true  },
  { name: "MCP.SO",        url: "https://mcp.so",             soon: true  },
  { name: "CDP x402",      url: "https://portal.cdp.coinbase.com/products/x402", soon: true },
  { name: "Agentic Market",url: "https://agenticmarket.ai",   soon: true  },
  { name: "Orbis",         url: "https://orbisapi.com",       soon: true  },
];

export default function PricingFooter() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">

      {/* Pricing tiers */}
      <div className="mb-16">
        <div className="text-center mb-10">
          <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mb-1">📊 PRICING</p>
          <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Hold $BLUEAGENT, save on every call</h2>
          <p className="font-mono text-xs text-slate-500 mt-2">
            Hold or stake — both count toward your tier. Discount applies to all priced tools.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TIERS.map(t => (
            <div key={t.name}
                 className="rounded-2xl border p-5 flex flex-col"
                 style={{ borderColor: `${t.color}25`, background: `${t.color}05` }}>
              <p className="font-mono text-xs font-bold mb-1" style={{ color: t.color }}>{t.name}</p>
              <p className="font-mono text-[10px] text-slate-600 mb-4">{t.need}</p>
              <div className="space-y-2 pt-3 border-t" style={{ borderColor: `${t.color}15` }}>
                <div>
                  <p className="font-mono text-[9px] text-slate-700">CREDITS</p>
                  <p className="font-mono text-sm font-bold text-white">{t.credits}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-slate-700">TOOL DISCOUNT</p>
                  <p className="font-mono text-sm font-bold" style={{ color: t.color }}>{t.discount}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center mt-6">
          <Link href="/staking" className="font-mono text-[11px] text-[#F59E0B] hover:underline">
            How to stake $BLUEAGENT →
          </Link>
        </p>
      </div>

      {/* Distribution badges */}
      <div>
        <div className="text-center mb-6">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">🏷️ AVAILABLE ON</p>
          <p className="font-mono text-xs text-slate-500">MCP catalogs distributing Blue Agent tools</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {DISTRIBUTION.map(d => (
            <a key={d.name} href={d.url} target="_blank" rel="noopener noreferrer"
               className="font-mono text-[11px] px-3 py-2 rounded-lg border border-[#1A1A2E] bg-[#0d0d12] text-slate-400 hover:text-white hover:border-slate-700 transition-all flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              {d.name}
              {d.soon && <span className="text-[8px] text-amber-400 tracking-widest">SOON</span>}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
