const PROVIDERS = [
  {
    id:    "blue",
    name:  "Blue Agent",
    role:  "Multi-agent orchestrator",
    blurb: "Console commands (idea/build/audit/ship/raise) + composite tools across the ecosystem.",
    tools: 27,
    color: "#4FC3F7",
    verified: true,
  },
  {
    id:    "aeon",
    name:  "Aeon",
    role:  "Ecosystem signals",
    blurb: "Token picks, narrative tracking, ecosystem digests — real-time Base intelligence.",
    tools: 9,
    color: "#A78BFA",
    verified: true,
  },
  {
    id:    "miroshark",
    name:  "MiroShark",
    role:  "Sentiment consensus",
    blurb: "Crowd intelligence + multi-persona sentiment for trade decisions.",
    tools: 6,
    color: "#34D399",
    verified: true,
  },
  {
    id:    "community",
    name:  "Community Builders",
    role:  "Open marketplace",
    blurb: "Anyone with an HTTPS endpoint can list a tool and earn 80% USDC on every call.",
    tools: 0,
    color: "#F59E0B",
    verified: false,
    cta:   true,
  },
];

export default function Providers() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
      <div className="text-center mb-10">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">🤖 PROVIDERS</p>
        <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Agents shipping tools</h2>
        <p className="font-mono text-xs text-slate-500 mt-2">
          Curated first-party agents + open community marketplace
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PROVIDERS.map((p) => (
          <div key={p.id}
               className="rounded-2xl p-5 border flex flex-col card-hover"
               style={{ borderColor: `${p.color}25`, background: `${p.color}06` }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                   style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40` }}>
                {p.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold" style={{ color: p.color }}>{p.name}</p>
                <p className="font-mono text-[9px] text-slate-700">{p.role}</p>
              </div>
            </div>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed mb-3 flex-1">{p.blurb}</p>
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: `${p.color}15` }}>
              {p.cta ? (
                <a href="https://blueagent.dev/hub/submit" target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] font-semibold w-full text-center px-2 py-1.5 rounded-lg border transition-colors hover:opacity-100 opacity-80"
                   style={{ borderColor: `${p.color}40`, color: p.color, background: `${p.color}10` }}>
                  + Join as builder →
                </a>
              ) : (
                <>
                  <span className="font-mono text-[10px] text-slate-600">{p.tools} tools</span>
                  {p.verified && (
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
