const FEATURES = [
  { icon: "💡", title: "Idea",          cmd: "blue idea",   desc: "Turn a rough thought into a fundable brief with why now, GTM, risks, and a 24h plan." },
  { icon: "🛠️", title: "Build",         cmd: "blue build",  desc: "Generate architecture, scaffold direction, stack choices, and the first implementation steps." },
  { icon: "🛡️", title: "Audit",         cmd: "blue audit",  desc: "Review the idea or build for risk, broken assumptions, unsafe patterns, and missing pieces." },
  { icon: "🚢", title: "Ship",          cmd: "blue ship",   desc: "Prepare deployment, verification, release notes, and launch checklist for Base." },
  { icon: "💬", title: "Chat + Models", cmd: "blue chat",   desc: "Pick a Bankr model, pay with credits or USDC, and run the right quality level for the task." },
  { icon: "🚀", title: "Launch",        cmd: "blue launch", desc: "Launch a fair-launch token or publish an agent to the Bankr marketplace." },
];

export default function FeaturesSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 border border-[#1A52FF]/25 bg-[#1A52FF]/8 rounded-full px-4 py-1.5 mb-6">
          <span className="font-mono text-xs text-[#33C3FF] tracking-widest">WORKFLOW</span>
        </div>
        <h2 className="font-sans font-bold text-3xl sm:text-4xl text-white mb-3">
          One console, many workflows
        </h2>
        <p className="text-[#B8CBE8] max-w-xl mx-auto">
          Blue Agent is built around the founder loop: think, build, audit, ship, and monetize.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div key={f.title} className="card-surface card-hover rounded-2xl p-6">
            <div className="text-2xl mb-3">{f.icon}</div>
            <div className="font-mono text-[10px] text-[#33C3FF] tracking-widest px-2 py-1 bg-[#1A52FF]/8 border border-[#1A52FF]/25 rounded inline-block mb-3">
              {f.cmd}
            </div>
            <h3 className="font-sans font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-[#7A8FAE] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
