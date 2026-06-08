"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem { href: string; label: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: "DISCOVER",
    items: [
      { href: "/marketplace", label: "Marketplace" },
      { href: "/agents",      label: "For AI Agents" },
      { href: "/x402",        label: "x402 Protocol" },
    ],
  },
  {
    label: "BUILD",
    items: [
      { href: "/submit",      label: "Register API" },
      { href: "/dashboard",   label: "Dashboard" },
      { href: "/docs",        label: "Docs" },
    ],
  },
  {
    label: "TOKEN",
    items: [
      { href: "/staking",     label: "$BLUEAGENT" },
    ],
  },
  {
    label: "RESOURCES",
    items: [
      { href: "/blog",        label: "Blog" },
    ],
  },
];

export default function LeftSidebar() {
  const path = usePathname();
  const isActive = (href: string) =>
    path === href || (href !== "/" && path.startsWith(href));

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-[#1A1A2E] bg-[#050508] h-screen sticky top-0">

      {/* Logo */}
      <div className="px-5 h-14 flex items-center border-b border-[#1A1A2E] shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-sm font-bold tracking-tight">
            BLUE<span className="text-[#4FC3F7]">HUB</span>
          </span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] tracking-widest">DEV</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map(group => (
          <div key={group.label} className="mb-6">
            <p className="px-5 mb-1.5 font-mono text-[10px] text-slate-700 tracking-widest">
              {group.label}
            </p>
            {group.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center px-5 py-2 font-mono text-[12px] transition-colors border-l-2 ${
                    active
                      ? "text-white bg-white/[0.04] border-[#4FC3F7] font-semibold"
                      : "text-slate-500 border-transparent hover:text-white hover:bg-white/[0.02]"
                  }`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#1A1A2E] shrink-0">
        <p className="font-mono text-[9px] text-slate-700 leading-relaxed">
          Blue Hub by Blue Agent
          <br />
          © 2026 ·{" "}
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="hover:text-slate-500">X</a>
          {" · "}
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-slate-500">GH</a>
          {" · "}
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-slate-500">TG</a>
        </p>
      </div>
    </aside>
  );
}
