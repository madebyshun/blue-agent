"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const SANS = "'DM Sans', system-ui, sans-serif";

// ─── Data ────────────────────────────────────────────────────────────────────

const SOCIAL_PROOF = ["74 AI tools", "x402 native", "MCP", "Bankr Skills", "Base App"];

const CHAT_COMMANDS = ["/idea", "/build", "/audit", "/ship", "/raise", "/pick", "/scan"];

const HUB_CATEGORIES = [
  { label: "On-chain",     color: "#FBBF24", tools: "token price · pool scan · gas tracker" },
  { label: "Security",     color: "#F87171", tools: "honeypot · risk gate · scam detector" },
  { label: "Intelligence", color: "#4FC3F7", tools: "token alpha · narrative pulse · base alpha" },
  { label: "DeFi",         color: "#34D399", tools: "cross-protocol yield · liquidity depth" },
  { label: "Builder",      color: "#A78BFA", tools: "repo health · founder check · roadmap validator" },
];

const FEED_TOOLS = ["base-pulse", "narrative-pulse", "token-alpha", "whale-tracker", "base-alpha"];

const AGENTS = [
  { glyph: "🟦", name: "Blue Agent", color: "#4FC3F7", role: "orchestration · routing · execution" },
  { glyph: "👁", name: "Aeon",       color: "#34D399", role: "sensing · detection · onchain reading" },
  { glyph: "🦈", name: "MiroShark",  color: "#A78BFA", role: "simulation · forecasting · consensus" },
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

const COMPARISON = [
  { feature: "Base-native",       gpt: false, claude: false, blue: true },
  { feature: "x402 payments",     gpt: false, claude: false, blue: true },
  { feature: "74 onchain tools",  gpt: false, claude: false, blue: true },
  { feature: "Token launch",      gpt: false, claude: false, blue: true },
  { feature: "MCP",               gpt: false, claude: true,  blue: true },
  { feature: "Agent-to-agent pay",gpt: false, claude: false, blue: true },
  { feature: "Hold to earn free", gpt: false, claude: false, blue: true },
];

const BUY_URL = "https://app.uniswap.org/swap?chain=base&outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3";

// ─── Scroll reveal (subtle fade-up; respects reduced-motion & no-JS) ──────────

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
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(18px)",
        transition: `opacity .6s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Section header (linear.app numbered style) ───────────────────────────────

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

const Yes = () => <span className="text-[#34D399] text-base" aria-label="yes">✓</span>;
const No  = () => <span className="text-slate-700 text-base" aria-label="no">✗</span>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050508] text-white" style={{ fontFamily: SANS }}>
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[800px] pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 75% 50% at 50% -8%, #4FC3F71f 0%, transparent 70%)" }} />
      </div>

      <main className="relative">

        {/* ══════════ HERO ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-24 text-center">
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-10">
            <Link
              href="/app/chat"
              className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}
            >
              Open Blue Chat →
            </Link>
            <Link href="/hub" className="text-sm font-semibold text-[#4FC3F7] border border-[#4FC3F7]/30 px-7 py-3 rounded-xl hover:bg-[#4FC3F7]/5 transition-all">
              Browse Hub
            </Link>
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
                    <span className="w-7 h-7 rounded-lg bg-[#4FC3F7]/15 flex items-center justify-center shrink-0 text-xs">🟦</span>
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
            title={<>Talk to AI.<br /><span className="text-[#4FC3F7]">Build onchain.</span></>}
            sub="Blue Chat is your AI co-founder on Base. Multi-model. Skill-based. Built for builders."
          />
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 sm:p-7">
              <div className="font-mono text-[11px] text-slate-600 mb-3 tracking-widest">SLASH COMMANDS</div>
              <div className="flex flex-wrap gap-2 mb-6">
                {CHAT_COMMANDS.map((c) => (
                  <span key={c} className="font-mono text-[13px] text-[#4FC3F7] border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-lg px-3 py-1.5">{c}</span>
                ))}
              </div>
              <p className="font-mono text-[12px] text-slate-500 leading-relaxed">
                Multi-model <span className="text-slate-400">(Venice · Bankr · Claude)</span> · Install any skill · Pay with credits or <span className="text-[#34D399]">$BLUEAGENT</span>
              </p>
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
                <div className="h-full rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 hover:border-[#A78BFA]/30 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
                    <span className="text-sm font-semibold" style={{ color: cat.color }}>{cat.label}</span>
                  </div>
                  <p className="font-mono text-[12px] text-slate-500 leading-relaxed">{cat.tools}</p>
                </div>
              </Reveal>
            ))}
            <Reveal delay={300}>
              <Link href="/hub" className="h-full flex flex-col justify-center items-start rounded-2xl border border-dashed border-[#A78BFA]/30 bg-[#A78BFA]/[0.03] p-5 hover:bg-[#A78BFA]/[0.06] transition-colors">
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

        {/* ══════════ 3.0 LAUNCH ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="3.0" kicker="Launch" accent="#34D399"
            title={<>From idea to token <span className="text-[#34D399]">in minutes.</span></>}
            sub="Fair launch on Base via Bankr. 100% LP. No hidden allocation. Earn fees from every trade."
          />
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 sm:p-7 flex flex-col gap-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { k: "100B", v: "fixed supply" },
                  { k: "57%", v: "of 1.2% creator fee" },
                  { k: "Gas", v: "sponsored" },
                  { k: "Live", v: "Farcaster + Base App" },
                ].map((s) => (
                  <div key={s.v} className="rounded-xl border border-[#15151f] bg-[#0a0a10] p-4">
                    <div className="text-xl font-bold text-[#34D399] mb-1">{s.k}</div>
                    <div className="font-mono text-[11px] text-slate-500 leading-snug">{s.v}</div>
                  </div>
                ))}
              </div>
              <Link href="/launch" className="self-start text-sm font-semibold text-[#34D399] border border-[#34D399]/30 px-6 py-2.5 rounded-xl hover:bg-[#34D399]/5 transition-all">
                Launch a token →
              </Link>
            </div>
          </Reveal>
        </section>

        {/* ══════════ 4.0 FEED ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="4.0" kicker="Feed" accent="#FB923C"
            title={
              <span className="inline-flex flex-wrap items-center gap-3">
                Live Base intelligence. <span className="text-[#FB923C]">24/7.</span>
                <span className="font-mono text-[10px] tracking-widest text-[#FB923C] border border-[#FB923C]/30 bg-[#FB923C]/5 rounded-full px-3 py-1 align-middle">COMING SOON</span>
              </span>
            }
            sub="Powered by 5 AI tools running every hour."
          />
          <Reveal>
            <div className="flex flex-wrap gap-2">
              {FEED_TOOLS.map((t) => (
                <span key={t} className="font-mono text-[12px] text-slate-400 border border-[#1A1A2E] bg-[#0d0d12] rounded-lg px-3 py-1.5">{t}</span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ══════════ 5.0 AGENTS ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="5.0" kicker="Agents"
            title={<>Three agents. <span className="text-[#4FC3F7]">One platform.</span></>}
            sub="Every output is a 3-agent consensus. Not one model guessing — three roles reasoning."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {AGENTS.map((a, i) => (
              <Reveal key={a.name} delay={i * 80}>
                <div className="h-full rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6" style={{ borderTop: `2px solid ${a.color}` }}>
                  <div className="text-2xl mb-3">{a.glyph}</div>
                  <div className="text-base font-semibold mb-1" style={{ color: a.color }}>{a.name}</div>
                  <p className="font-mono text-[12px] text-slate-500 leading-relaxed">{a.role}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══════════ INTEGRATIONS ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="6.0" kicker="Integrations" accent="#60A5FA"
            title={<>Built for the <span className="text-[#60A5FA]">agent economy</span></>}
            sub="BlueAgent is x402 native from day one. Agents pay agents. No human in the loop."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            {INTEGRATIONS.map((it, i) => (
              <Reveal key={it.name} delay={i * 55}>
                <div className="h-full rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
                  <div className="text-sm font-semibold mb-2" style={{ color: it.color }}>{it.name}</div>
                  <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{it.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          {/* Code snippet — real x402 call */}
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
                <span className="font-mono text-[11px] text-slate-600 ml-2">terminal</span>
              </div>
              <pre className="p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed">
<span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">curl</span><span className="text-slate-300"> https://x402.bankr.bot/0xb058.../token-price \</span>
{"\n"}<span className="text-slate-500">    -d </span><span className="text-[#34D399]">{'\'{"token":"AERO"}\''}</span>
{"\n"}<span className="text-slate-500">→ </span><span className="text-slate-300">{'{"price":0.49,"mcap":465000000,...}'}</span>
{"\n"}<span className="text-slate-600">Charged: </span><span className="text-[#FBBF24]">$0.01 USDC</span>
              </pre>
            </div>
          </Reveal>
        </section>

        {/* ══════════ PRICING ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="7.0" kicker="Pricing" accent="#34D399"
            title={<>Hold $BLUEAGENT. <span className="text-[#34D399]">Build for free.</span></>}
            sub="Credits refresh every day. No subscription. Just hold $BLUEAGENT and build."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {PRICING.map((p, i) => (
              <Reveal key={p.tier} delay={i * 60}>
                <div
                  className="h-full rounded-2xl border p-5 flex flex-col gap-2"
                  style={p.highlight
                    ? { borderColor: "#34D39950", background: "linear-gradient(160deg, #34D39912, #0d0d12)" }
                    : { borderColor: "#1A1A2E", background: "#0d0d12" }}
                >
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
                <a
                  href={BUY_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold px-6 py-2.5 rounded-xl text-center transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #34D399, #10B981)", color: "#031b12" }}
                >
                  Buy $BLUEAGENT →
                </a>
                <Link href="/app/rewards" className="text-sm font-semibold text-[#34D399] border border-[#34D399]/30 px-6 py-2.5 rounded-xl text-center hover:bg-[#34D399]/5 transition-all">
                  Stake now →
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ COMPARISON ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="8.0" kicker="Comparison"
            title={<>Not another AI chat. <span className="text-[#4FC3F7]">Built different.</span></>}
            sub="General AI: great for writing, coding, thinking. BlueAgent: built for building and trading on Base."
          />
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 sm:gap-x-6 px-4 sm:px-6 py-3 border-b border-[#1A1A2E] font-mono text-[9px] sm:text-[11px] text-slate-600 tracking-wider">
                <span>FEATURE</span>
                <span className="w-14 sm:w-20 text-center">ChatGPT</span>
                <span className="w-14 sm:w-20 text-center">Claude</span>
                <span className="w-14 sm:w-20 text-center text-[#4FC3F7]">BlueAgent</span>
              </div>
              {COMPARISON.map((row) => (
                <div key={row.feature} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 sm:gap-x-6 px-4 sm:px-6 py-3 border-b border-[#13131d] last:border-0">
                  <span className="text-[12px] sm:text-sm text-slate-300 pr-2">{row.feature}</span>
                  <span className="w-14 sm:w-20 text-center">{row.gpt ? <Yes /> : <No />}</span>
                  <span className="w-14 sm:w-20 text-center">{row.claude ? <Yes /> : <No />}</span>
                  <span className="w-14 sm:w-20 text-center bg-[#4FC3F7]/[0.04]">{row.blue ? <Yes /> : <No />}</span>
                </div>
              ))}
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
                <img src="/logomark.svg" alt="Blue Agent" className="h-5 w-5 rounded-md" />
                <span className="font-mono text-xs font-bold text-white tracking-widest">BLUE<span className="text-[#4FC3F7]">AGENT</span></span>
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
