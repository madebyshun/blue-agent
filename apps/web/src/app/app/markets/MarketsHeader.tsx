// The `// MARKETS` header bar shared by /markets, a token page and /portfolio —
// same shape as the Exchange header. Below lg only the tabs show.
import Link from "next/link";

const TABS = [
  { id: "markets", href: "/markets", label: "Markets" },
  { id: "portfolio", href: "/portfolio", label: "Portfolio" },
  { id: "hood", href: "/hood", label: "Stock signals" },
  { id: "wallet", href: "/wallet", label: "Wallet" },
] as const;

export default function MarketsHeader({ active, chip }: { active: "markets" | "portfolio" | null; chip?: string }) {
  const tab = (t: (typeof TABS)[number]) => (
    <Link key={t.id} href={t.href}
      className={`font-mono text-[10.5px] rounded-[7px] px-2.5 py-[5px] border transition-colors ${active === t.id ? "border-[#2a3350] bg-[#0F121A] text-[#E2E8F0]" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`}>
      {t.label}
    </Link>
  );
  return (
    <>
      <div className="lg:hidden flex items-center gap-2 shrink-0 px-4 py-2 border-b border-[#1A1A2E] overflow-x-auto">{TABS.map(tab)}</div>
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// MARKETS</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">Base 8453 + Robinhood Chain 4663 · you sign every trade</span>
        <div className="ml-auto flex items-center gap-2">
          {chip && <span className="font-mono text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{chip}</span>}
          {TABS.map(tab)}
        </div>
      </div>
    </>
  );
}
