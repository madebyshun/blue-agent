"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import { DOC_NAV } from "./_nav";

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-7">
      {DOC_NAV.map((group) => (
        <div key={group.group}>
          <div className="font-mono text-[10px] text-slate-600 tracking-[0.15em] uppercase mb-2 px-3">{group.group}</div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate}
                  className="block px-3 py-1.5 rounded-lg font-mono text-[13px] transition-colors"
                  style={active
                    ? { background: "#4FC3F712", color: "#4FC3F7", borderLeft: "2px solid #4FC3F7" }
                    : { color: "#94a3b8", borderLeft: "2px solid transparent" }}>
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[400px] pointer-events-none overflow-hidden">
        <div style={{ background: "radial-gradient(ellipse 70% 40% at 50% -5%, #4FC3F710 0%, transparent 70%)" }} className="absolute inset-0" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto py-8 pr-2">
            <SidebarNav pathname={pathname} />
          </div>
        </aside>

        {/* Mobile sidebar toggle */}
        <button onClick={() => setOpen(true)}
          className="lg:hidden fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-xl font-mono text-xs font-bold shadow-2xl"
          style={{ background: "#4FC3F7", color: "#050508" }}>
          ☰ Docs
        </button>
        {open && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0f] border-r border-[#1A1A2E] p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">DOCS</span>
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-md text-slate-500 hover:text-white hover:bg-[#1A1A2E]">✕</button>
              </div>
              <SidebarNav pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        {/* Content */}
        <main className="min-w-0 flex-1 py-8 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
