const FEATURES = [
  { icon: "💡", title: "Idea", desc: "Turn a rough thought into a fundable brief with why now, why Base, risks, and a 24h plan." },
  { icon: "🛠️", title: "Build", desc: "Generate architecture, scaffold direction, stack choices, and the first implementation steps." },
  { icon: "🛡️", title: "Audit", desc: "Review the idea or build for risk, broken assumptions, unsafe patterns, and missing pieces." },
  { icon: "🚢", title: "Ship", desc: "Prepare deployment, verification, release notes, and launch checklist for Base." },
  { icon: "🤖", title: "Chat + Models", desc: "Pick a Bankr model, pay with credits or USDC, and run the right quality level for the task." },
  { icon: "🚀", title: "Launch + Market", desc: "Launch agents, publish skills, and monetize workflows through a creator marketplace." },
];

export default function FeaturesSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <h2 className="text-3xl font-bold text-center mb-3" style={{ color: "var(--text)" }}>One console, many workflows</h2>
      <p className="text-center mb-12" style={{ color: "var(--text-muted)" }}>
        Blue Agent is built around the founder loop: think, build, audit, ship, and monetize.
      </p>

      <div className="grid md:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-7">
            <div className="text-3xl mb-4">{f.icon}</div>
            <h3 className="font-semibold text-base mb-2" style={{ color: "var(--text)" }}>{f.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
