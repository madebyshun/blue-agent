export default function BuilderCTA() {
  return (
    <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-20">
      <div className="rounded-3xl border border-[#A78BFA]/25 bg-gradient-to-br from-[#A78BFA]/[0.08] via-transparent to-[#4FC3F7]/[0.06] p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#A78BFA]/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[#4FC3F7]/10 blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div>
            <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-3">💰 FOR BUILDERS</p>
            <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Earn USDC on every call —<br />
              <span className="text-[#A78BFA]">80% builder share</span>
            </h2>
            <p className="font-mono text-sm text-slate-400 leading-relaxed mb-6 max-w-xl">
              Have an API on Base? List it on Blue Hub in 5 minutes.
              Set your price, sign one message, your tool is live —
              callable from Claude Desktop, Cursor, every MCP client, plus our marketplace UI.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://blueagent.dev/hub/submit" target="_blank" rel="noopener noreferrer"
                 className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-[#A78BFA] text-[#050508] hover:bg-[#9d7ef0] transition-colors">
                Submit your tool →
              </a>
              <a href="https://blueagent.dev/hub/dashboard" target="_blank" rel="noopener noreferrer"
                 className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-[#A78BFA]/40 text-[#A78BFA] hover:bg-[#A78BFA]/5 transition-colors">
                Builder dashboard
              </a>
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-4">
              SIWE auth · no signup · USDC paid to your wallet on Base
            </p>
          </div>

          {/* Revenue projection mini-calculator */}
          <div className="rounded-2xl border border-[#A78BFA]/20 bg-[#0a0a0f] p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">REVENUE PROJECTION</p>
            <Projection price="$0.20" calls={100}   />
            <Projection price="$0.20" calls={1000}  highlight />
            <Projection price="$0.20" calls={10000} />
            <p className="font-mono text-[9px] text-slate-700 mt-4 leading-relaxed">
              You receive 80% of every call · settled in USDC on Base · no minimum payout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Projection({ price, calls, highlight }: { price: string; calls: number; highlight?: boolean }) {
  const priceN  = parseFloat(price.replace("$", ""));
  const gross   = priceN * calls;
  const builder = gross * 0.8;
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2.5 border-b border-[#1A1A2E] last:border-0 ${highlight ? "" : ""}`}>
      <div>
        <p className="font-mono text-xs text-slate-300">{calls.toLocaleString()} calls / month</p>
        <p className="font-mono text-[9px] text-slate-700">at {price} per call</p>
      </div>
      <p className={`font-mono text-sm font-bold tabular-nums ${highlight ? "text-[#A78BFA]" : "text-white"}`}>
        ${builder.toFixed(2)}
      </p>
    </div>
  );
}
