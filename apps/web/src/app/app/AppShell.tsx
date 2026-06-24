"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppChromeProvider, useAppChrome } from "./AppChrome";

// ── Nav items ─────────────────────────────────────────────────────────────────

const APP_NAV = [
  {
    id: "chat",
    label: "Chat",
    href: "/app/chat",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
  },
  {
    id: "hub",
    label: "Hub",
    href: "/app/hub",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
  {
    id: "feed",
    label: "Feed",
    href: "/app/feed",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12.75 19.5v-.75a7.5 7.5 0 0 0-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    ),
  },
  {
    id: "bank",
    label: "Bank",
    href: "/app/bank",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
      </svg>
    ),
  },
  {
    id: "launches",
    label: "Launches",
    href: "/app/launches",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      </svg>
    ),
  },
  {
    id: "b20",
    label: "B20 Scan",
    href: "/app/b20",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    // Dashboard now hosts Overview + Stake + Alerts as tabs; the standalone
    // /app/rewards and /app/alerts entries are gone from the sidebar (they
    // redirect into the right tab for anyone hitting old links).
    href: "/app/dashboard",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
];

const APP_BOTTOM = [
  // Profile is back as its own page — identity (bio, avatar, social links)
  // is distinct from the dashboard's wallet snapshot. /app/dashboard is for
  // "what do I hold + manage", /app/profile is for "who am I".
  {
    id: "profile",
    label: "Profile",
    href: "/app/profile",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    id: "docs",
    label: "Docs",
    href: "/docs/blue-chat",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
    if (href === "/app/chat") return pathname === "/app/chat" || pathname.startsWith("/app/chat/");
    if (href.startsWith("/app/")) return pathname.startsWith(href);
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="hidden md:flex flex-col w-[72px] shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508]">

      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-[#1A1A2E] shrink-0">
        <Link href="/" title="blueagent.dev">
          <img
            src="/logomark.svg"
            alt="Blue Agent"
            className="h-7 w-7 rounded-lg hover:opacity-75 transition-opacity"
          />
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col items-center gap-0.5 pt-2 flex-1 px-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const isExt = !!(item as { external?: boolean }).external;
          const navCls = "group relative flex flex-col items-center justify-center gap-0.5 w-full h-[50px] rounded-xl transition-all";
          const navInner = (
            <>
              <span className="group-hover:text-slate-300 transition-colors">
                {item.icon}
              </span>
              <span
                className="font-mono text-[7px] tracking-wide transition-colors group-hover:text-slate-400 truncate max-w-[56px] text-center"
                style={{ color: active ? "#4FC3F7" : undefined }}
              >
                {item.label}
              </span>
              {/* Active left-bar indicator */}
              {active && (
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-[#4FC3F7]"
                  style={{ boxShadow: "0 0 6px #4FC3F780" }} />
              )}
            </>
          );
          if (isExt) {
            return (
              <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer"
                className={navCls} style={{ color: "#334155" }}>
                {navInner}
              </a>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              className={navCls}
              style={
                active
                  ? { color: "#4FC3F7", background: "#4FC3F712", boxShadow: "0 0 0 1px #4FC3F720" }
                  : { color: "#334155" }
              }
            >
              {navInner}
            </Link>
          );
        })}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col items-center gap-0.5 pb-3 px-2">

        {APP_BOTTOM.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group relative flex flex-col items-center justify-center gap-0.5 w-full h-[46px] rounded-xl transition-all"
              style={
                active
                  ? { color: "#4FC3F7", background: "#4FC3F712" }
                  : { color: "#334155" }
              }
            >
              <span className="group-hover:text-slate-400 transition-colors">
                {item.icon}
              </span>
              <span className="font-mono text-[7px] tracking-wide text-slate-700 group-hover:text-slate-500 transition-colors">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Divider */}
        <div className="w-8 h-px bg-[#1A1A2E] my-0.5" />

        {/* Back to marketing site */}
        <Link
          href="/"
          className="group relative flex flex-col items-center justify-center gap-0.5 w-full h-[46px] rounded-xl text-[#283040] hover:text-slate-500 transition-colors"
        >
          <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="font-mono text-[7px] tracking-wide text-slate-700 group-hover:text-slate-500 transition-colors">
            Home
          </span>
        </Link>
      </div>
    </aside>
  );
}

// ── Mobile chrome (top bar + drawer) ────────────────────────────────────────────
// Replaces the old bottom tab bar. Claude-style: a hamburger top bar opens a
// slide-out drawer that holds BOTH the product destinations and (when a page
// registers it) that page's contextual sub-nav — e.g. Blue Chat's Models /
// Tools / Skills / Scheduled and recent conversations. Shown below lg so the
// tablet gap (md rail, no chat sidebar) keeps full nav access.

// BlueBank is live — show in sidebar on all environments.
// Access is gated by BANK_PREVIEW_TOKEN cookie in middleware.
const NAV_ITEMS = APP_NAV;

const PRODUCTS = [...NAV_ITEMS, ...APP_BOTTOM];

// Mobile drawer products — Profile is surfaced at the very top, Docs lives in
// Settings (mobile), so both are dropped from the drawer's product list.
const DRAWER_PRODUCTS = PRODUCTS.filter(i => i.id !== "profile" && i.id !== "docs");

function labelForPath(pathname: string): string {
  const match = PRODUCTS.find(i => pathname === i.href || pathname.startsWith(i.href + "/"));
  return match?.label ?? "Blue Agent";
}

function MobileTopBar() {
  const { setDrawerOpen, contextual } = useAppChrome();
  const pathname = usePathname();
  const title = contextual?.barTitle ?? labelForPath(pathname);

  return (
    <header className="lg:hidden flex items-center gap-3 h-12 px-3 border-b border-[#1A1A2E] bg-[#050508] shrink-0">
      <button
        aria-label="Open menu"
        onClick={() => setDrawerOpen(true)}
        className="p-1.5 -ml-1 rounded-lg text-slate-300 hover:bg-[#ffffff0a] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest truncate flex-1">
        // {title.toUpperCase()}
      </span>
      {/* One-tap New chat (compose) — ChatGPT-style, no need to open the drawer. */}
      {contextual?.newChat && (
        <button
          aria-label="New chat"
          onClick={() => contextual.newChat?.()}
          className="p-1.5 -mr-1 rounded-lg text-slate-300 hover:bg-[#ffffff0a] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
    </header>
  );
}

function MobileDrawer() {
  const { drawerOpen, setDrawerOpen, contextual } = useAppChrome();
  const pathname = usePathname();

  // Close the drawer whenever the route changes (e.g. after tapping a product).
  useEffect(() => { setDrawerOpen(false); }, [pathname, setDrawerOpen]);

  // Escape closes.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;

  const hasContextual = contextual && (contextual.items.length > 0 || (contextual.recents?.length ?? 0) > 0);

  return (
    <div className="lg:hidden fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />

      <aside className="absolute left-0 top-0 h-full w-[300px] max-w-[86vw] bg-[#070710] border-r border-[#1A1A2E] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-[#1A1A2E] shrink-0">
          <div className="flex items-center gap-2">
            <img src="/logomark.svg" alt="" className="h-6 w-6 rounded-md" />
            <span className="font-mono text-[12px] text-white tracking-wide">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[#ffffff0a] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Profile — surfaced at the very top (ChatGPT-style account entry). */}
          <div className="px-2">
            <Link
              href="/app/profile"
              onClick={() => setDrawerOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[#ffffff06]"
            >
              <span className="w-7 h-7 rounded-full bg-[#15151f] border border-[#1A1A2E] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <span className="font-mono text-[13px] text-slate-200">Profile</span>
            </Link>
          </div>

          {/* New chat — primary action, prominent + easy to tap. */}
          {contextual?.newChat && (
            <div className="px-2 pt-1 pb-2">
              <button
                onClick={() => { contextual.newChat?.(); setDrawerOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors active:scale-[0.99]"
                style={{ background: "#4FC3F715", border: "1px solid #4FC3F730" }}
              >
                <svg className="w-4 h-4 text-[#4FC3F7] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-mono text-[13px] font-semibold text-[#4FC3F7]">New chat</span>
              </button>
            </div>
          )}

          {/* Contextual utilities (Scheduled · Settings) + recents */}
          {hasContextual && (
            <div className="px-2 pb-2 border-t border-[#13131f] pt-2">
              {contextual!.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { item.onSelect(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[#ffffff06]"
                  style={item.active ? { background: "#4FC3F712" } : undefined}
                >
                  {item.icon && <span className="w-4 text-center shrink-0 text-sm leading-none">{item.icon}</span>}
                  <span className="font-mono text-[13px]" style={{ color: item.active ? "#4FC3F7" : "#cbd5e1" }}>
                    {item.label}
                  </span>
                </button>
              ))}

              {contextual!.recents && contextual!.recents.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 font-mono text-[9px] text-slate-600 tracking-widest uppercase">Recents</p>
                  {contextual!.recents.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { r.onSelect(); setDrawerOpen(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff06]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.active ? "#4FC3F7" : "#334155" }} />
                      <span className="font-mono text-[12px] truncate" style={{ color: r.active ? "#ffffff" : "#94a3b8" }}>
                        {r.title}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Products group */}
          <div className="px-2 pt-1 border-t border-[#13131f] mt-1">
            <p className="px-3 pt-3 pb-1 font-mono text-[9px] text-slate-600 tracking-widest uppercase">Products</p>
            {DRAWER_PRODUCTS.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const isExt = !!(item as { external?: boolean }).external;
              const drawerCls = "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[#ffffff06]";
              const drawerInner = (
                <>
                  <span className="shrink-0" style={{ color: active ? "#4FC3F7" : "#64748b" }}>{item.icon}</span>
                  <span className="font-mono text-[13px]" style={{ color: active ? "#4FC3F7" : "#cbd5e1" }}>{item.label}</span>
                  {isExt && <span className="ml-auto font-mono text-[9px] text-slate-600">↗</span>}
                </>
              );
              if (isExt) {
                return (
                  <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer"
                    onClick={() => setDrawerOpen(false)}
                    className={drawerCls}>
                    {drawerInner}
                  </a>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={drawerCls}
                  style={active ? { background: "#4FC3F712" } : undefined}
                >
                  {drawerInner}
                </Link>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppChromeProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#050508]">
        <AppSideNav />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MobileTopBar />
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
        <MobileDrawer />
      </div>
    </AppChromeProvider>
  );
}
