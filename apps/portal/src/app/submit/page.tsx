import Link from "next/link";
import type { Metadata } from "next";
import SubmitForm from "./SubmitForm";

export const metadata: Metadata = {
  title: "Register your API · Blue Hub",
  description: "Register your API on Blue Hub MCP server. Get listed in the marketplace. Earn USDC on every call.",
};

export default function SubmitPage() {
  return (
    <div className="px-5 sm:px-8 py-6">

      {/* Header — matches marketplace pattern */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl font-bold tracking-tight">Register your API</h1>
          <p className="font-mono text-[11px] text-slate-600 mt-1">
            Get listed on Blue Hub MCP · earn 80% USDC per call · 5 min setup
          </p>
        </div>

        {/* Quick stats row */}
        <div className="flex items-center gap-3">
          {[
            { label: "Builder share",  value: "80%",   color: "#34D399" },
            { label: "Setup time",     value: "5min",  color: "#4FC3F7" },
            { label: "Payout min",     value: "$0",    color: "#A78BFA" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="font-mono text-base font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="font-mono text-[9px] text-slate-700 tracking-widest mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2-column body — form left, info right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

        {/* Form */}
        <div>
          <SubmitForm />
        </div>

        {/* Side info panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">WHAT HAPPENS NEXT</p>
            <ol className="space-y-3">
              {[
                { n: "1", title: "Endpoint probe",       desc: "We POST empty body to your URL. Must return 2xx or 402 within 8s." },
                { n: "2", title: "Manifest signed",      desc: "Sign one message proving wallet ownership. No transaction." },
                { n: "3", title: "Listed in MCP",        desc: "Within minutes, tools/list on blueagent.dev/api/mcp includes your API." },
                { n: "4", title: "Calls + earn",         desc: "AI agents call your endpoint. You keep 80% USDC, settled on Base." },
              ].map(s => (
                <li key={s.n} className="flex gap-2.5 items-start">
                  <span className="font-mono text-[11px] font-bold w-5 shrink-0 text-[#4FC3F7]">{s.n}.</span>
                  <div>
                    <p className="font-mono text-[11px] font-semibold text-white">{s.title}</p>
                    <p className="font-mono text-[10px] text-slate-500 leading-relaxed mt-0.5">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-[#A78BFA]/20 bg-gradient-to-br from-[#A78BFA]/[0.06] to-transparent p-5">
            <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-2">PRICING TIP</p>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed mb-3">
              Start low to drive adoption. Reference points across the catalog:
            </p>
            <ul className="font-mono text-[10px] text-slate-500 leading-relaxed space-y-1">
              <li>· Light (~1s compute): <span className="text-white">$0.05</span></li>
              <li>· Medium (LLM call): <span className="text-white">$0.10-$0.20</span></li>
              <li>· Heavy (multi-agent): <span className="text-white">$0.30-$0.50</span></li>
              <li>· Premium (full audit): <span className="text-white">$1.00+</span></li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">QUESTIONS?</p>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
              <Link href="/docs/builders/submit" className="text-[#4FC3F7] hover:underline">Read the submit guide</Link>
              {" "}or ping{" "}
              <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@blueagent_</a>
              {" "}on X.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
