import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const CORE_COMMANDS = [
  { name: "blue idea",  price: "$0.05", desc: "Generate a fundable concept, why now, GTM, risks, and 24h plan." },
  { name: "blue build", price: "$0.50", desc: "Generate architecture, stack, folder plan, and first implementation steps." },
  { name: "blue audit", price: "$1.00", desc: "Review the plan for risks, blockers, and missing assumptions." },
  { name: "blue ship",  price: "$0.10", desc: "Prepare deployment, verification, release notes, and launch checklist." },
  { name: "blue raise", price: "$0.20", desc: "Turn the product into a pitch narrative for partners or investors." },
];

const UTILITY_COMMANDS = [
  { name: "blue new",       desc: "Run the full workflow end-to-end: idea → build → audit → ship in one command." },
  { name: "blue launch",    desc: "Deploy a fair-launch token on Base via Bankr + Clanker, or publish an agent to the marketplace." },
  { name: "blue hackathon", desc: "Scope and optimize your project for a Base hackathon — pitch, demo, and submission checklist." },
  { name: "blue grant",     desc: "Find matching grants and generate a scored application draft for Base ecosystem funding." },
  { name: "blue debug",     desc: "Debug a failed tx, contract revert, or agent execution error with root cause and fix." },
];

export default function CodePage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">FOUNDER CONSOLE</span>
          </div>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white mb-4">
            Build on Base<br />
            <span className="text-gradient-blue">with Bankr</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Blue Agent turns ideas into shippable products. Every command produces a usable artifact — no filler.
          </p>
        </div>

        {/* Core Workflow */}
        <div className="mb-3">
          <span className="font-mono text-xs text-slate-500 tracking-widest uppercase">Core Workflow</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {CORE_COMMANDS.map((cmd) => (
            <div key={cmd.name} className="card-surface rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="font-mono text-xs px-2 py-1.5 rounded-lg bg-[#4FC3F7]/5 border border-[#4FC3F7]/20 text-[#4FC3F7]">
                  {cmd.name}
                </div>
                <span className="font-mono text-xs px-2 py-1 rounded-full bg-[#4FC3F7]/5 text-slate-400 border border-[#1A1A2E]">
                  {cmd.price}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{cmd.desc}</p>
            </div>
          ))}
        </div>

        {/* Utility Commands */}
        <div className="mb-3">
          <span className="font-mono text-xs text-slate-500 tracking-widest uppercase">Utility Commands</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {UTILITY_COMMANDS.map((cmd) => (
            <div key={cmd.name} className="card-surface rounded-2xl p-6">
              <div className="font-mono text-xs px-2 py-1.5 rounded-lg inline-flex mb-3 bg-[#1A1A2E] border border-[#1A1A2E] text-slate-400">
                {cmd.name}
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{cmd.desc}</p>
            </div>
          ))}
        </div>

        {/* Coming next */}
        <div className="card-surface rounded-2xl p-8 border border-[#A78BFA]/20">
          <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-3 py-1 mb-4">
            <span className="font-mono text-xs text-[#A78BFA] tracking-widest">COMING NEXT</span>
          </div>
          <h2 className="font-mono font-bold text-xl text-white mb-4">Roadmap</h2>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex gap-2"><span className="text-[#4FC3F7]">·</span> Chat with Bankr model picker (Claude, GPT, Gemini)</li>
            <li className="flex gap-2"><span className="text-[#4FC3F7]">·</span> x402 credits / USDC payment flow per command</li>
            <li className="flex gap-2"><span className="text-[#4FC3F7]">·</span> Full agent launch wizard with Bankr marketplace publish</li>
            <li className="flex gap-2"><span className="text-[#4FC3F7]">·</span> Skill browser and one-click install</li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
