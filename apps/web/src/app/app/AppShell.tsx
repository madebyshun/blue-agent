"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePolling } from "@/hooks/usePolling";
import { AppChromeProvider, useAppChrome } from "./AppChrome";
import LanguageToggle from "@/components/LanguageToggle";
import AccountMenu from "@/components/AccountMenu";
import { useLang } from "@/lib/i18n/context";

// T-D D1 — small self-contained client component. Polls
// `/api/hood/inbox/unread-count` every 30s and shows a red dot with the count
// on the Hood nav item. Only mounted for the Hood item so other nav items don't
// trigger the fetch.
//
// ⚠ This badge lives in the nav, so it runs on EVERY /app page — not just Hood.
// That made it the single most-amplified fetch in the app, and the largest
// contributor to the Upstash suspensions (#123, #148) back when one GET cost
// ~202 KV commands. #148 ② took the per-GET cost to 2; #148 ③ (below) stops
// the loop entirely while the tab is hidden.
const NAV_BADGE_POLL_MS = 30_000;

function HoodNavBadge() {
  const [n, setN] = useState<number | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/hood/inbox/unread-count", { cache: "no-store", signal });
      // 503 means "unread count UNKNOWN" (KV unreachable), not "zero unread".
      // Returning early keeps the last known count on screen; letting it fall
      // through to 0 would hide the badge and look exactly like "all caught
      // up", which is the one reading that is definitely wrong.
      if (!r.ok) return;
      const body = (await r.json()) as { unread?: number };
      if (typeof body.unread === "number") setN(body.unread);
    } catch { /* offline or aborted — both fine, keep the last count */ }
  }, []);

  // The `signal` replaces the old `alive` flag: it not only suppresses the
  // post-unmount setState, it cancels the request that is still on the wire.
  usePolling(load, NAV_BADGE_POLL_MS);
  if (!n) return null;
  const label = n > 99 ? "99+" : String(n);
  return (
    <span
      className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center font-mono text-[9px] font-bold"
      style={{ backgroundColor: "#ef4444", color: "#fff", boxShadow: "0 0 0 2px #050508" }}
      aria-label={`${n} unread`}
    >
      {label}
    </span>
  );
}

// ── Icons (Heroicons outline · 15px · strokeWidth 1.75) ─────────────────────────
// The design handoff specifies 15px Lucide icons. Lucide is NOT a dependency
// here (checked: not in package.json), so these stay Heroicons — but the SIZE
// is matched, and the stroke is re-weighted to compensate.
//
// Why the stroke changes with the size: both icon sets draw into a 24 viewBox,
// so the rendered stroke is `size/24 * strokeWidth` CSS px. Lucide's default 2
// at 15px lands on 1.25px. Heroicons' 1.5 at 15px would land on 0.94px — a
// visibly lighter rail than the design, and sub-pixel on a 1x display. 1.75
// lands on 1.09px: heavier than a straight shrink, and short of Lucide's 2,
// which collides the joins on the denser glyphs (Connectors, Usage).
//
// ⚠ `S` is an inline style, and inline style beats any Tailwind class — a
// `w-4` on one of these icons will silently do nothing. Resize here, not at
// the call site.
const S = { width: 15, height: 15 } as const;
const svg = (d: ReactNode) => (
  <svg style={S} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>{d}</svg>
);

const IconChat = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />);
const IconHub = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />);
const IconHood = svg(<><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m0 0-6-6m6 6-6 6" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5v15" /></>);
// Wallet — billfold body + fold flap + rounded coin pocket (distinct from the credit-card Plans icon).
const IconWallet = svg(<><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 9.75A2.25 2.25 0 0 1 4.5 7.5h15a2.25 2.25 0 0 1 2.25 2.25v7.5A2.25 2.25 0 0 1 19.5 19.5h-15a2.25 2.25 0 0 1-2.25-2.25v-7.5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5V6.75A2.25 2.25 0 0 0 15.75 4.5H5.25" /><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 12.75h-3a1.875 1.875 0 0 0 0 3.75h3" /></>);
// Overview — chart-pie (distinct from Hub's grid).
const IconOverview = svg(<><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></>);
// Skills — sparkles.
const IconSkills = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />);
// Connectors — squares-plus.
const IconConnectors = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z" />);
// Cron — clock.
const IconCron = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />);
// Usage — chart-bar.
const IconUsage = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />);
// Plans — credit-card.
const IconPlans = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />);
// Docs — document.
const IconDocs = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />);
// Home / Models used to be hand-rolled at 16px with strokeWidth 1.5 while every
// other icon came from `svg()` — a 2px and half-a-stroke difference sitting in
// the same column. Routed through the shared helper so one edit moves all of
// them and the rail can't drift apart again.
const IconHome = svg(<path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />);
const IconModels = svg(<path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17 9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />);

// ── Nav model ───────────────────────────────────────────────────────────────────
// Grouped sidebar mirroring the "onchain Agent OS" framing — three product
// pillars + an account band. Every destination is backed by REAL data (no
// fabricated Health / Sessions / Agents pages):
//   AGENT   — the agent you operate: Chat + Wallet, plus its control pages
//             (Overview, Connectors, Scheduled, Usage — all promoted Blue Chat
//             tabs; see src/app/app/{dashboard,connectors,cron,usage}).
//   EXPLORE — Blue Hood's public signals + receipted track record.
//   HUB     — the Blue Hub marketplace + your installed agent-skills catalog.
//   ACCOUNT — billing + help (Plans, Docs) — unchanged.
// This is a relabel/regroup only: every href below is identical to before, so
// no route, redirect, or deep link changes — only how items are grouped/named.
//
// `meta` is the design handoff's right-hand column on a nav row. It is a
// DISCRIMINATOR, not a string, for the same reason `badge` is: the handoff
// prints literal counts (Hub 111 · Skills 8 · Plans "Member") and a literal
// here would be a number that cannot be wrong today and cannot be right later
// — CLAUDE.md's own tool count carries "count it, don't trust this number".
// So the only meta wired up is the one with a real source: `hubCount` resolves
// from `TOOL_COUNT`, handed down from the SERVER layout as a plain number.
// That keeps the 1958-line catalog out of the client bundle and adds no fetch
// — which matters here specifically, because anything mounted in this nav runs
// on every /app page (see HoodNavBadge's warning above).
type NavItem = { id: string; href: string; icon: ReactNode; badge?: "hood"; meta?: "hubCount" };
type NavGroup = { id: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "group_agent",
    items: [
      { id: "chat", href: "/chat", icon: IconChat },
      { id: "models", href: "/models", icon: IconModels },
      { id: "wallet", href: "/wallet", icon: IconWallet },
      { id: "dashboard", href: "/dashboard", icon: IconOverview },
      { id: "connectors", href: "/connectors", icon: IconConnectors },
      { id: "cron", href: "/cron", icon: IconCron },
      { id: "usage", href: "/usage", icon: IconUsage },
    ],
  },
  {
    id: "group_explore",
    items: [
      { id: "hood", href: "/hood", icon: IconHood, badge: "hood" },
    ],
  },
  {
    id: "group_hub",
    items: [
      { id: "hub", href: "/hub", icon: IconHub, meta: "hubCount" },
      // No meta on Skills. The handoff prints "8", but nothing in the shell can
      // reach that number: the count lives inside <SkillsPanel>, a client
      // component behind a fetch, and importing it here would mount it on every
      // /app page. An 8 typed in by hand is a claim with no source — the exact
      // thing a derived Hub count exists to avoid.
      { id: "skills", href: "/skills", icon: IconSkills },
    ],
  },
  {
    id: "group_account",
    // The design handoff drops Docs from this group (it treats Docs as a
    // marketing page, not an app view) and prints "Member" beside Plans.
    // Neither is applied here, and both are deliberate:
    //   · Docs STAYS. /docs/blue-chat is live and this is its only entrance
    //     from inside the app. Removing a door to a working page is a product
    //     decision, not a restyle — flagged for ShunTr rather than taken.
    //   · Plans has no meta. "Member" is account state; reading it needs a
    //     shell-wide fetch on every /app page, which is the cost profile that
    //     produced #123/#148.
    items: [
      { id: "plans", href: "/plans", icon: IconPlans },
      { id: "docs", href: "/docs/blue-chat", icon: IconDocs },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// The app surface is served on app.blueagent.dev under clean, /app-less URLs
// (middleware rewrites /chat → /app/chat), so on prod usePathname() already
// returns the clean path. On localhost/preview you visit /app/chat directly, so
// strip a leading /app here too — that keeps the active highlight correct in
// BOTH environments. The app root ("/") is Blue Chat, so map it to /chat.
function cleanPath(pathname: string): string {
  const p = pathname.replace(/^\/app(?=\/|$)/, "") || "/";
  return p === "/" ? "/chat" : p;
}

// Returns the nav id for the current path so the mobile title can be translated
// via t(`nav.${id}`); falls back to null (→ generic "Blue Agent" brand label).
function navIdForPath(pathname: string): string | null {
  const clean = cleanPath(pathname);
  const match = ALL_ITEMS.find((i) => clean === i.href || clean.startsWith(i.href + "/"));
  return match?.id ?? null;
}

// ── Desktop sidebar (grouped · collapsible) ─────────────────────────────────────

const COLLAPSE_KEY = "blue.sidebar.collapsed";

// Design-handoff shell metrics, named once so the desktop rail and the mobile
// drawer cannot drift apart the way the 16px/18px icons did.
const RAIL_W = 218;          // handoff: 218px sidebar
const RAIL_W_COLLAPSED = 64; // no handoff value — collapsed is ours
const ITEM_PAD = "8px 9px";
const ITEM_RADIUS = 9;
const ACTIVE_BG = "rgba(79,195,247,0.10)";
const ACTIVE_RING = "inset 0 0 0 1px rgba(79,195,247,0.22)";
// Two tracking values, not one. The handoff specifies the wordmark at `.13em`
// and uppercase section labels at `.14–.16em` — they are different typographic
// objects that happen to land close together, so a single shared constant would
// assert an equality the design does not make. 0.14em is the bottom of the
// label range: these sit at 9px, where more tracking starts to shred the word.
const WORDMARK_TRACK = "0.13em";
const LABEL_TRACK = "0.14em";

// Group headings and the right-hand meta share one colour (--text-4). Both are
// chrome: they must be legible without competing with the row they annotate.
const META = "#475569";

function AppSideNav({ toolCount }: { toolCount: number }) {
  const pathname = usePathname();
  const { t } = useLang();
  const { contextual } = useAppChrome();
  const clean = cleanPath(pathname);
  const isActive = (href: string) => clean === href || clean.startsWith(href + "/");

  // Collapse state persists across sessions. Default expanded; hydrate from
  // localStorage after mount (avoids an SSR/client mismatch).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggle = () =>
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    // The handoff marks the active row with a tint AND a 1px inset ring. The
    // ring replaces the old left bar rather than joining it: a bar plus a ring
    // is two accents on one row, and the ring already traces the left edge.
    return (
      <Link
        key={item.id}
        href={item.href}
        title={collapsed ? t(`nav.${item.id}`) : undefined}
        className={`group relative flex items-center transition-colors ${
          collapsed ? "justify-center" : "gap-2.5"
        }`}
        style={{
          padding: ITEM_PAD,
          borderRadius: ITEM_RADIUS,
          ...(active ? { background: ACTIVE_BG, boxShadow: ACTIVE_RING } : null),
        }}
      >
        <span
          className="relative shrink-0 transition-colors"
          style={{ color: active ? "#4FC3F7" : "#64748B" }}
        >
          {item.icon}
          {/* Stays pinned to the icon rather than moving to the meta column the
              handoff draws it in. Unread receipts are an ALERT, not metadata:
              rendered as grey 9.5px meta it would read as a static count, and
              at the collapsed width there is no meta column at all. */}
          {item.badge === "hood" && <HoodNavBadge />}
        </span>
        {!collapsed && (
          <>
            <span
              className="font-mono text-[11.5px] font-medium truncate transition-colors flex-1 min-w-0"
              style={{ color: active ? "#4FC3F7" : "#E2E8F0" }}
            >
              {t(`nav.${item.id}`)}
            </span>
            {item.meta === "hubCount" && (
              <span className="font-mono text-[9.5px] shrink-0 tabular-nums" style={{ color: META }}>
                {toolCount}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    // bg is --nav (#07070c), one step DARKER than the page (--bg #050508). The
    // rail reading as a recess behind the content is what the hairline border
    // alone was doing before, at much lower contrast.
    <aside
      className="hidden md:flex flex-col shrink-0 border-r border-[#1A1A2E] h-full bg-nav transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? RAIL_W_COLLAPSED : RAIL_W }}
    >
      {/* Logo / wordmark */}
      <div
        className={`flex items-center h-14 border-b border-[#1A1A2E] shrink-0 ${
          collapsed ? "justify-center" : "px-3"
        }`}
      >
        <a
          href="https://blueagent.dev"
          title="blueagent.dev"
          className="flex items-center gap-2 min-w-0"
        >
          <img
            src="/logomark.svg"
            alt="Blue Agent"
            className="rounded-lg shrink-0 hover:opacity-75 transition-opacity"
            style={{ width: 22, height: 22 }}
          />
          {!collapsed && (
            <span
              className="font-mono text-[12px] font-bold truncate"
              style={{ color: "#E2E8F0", letterSpacing: WORDMARK_TRACK }}
            >
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          )}
        </a>
      </div>

      {/* New chat — PINNED, outside the scroll container.
          It used to be the first child of <nav> below, which meant the comment
          that lived here ("must never require scrolling past 12 nav rows to
          reach") described an intention the layout did not implement: one
          `overflow-y-auto` held the button, all 12 nav rows AND the unbounded
          Recents list, so scrolling down to an older conversation carried the
          primary action off the top of the sidebar.

          Only this row is lifted out, and the nav groups below are deliberately
          left scrolling. At the expanded width the groups need roughly
          4 labels (28px) + 12 rows (36px) ≈ 544px, and on a 800px-tall window
          the 56px header, the credit chip and the account/home/language/collapse
          footer already claim ~260px — so a `shrink-0` around the groups would
          clip the last ones with no way to reach them, which is strictly worse
          than scrolling to them. A single 36px button never has that problem. */}
      {/* FILLED cyan, per the handoff — it was a 7%-opacity tint before, which
          read as just another nav row. Foreground is --bg (#050508), not white:
          white on #4FC3F7 is ~1.9:1 and fails at 11.5px, dark-on-cyan is ~9:1.
          This is the one glow in the rail (`shadow-cta`); the handoff rations
          it to primary CTAs, and a second glowing thing would spend it. */}
      {contextual?.newChat && (
        <div className="shrink-0 px-2 pt-2 pb-1">
          <button
            onClick={() => contextual.newChat?.()}
            title={collapsed ? "New chat" : undefined}
            className={`group w-full flex items-center shadow-cta transition-colors ${
              collapsed ? "justify-center" : "gap-2.5"
            }`}
            style={{ padding: ITEM_PAD, borderRadius: ITEM_RADIUS, background: "#4FC3F7" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#29ABE2"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#4FC3F7"; }}
          >
            <svg style={S} className="shrink-0" fill="none" viewBox="0 0 24 24" stroke="#050508" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && (
              <>
                <span className="font-mono text-[11.5px] font-semibold text-[#050508] flex-1 text-left">New chat</span>
                <span className="font-mono text-[9.5px] text-[#05050899]">⌘N</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Grouped nav + recents — the scrolling region. `min-h-0` is load-bearing:
          without it a flex child refuses to shrink below its content height and
          the overflow lands on the whole sidebar instead, taking the pinned rows
          with it. */}
      {/* `overflow-x-hidden` is the handoff's, and it is not cosmetic: the rows
          below hold `truncate` labels, and a horizontal scrollbar here would
          let a long translation push the meta column out of view instead of
          eliding — the label would look complete while the count vanished. */}
      <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2 ${contextual?.newChat ? "" : "pt-2"}`}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.id} className={gi > 0 ? "mt-1" : ""}>
            {collapsed
              ? gi > 0 && <div className="mx-auto my-2 w-6 h-px bg-[#1A1A2E]" />
              : (
                <p
                  className="px-3 pt-4 pb-1 font-mono text-[9px] uppercase"
                  style={{ color: META, letterSpacing: LABEL_TRACK }}
                >
                  {t(`nav.${group.id}`)}
                </p>
              )}
            <div className="flex flex-col gap-0.5 px-2">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}

        {/* Page sub-nav — utilities + recents, registered by the page itself.
            Collapsed hides it: a 64px rail cannot show conversation titles, and
            the icons alone would be indistinguishable from one another. */}
        {!collapsed && contextual && (
          <div className="mt-1">
            <div className="flex flex-col gap-0.5 px-2">
              {/* Same metrics as renderItem — this is a nav row registered by
                  the page, not a different kind of control, and a second set of
                  paddings here is what makes a shared rail look assembled. */}
              {contextual.items.map((item) => (
                <button
                  key={item.id}
                  onClick={item.onSelect}
                  className="w-full flex items-center gap-2.5 hover:bg-[#ffffff06] transition-colors"
                  style={{
                    padding: ITEM_PAD,
                    borderRadius: ITEM_RADIUS,
                    ...(item.active ? { background: ACTIVE_BG, boxShadow: ACTIVE_RING } : null),
                  }}
                >
                  {item.icon && <span className="w-[15px] text-center shrink-0 text-sm leading-none">{item.icon}</span>}
                  <span className="font-mono text-[11.5px] font-medium" style={{ color: item.active ? "#4FC3F7" : "#E2E8F0" }}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {contextual.recents && contextual.recents.length > 0 && (
              <>
                <p
                  className="px-3 pt-4 pb-1 font-mono text-[9px] uppercase"
                  style={{ color: META, letterSpacing: LABEL_TRACK }}
                >
                  Recents
                </p>
                <div className="flex flex-col px-2">
                  {contextual.recents.map((r) => (
                    <div
                      key={r.id}
                      onClick={r.onSelect}
                      className="group relative flex items-center gap-2 px-[9px] h-8 cursor-pointer transition-colors hover:bg-[#ffffff05]"
                      style={{
                        borderRadius: ITEM_RADIUS,
                        ...(r.active ? { background: ACTIVE_BG, boxShadow: ACTIVE_RING } : null),
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: r.active ? "#4FC3F7" : "#334155" }}
                      />
                      <p
                        className="font-mono text-[12px] flex-1 truncate leading-snug"
                        style={{ color: r.active ? "#ffffff" : "#94a3b8" }}
                      >
                        {r.title}
                      </p>
                      {r.meta && (
                        <span className={`font-mono text-[9px] text-slate-700 shrink-0 ${r.onDelete ? "group-hover:hidden" : ""}`}>
                          {r.meta}
                        </span>
                      )}
                      {r.onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); r.onDelete?.(); }}
                          className="hidden group-hover:flex shrink-0 p-0.5 text-slate-700 hover:text-[#EF4444] transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Page-supplied footer (Blue Chat's credit chip) — above the shell's own. */}
      {!collapsed && contextual?.footer && (
        <div className="border-t border-[#1A1A2E] shrink-0 px-3 py-2.5">
          {contextual.footer}
        </div>
      )}

      {/* Footer — account · Home · language · collapse toggle */}
      <div className="border-t border-[#1A1A2E] shrink-0 flex flex-col gap-1 py-2 px-2">
        {/* Who you are, first. The shell previously named a nav group "Account"
            over Plans and Docs — a price list and a manual — with no route to
            your own profile and no sign-out outside the wallet modal. This is
            the actual account control; the group keeps its label for billing. */}
        <AccountMenu collapsed={collapsed} />

        <div className="h-px bg-[#1A1A2E] mx-1 my-1" />

        <a
          href="https://blueagent.dev"
          title={collapsed ? t("nav.home") : undefined}
          className={`group flex items-center text-[#283040] hover:text-slate-400 transition-colors ${
            collapsed ? "justify-center" : "gap-2.5"
          }`}
          style={{ padding: ITEM_PAD, borderRadius: ITEM_RADIUS }}
        >
          <span className="shrink-0">{IconHome}</span>
          {!collapsed && (
            <>
              <span className="font-mono text-[11.5px] font-medium text-slate-500 group-hover:text-slate-300 transition-colors flex-1 min-w-0">
                {t("nav.home")}
              </span>
              {/* The handoff writes this row "Home ↗" — it leaves the app for
                  blueagent.dev, and it is the only row in the rail that does. */}
              <span className="font-mono text-[9.5px] shrink-0" style={{ color: META }}>↗</span>
            </>
          )}
        </a>

        <div className={collapsed ? "flex justify-center" : "px-1"}>
          <LanguageToggle vertical={collapsed} />
        </div>

        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`group flex items-center text-slate-600 hover:text-slate-300 hover:bg-[#ffffff06] transition-colors ${
            collapsed ? "justify-center" : "gap-2.5"
          }`}
          style={{ padding: ITEM_PAD, borderRadius: ITEM_RADIUS }}
        >
          <span
            className="shrink-0 transition-transform"
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          >
            <svg style={S} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </span>
          {!collapsed && (
            <span className="font-mono text-[11.5px] font-medium">Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );
}

// ── Mobile chrome (top bar + drawer) ────────────────────────────────────────────
// A hamburger top bar opens a slide-out drawer holding BOTH the product
// destinations (same three groups as desktop) and — when a page registers it —
// that page's contextual sub-nav (e.g. Blue Chat's recents / New chat).

function MobileTopBar() {
  const { setDrawerOpen, contextual } = useAppChrome();
  const pathname = usePathname();
  const { t } = useLang();
  const navId = navIdForPath(pathname);
  const title = contextual?.barTitle ?? (navId ? t(`nav.${navId}`) : "Blue Agent");

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
      <LanguageToggle />
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

function MobileDrawer({ toolCount }: { toolCount: number }) {
  const { drawerOpen, setDrawerOpen, contextual } = useAppChrome();
  const pathname = usePathname();
  const { t } = useLang();
  const clean = cleanPath(pathname);

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
            <img src="/logomark.svg" alt="" className="rounded-md" style={{ width: 22, height: 22 }} />
            <span
              className="font-mono text-[12px] font-bold"
              style={{ color: "#E2E8F0", letterSpacing: WORDMARK_TRACK }}
            >
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
          {/* New chat — primary action, prominent + easy to tap. */}
          {contextual?.newChat && (
            <div className="px-2 pt-1 pb-2">
              <button
                onClick={() => { contextual.newChat?.(); setDrawerOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl shadow-cta transition-colors active:scale-[0.99]"
                style={{ background: "#4FC3F7" }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#050508" strokeWidth={2.25}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-mono text-[13px] font-semibold text-[#050508]">New chat</span>
              </button>
            </div>
          )}

          {/* Contextual utilities + recents (chat sub-nav, etc.) */}
          {hasContextual && (
            <div className="px-2 pb-2 border-t border-[#13131f] pt-2">
              {contextual!.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { item.onSelect(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#ffffff06]"
                  style={{
                    borderRadius: ITEM_RADIUS,
                    ...(item.active ? { background: ACTIVE_BG, boxShadow: ACTIVE_RING } : null),
                  }}
                >
                  {item.icon && <span className="w-4 text-center shrink-0 text-sm leading-none">{item.icon}</span>}
                  <span className="font-mono text-[13px]" style={{ color: item.active ? "#4FC3F7" : "#cbd5e1" }}>
                    {item.label}
                  </span>
                </button>
              ))}

              {contextual!.recents && contextual!.recents.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 font-mono text-[9px] uppercase" style={{ color: META, letterSpacing: LABEL_TRACK }}>Recents</p>
                  {contextual!.recents.map((r) => (
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

          {/* Product groups — same three groups as desktop. */}
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="px-2 pt-1 border-t border-[#13131f] mt-1">
              <p className="px-3 pt-3 pb-1 font-mono text-[9px] uppercase" style={{ color: META, letterSpacing: LABEL_TRACK }}>
                {t(`nav.${group.id}`)}
              </p>
              {group.items.map((item) => {
                const active = clean === item.href || clean.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#ffffff06]"
                    style={{
                      borderRadius: ITEM_RADIUS,
                      ...(active ? { background: ACTIVE_BG, boxShadow: ACTIVE_RING } : null),
                    }}
                  >
                    <span className="relative shrink-0" style={{ color: active ? "#4FC3F7" : "#64748B" }}>
                      {item.icon}
                      {item.badge === "hood" && <HoodNavBadge />}
                    </span>
                    <span className="font-mono text-[13px] flex-1 min-w-0 truncate" style={{ color: active ? "#4FC3F7" : "#E2E8F0" }}>
                      {t(`nav.${item.id}`)}
                    </span>
                    {item.meta === "hubCount" && (
                      <span className="font-mono text-[10px] shrink-0 tabular-nums" style={{ color: META }}>
                        {toolCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Back to marketing */}
          <div className="px-2 pt-1 border-t border-[#13131f] mt-1">
            <a
              href="https://blueagent.dev"
              className="w-full flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#ffffff06] text-slate-500"
              style={{ borderRadius: ITEM_RADIUS }}
            >
              <span className="shrink-0">{IconHome}</span>
              <span className="font-mono text-[13px] flex-1 min-w-0">{t("nav.home")}</span>
              <span className="font-mono text-[10px] shrink-0" style={{ color: META }}>↗</span>
            </a>
          </div>
        </div>

        {/* Account — same control as the desktop sidebar foot. It closes the
            drawer via `onNavigate` rather than an enclosing onClick, because a
            wrapper would fire on the click that OPENS the dropdown and the menu
            could never be read at this breakpoint. */}
        <div className="border-t border-[#1A1A2E] shrink-0 px-2 py-2">
          <AccountMenu onNavigate={() => setDrawerOpen(false)} />
        </div>

        {/* Page-supplied footer (Blue Chat's credit chip). It doubles as the
            Settings opener, which is why no Settings row is registered — the
            chip is the single entry point at both breakpoints. Wrapping it
            closes the drawer so the modal is not left stacked over it. */}
        {contextual?.footer && (
          <div
            className="border-t border-[#1A1A2E] shrink-0 px-4 py-3"
            onClick={() => setDrawerOpen(false)}
          >
            {contextual.footer}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

// `toolCount` arrives from the SERVER layout (app/layout.tsx), which already
// imports TOOL_COUNT for its metadata. Passing the resolved number down keeps
// `@/lib/agent-tools` — 1958 lines, the whole Hub catalog — out of the client
// bundle of every /app page, while still letting the nav print a count that is
// derived rather than typed.
export default function AppShell({
  children,
  toolCount,
}: {
  children: React.ReactNode;
  toolCount: number;
}) {
  return (
    <AppChromeProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#050508]">
        <AppSideNav toolCount={toolCount} />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MobileTopBar />
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
        <MobileDrawer toolCount={toolCount} />
      </div>
    </AppChromeProvider>
  );
}
