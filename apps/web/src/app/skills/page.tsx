"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

// ─── Data ─────────────────────────────────────────────────────────────────────

const SOUL_SECTIONS = [
  {
    id: "identity",
    label: "Identity",
    sub: "Who Blue Agent is",
    content: [
      { k: "name",    v: "Blue Agent" },
      { k: "role",    v: "AI founder agent for Base builders" },
      { k: "chain",   v: "Base (chain ID 8453) — exclusively" },
      { k: "built by",v: "Blocky Studio — @madebyshun" },
      { k: "token",   v: "$BLUEAGENT · 0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
    ],
  },
  {
    id: "values",
    label: "Core Values",
    sub: "5 principles",
    content: [
      { k: "01", v: "Ship over talk — always push toward action. Concrete > abstract." },
      { k: "02", v: "Base-native by default — every answer written for Base, not mainnet." },
      { k: "03", v: "Honest over comfortable — give the real answer, not the soft one." },
      { k: "04", v: "Builder-first — assume the user knows what they're doing." },
      { k: "05", v: "Composable — prefer open standards and Bankr / x402 / Base tooling." },
    ],
  },
  {
    id: "tone",
    label: "Communication",
    sub: "Tone + phrases",
    content: [
      { k: "says",       v: "\"Here's what I'd do…\" · \"The real risk here is…\" · \"Skip X. Do Y instead.\"" },
      { k: "never says", v: "\"Certainly!\" · \"Great question!\" · \"Happy to help!\" · \"As an AI language model…\"" },
      { k: "style",      v: "Sharp, direct, opinionated. Concise — leads with the answer, not the context." },
    ],
  },
  {
    id: "decisions",
    label: "Decision Rules",
    sub: "How Blue Agent chooses",
    content: [
      { k: "uncertain",  v: "Pick the option that ships faster → more Base-native → less attack surface" },
      { k: "chains",     v: "Answer for Base first. Never suggest Ethereum mainnet as the default path." },
      { k: "addresses",  v: "Only provide verified addresses from skills/base-addresses.md. Never guess." },
    ],
  },
  {
    id: "limits",
    label: "Hard Limits",
    sub: "What Blue Agent won't do",
    content: [
      { k: "✕", v: "Never invent contract addresses" },
      { k: "✕", v: "Never suggest Ethereum mainnet over Base" },
      { k: "✕", v: "Never call OpenAI / Anthropic directly — use Bankr LLM (llm.bankr.bot)" },
      { k: "✕", v: "Never give investment advice or price predictions" },
      { k: "✕", v: "Never claim to execute transactions — user signs all onchain actions" },
    ],
  },
];

const AEON_SKILLS = [
  {
    id: "token-movers",
    name: "aeon-token-movers",
    label: "Token Movers",
    color: "#34d399",
    icon: "📈",
    desc: "Top movers, losers, and trending coins from CoinGecko with pump-risk flags — low liquidity, fresh listing, volume-no-mcap, cex-only. No API key required.",
    triggers: ["top movers today", "what's pumping", "biggest losers 24h", "trending coins"],
    requires: "None — public CoinGecko API",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-token-movers.md",
    raw:    "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-token-movers.md",
  },
  {
    id: "token-pick",
    name: "aeon-token-pick",
    label: "Token Pick",
    color: "#fbbf24",
    icon: "🎯",
    desc: "One token recommendation per run with falsifiable thesis, entry, sizing, and kill criterion. Fires NO_PICK when no candidate has a named/dated catalyst — discipline is the skip branch.",
    triggers: ["give me a token pick", "what should I trade today", "is there an asymmetric setup"],
    requires: "None — skip branch is a valid output",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-token-pick.md",
    raw:    "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-token-pick.md",
  },
  {
    id: "narrative-tracker",
    name: "aeon-narrative-tracker",
    label: "Narrative Tracker",
    color: "#4FC3F7",
    icon: "🧭",
    desc: "Daily narrative map — mindshare score (1-5), velocity arrow (↑↑ ↑ → ↓ ↓↓), phase label (Emerging / Rising / Peak / Fading), named drivers, and position calls: FRONT-RUN / RIDE / FADE / WATCH / IGNORE.",
    triggers: ["what's running on CT", "narrative positions today", "is X peaking"],
    requires: "Optional: XAI_API_KEY for deeper signal threads",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-narrative-tracker.md",
    raw:    "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-narrative-tracker.md",
  },
  {
    id: "deep-research",
    name: "aeon-deep-research",
    label: "Deep Research",
    color: "#a78bfa",
    icon: "🔬",
    desc: "Exhaustive multi-source research with attributed claims and adversarial counterpoint. Claims tagged by source class — primary / expert / secondary / market signal — with confidence scores.",
    triggers: ["deep research X", "DD on Y", "build me a memo on Z", "contrarian take on X"],
    requires: "None — uses web search",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-deep-research.md",
    raw:    "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-deep-research.md",
  },
  {
    id: "distribute-tokens",
    name: "aeon-distribute-tokens",
    label: "Distribute Tokens",
    color: "#fb923c",
    icon: "💸",
    desc: "Batch token payouts via Bankr Wallet API with per-recipient idempotency, two-phase resolve→execute, dry-run preview, and recovery from partial runs. Re-runs on same UTC day skip completed rows.",
    triggers: ["distribute tokens", "pay contributors", "weekly payout", "send USDC to this list"],
    requires: "BANKR_API_KEY with Wallet write scope",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-distribute-tokens.md",
    raw:    "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-distribute-tokens.md",
  },
];

type Section = "soul" | "token-movers" | "token-pick" | "narrative-tracker" | "deep-research" | "distribute-tokens";

const SIDEBAR_NAV: { key: Section; label: string; sub: string }[] = [
  { key: "soul",              label: "SOUL.md",          sub: "Agent personality config" },
  { key: "token-movers",      label: "Token Movers",      sub: "CoinGecko · pump-risk flags" },
  { key: "token-pick",        label: "Token Pick",        sub: "Falsifiable thesis · kill criterion" },
  { key: "narrative-tracker", label: "Narrative Tracker", sub: "Mindshare · velocity · position" },
  { key: "deep-research",     label: "Deep Research",     sub: "Multi-source · attributed claims" },
  { key: "distribute-tokens", label: "Distribute Tokens", sub: "Batch payouts · idempotent" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="font-mono text-[10px] px-2 py-1 rounded border border-[#1A1A2E] text-slate-600 hover:text-white hover:border-slate-600 transition-all"
    >
      {copied ? "✓ copied" : label}
    </button>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function SoulSection() {
  const [open, setOpen] = useState<string | null>("identity");
  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E]">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <h2 className="font-mono text-sm font-bold text-white">
            SOUL<span className="text-[#4FC3F7]">.md</span>
          </h2>
          <span className="font-mono text-[10px] text-slate-600">Personality config · Who Blue Agent is · how it thinks · forkable</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#4FC3F7]/30 text-[#4FC3F7] rounded">FORKABLE</span>
          <a href="https://github.com/madebyshun/blue-agent/blob/main/SOUL.md"
            target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors">
            GitHub →
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 lg:px-10 py-8 w-full">
        {/* File header */}
        <div className="card-surface rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              </div>
              <span className="font-mono text-xs text-slate-400">SOUL.md</span>
              <span className="font-mono text-[10px] text-slate-700 border border-[#1A1A2E] px-1.5 py-0.5 rounded">v0.1.0</span>
            </div>
            <div className="flex items-center gap-2">
              <CopyBtn text="https://raw.githubusercontent.com/madebyshun/blue-agent/main/SOUL.md" label="Copy raw URL" />
              <a href="https://github.com/madebyshun/blue-agent/blob/main/SOUL.md"
                target="_blank" rel="noopener noreferrer"
                className="font-mono text-[10px] px-2 py-1 rounded border border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/5 transition-all">
                Fork on GitHub →
              </a>
            </div>
          </div>

          {/* Accordion */}
          {SOUL_SECTIONS.map((sec) => (
            <div key={sec.id} className="border-b border-[#1A1A2E] last:border-b-0">
              <button
                onClick={() => setOpen(open === sec.id ? null : sec.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#0D0D14]/60 transition-colors group"
              >
                <div className="text-left">
                  <span className="font-mono text-xs text-white group-hover:text-[#4FC3F7] transition-colors">
                    ## {sec.label}
                  </span>
                  <span className="font-mono text-[10px] text-slate-700 ml-3">{sec.sub}</span>
                </div>
                <svg className={`w-3.5 h-3.5 text-slate-700 transition-transform shrink-0 ${open === sec.id ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {open === sec.id && (
                <div className="px-5 pb-4 pt-1 space-y-2">
                  {sec.content.map((row) => (
                    <div key={row.k} className="flex gap-3 items-baseline">
                      <span className={`font-mono text-[10px] shrink-0 w-20 ${row.k === "✕" ? "text-red-500" : "text-slate-600"}`}>
                        {row.k}
                      </span>
                      <span className="font-mono text-xs text-slate-300 leading-relaxed">{row.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Fork callout */}
        <div className="card-surface rounded-lg p-4 flex items-start gap-3">
          <span className="font-mono text-[10px] text-[#4FC3F7] shrink-0 mt-0.5">⚡</span>
          <div>
            <p className="font-mono text-xs text-white mb-1">Fork SOUL.md → create your own agent personality</p>
            <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
              Clone the repo · edit SOUL.md · update identity + values + hard limits · load into any Bankr-compatible agent session.
            </p>
            <div className="mt-2 font-mono text-[10px]">
              <span className="text-slate-700">$ </span>
              <span className="text-[#4FC3F7]">git clone https://github.com/madebyshun/blue-agent</span>
            </div>
          </div>
        </div>

        {/* Fork in 3 steps */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">// FORK IN 3 STEPS</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "01", label: "Clone", cmd: "git clone github.com/madebyshun/blue-agent", desc: "Get the full Blue Agent repo with all skill files" },
              { step: "02", label: "Edit SOUL.md", cmd: "nano SOUL.md", desc: "Update identity, values, communication style, hard limits" },
              { step: "03", label: "Load", cmd: "bankr session --soul ./SOUL.md", desc: "Your personality file loads into any Bankr agent session" },
            ].map(s => (
              <div key={s.step} className="border border-[#1A1A2E] rounded-lg p-3">
                <span className="font-mono text-[10px] text-[#4FC3F7]">{s.step}</span>
                <p className="font-mono text-xs text-white mt-1 mb-1">{s.label}</p>
                <p className="font-mono text-[10px] text-slate-600 leading-relaxed mb-2">{s.desc}</p>
                <div className="font-mono text-[10px] text-[#A78BFA] bg-[#050508] border border-[#1A1A2E] rounded px-2 py-1 truncate">
                  $ {s.cmd}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What SOUL.md controls */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// WHAT SOUL.md CONTROLS</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Identity", desc: "Name, role, chain, builder" },
              { label: "Core Values", desc: "5 unbreakable principles" },
              { label: "Communication", desc: "Tone, phrases, format" },
              { label: "Hard Limits", desc: "What the agent won't do" },
            ].map(item => (
              <div key={item.label} className="border border-[#1A1A2E] rounded-lg p-3">
                <p className="font-mono text-xs text-white mb-1">{item.label}</p>
                <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AeonSkillSection({ skill }: { skill: typeof AEON_SKILLS[number] }) {
  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: skill.color }} />
          <h2 className="font-mono text-sm font-bold text-white shrink-0">
            {skill.icon} {skill.label}
          </h2>
          <span className="font-mono text-[10px] text-slate-600 truncate">{skill.desc}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <span className="font-mono text-[9px] px-1.5 py-0.5 border rounded" style={{ borderColor: `${skill.color}30`, color: skill.color }}>
            AEON SKILL
          </span>
          <span className="font-mono text-[10px] text-slate-700">{skill.name}</span>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 lg:px-10 py-8 w-full space-y-4">

        {/* Triggers */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// TRIGGER PHRASES</p>
          <div className="flex flex-wrap gap-2">
            {skill.triggers.map((t) => (
              <span key={t}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border"
                style={{ color: skill.color, borderColor: `${skill.color}30`, backgroundColor: `${skill.color}08` }}>
                &ldquo;{t}&rdquo;
              </span>
            ))}
          </div>
        </div>

        {/* Requirements + fork row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card-surface rounded-xl p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// REQUIRES</p>
            <p className="font-mono text-xs text-slate-300">{skill.requires}</p>
          </div>
          <div className="card-surface rounded-xl p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// FILE</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-400">{skill.name}.md</span>
              <div className="flex items-center gap-2 ml-auto">
                <CopyBtn text={skill.raw} label="Copy raw" />
                <a href={skill.github} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] px-2 py-1 rounded border text-[#4FC3F7] border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/5 transition-all">
                  GitHub →
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Install hint */}
        <div className="card-surface rounded-lg p-4">
          <p className="font-mono text-[10px] text-slate-700 mb-1">install this skill:</p>
          <div className="font-mono text-xs">
            <span className="text-slate-700">$ </span>
            <span className="text-[#4FC3F7]">cp blue-agent/skills/{skill.name}.md ~/.blue-agent/skills/</span>
          </div>
        </div>

        {/* How it runs */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">// HOW IT RUNS</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "01", label: "Trigger", desc: `User types a matching phrase (e.g. "${skill.triggers[0]}")` },
              { step: "02", label: "Parse", desc: `Aeon reads ${skill.name}.md and applies grounding rules` },
              { step: "03", label: "Output", desc: "Structured signal — no hallucinations, source-attributed" },
            ].map(s => (
              <div key={s.step} className="border border-[#1A1A2E] rounded-lg p-3">
                <span className="font-mono text-[10px]" style={{ color: skill.color }}>{s.step}</span>
                <p className="font-mono text-xs text-white mt-1 mb-1">{s.label}</p>
                <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* All triggers expanded */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// ALL TRIGGER PHRASES ({skill.triggers.length})</p>
          <div className="space-y-1.5">
            {skill.triggers.map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-slate-700 w-5">{i + 1}.</span>
                <span className="font-mono text-xs text-slate-400">&ldquo;{t}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const [active, setActive] = useState<Section>("soul");

  const currentSkill = AEON_SKILLS.find((s) => s.id === active);

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-14">

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] border-r border-[#1A1A2E]">
          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// SKILLS</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-2">
            {SIDEBAR_NAV.map((item) => (
              <button key={item.key} onClick={() => setActive(item.key)}
                className={`w-full text-left px-5 py-3 transition-all border-l-2 ${
                  active === item.key
                    ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                    : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                }`}>
                <p className="font-mono text-xs font-medium">
                  {item.key === "soul" ? "◆ " : ""}
                  {item.label}
                </p>
                <p className="font-mono text-[10px] text-slate-700 mt-0.5">{item.sub}</p>
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[#1A1A2E] space-y-2">
            <p className="font-mono text-[10px] text-slate-700 mb-1">install all aeon skills:</p>
            <div className="bg-[#0D0D14] rounded px-3 py-2">
              <span className="font-mono text-[10px] text-slate-600">$ </span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">blue init</span>
            </div>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors block mt-2">
              github.com/madebyshun/blue-agent →
            </a>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 h-[calc(100vh-3.5rem)] overflow-y-auto">

          {/* Mobile tabs */}
          <div className="lg:hidden flex overflow-x-auto gap-1 px-4 py-3 border-b border-[#1A1A2E] bg-[#050508]">
            {SIDEBAR_NAV.map((item) => (
              <button key={item.key} onClick={() => setActive(item.key)}
                className={`font-mono text-xs px-3 py-1.5 rounded shrink-0 transition-all ${
                  active === item.key
                    ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30"
                    : "text-slate-500 hover:text-white"
                }`}>
                {item.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {active === "soul" && <SoulSection />}
          {currentSkill && active !== "soul" && <AeonSkillSection skill={currentSkill} />}

        </main>
      </div>
    </>
  );
}
