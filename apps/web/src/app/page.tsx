"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// Marketing surface → mono-forward. JetBrains Mono is the PRIMARY brand voice
// here (display headlines + reading body). DM Sans (.font-ui) is reserved for the
// product app's UI chrome — chat bubbles, dense tables — not this hero page.
const MONO = "'JetBrains Mono', monospace";

// ─── Data ────────────────────────────────────────────────────────────────────

const SOCIAL_PROOF = ["74 AI tools", "x402 native", "MCP", "Bankr Skills", "Base App"];

const CHAT_COMMANDS = ["/idea", "/build", "/audit", "/ship", "/raise", "/pick", "/scan"];

// icon: "logo" → BlueAgent logomark, otherwise an emoji glyph
const CHAT_FEATURES = [
  { label: "Hub Tools",     icon: "logo", color: "#4FC3F7", desc: "Token price · whale tracking · security checks. Live tools, run directly in chat." },
  { label: "Skill System",  icon: "⭐",   color: "#34D399", desc: "Install Bankr · Base MCP · custom skills. Extend Blue Chat with any skill." },
  { label: "Multi-model",   icon: "🦈",   color: "#A78BFA", desc: "Venice · Bankr · Claude. Best model for each task." },
  { label: "Credits + x402",icon: "💎",   color: "#FBBF24", desc: "Stake $BLUEAGENT → free tools. Or pay $0.01–$0.20/call." },
];

const HUB_CATEGORIES = [
  { label: "On-chain",     color: "#FBBF24", tools: "token price · pool scan · gas tracker" },
  { label: "Security",     color: "#F87171", tools: "honeypot · risk gate · scam detector" },
  { label: "Intelligence", color: "#4FC3F7", tools: "token alpha · narrative pulse · base alpha" },
  { label: "DeFi",         color: "#34D399", tools: "cross-protocol yield · liquidity depth" },
  { label: "Builder",      color: "#A78BFA", tools: "repo health · founder check · roadmap validator" },
];

const FEED_METRICS = [
  { label: "Base TVL",    value: "$4.2B",        delta: "↑ +0.8%",  deltaColor: "#34D399", valueColor: "#fff" },
  { label: "Sentiment",   value: "bullish 🟢",   delta: null,       deltaColor: "",        valueColor: "#34D399" },
  { label: "Trending",    value: "AERO +10.2%",  delta: null,       deltaColor: "",        valueColor: "#4FC3F7" },
  { label: "Pulse Score", value: "84/100",       delta: null,       deltaColor: "",        valueColor: "#fff" },
  { label: "New Pools",   value: "12",           delta: "last hour",deltaColor: "#64748b", valueColor: "#fff" },
];

const FEED_TOOLS = [
  { id: "base-pulse",      desc: "ecosystem snapshot" },
  { id: "narrative-pulse", desc: "trending narratives" },
  { id: "token-alpha",     desc: "best signal now" },
  { id: "whale-tracker",   desc: "smart money moving" },
  { id: "base-alpha",      desc: "daily alpha digest" },
];

const AGENTS = [
  { icon: "logo", name: "Blue Agent", color: "#4FC3F7", role: "orchestration · routing · execution" },
  { icon: "⭐",   name: "Aeon",       color: "#34D399", role: "sensing · detection · onchain reading" },
  { icon: "🦈",   name: "MiroShark",  color: "#A78BFA", role: "simulation · forecasting · consensus" },
];

const INTEGRATIONS = [
  { name: "x402 HTTP",    color: "#4FC3F7", desc: "Pay per call · USDC on Base · any agent" },
  { name: "MCP",          color: "#A78BFA", desc: "Claude Code · Cursor · Claude Desktop" },
  { name: "Bankr Skills", color: "#FBBF24", desc: "install blueagent skill" },
  { name: "Base App",     color: "#60A5FA", desc: "Farcaster mini app · auto-verified" },
  { name: "$BLUEAGENT",   color: "#34D399", desc: "Hold to pay less · stake for credits" },
];

const PRICING = [
  { tier: "Guest",   hold: "no wallet",       credits: "100 cr/day",   note: null,            highlight: false },
  { tier: "Starter", hold: "500K BLUEAGENT",  credits: "500 cr/day",   note: null,            highlight: false },
  { tier: "Pro",     hold: "2M BLUEAGENT",    credits: "2,000 cr/day", note: "20% discount",  highlight: false },
  { tier: "Max",     hold: "10M BLUEAGENT",   credits: "unlimited",    note: "40% discount",  highlight: true  },
];

const BUY_URL = "https://bankr.bot/agents/blue-agent";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Glyph({ icon, size = 24, className = "" }: { icon: string; size?: number; className?: string }) {
  if (icon === "logo") {
    return <img src="/logomark.svg" alt="BlueAgent" width={size} height={size} className={`rounded ${className}`} style={{ display: "inline-block" }} />;
  }
  return <span className={className} style={{ fontSize: size * 0.9, lineHeight: 1 }}>{icon}</span>;
}

// Subtle fade-up on scroll (respects reduced-motion & no-JS)
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? "none" : "translateY(18px)",
      transition: `opacity .6s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function SectionHead({ num, kicker, title, sub, accent = "#4FC3F7" }: {
  num: string; kicker: string; title: React.ReactNode; sub?: React.ReactNode; accent?: string;
}) {
  return (
    <Reveal className="mb-10 sm:mb-14">
      <div className="font-mono text-[11px] tracking-[0.22em] mb-4">
        <span style={{ color: accent }}>// {num}</span>
        <span className="text-slate-600 ml-2 uppercase">{kicker}</span>
      </div>
      <h2 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight leading-[1.06] mb-4 max-w-2xl text-white">
        {title}
      </h2>
      {sub && <p className="text-slate-400 text-[15px] sm:text-lg leading-relaxed max-w-2xl">{sub}</p>}
    </Reveal>
  );
}

// ─── Chat mockup with typing animation (// 1.0) ───────────────────────────────

const CHAT_SEGMENTS: { t: string; cls: string }[] = [
  { t: "/pick", cls: "text-[#4FC3F7]" },
  { t: "\n⭐ Aeon scanning Base momentum…", cls: "text-slate-400" },
  { t: "\n🦈 MiroShark analyzing crowd signal…", cls: "text-slate-400" },
  { t: "\n\n{ ", cls: "text-slate-500" },
  { t: '"signal"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: '"BUY"', cls: "text-[#34D399] font-semibold" },
  { t: ", ", cls: "text-slate-500" },
  { t: '"token"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: '"AERO"', cls: "text-[#4FC3F7] font-semibold" },
  { t: ", ", cls: "text-slate-500" },
  { t: '"confidence"', cls: "text-slate-400" },
  { t: ": 82, ", cls: "text-slate-500" },
  { t: '"entry"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: '"$0.49"', cls: "text-white" },
  { t: ", ", cls: "text-slate-500" },
  { t: '"thesis"', cls: "text-slate-400" },
  { t: ': "narrative alignment + whale accumulation" }', cls: "text-slate-500" },
  { t: "\n\n$0.20 USDC · 2.1s · Base ", cls: "text-slate-500" },
  { t: "✓", cls: "text-[#34D399]" },
];

function ChatMockup() {
  const chars = useMemo(() => {
    const out: { ch: string; cls: string }[] = [];
    for (const s of CHAT_SEGMENTS) for (const ch of Array.from(s.t)) out.push({ ch, cls: s.cls });
    return out;
  }, []);
  const [n, setN] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(chars.length); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= chars.length) clearInterval(id);
    }, 20);
    return () => clearInterval(id);
  }, [chars.length]);

  // group revealed chars into contiguous same-color spans
  const groups: { cls: string; text: string }[] = [];
  for (let k = 0; k < n && k < chars.length; k++) {
    const c = chars[k];
    const last = groups[groups.length - 1];
    if (last && last.cls === c.cls) last.text += c.ch;
    else groups.push({ cls: c.cls, text: c.ch });
  }

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
        <img src="/logomark.svg" alt="BlueAgent" width={18} height={18} className="rounded" />
        <span className="font-mono text-[12px] text-slate-300">Blue Agent</span>
        <span className="ml-auto flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
        </span>
      </div>
      <pre className="flex-1 p-4 sm:p-5 whitespace-pre-wrap break-words font-mono text-[12px] sm:text-[13px] leading-relaxed m-0">
        {groups.map((g, i) => <span key={i} className={g.cls}>{g.text}</span>)}
        <span className="animate-blink text-[#4FC3F7]">_</span>
      </pre>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050508] text-white" style={{ fontFamily: MONO }}>
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[800px] pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 75% 50% at 50% -8%, #4FC3F71f 0%, transparent 70%)" }} />
      </div>

      <main className="relative">

        {/* ══════════ HERO ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-24 text-center">
          <img src="/logomark.svg" alt="BlueAgent" width={40} height={40} className="mx-auto mb-6 rounded-xl animate-breathe" />

          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3.5 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[10px] text-[#4FC3F7] tracking-[0.18em]">BUILT ON BASE · x402 NATIVE</span>
          </div>

          <h1 className="text-[2.75rem] leading-[1.04] sm:text-6xl lg:text-7xl font-bold tracking-tight mb-5">
            The Builder OS<br className="hidden sm:block" /> for <span className="text-[#4FC3F7]">Base</span>
          </h1>
          <p className="text-base sm:text-xl text-slate-400 mb-9 max-w-2xl mx-auto leading-relaxed">
            Chat with AI agents. Run 74 tools. Launch tokens. Build and scale onchain — all in one platform.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
              Open Blue Chat →
            </Link>
            <Link href="/hub" className="text-sm font-semibold text-[#4FC3F7] border border-[#4FC3F7]/30 px-7 py-3 rounded-xl hover:bg-[#4FC3F7]/5 transition-all">
              Browse Hub
            </Link>
            <Link href="/app/bank"
              className="text-sm font-semibold px-7 py-3 rounded-xl transition-all border border-[#34D399]/30 text-[#34D399] hover:bg-[#34D399]/5">
              Connect Wallet
            </Link>
            <a href="https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base"
              target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold px-7 py-3 rounded-xl transition-all border border-[#4FC3F7]/30 text-[#4FC3F7] hover:bg-[#4FC3F7]/5">
              Buy $BLUEAGENT ↗
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[11px] text-slate-600">
            {SOCIAL_PROOF.map((s, i) => (
              <span key={s} className="flex items-center gap-3">
                {i > 0 && <span className="text-slate-800">·</span>}
                {s}
              </span>
            ))}
          </div>

          {/* Product mockup — Blue Chat window */}
          <Reveal delay={120} className="mt-14 sm:mt-20">
            <div className="relative max-w-3xl mx-auto">
              <div className="absolute -inset-4 rounded-3xl pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 30%, #4FC3F715 0%, transparent 70%)" }} />
              <div className="relative rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden shadow-2xl text-left">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/70" />
                  <span className="font-mono text-[11px] text-slate-600 ml-2">Blue Chat · blueagent.dev</span>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="flex justify-end">
                    <div className="bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                      <span className="font-mono text-[13px] text-[#9bd9f7]">/pick — find me an asymmetric Base setup</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[#4FC3F7]/15 flex items-center justify-center shrink-0">
                      <img src="/logomark.svg" alt="BlueAgent" width={16} height={16} className="rounded" />
                    </span>
                    <div className="flex-1 space-y-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="font-mono text-[10px] text-[#34D399] border border-[#34D399]/25 bg-[#34D399]/5 rounded px-2 py-0.5">↳ token-pick-signal</span>
                        <span className="font-mono text-[10px] text-[#FBBF24] border border-[#FBBF24]/25 bg-[#FBBF24]/5 rounded px-2 py-0.5">↳ whale-tracker</span>
                        <span className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded px-2 py-0.5">$0.20 · USDC</span>
                      </div>
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        <span className="text-white font-semibold">AERO</span> — $0.52, +5% 24h, $25.6M liquidity. Whale accumulation confirmed over the last 50 transfers. Entry near $0.49 support, kill below $0.46.
                      </p>
                      <p className="text-[11px] text-slate-600 font-mono">3-agent consensus · Blue × Aeon × MiroShark</p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[#15151f] flex items-center gap-2">
                  <div className="flex-1 bg-[#0f0f17] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-[12px] text-slate-600">Ask anything, or type /</div>
                  <span className="w-8 h-8 rounded-lg bg-[#4FC3F7]/15 flex items-center justify-center text-[#4FC3F7]">↑</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ 1.0 CHAT ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="1.0" kicker="Chat"
            title={<>Talk to AI. <span className="text-[#4FC3F7]">Build onchain.</span></>}
            sub="Blue Chat routes your intent to the right tool. Live Hub tools, multi-model, skill-based. Built for Base."
          />
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
            {/* LEFT — typing chat mockup */}
            <Reveal>
              <ChatMockup />
            </Reveal>
            {/* RIGHT — 2×2 feature cards */}
            <Reveal delay={80}>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 h-full">
                {CHAT_FEATURES.map((card) => (
                  <div
                    key={card.label}
                    className="ba-card rounded-2xl p-4 sm:p-5"
                  >
                    <Glyph icon={card.icon} size={22} />
                    <div className="text-sm font-semibold mt-2.5 mb-1.5" style={{ color: card.color }}>{card.label}</div>
                    <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{card.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
          {/* Slash command chips */}
          <Reveal className="mt-5">
            <div className="flex flex-wrap gap-2">
              {CHAT_COMMANDS.map((c) => (
                <span key={c} className="font-mono text-[13px] text-[#4FC3F7] border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-lg px-3 py-1.5">{c}</span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ══════════ 2.0 HUB ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="2.0" kicker="Hub" accent="#A78BFA"
            title={<>74 tools. <span className="text-[#A78BFA]">Pay what you use.</span></>}
            sub="The intelligence layer for Base agents. Raw data, security checks, alpha signals — all x402 native. No API key. No subscription."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {HUB_CATEGORIES.map((cat, i) => (
              <Reveal key={cat.label} delay={i * 60}>
                <div className="ba-card h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
                    <span className="text-sm font-semibold" style={{ color: cat.color }}>{cat.label}</span>
                  </div>
                  <p className="font-mono text-[12px] text-slate-500 leading-relaxed">{cat.tools}</p>
                </div>
              </Reveal>
            ))}
            <Reveal delay={300}>
              <Link href="/hub" className="ba-card h-full flex flex-col justify-center items-start rounded-2xl p-5">
                <span className="text-sm font-semibold text-[#A78BFA] mb-1">Browse all 74 →</span>
                <span className="font-mono text-[11px] text-slate-600">9 categories · live data</span>
              </Link>
            </Reveal>
          </div>
          <Reveal>
            <p className="font-mono text-[12px] text-slate-500">
              From <span className="text-white">$0.01/call</span> · Pay in USDC or <span className="text-[#34D399]">$BLUEAGENT</span>
            </p>
          </Reveal>
        </section>

        {/* ══════════ 3.0 FEED ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="3.0" kicker="Feed" accent="#FB923C"
            title={<>Live Base intelligence. <span className="text-[#FB923C]">24/7.</span></>}
            sub={<>Powered by <span className="text-[#FB923C]">⭐ Aeon</span> · 🟦 BlueAgent · 🦈 MiroShark · updates every hour</>}
          />
          {/* TOP — feed card mockup */}
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#15151f] font-mono text-[12px] text-slate-400">
                ⭐ Aeon · <span className="text-[#FB923C]">base-pulse</span> · just now
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {FEED_METRICS.map((m) => (
                  <div key={m.label}>
                    <div className="font-mono text-[10px] text-slate-600 uppercase tracking-wider mb-1">{m.label}</div>
                    <div className="font-mono text-[13px] font-semibold" style={{ color: m.valueColor }}>
                      {m.value}
                      {m.delta && <span className="ml-1.5 text-[11px] font-normal" style={{ color: m.deltaColor }}>{m.delta}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-[#15151f] flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-slate-500">$0.05 USDC · auto · Base ✓</span>
                <div className="flex gap-2">
                  <button disabled className="font-mono text-[11px] text-slate-500 border border-[#1A1A2E] rounded-lg px-3 py-1.5 opacity-50 cursor-not-allowed">Share ↗</button>
                  <button disabled className="font-mono text-[11px] text-slate-500 border border-[#1A1A2E] rounded-lg px-3 py-1.5 opacity-50 cursor-not-allowed">Cast to Farcaster</button>
                </div>
              </div>
            </div>
          </Reveal>
          {/* BOTTOM — tool grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            {FEED_TOOLS.map((t, i) => (
              <Reveal key={t.id} delay={i * 50}>
                <div className="ba-card h-full rounded-xl p-4">
                  <div className="font-mono text-[12px] text-[#FB923C] mb-1 break-words">{t.id}</div>
                  <div className="font-mono text-[11px] text-slate-500 leading-snug">{t.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-6">
            <Link href="/app/feed" className="inline-block text-sm font-semibold text-[#FB923C] border border-[#FB923C]/30 px-7 py-3 rounded-xl hover:bg-[#FB923C]/5 transition-all">
              View Blue Feed →
            </Link>
          </div>
        </section>

        {/* ══════════ 4.0 AGENTS ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="4.0" kicker="Agents"
            title={<>Three agents. <span className="text-[#4FC3F7]">One platform.</span></>}
            sub="Every output is a 3-agent consensus. Not one model guessing — three roles reasoning."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {AGENTS.map((a, i) => (
              <Reveal key={a.name} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6">
                  <div className="mb-3"><Glyph icon={a.icon} size={28} /></div>
                  <div className="text-base font-semibold mb-1" style={{ color: a.color }}>{a.name}</div>
                  <p className="font-mono text-[12px] text-slate-500 leading-relaxed">{a.role}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══════════ 5.0 INTEGRATIONS ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="5.0" kicker="Integrations" accent="#60A5FA"
            title={<>Built for the <span className="text-[#60A5FA]">agent economy</span></>}
            sub="BlueAgent is x402 native from day one. Agents pay agents. No human in the loop."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            {INTEGRATIONS.map((it, i) => (
              <Reveal key={it.name} delay={i * 55}>
                <div className="ba-card h-full rounded-2xl p-5">
                  <div className="text-sm font-semibold mb-2" style={{ color: it.color }}>{it.name}</div>
                  <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{it.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
                <span className="font-mono text-[11px] text-slate-600 ml-2">terminal</span>
              </div>
              <pre className="p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed m-0">
<span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">curl</span><span className="text-slate-300"> https://x402.bankr.bot/0xb058.../token-price \</span>
{"\n"}<span className="text-slate-500">    -d </span><span className="text-[#34D399]">{'\'{"token":"AERO"}\''}</span>
{"\n"}<span className="text-slate-500">→ </span><span className="text-slate-300">{'{"price":0.49,"mcap":465000000,...}'}</span>
{"\n"}<span className="text-slate-600">Charged: </span><span className="text-[#FBBF24]">$0.01 USDC</span>
              </pre>
            </div>
          </Reveal>
        </section>

        {/* ══════════ 6.0 PRICING ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="6.0" kicker="Pricing" accent="#34D399"
            title={<>Hold $BLUEAGENT. <span className="text-[#34D399]">Build for free.</span></>}
            sub="Credits refresh every day. No subscription. Just hold $BLUEAGENT and build."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {PRICING.map((p, i) => (
              <Reveal key={p.tier} delay={i * 60}>
                <div className={`ba-card h-full rounded-2xl p-5 flex flex-col gap-2 ${p.highlight ? "ba-card--hot" : ""}`}>
                  <div className="text-sm font-semibold" style={{ color: p.highlight ? "#34D399" : "#fff" }}>{p.tier}</div>
                  <div className="font-mono text-[11px] text-slate-500">{p.hold}</div>
                  <div className="text-2xl font-bold text-white mt-1">{p.credits}</div>
                  {p.note && <div className="font-mono text-[11px] text-[#34D399]">{p.note}</div>}
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 sm:p-6 flex flex-col gap-4">
              <p className="font-mono text-[12px] text-slate-500">
                x402: <span className="text-white">$0.01–$0.20/call</span> · USDC or $BLUEAGENT · no signup
              </p>
              <p className="text-[15px] sm:text-base text-slate-300">
                The more <span className="text-[#34D399] font-semibold">$BLUEAGENT</span> you hold, the more you build for free.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href={BUY_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold px-6 py-2.5 rounded-xl text-center transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #34D399, #10B981)", color: "#031b12" }}>
                  Buy $BLUEAGENT →
                </a>
                <Link href="/app/rewards" className="text-sm font-semibold text-[#34D399] border border-[#34D399]/30 px-6 py-2.5 rounded-xl text-center hover:bg-[#34D399]/5 transition-all">
                  Stake now →
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ FINAL CTA ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-20 sm:py-28 border-t border-[#13131d]">
          <Reveal>
            <div className="rounded-3xl border border-[#4FC3F7]/20 p-8 sm:p-14 text-center" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 40%, #4FC3F710 0%, transparent 70%)" }}>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-8">
                Start building on <span className="text-[#4FC3F7]">Base</span> today
              </h2>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
                  Open Blue Chat →
                </Link>
                <Link href="/hub" className="text-sm font-semibold text-[#4FC3F7] border border-[#4FC3F7]/30 px-7 py-3 rounded-xl hover:bg-[#4FC3F7]/5 transition-all">
                  Browse 74 Hub Tools →
                </Link>
                <Link href="/docs" className="text-sm font-semibold text-slate-400 border border-[#1A1A2E] px-7 py-3 rounded-xl hover:text-white hover:border-[#4FC3F7]/30 transition-all">
                  Install MCP →
                </Link>
                <Link href="/docs" className="text-sm font-semibold text-slate-400 border border-[#1A1A2E] px-7 py-3 rounded-xl hover:text-white hover:border-[#4FC3F7]/30 transition-all">
                  Read Docs →
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer className="border-t border-[#1A1A2E] px-5 sm:px-6 py-10 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <img src="/logomark.svg" alt="BlueAgent" width={20} height={20} className="rounded-md" />
                <span className="font-semibold text-white">BlueAgent</span>
                <span className="text-xs text-slate-500">· The Builder OS for Base</span>
              </div>
              <p className="font-mono text-[11px] text-slate-600">Powered by Bankr · Venice AI · x402 native · Base</p>
            </div>
            <div className="flex items-center gap-5 font-mono text-xs text-slate-600">
              <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram</a>
              <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
