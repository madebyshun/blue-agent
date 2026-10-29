// A two-or-three-way switch at the top of a page, for views that are one nav
// entry (Agents: listed / all sellers; Create: agent / sell; My account: usage /
// following). Each side is a real URL, so links and the back button keep working.
import Link from "next/link";

export default function SubTabs({ tabs, active }: { tabs: { href: string; label: string }[]; active: string }) {
  return (
    <div className="mb-5 inline-flex rounded-[10px] border border-[#1A1A2E] bg-[#0D0D14] p-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href}
          className={`rounded-[8px] px-4 py-2 text-[14px] transition-colors ${t.href === active ? "bg-[#4FC3F7] font-semibold text-[#050508]" : "text-[#94A3B8] hover:text-[#E2E8F0]"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export const AGENTS_TABS = [{ href: "/exchange", label: "Listed agents" }, { href: "/exchange/discovered", label: "All sellers" }];
export const CREATE_TABS = [{ href: "/exchange/create", label: "Create an agent" }, { href: "/exchange/sell", label: "Sell your service" }];
export const ACCOUNT_TABS = [{ href: "/exchange/usage", label: "My usage" }, { href: "/exchange/following", label: "Following" }];
