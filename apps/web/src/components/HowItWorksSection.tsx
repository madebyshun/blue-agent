const STEPS = [
  { num: "01", icon: "💡", cmd: "blue idea", title: "Turn intent into a brief", desc: "Take a rough concept and produce a structured idea brief with why now, GTM, and first risks." },
  { num: "02", icon: "🛠️", cmd: "blue build", title: "Scaffold the system", desc: "Generate architecture, stack direction, and the first set of build tasks for the repo." },
  { num: "03", icon: "🚢", cmd: "blue ship", title: "Launch with confidence", desc: "Run audit checks, prep deployment, and ship a clear checklist for the launch moment." },
];

const EARN_ROWS = [
  { action: "Idea brief", pts: "1 artifact", note: "Fundable concept + plan" },
  { action: "Build plan", pts: "1 artifact", note: "Stack + files + steps" },
  { action: "Audit report", pts: "1 artifact", note: "Risks + fixes + go/no-go" },
  { action: "Ship checklist", pts: "1 artifact", note: "Deploy + verify + launch" },
  { action: "Model usage", pts: "Credits", note: "Pay per call or USDC" },
  { action: "Agent launch", pts: "Marketplace", note: "Publish and monetize" },
];

export default function HowItWorksSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <div className="text-center mb-14">
        <div className="badge mb-5">Founder workflow</div>
        <h2 className="text-4xl font-black mb-4 leading-snug" style={{ color: "var(--text)" }}>Idea → Build → Ship</h2>
        <p className="max-w-xl mx-auto" style={{ color: "var(--text-muted)" }}>
          Blue Agent turns scattered founder work into a clean command flow. Every step produces an artifact you can use immediately.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {STEPS.map((step) => (
          <div key={step.num} className="card p-7 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: "rgba(74,144,217,0.1)", border: "1px solid rgba(74,144,217,0.3)", color: "#4a90d9" }}>{step.num}</div>
              <div className="text-2xl">{step.icon}</div>
            </div>
            <div className="text-xs font-mono px-2 py-1.5 rounded-lg self-start" style={{ background: "rgba(74,144,217,0.07)", border: "1px solid rgba(74,144,217,0.2)", color: "#4a90d9" }}>{step.cmd}</div>
            <h3 className="font-bold text-base" style={{ color: "var(--text)" }}>{step.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.desc}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)", background: "rgba(74,144,217,0.04)" }}>
          <div className="font-bold text-base" style={{ color: "var(--text)" }}>What the console produces</div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Artifacts first. UI second. Hype last.</div>
        </div>
        {EARN_ROWS.map(({ action, pts, note }, i) => (
          <div key={action} className="flex items-center justify-between px-6 py-4" style={{ borderBottom: i < EARN_ROWS.length - 1 ? "1px solid #e2e8f0" : "none" }}>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{action}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{note}</div>
            </div>
            <div className="text-sm font-bold" style={{ color: "#4a90d9" }}>{pts}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
