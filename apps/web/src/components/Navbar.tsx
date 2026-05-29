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
      <div className="flex items-center h-16 px-5 sm:px-8">

        {/* Left — logo — fixed w-64 on lg to align right-edge with sidebar (w-72 minus px-8 padding) */}
        <div className="flex-1 lg:flex-none lg:w-64 flex items-center">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo.svg" alt="Blue Agent" className="h-7 w-7" />
            <span className="font-mono font-semibold text-white tracking-widest text-sm">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </Link>
        </div>

        {/* Desktop: content-area header — flex-1 spacer · center nav · flex-1 actions */}
        <div className="hidden md:flex flex-1 items-center">
          {/* Left spacer */}
          <div className="flex-1" />
          {/* Center nav — centered in the content area (viewport minus sidebar) */}
          <div className="flex items-center gap-1">
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
          {/* Right actions — flex-1 mirrors left spacer for symmetric centering */}
          <div className="flex-1 flex items-center justify-end gap-2">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
              className="text-slate-500 hover:text-white transition-colors p-1.5 rounded" aria-label="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            {/* Wallet button */}
            <ConnectButton />
            <Link href="/console"
              className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-4 py-1.5 rounded hover:bg-[#29ABE2] transition-colors">
              Console
            </Link>
          </div>
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
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508]/95 px-4 py-3 flex flex-col gap-0.5">
          {NAV_LINKS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`font-mono text-sm px-3 py-2.5 rounded-lg transition-all ${
                isActive(item.href)
                  ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                  : "text-slate-400 hover:text-white hover:bg-[#1A1A2E]/50"
              }`}>
              {item.label}
            </Link>
          ))}
          <div className="border-t border-[#1A1A2E] mt-2 pt-3 flex items-center gap-3 px-3">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
              className="font-mono text-sm text-slate-500 hover:text-white transition-colors">X</a>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-sm text-slate-500 hover:text-white transition-colors">GitHub</a>
            <div className="ml-auto flex items-center gap-2">
              <ConnectButton />
              <Link href="/console" onClick={() => setOpen(false)}
                className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-3 py-1.5 rounded hover:bg-[#29ABE2] transition-colors">
                Console
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
