"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { APIS } from "../marketplace/_data";
import { POSTS } from "../blog/_data";

interface Result {
  href:     string;
  title:    string;
  sub:      string;
  kind:     "API" | "Provider" | "Blog" | "Page";
  accent:   string;
}

const STATIC_PAGES: Result[] = [
  { href: "/marketplace", title: "Marketplace",       sub: "Discover registered APIs",                    kind: "Page", accent: "#4FC3F7" },
  { href: "/agents",      title: "For AI Agents",     sub: "Install Blue Hub MCP server",            kind: "Page", accent: "#A78BFA" },
  { href: "/x402",        title: "x402 Protocol",     sub: "Pay-per-call USDC standard",                  kind: "Page", accent: "#F59E0B" },
  { href: "/submit",      title: "Register API",      sub: "List your API in 5 minutes",                  kind: "Page", accent: "#34D399" },
  { href: "/dashboard",   title: "Dashboard",         sub: "Your registered APIs + revenue",              kind: "Page", accent: "#4FC3F7" },
  { href: "/staking",     title: "$BLUEAGENT Staking", sub: "Earn 10% of marketplace fees in USDC",       kind: "Page", accent: "#F59E0B" },
  { href: "/docs",        title: "Docs",              sub: "Quickstart, MCP, x402, REST API",             kind: "Page", accent: "#4FC3F7" },
  { href: "/blog",        title: "Blog",              sub: "Updates from the team",                       kind: "Page", accent: "#A78BFA" },
  { href: "/signin",      title: "Sign In",           sub: "Google · GitHub · email · wallet",            kind: "Page", accent: "#4FC3F7" },
  { href: "/signup",      title: "Sign Up",           sub: "Create your account · OAuth or wallet",       kind: "Page", accent: "#4FC3F7" },
  { href: "/terms",       title: "Terms of Service",  sub: "How Blue Agent works · provider obligations", kind: "Page", accent: "#475569" },
  { href: "/privacy",     title: "Privacy Policy",    sub: "What we collect, share, retain · your rights",kind: "Page", accent: "#475569" },
];

const PROVIDERS: Result[] = [
  { href: "/providers/blue-agent", title: "Blue Agent", sub: "Multi-agent orchestrator · 31 APIs", kind: "Provider", accent: "#4FC3F7" },
  { href: "/providers/aeon",       title: "Aeon",       sub: "Ecosystem signals (onboarding)",     kind: "Provider", accent: "#A78BFA" },
  { href: "/providers/miroshark",  title: "MiroShark",  sub: "Sentiment consensus (onboarding)",   kind: "Provider", accent: "#34D399" },
];

export default function SearchPalette() {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle on Cmd/Ctrl+K, close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) { setQuery(""); setActive(0); }
  }, [open]);

  // Search results
  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const apiResults: Result[] = APIS.filter(a => a.status === "live").map(a => ({
      href:   `/marketplace/${a.id}`,
      title:  a.name,
      sub:    `${a.provider} · ${a.price}/call · ${a.category}`,
      kind:   "API",
      accent: "#34D399",
    }));
    const blogResults: Result[] = POSTS.map(p => ({
      href:   `/blog/${p.slug}`,
      title:  p.title,
      sub:    `${p.tag.toLowerCase()} · ${p.read} · ${p.date}`,
      kind:   "Blog",
      accent: "#A78BFA",
    }));
    const all = [...apiResults, ...PROVIDERS, ...blogResults, ...STATIC_PAGES];
    if (!q) {
      return [...STATIC_PAGES, ...PROVIDERS, ...apiResults.slice(0, 8), ...blogResults.slice(0, 2)];
    }
    return all
      .filter(r => r.title.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query]);

  // Keyboard nav within list
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter")     {
        e.preventDefault();
        const hit = results[active];
        if (hit) {
          window.location.href = hit.href;
          setOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
         onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden shadow-2xl"
           onClick={e => e.stopPropagation()}>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1A1A2E]">
          <span className="font-mono text-base text-slate-500">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search APIs, providers, docs…"
            className="flex-1 bg-transparent font-mono text-sm text-white placeholder-slate-700 outline-none"
          />
          <kbd className="font-mono text-[9px] text-slate-700 border border-[#1A1A2E] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-xs text-slate-600">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((r, i) => (
              <Link key={`${r.href}-${i}`} href={r.href} onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-3 px-4 py-3 border-b border-[#1A1A2E] last:border-0 transition-colors ${
                  active === i ? "bg-white/[0.04]" : ""
                }`}>
                <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border tracking-widest shrink-0"
                      style={{ borderColor: `${r.accent}40`, color: r.accent, background: `${r.accent}10` }}>
                  {r.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-white truncate">{r.title}</p>
                  <p className="font-mono text-[10px] text-slate-600 truncate">{r.sub}</p>
                </div>
                <span className="font-mono text-[10px] text-slate-700 shrink-0">↵</span>
              </Link>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#1A1A2E] bg-[#0d0d12] flex items-center justify-between text-[10px] text-slate-600">
          <span className="font-mono">↑↓ navigate · ↵ open · ESC close</span>
          <span className="font-mono">{results.length} result{results.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
