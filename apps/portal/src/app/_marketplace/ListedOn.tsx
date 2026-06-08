/**
 * Distribution platforms where Blue Hub MCP server is (or will be) indexed.
 * Mirrors Orbis's "LISTED & INDEXED ON" pattern — trust signal for AI agent users
 * who already know these catalogs.
 */

interface Channel {
  name:  string;
  url:   string;
  blurb: string;
  live:  boolean;
  initial: string;
  color: string;
}

const CHANNELS: Channel[] = [
  { name: "Smithery",       url: "https://smithery.ai",                              blurb: "MCP server catalog", live: false, initial: "S",   color: "#E36B2C" },
  { name: "MCP.SO",          url: "https://mcp.so",                                   blurb: "MCP directory",      live: false, initial: "M",   color: "#A9A9A9" },
  { name: "CDP x402",        url: "https://portal.cdp.coinbase.com/products/x402",   blurb: "Coinbase facilitator",live: false, initial: "C",  color: "#0052FF" },
  { name: "Agentic Market", url: "https://agentic.market",                            blurb: "Agent services",    live: false, initial: "A",   color: "#F59E0B" },
];

export default function ListedOn() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 sm:py-14">

      <p className="text-center font-mono text-[10px] text-slate-600 tracking-widest mb-6">
        LISTED &amp; INDEXED ON
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CHANNELS.map(c => (
          <a key={c.name}
             href={c.url}
             target="_blank" rel="noopener noreferrer"
             className="block rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-6 card-hover group text-center">
            <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center font-bold text-lg mb-3"
                 style={{ background: `${c.color}15`, color: c.color, border: `1px solid ${c.color}30` }}>
              {c.initial}
            </div>
            <p className="font-mono text-sm font-bold text-white truncate">{c.name}</p>
            <p className="font-mono text-[10px] text-slate-600 mt-0.5">{c.blurb}</p>
            <p className={`font-mono text-[9px] tracking-widest mt-3 ${c.live ? "text-[#34D399]" : "text-amber-400"}`}>
              {c.live ? "● LIVE" : "○ SUBMITTED"}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
