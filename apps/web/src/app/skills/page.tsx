"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

// ─── SOUL.md data ─────────────────────────────────────────────────────────────

const SOUL = {
  version: "v0.1.0",
  updatedAt: "2026-05-23",
  github: "https://github.com/madebyshun/blue-agent/blob/main/SOUL.md",
  raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/SOUL.md",
  identity: {
    name: "Blue Agent",
    builtBy: "Blocky Studio — @madebyshun",
    role: "AI founder agent for Base builders",
    chain: "Base (chain ID 8453) — exclusively",
    token: "$BLUEAGENT",
    tokenAddress: "0xf895783b2931c919955e18b5e3343e7c7c456ba3",
  },
  values: [
    { n: "01", title: "Ship over talk",          desc: "Always push toward action. Concrete > abstract." },
    { n: "02", title: "Base-native by default",   desc: "Every answer is written for Base. No Ethereum mainnet." },
    { n: "03", title: "Honest over comfortable",  desc: "Give the real answer, not the soft one. If something is risky, say so." },
    { n: "04", title: "Builder-first",            desc: "Assume the user knows what they're doing. Skip basics unless asked." },
    { n: "05", title: "Composable",               desc: "Prefer open standards, existing tooling, Bankr / x402 / Base integrations." },
  ],
  tone: {
    fits: ["Here's what I'd do…", "The real risk here is…", "Skip X. Do Y instead.", "Base has a native solution — use it."],
    never: ["Certainly!", "Of course!", "Great question!", "Happy to help!", "As an AI language model…"],
  },
  decisionRules: [
    "When uncertain — pick the option that ships faster",
    "Pick the one that is more Base-native",
    "Pick the one with less attack surface",
    "For chains — answer for Base first, never suggest mainnet as default",
    "For addresses — only use verified addresses from skills/base-addresses.md",
  ],
  hardLimits: [
    "Never invent contract addresses",
    "Never suggest Ethereum mainnet over Base",
    "Never call OpenAI / Anthropic APIs directly — use Bankr LLM (llm.bankr.bot)",
    "Never give investment advice or price predictions",
    "Never claim to execute transactions — user signs all onchain actions",
  ],
};

// ─── Aeon skills ──────────────────────────────────────────────────────────────

const AEON_SKILLS = [
  {
    name: "aeon-token-movers",
    label: "Token Movers",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.2)",
    icon: "📈",
    description:
      "Top movers, losers, and trending coins from CoinGecko — with pump-risk flags: low liquidity, fresh listing, volume-no-mcap, low-holder-data, cex-only. No API key required.",
    triggers: ["top movers today", "what's pumping", "biggest losers 24h", "trending coins", "crypto movers with risk flags"],
    requires: "None — public CoinGecko API",
    source: "BankrBot/skills",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-token-movers.md",
    raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-token-movers.md",
  },
  {
    name: "aeon-token-pick",
    label: "Token Pick",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.2)",
    icon: "🎯",
    description:
      "One token recommendation and one prediction-market pick per run — with falsifiable thesis, entry, sizing, and kill criterion. NO_PICK fires when no candidate has a named/dated catalyst. The discipline is the skip branch.",
    triggers: ["give me a token pick", "what should I trade today", "prediction-market rec", "is there an asymmetric setup"],
    requires: "None — skip branch is a valid output",
    source: "BankrBot/skills",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-token-pick.md",
    raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-token-pick.md",
  },
  {
    name: "aeon-narrative-tracker",
    label: "Narrative Tracker",
    color: "#4FC3F7",
    bg: "rgba(79,195,247,0.08)",
    border: "rgba(79,195,247,0.2)",
    icon: "🧭",
    description:
      "Daily narrative map — mindshare score (1-5), velocity arrow (↑↑ ↑ → ↓ ↓↓), phase label (Emerging / Rising / Peak / Fading), named drivers, and explicit position calls: FRONT-RUN / RIDE / FADE / WATCH / IGNORE.",
    triggers: ["track narratives", "what's running on CT", "is X peaking", "narrative positions today"],
    requires: "Optional: XAI_API_KEY for deeper signal threads",
    source: "BankrBot/skills",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-narrative-tracker.md",
    raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-narrative-tracker.md",
  },
  {
    name: "aeon-deep-research",
    label: "Deep Research",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.2)",
    icon: "🔬",
    description:
      "Exhaustive multi-source research with attributed claims, adversarial counterpoint, and open-questions list. Claims tagged by source class (primary / expert / secondary / market signal) and confidence. Use when cost of being wrong exceeds an hour of research.",
    triggers: ["deep research X", "DD on Y", "build me a memo on Z", "contrarian take on X"],
    requires: "None — uses web search. Optional: primary source access",
    source: "BankrBot/skills",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-deep-research.md",
    raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-deep-research.md",
  },
  {
    name: "aeon-distribute-tokens",
    label: "Distribute Tokens",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.08)",
    border: "rgba(251,146,60,0.2)",
    icon: "💸",
    description:
      "Batch token payouts via Bankr Wallet API with per-recipient idempotency, two-phase resolve→execute, dry-run preview, and recovery from partial runs. Re-runs on the same UTC day skip already-completed rows — double-sending is impossible.",
    triggers: ["distribute tokens", "pay contributors", "weekly payout", "send USDC to this list", "tip these handles"],
    requires: "BANKR_API_KEY with Wallet write scope",
    source: "BankrBot/skills",
    github: "https://github.com/madebyshun/blue-agent/blob/main/skills/aeon-distribute-tokens.md",
    raw: "https://raw.githubusercontent.com/madebyshun/blue-agent/main/skills/aeon-distribute-tokens.md",
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="font-mono text-xs px-3 py-1.5 rounded border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-slate-600 transition-all"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function ForkBtn({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="font-mono text-xs px-3 py-1.5 rounded border border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/10 transition-all flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
      Fork
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const [soulOpen, setSoulOpen] = useState<string | null>("identity");

  const sections: Array<{ key: string; label: string; content: React.ReactNode }> = [
    {
      key: "identity",
      label: "Identity",
      content: (
        <div className="space-y-2 font-mono text-sm">
          {Object.entries(SOUL.identity).map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="text-slate-500 w-28 shrink-0">{k}:</span>
              <span className={k === "tokenAddress" ? "text-[#4FC3F7] text-xs break-all" : "text-slate-200"}>{v}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "values",
      label: "Core Values",
      content: (
        <div className="space-y-3">
          {SOUL.values.map((v) => (
            <div key={v.n} className="flex gap-3">
              <span className="font-mono text-xs text-slate-600 pt-0.5 w-6 shrink-0">{v.n}</span>
              <div>
                <div className="font-mono text-sm text-white font-semibold">{v.title}</div>
                <div className="font-mono text-xs text-slate-400 mt-0.5">{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "tone",
      label: "Communication Style",
      content: (
        <div className="space-y-4">
          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">SAYS</div>
            <div className="space-y-1">
              {SOUL.tone.fits.map((p) => (
                <div key={p} className="font-mono text-sm text-[#34d399] bg-[#34d399]/5 px-3 py-1.5 rounded">
                  &ldquo;{p}&rdquo;
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="font-mono text-xs text-slate-500 mb-2">NEVER SAYS</div>
            <div className="space-y-1">
              {SOUL.tone.never.map((p) => (
                <div key={p} className="font-mono text-sm text-slate-600 bg-[#1A1A2E]/40 px-3 py-1.5 rounded line-through">
                  &ldquo;{p}&rdquo;
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "decisions",
      label: "Decision Rules",
      content: (
        <ul className="space-y-2">
          {SOUL.decisionRules.map((r) => (
            <li key={r} className="flex gap-2 font-mono text-sm text-slate-300">
              <span className="text-[#4FC3F7] shrink-0">→</span>
              {r}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "limits",
      label: "Hard Limits",
      content: (
        <ul className="space-y-2">
          {SOUL.hardLimits.map((l) => (
            <li key={l} className="flex gap-2 font-mono text-sm text-slate-300">
              <span className="text-red-400 shrink-0">✕</span>
              {l}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-r border-[#1A1A2E] px-6 py-8 gap-1 overflow-y-auto">
          <div className="font-mono text-xs text-slate-500 mb-4 tracking-widest">SECTIONS</div>
          <a href="#soul"
            className="font-mono text-sm text-slate-300 hover:text-[#4FC3F7] py-1.5 transition-colors flex items-center gap-2">
            <span className="text-[#4FC3F7]">◆</span> SOUL.md
          </a>
          <a href="#aeon"
            className="font-mono text-sm text-slate-300 hover:text-[#4FC3F7] py-1.5 transition-colors flex items-center gap-2">
            <span className="text-[#34d399]">◆</span> Aeon Skills
          </a>
          <div className="mt-4 space-y-0.5">
            {AEON_SKILLS.map((s) => (
              <a key={s.name} href={`#${s.name}`}
                className="font-mono text-xs text-slate-500 hover:text-slate-300 py-1 pl-4 transition-colors block">
                {s.icon} {s.label}
              </a>
            ))}
          </div>

          <div className="mt-auto pt-6 border-t border-[#1A1A2E]">
            <div className="font-mono text-xs text-slate-600 mb-2">FORK THIS AGENT</div>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-[#4FC3F7] hover:underline flex items-center gap-1">
              github.com/madebyshun/blue-agent
            </a>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 px-6 sm:px-8 lg:px-12 py-10 max-w-4xl">

          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="font-mono text-xs text-[#4FC3F7] tracking-widest">SKILLS BROWSER</div>
            </div>
            <h1 className="font-mono text-3xl font-bold text-white mb-3">
              Blue Agent <span className="text-[#4FC3F7]">Skills</span>
            </h1>
            <p className="font-mono text-slate-400 text-sm leading-relaxed max-w-xl">
              The intelligence layer of Blue Agent. SOUL.md defines who the agent is.
              Aeon skills are installed intelligence modules — forkable, composable, Base-native.
            </p>
          </div>

          {/* ── SOUL.md ── */}
          <section id="soul" className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[#4FC3F7] text-lg">◆</span>
                <div>
                  <h2 className="font-mono text-xl font-bold text-white">SOUL.md</h2>
                  <div className="font-mono text-xs text-slate-500">Personality config · {SOUL.version} · {SOUL.updatedAt}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CopyBtn text={SOUL.raw} label="Copy raw URL" />
                <ForkBtn href={SOUL.github} />
              </div>
            </div>

            <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl overflow-hidden">
              {/* File header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E] bg-[#0D0D1A]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="font-mono text-xs text-slate-400">SOUL.md</span>
                </div>
                <span className="font-mono text-xs text-slate-600">{SOUL.version}</span>
              </div>

              {/* Accordion sections */}
              {sections.map((sec) => (
                <div key={sec.key} className="border-b border-[#1A1A2E] last:border-b-0">
                  <button
                    onClick={() => setSoulOpen(soulOpen === sec.key ? null : sec.key)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#0D0D1A]/50 transition-colors group"
                  >
                    <span className="font-mono text-sm text-slate-300 group-hover:text-white transition-colors">
                      ## {sec.label}
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-600 transition-transform ${soulOpen === sec.key ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {soulOpen === sec.key && (
                    <div className="px-4 pb-5 pt-1">
                      {sec.content}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Fork callout */}
            <div className="mt-4 bg-[#4FC3F7]/5 border border-[#4FC3F7]/15 rounded-lg px-4 py-3 flex items-start gap-3">
              <span className="text-[#4FC3F7] text-base shrink-0 mt-0.5">⚡</span>
              <div>
                <div className="font-mono text-xs text-[#4FC3F7] font-semibold mb-1">Fork SOUL.md to create your own agent</div>
                <div className="font-mono text-xs text-slate-400">
                  Clone the repo, edit SOUL.md, update identity + values + hard limits. Load into any Bankr-compatible agent session.
                </div>
              </div>
            </div>
          </section>

          {/* ── Aeon Skills ── */}
          <section id="aeon">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-mono text-[#34d399] text-lg">◆</span>
              <div>
                <h2 className="font-mono text-xl font-bold text-white">Aeon Skills</h2>
                <div className="font-mono text-xs text-slate-500">
                  5 intelligence modules installed from BankrBot/skills
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {AEON_SKILLS.map((skill) => (
                <div key={skill.name} id={skill.name}
                  className="border rounded-xl overflow-hidden"
                  style={{ borderColor: skill.border, backgroundColor: skill.bg }}>

                  {/* Skill header */}
                  <div className="flex items-start justify-between px-5 py-4 border-b"
                    style={{ borderColor: skill.border }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{skill.icon}</span>
                      <div>
                        <div className="font-mono text-sm font-bold" style={{ color: skill.color }}>
                          {skill.name}
                        </div>
                        <div className="font-mono text-xs text-slate-400">{skill.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 px-2 py-1 bg-[#1A1A2E]/60 rounded">
                        source: {skill.source}
                      </span>
                      <CopyBtn text={skill.raw} label="Copy raw" />
                      <ForkBtn href={skill.github} />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4 space-y-4">
                    <p className="font-mono text-sm text-slate-300 leading-relaxed">
                      {skill.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Triggers */}
                      <div>
                        <div className="font-mono text-xs text-slate-500 mb-2 tracking-wider">TRIGGER PHRASES</div>
                        <div className="flex flex-wrap gap-1.5">
                          {skill.triggers.map((t) => (
                            <span key={t}
                              className="font-mono text-xs px-2 py-1 rounded-md border bg-[#050508]/60"
                              style={{ color: skill.color, borderColor: skill.border }}>
                              &ldquo;{t}&rdquo;
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Requires */}
                      <div>
                        <div className="font-mono text-xs text-slate-500 mb-2 tracking-wider">REQUIRES</div>
                        <div className="font-mono text-xs text-slate-300 bg-[#050508]/60 border border-[#1A1A2E] rounded px-3 py-2">
                          {skill.requires}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Install all CTA */}
            <div className="mt-8 bg-[#0A0A14] border border-[#1A1A2E] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-sm text-white font-semibold">Install all Aeon skills</div>
                <CopyBtn
                  text="git clone https://github.com/madebyshun/blue-agent && cp blue-agent/skills/aeon-*.md ~/.blue-agent/skills/"
                  label="Copy command"
                />
              </div>
              <div className="font-mono text-xs text-slate-500 bg-[#050508] rounded-lg px-4 py-3 border border-[#1A1A2E]">
                git clone https://github.com/madebyshun/blue-agent<br />
                cp blue-agent/skills/aeon-*.md ~/.blue-agent/skills/
              </div>
              <div className="mt-3 font-mono text-xs text-slate-600">
                Or fork the repo and modify individual skill files to create custom intelligence modules.
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
