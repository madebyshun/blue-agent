/**
 * Homepage Partners section — ecosystem logos / cards.
 * Different from Providers (agents who registered APIs). Partners = the
 * infrastructure stack and ecosystem allies Blue Agent integrates with.
 */

interface Partner {
  name:  string;
  role:  string;
  blurb: string;
  url:   string;
  color: string;
  initial: string;
}

const PARTNERS: Partner[] = [
  {
    name:    "Base",
    role:    "Chain",
    blurb:   "Native chain · ID 8453 · USDC settlement layer · all marketplace activity here.",
    url:     "https://base.org",
    color:   "#0052FF",
    initial: "B",
  },
  {
    name:    "Coinbase CDP",
    role:    "x402 Facilitator",
    blurb:   "Reference x402 implementation · settles every paid API call through CDP's facilitator.",
    url:     "https://portal.cdp.coinbase.com/products/x402",
    color:   "#0052FF",
    initial: "CDP",
  },
  {
    name:    "Anthropic MCP",
    role:    "Protocol",
    blurb:   "Model Context Protocol · how AI clients discover and call APIs · open standard.",
    url:     "https://modelcontextprotocol.io",
    color:   "#C77B5C",
    initial: "MCP",
  },
  {
    name:    "Uniswap v4",
    role:    "Liquidity",
    blurb:   "$BLUEAGENT token liquidity on Base · primary DEX for buying/selling.",
    url:     "https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base",
    color:   "#FF007A",
    initial: "Uni",
  },
  {
    name:    "Aeon",
    role:    "Agent partner",
    blurb:   "Ecosystem signals + narrative tracking · onboarding APIs to the marketplace.",
    url:     "https://x.com/aeon_xyz",
    color:   "#A78BFA",
    initial: "Ae",
  },
  {
    name:    "MiroShark",
    role:    "Agent partner",
    blurb:   "Sentiment consensus + crowd intelligence · onboarding APIs.",
    url:     "https://x.com/miroshark",
    color:   "#34D399",
    initial: "MS",
  },
  {
    name:    "Bankr",
    role:    "LLM provider",
    blurb:   "Bankr LLM powers Blue Agent's first-party tools (idea, build, audit, ship, raise).",
    url:     "https://bankr.bot",
    color:   "#F59E0B",
    initial: "Bk",
  },
  {
    name:    "Vercel",
    role:    "Infra",
    blurb:   "Hosting + edge functions for the portal and MCP server.",
    url:     "https://vercel.com",
    color:   "#FFFFFF",
    initial: "V",
  },
];

export default function Partners() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">

      <div className="text-center mb-10">
        <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mb-1">🤝 PARTNERS</p>
        <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Built with the Base ecosystem</h2>
        <p className="font-mono text-xs text-slate-500 mt-2">
          Infrastructure and agent partners integrated with Blue Agent
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {PARTNERS.map(p => (
          <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
            className="block rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                   style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40` }}>
                {p.initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-bold text-white truncate group-hover:text-[#4FC3F7] transition-colors">{p.name}</p>
                <p className="font-mono text-[9px] text-slate-700 truncate">{p.role}</p>
              </div>
            </div>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-3">{p.blurb}</p>
          </a>
        ))}
      </div>

      <p className="font-mono text-[10px] text-slate-700 text-center mt-8">
        Building on Blue Agent? <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">DM us on X</a> to be added to this list.
      </p>
    </div>
  );
}
