"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Console", href: "/console" },
  { label: "Score",   href: "/score", badge: "soon" },
  { label: "Chat",    href: "/chat" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1A1A2E] bg-[#050508]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="glow-dot" />
            <span className="font-mono font-semibold text-white tracking-widest text-sm">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all flex items-center ${
                  isActive(item.href)
                    ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                    : "text-slate-400 hover:text-white hover:bg-[#1A1A2E]/50"
                }`}
              >
                {item.label}
                {item.badge && (
                  <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1 rounded ml-1 align-middle">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://github.com/madebyshun/blue-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-slate-400 hover:text-white transition-colors border border-[#1A1A2E] px-3 py-1.5 rounded hover:border-[#4FC3F7]/30"
            >
              GitHub
            </a>
            <Link
              href="/console"
              className="font-mono text-xs font-semibold bg-[#4FC3F7] text-[#050508] px-3 py-1.5 rounded hover:bg-[#29ABE2] transition-colors"
            >
              Open Console →
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508]/95 px-4 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`font-mono text-sm px-3 py-2.5 rounded-lg transition-all flex items-center ${
                isActive(item.href)
                  ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {item.label}
              {item.badge && (
                <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1 rounded ml-1 align-middle">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
          <div className="pt-3 mt-2 border-t border-[#1A1A2E]">
            <Link
              href="/console"
              onClick={() => setOpen(false)}
              className="block text-center font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-3 py-2.5 rounded-lg hover:bg-[#29ABE2] transition-colors"
            >
              Open Console →
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
