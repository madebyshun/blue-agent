"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MOBILE_NAV = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/agents",      label: "For AI Agents" },
  { href: "/x402",        label: "x402 Protocol" },
  { href: "/submit",      label: "Register API" },
  { href: "/dashboard",   label: "Dashboard" },
  { href: "/staking",     label: "$BLUEAGENT Staking" },
  { href: "/docs",        label: "Docs" },
  { href: "/blog",        label: "Blog" },
  { href: "/signin",      label: "Sign In" },
  { href: "/signup",      label: "Sign Up" },
];

export default function TopBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => path === href || (href !== "/" && path.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-[#1A1A2E] bg-[#050508]/85 backdrop-blur-xl h-14 flex items-center px-5">

      {/* Mobile: brand + hamburger */}
      <Link href="/" className="lg:hidden flex items-center gap-2 mr-auto">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
        <span className="font-mono text-sm font-bold tracking-tight">
          BLUE<span className="text-[#4FC3F7]">HUB</span>
        </span>
        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] tracking-widest">DEV</span>
      </Link>

      <button onClick={() => setOpen(v => !v)}
        className="lg:hidden text-slate-400 hover:text-white mr-3" aria-label="Menu">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Search trigger (desktop) */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="hidden lg:flex items-center gap-3 ml-6 mr-auto px-3 py-1.5 rounded-lg border border-[#1A1A2E] hover:border-slate-700 transition-colors text-slate-500 hover:text-slate-300 w-72 group"
        aria-label="Open search">
        <span className="font-mono text-[11px]">🔍</span>
        <span className="font-mono text-[11px] flex-1 text-left">Search APIs, providers, docs…</span>
        <kbd className="font-mono text-[9px] text-slate-700 border border-[#1A1A2E] rounded px-1.5 py-0.5 group-hover:border-slate-700">⌘ K</kbd>
      </button>

      {/* Right CTAs */}
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/signin"
          className="font-mono text-[11px] text-slate-400 hover:text-white px-3 py-1.5 transition-colors">
          Sign In
        </Link>
        <Link href="/signup"
          className="font-mono text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
          Sign Up
        </Link>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden absolute top-14 inset-x-0 border-b border-[#1A1A2E] bg-[#050508] px-5 py-3 space-y-1">
          {MOBILE_NAV.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`block py-2 font-mono text-sm transition-colors ${
                isActive(item.href) ? "text-white font-semibold" : "text-slate-400"
              }`}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
