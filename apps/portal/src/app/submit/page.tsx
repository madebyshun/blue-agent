import Link from "next/link";
import type { Metadata } from "next";
import SubmitForm from "./SubmitForm";

export const metadata: Metadata = {
  title: "Register your API · Blue Hub",
  description: "Register your API on Blue Hub MCP server. Get listed in the marketplace. Earn USDC on every call.",
};

export default function SubmitPage() {
  return (
    <div className="px-5 sm:px-8 py-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-xl sm:text-2xl font-bold tracking-tight mb-1">Register your API</h1>
        <p className="font-mono text-[12px] text-slate-500 leading-relaxed">
          Get listed on the Blue Agent MCP server. Any AI agent connected to{" "}
          <code className="text-slate-400 text-[11px]">blueagent.dev/api/mcp</code>{" "}
          will discover and be able to call your API.
        </p>
      </div>

      {/* Form */}
      <SubmitForm />

      {/* What happens next */}
      <div className="mt-8 rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">WHAT HAPPENS NEXT</p>
        <ol className="space-y-3">
          {[
            { n: "1", title: "Endpoint probe",       desc: "We POST an empty payload to your URL. Must return 2xx or 402 Payment Required within 8s." },
            { n: "2", title: "Manifest signed",      desc: "You sign a one-line message proving wallet ownership. No transaction, no gas." },
            { n: "3", title: "Listed in MCP",        desc: "Within minutes, tools/list on Blue Hub's MCP endpoint includes your API." },
            { n: "4", title: "Calls flow + you earn", desc: "AI agents call your endpoint. You keep 80% of every USDC payment, settled on Base." },
          ].map(s => (
            <li key={s.n} className="flex gap-3 items-start">
              <span className="font-mono text-xs font-bold w-7 shrink-0 text-[#4FC3F7]">{s.n}.</span>
              <div>
                <p className="font-mono text-sm font-semibold text-white">{s.title}</p>
                <p className="font-mono text-[11px] text-slate-500 leading-relaxed mt-0.5">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Help */}
      <p className="font-mono text-[10px] text-slate-700 text-center mt-6">
        Questions? <Link href="/docs" className="text-[#4FC3F7] hover:underline">Read the docs</Link>{" "}
        or ping us on <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">X</a>.
      </p>
    </div>
  );
}
