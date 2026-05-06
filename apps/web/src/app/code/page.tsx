import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const CORE_COMMANDS = [
  { name: "blue idea", price: "$0.05", desc: "Generate a fundable concept, why now, GTM, risks, and 24h plan." },
  { name: "blue build", price: "$0.50", desc: "Generate architecture, stack, folder plan, and first implementation steps." },
  { name: "blue audit", price: "$1.00", desc: "Review the plan for risks, blockers, and missing assumptions." },
  { name: "blue ship", price: "$0.10", desc: "Prepare deployment, verification, release notes, and launch checklist." },
  { name: "blue raise", price: "$0.20", desc: "Turn the product into a pitch narrative for partners or investors." },
];

const UTILITY_COMMANDS = [
  { name: "blue new", desc: "Run the full workflow end-to-end: idea → build → audit → ship in one command." },
  { name: "blue launch", desc: "Deploy a fair-launch token on Base via Bankr + Clanker, or publish an agent to the marketplace." },
  { name: "blue hackathon", desc: "Scope and optimize your project for a Base hackathon — pitch, demo, and submission checklist." },
  { name: "blue grant", desc: "Find matching grants and generate a scored application draft for Base ecosystem funding." },
  { name: "blue debug", desc: "Debug a failed tx, contract revert, or agent execution error with root cause and fix." },
];

export default function CodePage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Founder Console</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Build on Base with Bankr
        </h1>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Blue Agent turns ideas into shippable products. Every command produces a usable artifact — no filler.
        </p>

        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
          Core Workflow
        </h2>
        <div className="grid md:grid-cols-2 gap-5 mb-10">
          {CORE_COMMANDS.map((cmd) => (
            <div key={cmd.name} className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="text-xs font-mono px-2 py-1.5 rounded-lg inline-flex"
                  style={{ background: "rgba(74,144,217,0.07)", border: "1px solid rgba(74,144,217,0.2)", color: "#4a90d9" }}
                >
                  {cmd.name}
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: "rgba(74,144,217,0.06)", color: "var(--text-muted)" }}
                >
                  {cmd.price}
                </span>
              </div>
              <p style={{ color: "var(--text-muted)" }}>{cmd.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
          Utility Commands
        </h2>
        <div className="grid md:grid-cols-2 gap-5 mb-12">
          {UTILITY_COMMANDS.map((cmd) => (
            <div key={cmd.name} className="card p-6">
              <div
                className="text-xs font-mono px-2 py-1.5 rounded-lg inline-flex mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                {cmd.name}
              </div>
              <p style={{ color: "var(--text-muted)" }}>{cmd.desc}</p>
            </div>
          ))}
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>
            Coming next
          </h2>
          <ul className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>• Chat with Bankr model picker (Claude, GPT, Gemini)</li>
            <li>• x402 credits / USDC payment flow per command</li>
            <li>• Full agent launch wizard with Bankr marketplace publish</li>
            <li>• Skill browser and one-click install</li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
