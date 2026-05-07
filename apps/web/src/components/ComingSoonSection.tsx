type Product = { title: string; desc: string; price: string; href: string; live?: boolean };

const PRODUCTS: Product[] = [
  {
    title:  "Model Picker Chat",
    desc:   "Choose a Bankr model, pay with credits or USDC, and get the right quality level for the task.",
    price:  "Pay per call",
    href:   "/chat",
    live:   true,
  },
  {
    title: "Launch Wizard",
    desc:  "Turn an agent idea into a public launch with persona, pricing, tools, and publishing config.",
    price: "Launch fee",
    href:  "/launch",
  },
  {
    title: "Marketplace",
    desc:  "Browse agents, prompts, and skills. Discover what works, then monetize the best workflows.",
    price: "Take rate",
    href:  "/market",
  },
];

export default function ComingSoonSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 border border-[#33C3FF]/25 bg-[#33C3FF]/6 rounded-full px-4 py-1.5 mb-6">
          <span className="font-mono text-xs text-[#33C3FF] tracking-widest">NEXT LAYERS</span>
        </div>
        <h2 className="font-sans font-bold text-3xl sm:text-4xl text-white mb-3">
          What ships after the wedge
        </h2>
        <p className="text-[#B8CBE8] max-w-xl mx-auto">
          Start with the founder console. Then add chat, launch, and marketplace once the workflow is proven.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PRODUCTS.map(({ title, desc, price, href, live }) => (
          <div key={title} className="card-surface card-hover rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className={`font-mono text-[10px] tracking-widest px-2 py-1 rounded-sm border ${
                live
                  ? "text-emerald-400 bg-emerald-400/5 border-emerald-400/20"
                  : "text-[#33C3FF] bg-[#33C3FF]/8 border-[#33C3FF]/20"
              }`}>
                {live ? "LIVE" : "SOON"}
              </div>
              {live && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            </div>

            <div className="font-sans font-bold text-white">{title}</div>
            <div className="text-sm text-[#7A8FAE] leading-relaxed flex-1">{desc}</div>

            <div className="flex items-center justify-between pt-2 border-t border-white/8">
              <span className="font-mono text-xs text-[#33C3FF]">{price}</span>
              <a href={href}
                className="text-xs text-[#7A8FAE] hover:text-[#4A7AFF] border border-white/15 hover:border-[#1A52FF]/35 px-3 py-1.5 rounded-lg transition-all">
                {live ? "Open →" : "Preview →"}
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
