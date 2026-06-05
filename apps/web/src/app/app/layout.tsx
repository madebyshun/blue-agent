"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Nav items ─────────────────────────────────────────────────────────────────

const APP_NAV = [
  {
    id: "chat",
    label: "Chat",
    href: "/app/chat",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
  },
  {
    id: "rewards",
    label: "Stake",
    href: "/app/rewards",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    ),
  },
  {
    id: "hub",
    label: "Hub",
    href: "/hub",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
  {
    id: "market",
    label: "Market",
    href: "/market",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
    ),
  },
  {
    id: "sentinel",
    label: "Sentinel",
    href: "/sentinel",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
];

const APP_BOTTOM = [
  {
    id: "docs",
    label: "Docs",
    href: "/docs",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
];

// ── Sidebar ────────────────────────────────────────────────────────────────────

function AppSideNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href.startsWith("/app/")) return pathname.startsWith(href);
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden md:flex flex-col w-14 shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508]">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-[#1A1A2E] shrink-0">
        <Link href="/" title="Blue Agent home">
          <img src="/logomark.svg" alt="Blue Agent" className="h-7 w-7 rounded-lg hover:opacity-80 transition-opacity" />
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col items-center gap-1 pt-3 flex-1">
        {APP_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all"
              style={active
                ? { color: "#4FC3F7", background: "#4FC3F710" }
                : { color: "#475569" }}
            >
              <span className="group-hover:text-white transition-colors">
                {item.icon}
              </span>
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-[#0D0D1A] border border-[#1A1A2E] font-mono text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {item.label}
              </span>
              {/* Active indicator */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[#4FC3F7]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1 pb-4">
        {APP_BOTTOM.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all"
              style={active
                ? { color: "#4FC3F7", background: "#4FC3F710" }
                : { color: "#475569" }}
            >
              <span className="group-hover:text-white transition-colors">
                {item.icon}
              </span>
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-[#0D0D1A] border border-[#1A1A2E] font-mono text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Divider + back to home */}
        <div className="w-6 h-px bg-[#1A1A2E] my-1" />
        <Link
          href="/"
          title="Marketing site"
          className="group relative flex items-center justify-center w-10 h-10 rounded-xl text-[#2D3748] hover:text-slate-500 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-[#0D0D1A] border border-[#1A1A2E] font-mono text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Home
          </span>
        </Link>
      </div>
    </aside>
  );
}

// ── Mobile bottom nav ──────────────────────────────────────────────────────────

function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  const allItems = [...APP_NAV, ...APP_BOTTOM];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#1A1A2E] bg-[#050508]/95 backdrop-blur-xl flex">
      {allItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all"
            style={active ? { color: "#4FC3F7" } : { color: "#475569" }}
          >
            {item.icon}
            <span className="font-mono text-[9px] tracking-wider">{item.label.toUpperCase()}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050508]">
      <AppSideNav />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
