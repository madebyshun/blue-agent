export default function FooterCTA() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-20">
      <div className="glow" style={{ background: "var(--surface)", border: "1.5px solid rgba(74,144,217,0.25)", borderRadius: 20, padding: "64px 48px", textAlign: "center" }}>
        <h2 className="text-4xl font-black mb-4" style={{ color: "var(--text)" }}>
          Build the Base-native founder console
        </h2>
        <p className="mb-3 text-lg" style={{ color: "var(--text-muted)" }}>
          Start with ideas, build plans, audits, and launch workflows.
        </p>
        <p className="text-sm mb-10" style={{ color: "var(--text-muted)" }}>
          Then expand into chat, agent launch, marketplace, and rewards.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <a href="/code" className="btn-blue" style={{ fontSize: 16, padding: "16px 36px" }}>
            Open Founder Console
          </a>
          <a href="/rewards" className="btn-ghost" style={{ fontSize: 16, padding: "16px 36px" }}>
            View Rewards
          </a>
        </div>
      </div>
    </section>
  );
}
