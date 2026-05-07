import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ASSETS = [
  { type: "Agent",  name: "Builder Coach",    price: "$0.10 / msg",  status: "live" },
  { type: "Skill",  name: "Token Audit",       price: "$0.05 / call", status: "soon" },
  { type: "Prompt", name: "Launch Playbook",   price: "$0.02 / use",  status: "soon" },
];

export default function MarketPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">MARKETPLACE</span>
          </div>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white mb-4">
            Discover and<br />
            <span className="text-gradient-blue">monetize workflows</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Agents, prompts, and skills live here. Later this becomes the creator economy layer.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 mb-12">
          {ASSETS.map((a) => (
            <div key={a.name} className="card-surface card-hover rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[10px] tracking-widest px-2 py-1 rounded bg-[#4FC3F7]/5 border border-[#4FC3F7]/20 text-[#4FC3F7]">
                  {a.type.toUpperCase()}
                </div>
                <div className={`font-mono text-[10px] tracking-widest px-2 py-1 rounded border ${
                  a.status === "live"
                    ? "text-emerald-400 bg-emerald-400/5 border-emerald-400/20"
                    : "text-slate-500 bg-[#1A1A2E] border-[#1A1A2E]"
                }`}>
                  {a.status === "live" ? "LIVE" : "SOON"}
                </div>
              </div>
              <div className="font-mono font-semibold text-white mb-2">{a.name}</div>
              <div className="font-mono text-sm text-[#4FC3F7]">{a.price}</div>
            </div>
          ))}
        </div>

        {/* Coming soon notice */}
        <div className="card-surface rounded-2xl p-8 border border-[#A78BFA]/20 text-center">
          <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-3 py-1 mb-4">
            <span className="font-mono text-xs text-[#A78BFA] tracking-widest">IN DEVELOPMENT</span>
          </div>
          <h2 className="font-mono font-bold text-xl text-white mb-3">Full marketplace coming soon</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            Browse, install, and monetize agents, prompts, and skills. Use the console to build and publish your first workflow today.
          </p>
          <a href="/code"
            className="inline-block font-mono text-sm font-semibold bg-[#4FC3F7] hover:bg-[#29ABE2] text-[#050508] px-6 py-2.5 rounded-lg transition-all">
            Open Console →
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
