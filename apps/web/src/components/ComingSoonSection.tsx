type Product = {
  icon: string
  title: string
  desc: string
  price: string
  href: string
  live?: boolean
}

const PRODUCTS: Product[] = [
  {
    icon: "💬",
    title: "Model Picker Chat",
    desc: "Choose a Bankr model, pay with credits or USDC, and get the right quality level for the task.",
    price: "Pay per call",
    href: "/chat",
    live: true,
  },
  {
    icon: "🚀",
    title: "Launch Wizard",
    desc: "Turn an agent idea into a public launch with persona, pricing, tools, and publishing config.",
    price: "Launch fee",
    href: "/launch",
  },
  {
    icon: "🧩",
    title: "Marketplace",
    desc: "Browse agents, prompts, and skills. Discover what works, then monetize the best workflows.",
    price: "Take rate",
    href: "/market",
  },
]

export default function ComingSoonSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <div className="text-center mb-12">
        <div className="badge mb-4">Next layers</div>
        <h2 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          What ships after the wedge
        </h2>
        <p className="mt-3 text-base" style={{ color: "var(--text-muted)" }}>
          Start with the founder console. Then add chat, launch, and marketplace once the workflow is proven.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PRODUCTS.map(({ icon, title, desc, price, href, live }) => (
          <div key={title} className="card p-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 32 }}>{icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: live ? "#22c55e" : "#4a90d9", background: live ? "rgba(34,197,94,0.08)" : "rgba(74,144,217,0.08)", border: `1px solid ${live ? "rgba(34,197,94,0.2)" : "rgba(74,144,217,0.2)"}`, borderRadius: 999, padding: "3px 10px" }}>
                {live ? "Live 🟢" : "Soon"}
              </span>
            </div>

            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{title}</div>
            <div style={{ fontSize: 15, color: "var(--text-muted)", lineHeight: 1.6, flex: 1 }}>{desc}</div>

            <div className="flex items-center justify-between mt-2">
              <span style={{ fontSize: 14, fontWeight: 600, color: "#4a90d9" }}>{price}</span>
              <a href={href} className="text-sm font-semibold" style={{ color: "#4a90d9", textDecoration: "none", border: "1px solid rgba(74,144,217,0.3)", borderRadius: 8, padding: "10px 16px", minHeight: 40, display: "inline-flex", alignItems: "center" }}>
                {live ? "Open →" : "Preview →"}
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
