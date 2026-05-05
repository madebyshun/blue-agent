import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const MODELS = [
  { name: "Fast", desc: "cheap + fast for simple tasks" },
  { name: "Pro", desc: "best default for product thinking" },
  { name: "Max", desc: "deep reasoning for hard work" },
];

export default function ChatPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Chat + Model Picker</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Pick a model, pay in credits or USDC
        </h1>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          This is the compute layer of Blue Agent. Users select a quality tier, see the cost, and run the task.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {MODELS.map((m) => (
            <div key={m.name} className="card p-6">
              <div className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>{m.name}</div>
              <p style={{ color: "var(--text-muted)" }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
