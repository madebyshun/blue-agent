import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#1A1A2E] mt-16">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-[11px] mb-10">

          <div>
            <p className="font-mono text-xs font-bold text-white mb-3">PRODUCT</p>
            <ul className="space-y-2 text-slate-500">
              <li><Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link></li>
              <li><Link href="/agents" className="hover:text-white transition-colors">For AI Agents</Link></li>
              <li><Link href="/x402" className="hover:text-white transition-colors">x402 Ecosystem</Link></li>
              <li><a href="https://blueagent.dev/hub/submit" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">List a tool ↗</a></li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-xs font-bold text-white mb-3">DEVELOPERS</p>
            <ul className="space-y-2 text-slate-500">
              <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/docs/quickstart" className="hover:text-white transition-colors">Quickstart</Link></li>
              <li><Link href="/docs/mcp" className="hover:text-white transition-colors">MCP setup</Link></li>
              <li><a href="https://blueagent.dev/api/mcp" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">MCP endpoint ↗</a></li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-xs font-bold text-white mb-3">TOKEN</p>
            <ul className="space-y-2 text-slate-500">
              <li><Link href="/staking" className="hover:text-white transition-colors">$BLUEAGENT Staking</Link></li>
              <li><a href="https://basescan.org/token/0xf895783b2931c919955e18b5e3343e7c7c456ba3" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Token contract ↗</a></li>
              <li><a href="https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Buy on Uniswap ↗</a></li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-xs font-bold text-white mb-3">COMMUNITY</p>
            <ul className="space-y-2 text-slate-500">
              <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              <li><a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X / Twitter ↗</a></li>
              <li><a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram ↗</a></li>
              <li><a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub ↗</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-[#1A1A2E] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-sm font-bold tracking-tight">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] tracking-widest">API</span>
          </div>
          <p className="font-mono text-[10px] text-slate-700">
            Built by <a href="https://blocky.studio" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400">Blocky Studio</a> · Base chain ID 8453 · Open source · x402 EIP-3009
          </p>
        </div>
      </div>
    </footer>
  );
}
