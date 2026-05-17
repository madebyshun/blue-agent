"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Working pages first, coming-soon last
const PAGE_LINKS: { label: string; href: string; soon?: boolean }[] = [
  { label: "Console", href: "/console" },
  { label: "Tools",   href: "/tools" },
  { label: "Docs",    href: "/docs" },
  { label: "Chat",    href: "/chat",   soon: true },
  { label: "Launch",  href: "/launch", soon: true },
];

// Homepage section anchors — no name collision with page links
const HOME_SECTIONS = [
  { label: "Commands",    id: "commands" },
  { label: "Skills",      id: "skills" },
  { label: "x402",        id: "tools" },
  { label: "Packages",    id: "ecosystem" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isActive = (href: string) => pathname.startsWith(href);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1A1A2E] bg-[#050508]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="glow-dot" />
            <span className="font-mono font-semibold text-white tracking-widest text-sm">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {/* Page links — always visible */}
            {PAGE_LINKS.map((item) =>
              item.soon ? (
                <span key={item.href} className="font-mono text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-700 cursor-default select-none">
                  {item.label}
                  <span className="font-mono text-[9px] text-slate-700 border border-slate-800 px-1 py-0.5 rounded">soon</span>
                </span>
              ) : (
                <Link key={item.href} href={item.href}
                  className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all ${
                    isActive(item.href) ? "text-[#4FC3F7] bg-[#4FC3F7]/10" : "text-slate-400 hover:text-white hover:bg-[#1A1A2E]/50"
                  }`}>
                  {item.label}
                </Link>
              )
            )}

            {/* Divider + section anchors — homepage only */}
            {isHome && (
              <>
                <span className="text-slate-800 mx-1">|</span>
                {HOME_SECTIONS.map((s) => (
                  <button key={s.id} onClick={() => scrollTo(s.id)}
                    className="font-mono text-xs px-3 py-1.5 rounded-lg transition-all text-slate-600 hover:text-white hover:bg-[#1A1A2E]/50">
                    {s.label}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3">
            <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer"
              className="text-slate-500 hover:text-white transition-colors" aria-label="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-slate-400 hover:text-white transition-colors border border-[#1A1A2E] hover:border-[#4FC3F7]/30 px-3 py-1.5 rounded">
              GitHub
            </a>
            <Link href="/console"
              className="font-mono text-xs font-semibold bg-[#4FC3F7] text-[#050508] px-3 py-1.5 rounded hover:bg-[#29ABE2] transition-colors">
              Open Console
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508]/95 px-4 py-4 flex flex-col gap-1">
          {/* Page links — always */}
          <p className="font-mono text-[10px] text-slate-700 tracking-widest px-3 pt-1 pb-2">PAGES</p>
          {PAGE_LINKS.map((item) =>
            item.soon ? (
              <span key={item.href} className="font-mono text-sm px-3 py-2 rounded-lg flex items-center gap-2 text-slate-700 cursor-default">
                {item.label}
                <span className="font-mono text-[9px] text-slate-700 border border-slate-800 px-1 py-0.5 rounded">soon</span>
              </span>
            ) : (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={`font-mono text-sm px-3 py-2 rounded-lg transition-all ${
                  isActive(item.href) ? "text-[#4FC3F7] bg-[#4FC3F7]/10" : "text-slate-400 hover:text-white"
                }`}>
                {item.label}
              </Link>
            )
          )}
          {/* Section anchors — homepage only */}
          {isHome && (
            <>
              <p className="font-mono text-[10px] text-slate-700 tracking-widest px-3 pt-4 pb-2 mt-1 border-t border-[#1A1A2E]">ON THIS PAGE</p>
              {HOME_SECTIONS.map((s) => (
                <button key={s.id} onClick={() => scrollTo(s.id)}
                  className="font-mono text-sm px-3 py-2 rounded-lg text-left text-slate-500 hover:text-white hover:bg-[#1A1A2E]/50">
                  {s.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
