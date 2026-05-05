import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const STEPS = ["Name the agent", "Choose persona + model", "Set tools + price", "Publish to marketplace"];

export default function LaunchPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Launch Wizard</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Launch an agent on Base
        </h1>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Turn an idea into a sellable agent with a simple guided flow.
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {STEPS.map((step, i) => (
            <div key={step} className="card p-6 flex gap-4 items-start">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(74,144,217,0.1)", color: "#4a90d9", border: "1px solid rgba(74,144,217,0.3)" }}>{i + 1}</div>
              <div>
                <div className="font-semibold" style={{ color: "var(--text)" }}>{step}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>Wizard step {i + 1}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
