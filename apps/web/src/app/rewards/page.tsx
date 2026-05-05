import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ROWS = [
  { label: "Show up daily", value: "+5 pts/day" },
  { label: "Win trivia", value: "+25 pts" },
  { label: "Refer a builder", value: "+50 pts" },
  { label: "Submit a project", value: "+20 pts" },
  { label: "Top 3 weekly", value: "+100 pts" },
  { label: "Claim value", value: "1 pt = 1,000 $BLUEAGENT" },
];

export default function RewardsPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="badge mb-5">Rewards</div>
        <h1 className="text-5xl font-black mb-4" style={{ color: "var(--text)" }}>
          Points, credits, and loyalty
        </h1>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Blue Agent rewards builders for showing up and shipping. Points can turn into $BLUEAGENT, and holders get discounts.
        </p>

        <div className="grid md:grid-cols-2 gap-5 mb-10">
          {ROWS.map((row) => (
            <div key={row.label} className="card p-6 flex items-center justify-between">
              <div style={{ color: "var(--text)" }}>{row.label}</div>
              <div className="font-semibold" style={{ color: "#4a90d9" }}>{row.value}</div>
            </div>
          ))}
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>How the loop works</h2>
          <ol className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>1. Builders show up and earn points.</li>
            <li>2. Points can be claimed into $BLUEAGENT.</li>
            <li>3. $BLUEAGENT can unlock discounts or future product access.</li>
            <li>4. More usage creates more value for the ecosystem.</li>
          </ol>
        </div>
      </main>
      <Footer />
    </>
  );
}
