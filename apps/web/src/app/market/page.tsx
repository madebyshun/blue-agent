import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ASSETS = [
  { type: "Agent", name: "Builder Coach", price: "$0.10 / msg" },
  { type: "Skill", name: "Token Audit", price: "$0.05 / call" },
  { type: "Prompt", name: "Launch Playbook", price: "$0.02 / use" },
];

export default function MarketPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Marketplace</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Discover and monetize workflows
        </h1>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Agents, prompts, and skills live here. Later this becomes the creator economy layer.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {ASSETS.map((a) => (
            <div key={a.name} className="card p-6">
              <div className="text-xs font-mono px-2 py-1.5 rounded-lg inline-flex mb-4" style={{ background: "rgba(74,144,217,0.07)", border: "1px solid rgba(74,144,217,0.2)", color: "#4a90d9" }}>
                {a.type}
              </div>
              <div className="font-semibold mb-2" style={{ color: "var(--text)" }}>{a.name}</div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>{a.price}</div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
