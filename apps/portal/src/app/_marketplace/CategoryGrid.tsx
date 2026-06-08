const CATEGORIES = [
  { id: "intelligence",  label: "Intelligence",  emoji: "🧠", desc: "Signals, token picks, narratives", count: 9,  color: "#4FC3F7" },
  { id: "builder",       label: "Builder",       emoji: "🚀", desc: "Idea → build → audit → ship → raise", count: 13, color: "#A78BFA" },
  { id: "trading",       label: "Trading",       emoji: "📈", desc: "Momentum, copy-signals, rebalance", count: 3,  color: "#34D399" },
  { id: "security",      label: "Security",      emoji: "🛡️", desc: "Honeypot, risk-gate, quantum", count: 9,  color: "#F87171" },
  { id: "on-chain",      label: "On-chain Data", emoji: "⛓️", desc: "PnL, AML, whale tracking, DEX flow", count: 6,  color: "#FACC15" },
  { id: "content",       label: "Content",       emoji: "✍️", desc: "Threads, brand score, growth playbooks", count: 3,  color: "#FB923C" },
  { id: "agent-economy", label: "Agent Economy", emoji: "🤖", desc: "Multi-agent workflows, revenue, collab", count: 8,  color: "#94A3B8" },
  { id: "base-ecosystem",label: "Base",           emoji: "🔵", desc: "Grants, protocols, builder network", count: 3,  color: "#60A5FA" },
];

export default function CategoryGrid() {
  return (
    <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-20">
      <div className="text-center mb-10">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">📂 BROWSE BY USE CASE</p>
        <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Find the right tool, faster</h2>
        <p className="font-mono text-xs text-slate-500 mt-2">8 curated bundles · click to drill down</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {CATEGORIES.map((c) => (
          <a key={c.id}
             href={`https://blueagent.dev/hub?cat=${c.id}`}
             target="_blank" rel="noopener noreferrer"
             className="block rounded-2xl p-5 border card-hover group"
             style={{ borderColor: `${c.color}25`, background: `${c.color}05` }}>
            <div className="text-2xl mb-3">{c.emoji}</div>
            <p className="font-mono text-sm font-bold mb-1" style={{ color: c.color }}>{c.label}</p>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-2 mb-3">{c.desc}</p>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-700">{c.count} tools</span>
              <span className="font-mono text-[10px] opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: c.color }}>
                Browse →
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
