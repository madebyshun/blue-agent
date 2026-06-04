"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectModal";

const NAV_LINKS = [
  { label: "Hub",      href: "/hub" },
  { label: "Console",  href: "/console" },
  { label: "Skills",   href: "/skills" },
  { label: "API",      href: "/api-docs" },
  { label: "Docs",     href: "/docs" },
];

// Hidden from nav — links still accessible directly
// { label: "Chat",   href: "/chat" }
// { label: "Market", href: "/market" }


export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1A1A2E] bg-[#050508]/90 backdrop-blur-xl">
      <div className="flex items-center h-16 px-5 sm:px-8 gap-4">

        {/* Left — logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/logomark.svg" alt="Blue Agent" className="h-7 w-7 rounded-lg" />
          <span className="hidden sm:inline font-mono font-semibold text-white tracking-widest text-sm">
            BLUE<span className="text-[#4FC3F7]">AGENT</span>
          </span>
        </Link>

        {/* Center — viewport center on md (no sidebar), content-area center on lg (sidebar=288px → offset 144px) */}
        <div className="hidden md:flex absolute left-1/2 lg:left-[calc(50%+144px)] -translate-x-1/2 items-center gap-1">
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href}
              className={`font-mono text-sm px-4 py-1.5 rounded-lg transition-all ${
                isActive(item.href)
                  ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                  : "text-slate-400 hover:text-white hover:bg-[#1A1A2E]/60"
              }`}>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right — actions */}
        <div className="hidden md:flex items-center gap-2">
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
            className="text-slate-500 hover:text-white transition-colors p-1.5 rounded" aria-label="X / Twitter">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <ConnectButton />
          <Link href="/console"
            className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-1.5 rounded hover:bg-[#29ABE2] transition-colors">
            Console
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-slate-400 hover:text-white p-1 ml-auto" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508]/98 px-3 py-2 flex flex-col">
          {/* Nav links */}
          <div className="flex flex-col gap-0.5 py-2">
            {NAV_LINKS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={`font-mono text-sm px-4 py-3 rounded-lg transition-all ${
                  isActive(item.href)
                    ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                    : "text-slate-300 hover:text-white hover:bg-[#1A1A2E]/60"
                }`}>
                {item.label}
              </Link>
            ))}
          </div>
          {/* Bottom actions */}
          <div className="border-t border-[#1A1A2E] py-3 flex items-center gap-3 px-2">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
              className="font-mono text-sm text-slate-500 hover:text-white transition-colors">X</a>
            <div className="ml-auto flex items-center gap-2">
              <ConnectButton />
              <Link href="/console" onClick={() => setOpen(false)}
                className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-2 rounded hover:bg-[#29ABE2] transition-colors">
                Console
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
