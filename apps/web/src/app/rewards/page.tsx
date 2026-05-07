import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ROWS = [
  { label: "Show up daily",     value: "+5 pts/day" },
  { label: "Win trivia",        value: "+25 pts" },
  { label: "Refer a builder",   value: "+50 pts" },
  { label: "Submit a project",  value: "+20 pts" },
  { label: "Top 3 weekly",      value: "+100 pts" },
  { label: "Claim value",       value: "1 pt = 1,000 $BLUEAGENT" },
];

const LOOP = [
  "Builders show up and earn points.",
  "Points can be claimed into $BLUEAGENT.",
  "$BLUEAGENT can unlock discounts or future product access.",
  "More usage creates more value for the ecosystem.",
];

export default function RewardsPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">REWARDS</span>
          </div>
          <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white mb-4">
            Points, credits,<br />
            <span className="text-gradient-blue">and loyalty</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Blue Agent rewards builders for showing up and shipping. Points can turn into $BLUEAGENT, and holders get discounts.
          </p>
        </div>

        {/* Earn rows */}
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {ROWS.map((row) => (
            <div key={row.label} className="card-surface rounded-2xl p-5 flex items-center justify-between">
              <div className="font-mono text-sm text-white">{row.label}</div>
              <div className="font-mono text-sm font-bold text-[#4FC3F7]">{row.value}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="card-surface rounded-2xl p-8">
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3 py-1 mb-4">
            <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">HOW THE LOOP WORKS</span>
          </div>
          <h2 className="font-mono font-bold text-xl text-white mb-5">Earn → Claim → Grow</h2>
          <ol className="space-y-3">
            {LOOP.map((step, i) => (
              <li key={i} className="flex gap-4 items-start">
                <div className="w-7 h-7 rounded-lg bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center font-mono text-xs text-[#4FC3F7] flex-shrink-0">
                  {i + 1}
                </div>
                <span className="text-sm text-slate-400 leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </main>
      <Footer />
    </>
  );
}
