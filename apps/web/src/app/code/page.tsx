import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const COMMANDS = [
  { name: "blue idea", desc: "Generate a fundable concept, why now, GTM, risks, and 24h plan." },
  { name: "blue build", desc: "Generate architecture, stack, folder plan, and first implementation steps." },
  { name: "blue audit", desc: "Review the plan for risks, blockers, and missing assumptions." },
  { name: "blue ship", desc: "Prepare deployment, verification, release notes, and launch checklist." },
  { name: "blue raise", desc: "Turn the product into a pitch narrative for partners or investors." },
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
          Blue Agent turns ideas into a structured workflow: think, build, audit, ship, and raise.
        </p>

        <div className="grid md:grid-cols-2 gap-5 mb-12">
          {COMMANDS.map((cmd) => (
            <div key={cmd.name} className="card p-6">
              <div className="text-xs font-mono px-2 py-1.5 rounded-lg inline-flex mb-4" style={{ background: "rgba(74,144,217,0.07)", border: "1px solid rgba(74,144,217,0.2)", color: "#4a90d9" }}>
                {cmd.name}
              </div>
              <p style={{ color: "var(--text-muted)" }}>{cmd.desc}</p>
            </div>
          ))}
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>
            What comes next
          </h2>
          <ul className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>• Add chat with Bankr model picker</li>
            <li>• Add x402 credits / USDC payment flow</li>
            <li>• Add agent launch wizard</li>
            <li>• Add marketplace for agents, prompts, and skills</li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
