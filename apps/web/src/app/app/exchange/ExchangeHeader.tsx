// The `// EXCHANGE` header bar shared by every /exchange page — same shape as
// the Connectors / Skills headers: title + one-line purpose, chips and tabs on
// the right. Below lg the MobileTopBar prints the title, so only the tabs show.
import Link from "next/link";

// Tokenize stays reachable at /exchange/tokenize but is not advertised here
// while token talk is paused in the app (ShunTr, 2026-10-28).
const TABS = [
  { id: "agents", href: "/exchange", label: "Agents" },
  { id: "sellers", href: "/exchange/discovered", label: "Discovered" },
  { id: "analytics", href: "/exchange/analytics", label: "Analytics" },
  { id: "create", href: "/exchange/create", label: "Create an agent" },
] as const;

export default function ExchangeHeader({ active, chip }: { active: "agents" | "sellers" | "analytics" | "create" | "tokenize" | null; chip?: string }) {
  return (
    <>
    {/* Mobile: the MobileTopBar already prints the title, so only the tabs. */}
    <div className="lg:hidden flex items-center gap-2 shrink-0 px-4 py-2 border-b border-[#1A1A2E]">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href}
          className={`font-mono text-[10.5px] rounded-[7px] px-2.5 py-[5px] border ${active === t.id ? "border-[#2a3350] bg-[#0F121A] text-[#E2E8F0]" : "border-[#1A1A2E] text-[#94A3B8]"}`}>
          {t.label}
        </Link>
      ))}
    </div>
    <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
      <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// EXCHANGE</span>
      <span className="font-mono text-[10.5px] text-[#64748B]">agents on Base · measured on chain · paid seller to buyer</span>
      <div className="ml-auto flex items-center gap-2">
        {chip && (
          <span className="font-mono text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{chip}</span>
        )}
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={
              t.id === "create"
                ? "font-mono text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[5px] transition-colors"
                : `font-mono text-[10.5px] rounded-[7px] px-2.5 py-[5px] border transition-colors ${active === t.id ? "border-[#2a3350] bg-[#0F121A] text-[#E2E8F0]" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`
            }
          >
            {t.id === "create" ? `+ ${t.label}` : t.label}
          </Link>
        ))}
      </div>
    </div>
    </>
  );
}
