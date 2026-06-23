"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

// ── Data ──────────────────────────────────────────────────────────────────────

const SURFACES = [
  {
    icon: "🖥️",
    name: "Founder Console",
    handle: "blueagent.dev",
    desc: "The AI-native workflow for Base builders. idea → build → audit → ship → raise. 78 tools. Pay per use in USDC via x402.",
    link: "/hub",
    linkLabel: "Open Hub →",
    color: "#A78BFA",
    stats: [{ label: "Tools", value: "78+" }, { label: "Commands", value: "5 core" }],
  },
  {
    icon: "⚡",
    name: "x402 API",
    handle: "api.blueagent.dev",
    desc: "78+ pay-per-use AI tools for agents and developers. Each tool costs fractions of a cent in USDC on Base. No subscriptions.",
    link: "https://api.blueagent.dev/docs",
    linkLabel: "View API →",
    color: "#F59E0B",
    stats: [{ label: "Endpoints", value: "78+" }, { label: "Cost", value: "USDC/call" }],
  },
];

const ROADMAP = [
  {
    period: "Mar–Jun 2026",
    status: "done",
    items: [
      { done: true, text: "$BLUEAGENT — Base, Uniswap v4, stake → credits + USDC yield" },
      { done: true, text: "Bankr integration — LLM + agent execution layer" },
      { done: true, text: "Blue Hub — 78 x402 tools, pay-per-call in USDC" },
      { done: true, text: "Blue Chat — multi-model AI, artifacts, public share links" },
      { done: true, text: "Blue Feed — live Base intelligence, hourly + daily" },
      { done: true, text: "Blue Bank — send, swap, yield, invoices, QR pay" },
      { done: true, text: "MCP Server — 81 tools, full x402 catalog parity" },
      { done: true, text: "Agent SDK — @blueagent/x402, agents pay + call tools onchain" },
      { done: true, text: "B20 — deploy from chat, plus tracker, check, analyze, launch" },
      { done: true, text: "x402 Builder Codes — every paid call attributed onchain" },
    ],
  },
  {
    period: "Q3 2026 — Marketplace",
    status: "building",
    items: [
      { done: false, text: "Builder Registry — submit your tool, earn 80% in USDC" },
      { done: false, text: "Tool discovery — search, rank by calls/revenue, verified badges" },
      { done: false, text: "B20 — mainnet deploy at Beryl, payment rails, issuer tracking" },
      { done: false, text: "Tool chains — compose multiple tools, one payment" },
      { done: false, text: "Feed track record — signal → outcome → win rate" },
      { done: false, text: "Real yield — 20% Hub fees auto-route to staking pool" },
      { done: false, text: "Distribution — listed on Smithery, MCP.SO, CDP Bazaar" },
      { done: false, text: "Blue Bank — scan-to-pay USDC, pay links, B20 holdings + PnL" },
    ],
  },
  {
    period: "Q4 2026 — Network",
    status: "planned",
    items: [
      { done: false, text: "Public API — api.blueagent.dev, the Stripe of AI tools on Base" },
      { done: false, text: "Cross-agent routing — best agent + tool per intent" },
      { done: false, text: "Agent registry — directory of active buyer agents" },
      { done: false, text: "Tool creator rewards — top tools earn weekly" },
      { done: false, text: "Cobalt-ready — gas in B20, account abstraction support" },
    ],
  },
];

const STATS = [
  { value: "78+",    label: "AI Tools",       color: "#4FC3F7" },
  { value: "78+",    label: "API Endpoints",  color: "#A78BFA" },
  { value: "Base",   label: "Network",        color: "#2563EB" },
  { value: "x402",   label: "Payment rail",   color: "#F59E0B" },
];

// ── Components ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 mb-6">
      <div className="h-px w-8 bg-[#4FC3F740]" />
      <span className="font-mono text-[11px] text-[#4FC3F7] tracking-[0.2em] uppercase">{children}</span>
      <div className="h-px w-8 bg-[#4FC3F740]" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />

      {/* ── Ambient glow ── */}
      <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
        <div style={{ background: "radial-gradient(ellipse 70% 40% at 50% -5%, #4FC3F714 0%, transparent 70%)" }} className="absolute inset-0" />
      </div>

      <div className="relative">

        {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 pt-32 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4FC3F730] bg-[#4FC3F708] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">BUILT ON BASE</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            AI agent layer<br />
            <span className="text-[#4FC3F7]">built for Base builders</span>
          </h1>

          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
            Not a generic AI assistant. Not a Telegram bot with a GPT wrapper.
            A full economic actor — holds a wallet, executes onchain, earns and distributes tokens,
            and powers a growing ecosystem of tools on Base.
          </p>

          {/* Stats row */}
          <div className="inline-grid grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] mb-12">
            {STATS.map((s) => (
              <div key={s.label} className="bg-[#0d0d12] px-8 py-5 text-center">
                <div className="font-mono text-2xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono text-[10px] text-slate-600 tracking-widest">{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link href="/app/chat"
              className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
              Launch App →
            </Link>
            <Link href="/hub"
              className="px-6 py-3 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
              Explore Hub
            </Link>
          </div>
        </section>

        {/* ══ STORY ════════════════════════════════════════════════════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-12">
            <SectionLabel>Our Story</SectionLabel>
            <h2 className="text-3xl font-bold">Why Blue Agent exists</h2>
          </div>

          <div className="space-y-6 text-slate-400 leading-relaxed text-base">
            <p>
              Blue Agent started as a simple idea: Base has the best infrastructure for onchain apps,
              but building on Base still requires too much context, too many tools, and too much friction.
              Founders were losing weeks to research that should take hours.
            </p>
            <p>
              We built the five core commands — <span className="text-white font-mono text-sm">idea · build · audit · ship · raise</span> — to compress that workflow.
              Each command is grounded in 34+ skill files covering Base-native patterns, verified addresses,
              security checks, and ecosystem knowledge. No hallucinated addresses. No generic advice.
            </p>
            <p>
              Then we added tools. Then a chat interface. Then staking. Then an API. Each piece emerged
              from what Base builders actually needed — not from a product roadmap decided in a boardroom.
            </p>
            <p className="text-slate-300">
              Today Blue Agent is the flagship AI agent of the Base ecosystem — 78 tools live,
              $BLUEAGENT token on Uniswap v4, x402 micropayments powering every API call,
              and a staking model that turns holding into earning.
            </p>
          </div>
        </section>

        {/* ══ THREE SURFACES ═══════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Two Surfaces</SectionLabel>
            <h2 className="text-3xl font-bold">One agent, two ways to access</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SURFACES.map((s) => (
              <div key={s.name}
                className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 flex flex-col"
                style={{ boxShadow: `0 0 40px ${s.color}06` }}>

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${s.color}12`, border: `1px solid ${s.color}25` }}>
                    {s.icon}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{s.name}</div>
                    <div className="font-mono text-[10px]" style={{ color: s.color }}>{s.handle}</div>
                  </div>
                </div>

                <p className="text-slate-500 text-sm leading-relaxed flex-1 mb-5">{s.desc}</p>

                <div className="flex gap-3 mb-5">
                  {s.stats.map(st => (
                    <div key={st.label} className="flex-1 rounded-lg bg-[#0a0a0f] border border-[#1A1A2E] px-3 py-2 text-center">
                      <div className="font-mono text-sm font-bold text-white">{st.value}</div>
                      <div className="font-mono text-[9px] text-slate-600 mt-0.5">{st.label.toUpperCase()}</div>
                    </div>
                  ))}
                </div>

                <Link href={s.link}
                  className="font-mono text-xs font-bold transition-all hover:opacity-80 text-center py-2.5 rounded-xl border"
                  style={{ color: s.color, borderColor: `${s.color}30`, background: `${s.color}08` }}>
                  {s.linkLabel}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ══ TOKEN ════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>The Token</SectionLabel>
            <h2 className="text-3xl font-bold">$BLUEAGENT on Base</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Token info */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
              <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-5">TOKEN DETAILS</div>

              <div className="space-y-3">
                {[
                  { label: "Name",       value: "$BLUEAGENT",                                                    color: "#4FC3F7" },
                  { label: "Network",    value: "Base mainnet",                                                  color: "#2563EB" },
                  { label: "DEX",        value: "Uniswap v4",                                                    color: "#FF007A" },
                  { label: "Contract",   value: "0xf895...6ba3",                                                 color: "#94a3b8", mono: true },
                  { label: "Treasury",   value: "0xf31f...ffe5",                                                 color: "#94a3b8", mono: true },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2 border-b border-[#1A1A2E] last:border-0">
                    <span className="font-mono text-[11px] text-slate-600">{r.label}</span>
                    <span className={`font-${r.mono ? "mono" : "semibold"} text-sm`} style={{ color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <a href="https://basescan.org/token/0xf895783b2931c919955e18b5e3343e7c7c456ba3"
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl font-mono text-xs text-center border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
                  Basescan ↗
                </a>
                <a href="https://app.uniswap.org"
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl font-mono text-xs font-bold text-center transition-all hover:opacity-90"
                  style={{ background: "#FF007A15", color: "#FF007A", border: "1px solid #FF007A30" }}>
                  Buy on Uniswap →
                </a>
              </div>
            </div>

            {/* Staking flywheel */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
              <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-5">TOKEN UTILITY</div>

              <div className="space-y-3 mb-6">
                {[
                  { step: "01", icon: "💎", title: "Hold $BLUEAGENT", desc: "500K → Starter · 2M → Pro · 10M → Max tier" },
                  { step: "02", icon: "⚡", title: "Earn credits daily", desc: "Credits accrue on-chain every second you hold" },
                  { step: "03", icon: "🛠️", title: "Use Blue Chat tools", desc: "AI tools, 3-agent consensus, deep research" },
                  { step: "04", icon: "💵", title: "Earn USDC yield", desc: "Earn real USDC yield, claimed onchain" },
                ].map(item => (
                  <div key={item.step} className="flex gap-4 p-3 rounded-xl bg-[#0a0a0f] border border-[#1A1A2E]">
                    <div className="font-mono text-[10px] text-slate-700 mt-0.5 w-4 shrink-0">{item.step}</div>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div>
                      <div className="font-semibold text-sm text-white mb-0.5">{item.title}</div>
                      <div className="font-mono text-[11px] text-slate-600">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Link href="/app/rewards"
                className="block w-full py-3 rounded-xl font-mono text-sm font-bold text-center transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 20px #4FC3F725" }}>
                ⚡ Stake & Earn →
              </Link>
            </div>
          </div>
        </section>

        {/* ══ ROADMAP ═══════════════════════════════════════════════════════════ */}
        <section className="max-w-3xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Roadmap</SectionLabel>
            <h2 className="text-3xl font-bold">Where we&apos;ve been, where we&apos;re going</h2>
          </div>

          <div className="space-y-8">
            {ROADMAP.map((era) => {
              const statusColor = era.status === "done" ? "#22C55E" : era.status === "building" ? "#4FC3F7" : "#475569";
              const statusLabel = era.status === "done" ? "DONE" : era.status === "building" ? "BUILDING" : "PLANNED";
              return (
                <div key={era.period} className="flex gap-6">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: statusColor, boxShadow: era.status !== "planned" ? `0 0 8px ${statusColor}` : "none" }} />
                    <div className="w-px flex-1 mt-2" style={{ background: `${statusColor}30` }} />
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-bold text-white">{era.period}</span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded tracking-widest"
                        style={{ color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {era.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="text-sm mt-0.5">{item.done ? "✅" : era.status === "building" ? "🔄" : "📋"}</span>
                          <span className={`text-sm leading-relaxed ${item.done ? "text-slate-400" : era.status === "building" ? "text-white" : "text-slate-600"}`}>
                            {item.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ══ TEAM ═════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Team</SectionLabel>
            <h2 className="text-3xl font-bold">Built by Blocky Studio</h2>
          </div>

          <div className="max-w-md mx-auto">
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-8 text-center">
              {/* Avatar placeholder */}
              <div className="w-20 h-20 rounded-2xl bg-[#4FC3F710] border border-[#4FC3F730] flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">🤖</span>
              </div>
              <div className="font-bold text-xl text-white mb-1">Shun</div>
              <div className="font-mono text-sm text-[#4FC3F7] mb-3">@madebyshun · Blocky Studio</div>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Base builder. Building AI-native tools for founders who ship.
                $BLUEAGENT is the flagship product of Blocky Studio.
              </p>
              <div className="flex gap-3 justify-center">
                <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1A1A2E] font-mono text-xs text-slate-400 hover:text-white hover:border-[#2a2a3e] transition-all">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @blueagent_
                </a>
                <a href="https://bankr.bot/agent/blue-agent" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1A1A2E] font-mono text-xs text-slate-400 hover:text-white hover:border-[#2a2a3e] transition-all">
                  🤖 Bankr profile
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ══ COMMUNITY ════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-12">
            <SectionLabel>Community</SectionLabel>
            <h2 className="text-3xl font-bold mb-4">Join the ecosystem</h2>
            <p className="text-slate-500 text-sm">Base builders, $BLUEAGENT holders, and AI agent developers.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              {
                icon: "𝕏",
                name: "X / Twitter",
                desc: "Daily updates, Base ecosystem news, tool launches",
                href: "https://x.com/blueagent_",
                label: "@blueagent_",
                color: "#ffffff",
              },
              {
                icon: "🤖",
                name: "Bankr",
                desc: "Agent profile, token data, community ranking",
                href: "https://bankr.bot/agent/blue-agent",
                label: "bankr.bot/agent/blue-agent",
                color: "#A78BFA",
              },
            ].map((c) => (
              <a key={c.name} href={c.href} target="_blank" rel="noopener noreferrer"
                className="group rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 flex flex-col gap-3 hover:border-[#2a2a3e] transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: `${c.color}12`, border: `1px solid ${c.color}20` }}>
                    {c.icon}
                  </div>
                  <div className="font-bold text-white">{c.name}</div>
                </div>
                <p className="text-slate-500 text-sm leading-relaxed flex-1">{c.desc}</p>
                <div className="font-mono text-[10px] group-hover:text-[#4FC3F7] transition-colors" style={{ color: c.color }}>
                  {c.label} ↗
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ══ CTA ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="rounded-2xl border border-[#4FC3F720] bg-[#4FC3F705] p-12 text-center"
            style={{ boxShadow: "0 0 60px #4FC3F708" }}>
            <h2 className="text-3xl font-bold mb-4">Ready to build on Base?</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              64 AI tools. 5 core commands. Stake to earn. All on Base.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/app/chat"
                className="px-8 py-3.5 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
                Launch App →
              </Link>
              <Link href="/hub"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
                Explore Hub
              </Link>
              <Link href="/app/rewards"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#4FC3F730] text-[#4FC3F7] hover:bg-[#4FC3F710] transition-all">
                ⚡ Stake BLUE
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
