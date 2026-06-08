/**
 * "Why Blue Hub?" — 6-feature value-props grid, mirrors Orbis's pattern.
 * The middle card is the highlighted differentiator vs other x402 marketplaces.
 */

interface Feature {
  title:    string;
  desc:     string;
  highlight?: boolean;
}

const FEATURES: Feature[] = [
  {
    title: "80% Builder Share",
    desc:  "Keep 80% of every USDC paid. Transparent split: 10% to $BLUEAGENT stakers, 10% to Blue Hub treasury — no hidden fees.",
  },
  {
    title: "x402 USDC on Base",
    desc:  "Pay-per-call settlement via EIP-3009 on Base. No subscription, no API key, no minimum payout.",
  },
  {
    title: "Agent-Native by Default",
    desc:  "Any AI client with a Base wallet discovers and calls APIs via MCP. No human in the loop, no signup, sub-second.",
    highlight: true,
  },
  {
    title: "Multi-Agent Composite",
    desc:  "Tools fuse Blue Agent + Aeon + MiroShark for cross-agent consensus. Single call, three perspectives — unique to Blue Hub.",
  },
  {
    title: "Base-Grounded",
    desc:  "34 Base skill files prevent hallucinated addresses. Every USDC, every Uniswap pool, every protocol address verified.",
  },
  {
    title: "Open Marketplace",
    desc:  "Anyone can register an API in 5 minutes. SIWE signature, lenient probe, instant listing in tools/list across MCP clients.",
  },
];

export default function WhyBlueHub() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">

      <div className="text-center mb-10">
        <h2 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-2">Why Blue Hub?</h2>
        <p className="font-mono text-xs text-slate-500">
          Fair pricing, real payments, agent-native from day one.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {FEATURES.map(f => (
          <div key={f.title}
               className={`rounded-2xl border p-5 ${
                 f.highlight
                   ? "border-[#4FC3F7]/40 bg-gradient-to-br from-[#4FC3F7]/[0.10] to-[#A78BFA]/[0.05] ring-1 ring-[#4FC3F7]/20"
                   : "border-[#1A1A2E] bg-[#0d0d12]"
               }`}>
            <p className={`font-mono text-sm font-bold mb-2 ${f.highlight ? "text-[#4FC3F7]" : "text-white"}`}>
              {f.title}
            </p>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
