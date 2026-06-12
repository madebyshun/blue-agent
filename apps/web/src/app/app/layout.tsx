"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
];

// ── Dev-only surfaces ───────────────────────────────────────────────────────────
// Hidden from the product nav by default — the app is focused on Blue Chat +
// Blue Hub (+ Launches, Dashboard). These developer tools appear in the side
// rail ONLY when dev tools are enabled: NEXT_PUBLIC_DEV_TOOLS=1 at build time,
// or append ?dev to any /app URL once (it sticks via localStorage). The routes
// themselves stay live and reachable by direct URL regardless of the flag.
const APP_DEV_NAV = [
  {
    id: "terminal",
    label: "Terminal",
    href: "/app/terminal",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    id: "simulator",
    label: "Simulator",
    href: "/app/simulator",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21a48.309 48.309 0 0 1-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    id: "console",
    label: "Console",
    href: "/app/console",
    icon: (
      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
      </svg>
    ),
  },
];

// ── Dev-tools flag ──────────────────────────────────────────────────────────────
// Server + first client render use the build-time env so hydration matches.
// After mount we upgrade to `true` if ?dev is present (and persist it) or it was
// persisted earlier — a one-directional flip that never causes a hydration error.
function useDevTools() {
  const [dev, setDev] = useState(process.env.NEXT_PUBLIC_DEV_TOOLS === "1");
  useEffect(() => {
    try {
      const params   = new URLSearchParams(window.location.search);
      const devParam = params.get("dev");
      if (devParam === "0" || devParam === "off" || devParam === "false") {
        // ?dev=0 — explicit off-switch: clear the persisted flag.
        localStorage.removeItem("blue_dev_tools");
        setDev(false);
      } else if (params.has("dev")) {
        // ?dev (or ?dev=1) — turn on and persist for this origin.
        localStorage.setItem("blue_dev_tools", "1");
        setDev(true);
      } else if (localStorage.getItem("blue_dev_tools") === "1") {
        setDev(true);
      }
    } catch { /* SSR / storage blocked — keep env default */ }
  }, []);
  return dev;
}

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
    href: "/docs",
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
  const dev      = useDevTools();

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
        {APP_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group relative flex flex-col items-center justify-center gap-0.5 w-full h-[50px] rounded-xl transition-all"
              style={
                active
                  ? { color: "#4FC3F7", background: "#4FC3F712", boxShadow: "0 0 0 1px #4FC3F720" }
                  : { color: "#334155" }
              }
            >
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
            </Link>
          );
        })}

        {/* Dev-only tools — only when the dev flag is on */}
        {dev && (
          <>
            <div className="w-8 h-px bg-[#1A1A2E] my-1.5 self-center" />
            {APP_DEV_NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group relative flex flex-col items-center justify-center gap-0.5 w-full h-[50px] rounded-xl transition-all"
                  style={
                    active
                      ? { color: "#A78BFA", background: "#A78BFA12", boxShadow: "0 0 0 1px #A78BFA20" }
                      : { color: "#334155" }
                  }
                  title={`${item.label} · dev`}
                >
                  <span className="group-hover:text-slate-300 transition-colors">
                    {item.icon}
                  </span>
                  <span
                    className="font-mono text-[7px] tracking-wide transition-colors group-hover:text-slate-400 truncate max-w-[56px] text-center"
                    style={{ color: active ? "#A78BFA" : undefined }}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-[#A78BFA]"
                      style={{ boxShadow: "0 0 6px #A78BFA80" }} />
                  )}
                </Link>
              );
            })}
          </>
        )}
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

// ── Mobile bottom nav ──────────────────────────────────────────────────────────

function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  // Mobile bottom bar = the 5 product destinations. Terminal/Simulator/Console
  // are dev-only (never on mobile); Docs lives in-app. Order mirrors the desktop
  // rail: Chat → Hub → Launches → Dashboard → Profile.
  const MOBILE_IDS = ["chat", "hub", "launches", "dashboard", "profile"];
  const allItems = [...APP_NAV, ...APP_BOTTOM]
    .filter(i => MOBILE_IDS.includes(i.id))
    .sort((a, b) => MOBILE_IDS.indexOf(a.id) - MOBILE_IDS.indexOf(b.id));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#1A1A2E] bg-[#050508]/95 backdrop-blur-xl"
      style={{ height: 56 }}>
      <div className="flex h-full">
        {allItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: active ? "#4FC3F7" : "#334155" }}
            >
              {item.icon}
              <span className="font-mono text-[8px] tracking-wider mt-0.5">
                {item.label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
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
