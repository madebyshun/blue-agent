"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Data ────────────────────────────────────────────────────────────────────

const COMMANDS_DATA = [
  { tag: "idea",  cmd: "blue idea",  price: "$0.05", desc: "Turn rough concept → fundable brief", detail: "Problem · Why Now · Why Base · MVP · Risks · 24h Plan" },
  { tag: "build", cmd: "blue build", price: "$0.50", desc: "Architecture, stack, folder structure, integrations, test plan", detail: "No hallucinated addresses. Verified Base patterns only." },
  { tag: "audit", cmd: "blue audit", price: "$1.00", desc: "500+ security checks · 13 categories · Base-native", detail: "Reentrancy · Oracle · MEV · x402 · Coinbase Smart Wallet" },
  { tag: "ship",  cmd: "blue ship",  price: "$0.10", desc: "Deployment checklist · Verification · Release notes · Monitoring", detail: "Everything you forget when excited to launch." },
  { tag: "raise", cmd: "blue raise", price: "$0.20", desc: "Fundraising narrative · Investor deck · Competitive landscape", detail: "Smart money map for Base ecosystem." },
];

const HUB_CATEGORIES = [
  { label: "Intelligence",   color: "#4FC3F7", count: 6  },
  { label: "Builder",        color: "#A78BFA", count: 13 },
  { label: "Trading",        color: "#34D399", count: 3  },
  { label: "Content",        color: "#FB923C", count: 3  },
  { label: "Agent Economy",  color: "#F472B6", count: 3  },
  { label: "Base Ecosystem", color: "#60A5FA", count: 3  },
  { label: "On-chain",       color: "#FBBF24", count: 3  },
];

const SKILLS_GROUPS = [
  { group: "Core",            color: "#4FC3F7", count: 7  },
  { group: "Security",        color: "#f87171", count: 7  },
  { group: "DeFi",            color: "#34d399", count: 7  },
  { group: "Accounts",        color: "#a78bfa", count: 4  },
  { group: "Payments",        color: "#fbbf24", count: 2  },
  { group: "Distribution",    color: "#fb923c", count: 3  },
  { group: "Infrastructure",  color: "#94a3b8", count: 4  },
];

const ECOSYSTEM_PKGS = [
  { pkg: "@blueagent/cli",        badge: "TUI",      color: "#4FC3F7", desc: "Terminal UI — interactive menu, 31+ tools" },
  { pkg: "@blueagent/core",       badge: "Runtime",  color: "#A78BFA", desc: "Grounded LLM · skill registry · schemas" },
  { pkg: "@blueagent/skill",      badge: "MCP",      color: "#34D399", desc: "MCP server for Claude Code · Cursor · Claude Desktop" },
  { pkg: "@blueagent/sdk",        badge: "SDK",      color: "#60A5FA", desc: "Unified programmatic API" },
  { pkg: "@blueagent/agentkit",   badge: "AgentKit", color: "#F472B6", desc: "Coinbase AgentKit plugin — 32 x402 tools" },
  { pkg: "@blueagent/x402-guard", badge: "Security", color: "#FBBF24", desc: "x402 payment validation middleware" },
];

// ─── Section label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 mb-6">
      <div className="h-px w-8 bg-[#4FC3F740]" />
      <span className="font-mono text-[11px] text-[#4FC3F7] tracking-[0.2em] uppercase">{children}</span>
      <div className="h-px w-8 bg-[#4FC3F740]" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [openCmd, setOpenCmd] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono">
      <Navbar />

      {/* ── Ambient glow ── */}
      <div className="fixed inset-x-0 top-0 h-[700px] pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #4FC3F718 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative">

        {/* ══════════════════════════════════════════
            HERO
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 pt-36 pb-24 text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="text-[10px] text-[#4FC3F7] tracking-[0.2em]">BUILT ON BASE · POWERED BY BANKR LLM</span>
          </div>

          {/* Headline */}
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-none mb-6">
            BLUE<span className="text-[#4FC3F7]">AGENT</span>
          </h1>
          <p className="text-xl text-slate-400 mb-3 max-w-xl mx-auto leading-relaxed">
            The AI founder console for Base builders.
          </p>
          <p className="text-sm text-slate-600 mb-12 max-w-md mx-auto leading-relaxed">
            Idea → build → audit → ship → raise.<br />
            Grounded in real Base knowledge. No hallucinations.
          </p>

          {/* Install */}
          <div className="flex items-center justify-center gap-2 bg-[#0D0D14] border border-[#1A1A2E] rounded-xl px-5 py-3 mb-2 max-w-lg mx-auto">
            <span className="text-xs text-slate-600 shrink-0">$</span>
            <span className="text-sm text-[#4FC3F7] truncate">curl -fsSL https://blueagent.dev/setup.sh | bash</span>
          </div>
          <p className="text-[10px] text-slate-700 mb-10">
            installs <span className="text-slate-500">blueagent</span> (TUI) + <span className="text-slate-500">blue</span> (CLI) · Node ≥ 18
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap justify-center gap-3 mb-20">
            <Link
              href="/app/chat"
              className="text-sm font-semibold px-6 py-2.5 rounded-lg transition-all hover:opacity-90 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #4FC3F7, #29ABE2)",
                color: "#050508",
                boxShadow: "0 0 20px #4FC3F730",
              }}
            >
              Launch App →
            </Link>
            <Link href="/hub"
              className="text-sm text-[#4FC3F7] border border-[#4FC3F7]/30 px-6 py-2.5 rounded-lg hover:bg-[#4FC3F7]/5 transition-all">
              Explore Hub →
            </Link>
            <Link href="/docs"
              className="text-sm text-slate-500 border border-[#1A1A2E] px-6 py-2.5 rounded-lg hover:text-white hover:border-[#4FC3F7]/30 transition-all">
              Read Docs →
            </Link>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { n: "5", label: "Core commands", sub: "idea · build · audit · ship · raise" },
              { n: "41", label: "Skill files", sub: "grounded · verified · Base-native" },
              { n: "50+", label: "Hub tools", sub: "3-agent collab · pay per use" },
              { n: "9", label: "npm packages", sub: "CLI · MCP · SDK · AgentKit" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 text-center">
                <div className="text-3xl font-bold text-[#4FC3F7] mb-1">{s.n}</div>
                <div className="text-xs text-white mb-1">{s.label}</div>
                <div className="text-[10px] text-slate-600">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            COMMANDS
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <SectionLabel>5 Core Commands</SectionLabel>
          <h2 className="text-3xl font-bold mb-3">
            Build <span className="text-[#4FC3F7]">on Base</span> faster
          </h2>
          <p className="text-slate-500 text-sm mb-12 max-w-lg">
            Five commands that cover the entire founder journey. Pay per use. No subscriptions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-10">
            {COMMANDS_DATA.map((c) => (
              <button
                key={c.tag}
                onClick={() => setOpenCmd(openCmd === c.tag ? null : c.tag)}
                className="text-left rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 flex flex-col gap-3 hover:border-[#4FC3F7]/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#4FC3F7] tracking-widest">&lt;{c.tag}&gt;</span>
                  <span className="text-[10px] text-slate-600 border border-[#1A1A2E] px-1.5 py-0.5 rounded">{c.price}</span>
                </div>
                <div className="text-sm text-white font-semibold">{c.cmd}</div>
                <p className="text-xs text-slate-400 leading-relaxed flex-1">{c.desc}</p>
                {openCmd === c.tag && (
                  <p className="text-[10px] text-slate-600 border-t border-[#1A1A2E] pt-3">{c.detail}</p>
                )}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-[10px] text-slate-600 tracking-widest">QUICK START</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-700">$</span>
              <span className="text-sm text-[#4FC3F7]">npm install -g @blueagent/cli</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-700">$</span>
              <span className="text-sm text-[#4FC3F7]">blue init</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-700">$</span>
              <span className="text-sm text-white">blue idea <span className="text-slate-600">"my Base project"</span></span>
            </div>
            <Link href="/docs" className="ml-auto text-[10px] text-[#4FC3F7] hover:underline">
              Full docs →
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            BLUE HUB
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <SectionLabel>Blue Hub</SectionLabel>
          <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold mb-3">
                34 collab tools · <span className="text-[#A78BFA]">3 agents</span>
              </h2>
              <p className="text-slate-500 text-sm max-w-lg">
                Blue Agent · Aeon · MiroShark working together. Pay per use via x402 micropayments.
              </p>
            </div>
            <Link
              href="/hub"
              className="text-sm font-semibold px-5 py-2 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/5 transition-all shrink-0"
            >
              Explore Hub →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {HUB_CATEGORIES.map((cat) => (
              <div
                key={cat.label}
                className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5"
              >
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-semibold" style={{ color: cat.color }}>{cat.label}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                    style={{ color: cat.color, background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}
                  >
                    {cat.count}
                  </span>
                </div>
                <div className="h-px w-full mt-2" style={{ background: `${cat.color}20` }} />
              </div>
            ))}
          </div>

          {/* Agent collaborators */}
          <div className="flex flex-wrap gap-3">
            {[
              { name: "Blue Agent", color: "#4FC3F7", role: "Founder intelligence · commands · x402 APIs" },
              { name: "Aeon",       color: "#34D399", role: "Market signals · token picks · narrative tracking" },
              { name: "MiroShark",  color: "#A78BFA", role: "DeFi strategy · portfolio · yield optimization" },
            ].map((a) => (
              <div
                key={a.name}
                className="flex-1 min-w-[200px] rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color, boxShadow: `0 0 6px ${a.color}` }} />
                  <span className="text-sm font-semibold" style={{ color: a.color }}>{a.name}</span>
                </div>
                <p className="text-[10px] text-slate-600">{a.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            SKILLS / GROUNDING
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <SectionLabel>Grounding</SectionLabel>
          <h2 className="text-3xl font-bold mb-3">
            34 skill files · <span className="text-[#34D399]">zero hallucinations</span>
          </h2>
          <p className="text-slate-500 text-sm mb-12 max-w-lg">
            Every command loads verified Base knowledge before it generates a single token. No guessing. No invented addresses.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {SKILLS_GROUPS.map((g) => (
              <div
                key={g.group}
                className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm font-semibold" style={{ color: g.color }}>{g.group}</span>
                  <span className="text-[10px] text-slate-700">{g.count} files</span>
                </div>
                <div className="h-px w-full mt-2" style={{ background: `${g.color}20` }} />
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-xs text-white mb-1">Install all 34 skills</p>
              <div className="flex items-center gap-2">
                <span className="text-slate-700">$</span>
                <span className="text-sm text-[#4FC3F7]">blue init</span>
              </div>
            </div>
            <div className="w-px h-8 bg-[#1A1A2E] hidden sm:block" />
            <div>
              <p className="text-[10px] text-slate-600 mb-1">Covers</p>
              <div className="flex flex-wrap gap-1.5">
                {["Base contracts", "ERC standards", "DeFi patterns", "Security checks", "x402 flows"].map((t) => (
                  <span key={t} className="text-[10px] text-slate-500 border border-[#1A1A2E] px-2 py-0.5 rounded">{t}</span>
                ))}
              </div>
            </div>
            <Link href="/skills" className="ml-auto text-[10px] text-[#4FC3F7] hover:underline shrink-0">
              View all skills →
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            ECOSYSTEM PACKAGES
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <SectionLabel>Ecosystem</SectionLabel>
          <h2 className="text-3xl font-bold mb-3">
            9 npm packages · <span className="text-[#A78BFA]">plug into any stack</span>
          </h2>
          <p className="text-slate-500 text-sm mb-12 max-w-lg">
            From the CLI you install to the SDK you embed — Blue Agent fits wherever you build.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ECOSYSTEM_PKGS.map((p) => (
              <div
                key={p.pkg}
                className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-sm font-semibold text-white break-all">{p.pkg}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: p.color, background: `${p.color}15`, border: `1px solid ${p.color}30` }}
                  >
                    {p.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{p.desc}</p>
                <div className="mt-3 pt-3 border-t border-[#1A1A2E] flex items-center gap-2">
                  <span className="text-slate-700 text-xs">$</span>
                  <span className="text-xs text-slate-600">npm install {p.pkg}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CTA
        ══════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div
            className="rounded-2xl border border-[#4FC3F7]/20 p-12 text-center"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, #4FC3F710 0%, transparent 70%)" }}
          >
            <SectionLabel>Start building</SectionLabel>
            <h2 className="text-4xl font-bold mb-4">
              Your next Base project<br />starts <span className="text-[#4FC3F7]">here</span>
            </h2>
            <p className="text-slate-400 text-sm mb-10 max-w-md mx-auto">
              5 commands. 34 skills. 34 hub tools. Everything you need to go from idea to deployed on Base.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/app/chat"
                className="font-semibold px-8 py-3 rounded-lg transition-all hover:opacity-90 active:scale-95 text-sm"
                style={{
                  background: "linear-gradient(135deg, #4FC3F7, #29ABE2)",
                  color: "#050508",
                  boxShadow: "0 0 24px #4FC3F730",
                }}
              >
                Open Blue Chat →
              </Link>
              <Link href="/hub"
                className="text-sm text-[#4FC3F7] border border-[#4FC3F7]/30 px-8 py-3 rounded-lg hover:bg-[#4FC3F7]/5 transition-all">
                Explore Hub →
              </Link>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════ */}
        <footer className="border-t border-[#1A1A2E] px-6 py-8 max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logomark.svg" alt="Blue Agent" className="h-5 w-5 rounded-md" />
            <span className="font-mono text-xs font-bold text-white tracking-widest">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </div>
          <div className="flex items-center gap-5 font-mono text-xs text-slate-700">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X / Twitter</a>
            <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram</a>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[10px] text-slate-700">$BLUEAGENT · Base</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
