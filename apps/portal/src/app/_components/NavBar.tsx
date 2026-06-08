"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/agents",      label: "For AI Agents" },
  { href: "/x402",        label: "x402 Ecosystem" },
  { href: "/staking",     label: "$BLUEAGENT" },
  { href: "/docs",        label: "Docs" },
  { href: "/blog",        label: "Blog" },
];

export default function NavBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => path === href || (href !== "/" && path.startsWith(href));

  return (
    <nav className="sticky top-0 z-50 border-b border-[#1A1A2E] bg-[#050508]/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-sm font-bold tracking-tight">
            BLUE<span className="text-[#4FC3F7]">AGENT</span>
          </span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] tracking-widest">API</span>
        </Link>

        {/* Nav (desktop) */}
        <div className="hidden md:flex items-center gap-6 text-[12px] flex-1">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={`transition-colors ${
                isActive(item.href) ? "text-white font-semibold" : "text-slate-400 hover:text-white"
              }`}>
              {item.label}
            </Link>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link href="/signin"
            className="font-mono text-[11px] text-slate-400 hover:text-white px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <a href="https://blueagent.dev/hub/submit" target="_blank" rel="noopener noreferrer"
            className="font-mono text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA] text-[#A78BFA] bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 transition-all">
            + List a tool
          </a>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(v => !v)}
          className="md:hidden ml-auto text-slate-400 hover:text-white"
          aria-label="Menu">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508] px-6 py-4 space-y-3">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`block text-sm transition-colors ${
                isActive(item.href) ? "text-white font-semibold" : "text-slate-400"
              }`}>
              {item.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-[#1A1A2E] flex items-center gap-2">
            <Link href="/signin" onClick={() => setOpen(false)}
              className="font-mono text-xs text-slate-400 px-3 py-1.5">
              Sign in
            </Link>
            <a href="https://blueagent.dev/hub/submit" target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA] text-[#A78BFA] bg-[#A78BFA]/10">
              + List a tool
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
