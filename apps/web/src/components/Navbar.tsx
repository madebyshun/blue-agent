"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const X_URL = "https://x.com/blocky_agent";

const NAV_LINKS = [
  { label: "Console", href: "/code" },
  { label: "Chat",    href: "/chat" },
  { label: "Launch",  href: "/launch" },
  { label: "Market",  href: "/market" },
  { label: "Rewards", href: "/rewards" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#060C18]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="glow-dot" />
            <span className="font-mono font-semibold text-white tracking-widest text-sm">
              BLUE<span className="text-[#33C3FF]">AGENT</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm px-3 py-1.5 rounded-lg transition-all ${
                  isActive(item.href)
                    ? "text-[#4A7AFF] bg-[#1A52FF]/10"
                    : "text-[#7A8FAE] hover:text-white hover:bg-[#162040]/60"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right actions */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7A8FAE] hover:text-white transition-colors"
              aria-label="X / Twitter"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://github.com/madebyshun/blue-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#B8CBE8] hover:text-white transition-colors border border-white/15 px-3 py-1.5 rounded-lg hover:border-[#1A52FF]/40"
            >
              GitHub
            </a>
            <Link
              href="/code"
              className="btn-primary text-sm px-3 py-1.5 rounded-lg"
            >
              Open Console
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-[#7A8FAE] hover:text-white"
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
        <div className="md:hidden border-t border-white/10 bg-[#060C18]/95 px-4 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`text-sm px-3 py-2.5 rounded-lg transition-all ${
                isActive(item.href)
                  ? "text-[#4A7AFF] bg-[#1A52FF]/10"
                  : "text-[#7A8FAE] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-3 mt-2 border-t border-white/10">
            <Link
              href="/code"
              onClick={() => setOpen(false)}
              className="btn-primary block text-center text-sm px-3 py-2.5 rounded-lg"
            >
              Open Console
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
