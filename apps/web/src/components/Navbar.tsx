"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n/context";
import { useTheme } from "@/components/ThemeProvider";

// Sun (shown in dark mode → click to go light) / Moon (shown in light → go dark).
function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={"flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-[#1A1A2E] transition-all " + className}
    >
      {dark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07-1.42 1.42M6.34 17.66l-1.41 1.41m12.14 0-1.42-1.42M6.34 6.34 4.93 4.93" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21.75 15.5A9.75 9.75 0 0 1 8.5 2.25a.75.75 0 0 0-.98-.98A9.75 9.75 0 1 0 22.73 16.48a.75.75 0 0 0-.98-.98Z" />
        </svg>
      )}
    </button>
  );
}

// Product-forward marketing nav (landing-shaped like Halo/Dot): the bar is
// in-page section anchors that scroll the landing — How it works (§01 #flow),
// Models (§02 #models) and Pricing (§07 #pricing) — plus Docs, the one external
// route. Each hash link scrolls on "/" and navigates-then-scrolls from other
// routes; the target sections carry `scroll-mt-24` so the fixed bar never covers
// them. `hub` was dropped 2026-09-19 — the landing has no Hub section for a
// top-level link to scroll to (the Hub lives in the app shell + the CTA).
// `soul`/`about` stay dropped; their routes + i18n keys remain so nothing breaks.
// `physical` is a teaser for the desk bot running on the blueagent skill —
// no route yet, so it renders as a non-clickable "soon" item (not an <a>),
// which also keeps it out of the link-liveness check.
const NAV_LINKS: { key: string; href?: string; soon?: boolean }[] = [
  { key: "how",      href: "/#flow" },
  { key: "models",   href: "/#models" },
  { key: "pricing",  href: "/#pricing" },
  { key: "docs",     href: "/docs" },
  { key: "physical", soon: true },
];

function SoonBadge() {
  return (
    <span className="text-[9px] uppercase tracking-wider text-[#4FC3F7]/70 border border-[#4FC3F7]/25 rounded px-1 py-0.5">
      soon
    </span>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useLang();
  const isActive = (href: string) => pathname.startsWith(href);
  // Theme toggle only where it does anything — the landing is the only surface
  // that reads the light palette. Elsewhere the app shell is dark-only.
  const isHome = pathname === "/";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1A1A2E] bg-[#050508]/90 backdrop-blur-xl">
      <div className="relative flex items-center h-14 px-6 sm:px-10">

        {/* ── Logo ── */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 md:flex-1">
          <img src="/logomark.svg" alt="Blue Agent" className="h-6 w-6 rounded-md" />
          <span className="hidden sm:inline font-mono font-bold text-white tracking-widest text-[13px]">
            BLUE<span className="text-[#4FC3F7]">AGENT</span>
          </span>
        </Link>

        {/* ── Desktop nav — natural width, flanked by two flex-1 columns
             (logo + right actions) so it stays truly viewport-centered. ── */}
        <div className="hidden md:flex items-center justify-center gap-0.5 shrink-0">
          {NAV_LINKS.map((item) => {
            if (item.soon) {
              return (
                <span
                  key={item.key}
                  className="relative font-mono text-[13px] px-4 py-1.5 rounded-lg flex items-center gap-1.5 cursor-default"
                  style={{ color: "#64748b" }}
                >
                  {t(`nav_marketing.${item.key}`)}
                  <SoonBadge />
                </span>
              );
            }
            const active = isActive(item.href!);
            return (
              <Link
                key={item.href}
                href={item.href!}
                className="relative font-mono text-[13px] px-4 py-1.5 rounded-lg transition-all"
                style={active
                  ? { color: "#4FC3F7" }
                  : { color: "#64748b" }}
              >
                <span className="relative z-10 hover:text-slate-200 transition-colors">
                  {t(`nav_marketing.${item.key}`)}
                </span>
                {active && (
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "#4FC3F710", border: "1px solid #4FC3F720" }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Right actions ── */}
        <div className="hidden md:flex md:flex-1 items-center justify-end gap-3">
          {/* Light/dark toggle — landing only */}
          {isHome && <ThemeToggle />}

          {/* Language toggle — EN | 中文 (shared cookie syncs marketing + app) */}
          <LanguageToggle />

          {/* Divider */}
          <div className="w-px h-4 bg-[#1A1A2E]" />

          {/* CTA */}
          <Link
            href="/app/chat"
            className="font-mono text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-all hover:opacity-90 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #4FC3F7, #29ABE2)",
              color: "#050508",
              boxShadow: "0 0 16px #4FC3F730",
            }}
          >
            {t("nav_marketing.launch_app")}
          </Link>
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          className="md:hidden ml-auto text-slate-500 hover:text-white p-1.5 rounded-lg transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {open
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />}
          </svg>
        </button>
      </div>

      {/* ── Mobile menu ── */}
      {open && (
        <div className="md:hidden border-t border-[#1A1A2E] bg-[#050508] px-4 py-3">
          <div className="flex flex-col gap-0.5 mb-3">
            {NAV_LINKS.map((item) =>
              item.soon ? (
                <span
                  key={item.key}
                  className="font-mono text-sm px-4 py-2.5 rounded-lg flex items-center gap-2"
                  style={{ color: "#94a3b8" }}
                >
                  {t(`nav_marketing.${item.key}`)}
                  <SoonBadge />
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setOpen(false)}
                  className="font-mono text-sm px-4 py-2.5 rounded-lg transition-all"
                  style={isActive(item.href!)
                    ? { color: "#4FC3F7", background: "#4FC3F710" }
                    : { color: "#94a3b8" }}
                >
                  {t(`nav_marketing.${item.key}`)}
                </Link>
              )
            )}
          </div>
          <div className="border-t border-[#1A1A2E] pt-3 flex items-center justify-between px-1 mb-3">
            <div className="flex items-center gap-4">
              <a
                href="https://x.com/blueagent_"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-slate-600 hover:text-slate-400 transition-colors tracking-wider"
              >
                @blueagent_
              </a>
              <a
                href="https://github.com/madebyshun/blue-agent"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="text-slate-600 hover:text-slate-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.556 0-.274-.01-1.002-.015-1.967-3.196.695-3.87-1.54-3.87-1.54-.523-1.328-1.277-1.682-1.277-1.682-1.044-.714.08-.699.08-.699 1.155.081 1.763 1.186 1.763 1.186 1.026 1.758 2.693 1.25 3.35.956.103-.744.401-1.25.73-1.538-2.552-.29-5.235-1.276-5.235-5.68 0-1.255.448-2.28 1.184-3.084-.119-.29-.513-1.46.112-3.045 0 0 .966-.309 3.165 1.178a11 11 0 0 1 5.76 0c2.198-1.487 3.163-1.178 3.163-1.178.626 1.585.232 2.755.114 3.045.737.804 1.182 1.829 1.182 3.084 0 4.415-2.687 5.386-5.247 5.67.412.355.78 1.056.78 2.13 0 1.538-.014 2.777-.014 3.155 0 .308.207.667.79.554A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
                </svg>
              </a>
            </div>
            <Link
              href="/app/chat"
              onClick={() => setOpen(false)}
              className="font-mono text-[12px] font-semibold px-4 py-1.5 rounded-lg"
              style={{
                background: "linear-gradient(135deg, #4FC3F7, #29ABE2)",
                color: "#050508",
              }}
            >
              {t("nav_marketing.launch_app")}
            </Link>
          </div>
          {/* Language + theme toggle (mobile) */}
          <div className="flex justify-center items-center gap-2 pt-1">
            <LanguageToggle />
            {isHome && <ThemeToggle />}
          </div>
        </div>
      )}
    </nav>
  );
}
