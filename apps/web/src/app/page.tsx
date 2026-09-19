"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProofStrip from "@/components/ProofStrip";
import { useLang } from "@/lib/i18n/context";
import { TOOL_COUNT } from "@/lib/agent-tools";

// Marketing surface → mono-forward. JetBrains Mono is the PRIMARY brand voice
// here (display headlines + reading body). DM Sans (.font-ui) is reserved for the
// product app's UI chrome — chat bubbles, dense tables — not this hero page.
const MONO = "'JetBrains Mono', monospace";

// i18n: this landing was fully restructured 2026-09-19 around the wallet →
// credit → chat core. The new/changed copy is English-first; only the
// `HowYouUse` modality tabs still read the existing bilingual `home.use_*`
// keys. Chinese strings for the redesigned sections are a pending follow-up —
// tracked separately so we don't ship stale/mismatched zh.

// ─── Data ────────────────────────────────────────────────────────────────────

// Core positioning: Blue Chat is a non-custodial AI workspace paid in USDC.
// Social proof leads with that spine (non-custodial · USDC on Base · the two
// inference networks · the free daily allowance) — not a legacy tool count.
// Skill count is dynamic (TOOL_COUNT) — never hardcode it.
const SOCIAL_PROOF = ["Non-custodial", "USDC on Base 8453", "Virtuals + Venice inference", "500 free credits/day", `${TOOL_COUNT} skills`];

const CHAT_COMMANDS = ["/idea", "/build", "/audit", "/ship", "/raise", "/pick", "/scan", "/wallet", "/launch"];

// Models available in Blue Chat — the 8 real presets from
// api/_lib/llm.ts (VIRTUALS_PRESETS). `provider` and the per-message credit
// note are the LIVE values; models are switchable mid-conversation and share
// one credit balance. Split: 6 on Virtuals, 2 on Venice (free + live search).
const MODELS: { name: string; provider: "Virtuals" | "Venice"; color: string; note: string; href?: string }[] = [
  { name: "Claude Opus 4.8",   provider: "Virtuals", color: "#4FC3F7", note: "200 cr" },
  { name: "Claude Sonnet 5",   provider: "Virtuals", color: "#60A5FA", note: "50 cr" },
  { name: "DeepSeek V4 Flash", provider: "Virtuals", color: "#34D399", note: "10 cr" },
  { name: "Gemini 2.5 Flash",  provider: "Virtuals", color: "#FBBF24", note: "10 cr" },
  { name: "Grok 4",            provider: "Virtuals", color: "#E879F9", note: "2M ctx" },
  { name: "Qwen 3.5 9B",       provider: "Venice",   color: "#FB923C", note: "free" },
  { name: "Grok 4.3 · Search", provider: "Venice",   color: "#F87171", note: "live web" },
  // Backed by `e2ee-deepseek-v4-flash` in the Virtuals catalog — the claim is
  // real. Links to the Private preset so it's one click to select.
  { name: "Private · E2EE",    provider: "Virtuals", color: "#6EE7B7", note: "no logs", href: "/app/chat?preset=private" },
];

// The core mechanic — wallet → credit → chat. Every number here is the live
// constant from lib/payments.ts (CREDITS_PER_USDC) + lib/credits.ts
// (WALLET_DAILY). Do not hardcode a different figure.
const FLOW: { n: string; color: string; title: string; body: string }[] = [
  { n: "01", color: "#4FC3F7", title: "Connect a wallet",
    body: "Bring your own, or create a free Coinbase Smart Wallet in one tap — no seed phrase, nothing to install. Non-custodial: you hold the keys, we never touch them." },
  { n: "02", color: "#34D399", title: "Top up USDC → credits",
    body: "Send USDC on Base and it settles to credits on-chain: 1 USDC = 2,000 credits. Or start free — 500 credits every day for any connected wallet, no token to hold." },
  { n: "03", color: "#818CF8", title: "Spend it in chat",
    body: "Credits debit per message, priced by the model you pick — switch models any time. If a model call fails, the credits are refunded automatically." },
];

// The two inference networks behind Blue Chat (Halo-style "who powers the
// thinking" block). Roles are the real routing in api/_lib/llm.ts: Virtuals
// serves the frontier + private presets, Venice serves the free tier + the
// only live-web-search preset. The "Built in Venice" link points at the real
// directory repo where Blue Chat is listed (veniceai/builtinvenice, PR #64).
const PROVIDERS: { name: string; color: string; role: string; models: string; href: string; hrefLabel: string }[] = [
  { name: "Virtuals", color: "#22C55E",
    role: "Frontier + private inference — the 6 paid presets.",
    models: "Claude Opus 4.8 · Sonnet 5 · DeepSeek V4 · Gemini 2.5 Flash · Grok 4 · E2EE",
    href: "https://compute.virtuals.io", hrefLabel: "compute.virtuals.io ↗" },
  { name: "Venice", color: "#EF4444",
    role: "The free tier + the only live-web-search model. Privacy-first, no key of yours upstream.",
    models: "Qwen 3.5 9B (free) · Grok 4.3 (live search)",
    href: "https://github.com/veniceai/builtinvenice", hrefLabel: "Listed in Built in Venice ↗" },
];

// Per-message chat credit costs — the live `credits` field on each preset in
// api/_lib/llm.ts. Ordered cheapest → priciest.
const CHAT_PRICES: { label: string; cost: string; sub: string; accent: string }[] = [
  { label: "Free · Qwen 3.5",      cost: "0",   sub: "Venice · chat only",   accent: "#FB923C" },
  { label: "Fast · DeepSeek V4",   cost: "10",  sub: "Virtuals",             accent: "#34D399" },
  { label: "Instant · Gemini 2.5", cost: "10",  sub: "Virtuals · fastest",   accent: "#FBBF24" },
  { label: "Private · E2EE",       cost: "30",  sub: "Virtuals · no logs",   accent: "#6EE7B7" },
  { label: "Balanced · Sonnet 5",  cost: "50",  sub: "Virtuals · default",   accent: "#60A5FA" },
  { label: "Search · Grok 4.3",    cost: "60",  sub: "Venice · live web",    accent: "#F87171" },
  { label: "Grok 4",               cost: "60",  sub: "Virtuals · 2M ctx",    accent: "#E879F9" },
  { label: "Deep · Opus 4.8",      cost: "200", sub: "Virtuals · heavy",     accent: "#4FC3F7" },
];

// USDC credit packs — the live CREDIT_PACKS from lib/payments.ts
// (5/20/50/100 USDC → ×2,000 credits). Amounts are round so the on-chain
// transfer and the "≈ N credits" preview agree exactly.
const PACKS: { usdc: string; credits: string; label: string; popular?: boolean }[] = [
  { usdc: "$5",   credits: "10,000",  label: "Starter" },
  { usdc: "$20",  credits: "40,000",  label: "Plus", popular: true },
  { usdc: "$50",  credits: "100,000", label: "Pro" },
  { usdc: "$100", credits: "200,000", label: "Scale" },
];

const HUB_CATEGORIES = [
  { label: "RH RWA",       color: "#34D399", tools: "rh-stock-arb · rh-stock-movers · rh-stock-swap · rh-rwa-dca" },
  { label: "On-chain",     color: "#FBBF24", tools: "token price · pool scan · gas tracker · bridge route" },
  { label: "Security",     color: "#F87171", tools: "honeypot · risk gate · scam detector · scam-clone check" },
  { label: "Intelligence", color: "#4FC3F7", tools: "token alpha · narrative pulse · whale tracker" },
  { label: "DeFi",         color: "#34D399", tools: "cross-protocol yield · liquidity depth · morpho vault" },
  { label: "Builder",      color: "#A78BFA", tools: "repo health · founder check · roadmap validator" },
];

// Who builds on Blue — persona routing to the real surfaces. Founder → the five
// commands (fixed USDC prices, packages/core BLUE_AGENT_PRICING). Trader → Blue
// Hood (graded in public). Agent-dev → the Hub over x402 + the MCP server.
const SOLUTIONS: { tag: string; title: string; body: string; chips: string[]; href: string; cta: string; color: string }[] = [
  { color: "#4FC3F7", tag: "Founders", title: "Idea → raise, one thread",
    body: "Run the five commands end to end: /idea to shape it, /build for architecture, /audit for a go/no-go, /ship for the launch checklist, /raise for the pitch. A fixed USDC price each — no retainer.",
    chips: ["/idea · $0.05", "/build · $0.50", "/audit · $1.00", "/ship · $0.10", "/raise · $0.20"],
    href: "/app/chat", cta: "Start with /idea →" },
  { color: "#34D399", tag: "Traders", title: "Signals graded in public",
    body: "Blue Hood tracks oracle-vs-DEX drift on tokenized stocks across Base B20 and Robinhood Chain. Every call is signed by you and scored in the open — the misses too, not just the hits.",
    chips: ["Base 8453", "Robinhood 4663", "hits + misses"],
    href: "/track", cta: "See the track record →" },
  { color: "#60A5FA", tag: "Agent builders", title: "Rent the tools, per call",
    body: "Point your own agent at the Hub over x402 — pay per call in USDC, no key exchange, settled on Base. Or attach the MCP server and call Blue from Claude Code, Cursor, or Desktop.",
    chips: [`${TOOL_COUNT} tools`, "x402", "MCP"],
    href: "/hub", cta: "Browse the Hub →" },
];

// Convictions — Halo-style principle band. Each is a literal property of the
// system, not aspiration: verifiable/on-chain stats (ProofStrip), non-custodial
// signing (payments.ts), pay-per-use credits (credits.ts), public grading (Hood).
const CONVICTIONS: { title: string; body: string; color: string }[] = [
  { color: "#0052FF", title: "Verifiable, not vibes", body: "Every stat on this page is aggregate and on-chain. Missing data shows as “—”, never a fake 0." },
  { color: "#34D399", title: "Non-custodial by default", body: "You sign every transaction from your own wallet. We never hold your keys or your funds." },
  { color: "#818CF8", title: "Pay per use", body: "USDC on Base, credits per message. No subscription, no token to hold, no lock-up." },
  { color: "#A78BFA", title: "Misses shown in public", body: "Blue Hood grades every signal it makes — including the calls it got wrong." },
];

// How you use Blue — modality tabs (Dot-style). `k` maps to home.use_<k>_label/desc.
// `soon` modalities render a placeholder preview instead of a live mock.
const USE_TABS: { k: string; color: string; icon: string; soon?: boolean }[] = [
  { k: "chat",    color: "#4FC3F7", icon: "💬" },
  { k: "code",    color: "#818CF8", icon: "‹›" },
  { k: "connect", color: "#34D399", icon: "🧩" },
  { k: "image",   color: "#F472B6", icon: "🎨", soon: true },
  { k: "video",   color: "#E879F9", icon: "🎬", soon: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Chat mockup with typing animation ────────────────────────────────────────
// Reads the chain: the response numbers cite a live source (DexScreener + onchain
// transfers), not a fabricated multi-agent framing.

const CHAT_SEGMENTS: { t: string; cls: string }[] = [
  { t: "/pick", cls: "text-[#4FC3F7]" },
  { t: " AERO — asymmetric setup?", cls: "text-slate-400" },
  { t: "\n↳ token-pick-signal · whale-tracker", cls: "text-[#34D399]" },
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
  { t: '"source"', cls: "text-slate-400" },
  { t: ': "live DexScreener + 50 transfers" }', cls: "text-slate-500" },
  { t: "\n\n50 cr · Sonnet 5 · 2.1s · Base ", cls: "text-slate-500" },
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
        <span className="font-mono text-[12px] text-slate-300">Blue Chat</span>
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

// ─── How you use Blue — modality tabs ─────────────────────────────────────────
// Dot-style tabbed switcher. Each tab renders a left copy panel + a right preview.
// `chat`/`code`/`connect` are live; `image`/`video` are Soon placeholders.

function UsePreview({ tab }: { tab: string }) {
  if (tab === "chat") return <ChatMockup />;

  if (tab === "code") {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
          <span className="font-mono text-[12px] text-[#818CF8]">/build · Opus 4.8</span>
          <span className="ml-auto font-mono text-[10px] text-slate-600">200 cr</span>
        </div>
        <pre className="flex-1 p-4 sm:p-5 whitespace-pre-wrap break-words font-mono text-[12px] sm:text-[13px] leading-relaxed m-0">
<span className="text-[#818CF8]">/build</span><span className="text-slate-400"> a Base points program</span>
{"\n\n"}<span className="text-[#34D399]">▸ stack</span><span className="text-slate-400">   Next.js · viem · Base 8453</span>
{"\n"}<span className="text-[#34D399]">▸ contracts</span><span className="text-slate-400"> Points.sol · Distributor.sol</span>
{"\n"}<span className="text-[#34D399]">▸ tests</span><span className="text-slate-400">   claim · rate-limit · reentrancy</span>
{"\n\n"}<span className="text-slate-500">→ next: </span><span className="text-[#FBBF24]">/audit</span>
        </pre>
      </div>
    );
  }

  if (tab === "connect") {
    const conns = [
      { icon: "🐙", name: "GitHub",    tools: "repos · PRs · code search" },
      { icon: "🔵", name: "Base Docs", tools: "contracts · RPC · deploy" },
      { icon: "📝", name: "Notion",    tools: "pages · search · update" },
      { icon: "📖", name: "DeepWiki",  tools: "any public repo Q&A" },
    ];
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
          <span className="font-mono text-[12px] text-[#34D399]">Blue Connector · MCP</span>
          <span className="ml-auto font-mono text-[10px] text-slate-600">attached</span>
        </div>
        <div className="flex-1 p-4 sm:p-5 space-y-2.5">
          {conns.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg border border-[#15151f] bg-[#0a0a10] px-3 py-2.5">
              <span className="text-lg">{c.icon}</span>
              <span className="font-mono text-[13px] text-slate-300">{c.name}</span>
              <span className="ml-auto font-mono text-[11px] text-slate-600">{c.tools}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" style={{ boxShadow: "0 0 6px #34D399" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // image / video → Soon placeholder
  return (
    <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0d0d12] h-full flex flex-col items-center justify-center gap-3 p-10 min-h-[280px]">
      <span className="text-4xl opacity-70">{tab === "image" ? "🎨" : "🎬"}</span>
      <span className="font-mono text-[11px] uppercase tracking-wider text-[#FBBF24] border border-[#FBBF24]/30 bg-[#FBBF24]/5 rounded px-2 py-0.5">Soon</span>
    </div>
  );
}

function HowYouUse() {
  const { t } = useLang();
  const [active, setActive] = useState("chat");
  const tab = USE_TABS.find((x) => x.k === active) ?? USE_TABS[0];
  return (
    <div>
      {/* Tab bar */}
      <Reveal className="mb-8">
        <div className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl border border-[#1A1A2E] bg-[#0a0a10]">
          {USE_TABS.map((x) => {
            const on = x.k === active;
            return (
              <button key={x.k} onClick={() => setActive(x.k)}
                className="flex items-center gap-2 font-mono text-[12px] sm:text-[13px] rounded-xl px-3.5 py-2 transition-all"
                style={on
                  ? { background: `${x.color}1a`, color: x.color, border: `1px solid ${x.color}40` }
                  : { color: "#64748b", border: "1px solid transparent" }}>
                <span>{x.icon}</span>
                {t(`home.use_${x.k}_label`)}
                {x.soon && <span className="text-[9px] uppercase tracking-wider text-[#FBBF24]">soon</span>}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Panel */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
        <Reveal key={`copy-${active}`}>
          <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col justify-center">
            <div className="text-lg font-semibold mb-2" style={{ color: tab.color }}>
              {t(`home.use_${tab.k}_label`)}
            </div>
            <p className="text-slate-400 text-[14px] sm:text-[15px] leading-relaxed mb-5">
              {t(`home.use_${tab.k}_desc`)}
            </p>
            {tab.k === "chat" && (
              <div className="flex flex-wrap gap-2">
                {CHAT_COMMANDS.map((c) => (
                  <span key={c} className="font-mono text-[12px] text-[#4FC3F7] border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-lg px-2.5 py-1">{c}</span>
                ))}
              </div>
            )}
          </div>
        </Reveal>
        <Reveal key={`prev-${active}`} delay={60}>
          <UsePreview tab={active} />
        </Reveal>
      </div>
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
            <span className="font-mono text-[10px] text-[#4FC3F7] tracking-[0.18em] uppercase">Blue Chat · non-custodial · live on Base</span>
          </div>

          {/* Hero — the core product is the wallet + credit + chat loop. Two-beat
              mono headline: pay in USDC, then think onchain across every model. */}
          <h1 className="text-[2.75rem] leading-[1.04] sm:text-6xl lg:text-7xl font-bold tracking-tight mb-5">
            Pay in USDC.<br className="hidden sm:block" /> <span className="text-[#4FC3F7]">Think onchain.</span>
          </h1>
          <p className="text-base sm:text-xl text-slate-400 mb-9 max-w-2xl mx-auto leading-relaxed">
            Blue Chat is a non-custodial AI workspace. Create a wallet, top up USDC for credits, and
            spend them across every frontier model — reasoning, code, live web, onchain tools. No
            subscription, no token to hold. Every number verifiable on Base.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
              Open Blue Chat →
            </Link>
            <a href="#flow" className="text-sm font-semibold text-[#34D399] border border-[#34D399]/30 px-7 py-3 rounded-xl hover:bg-[#34D399]/5 transition-all">
              How credits work
            </a>
            <Link href="/hub" className="text-sm font-semibold text-[#A78BFA] border border-[#A78BFA]/30 px-7 py-3 rounded-xl hover:bg-[#A78BFA]/5 transition-all">
              Browse the Hub
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

          {/* Product mockup — Blue Chat window: a prompt, the model it ran on,
              the answer, and the credit cost debited. Shows the real loop
              (chat + model choice + credits), not a fabricated framing. */}
          <Reveal delay={120} className="mt-14 sm:mt-20">
            <div className="relative max-w-3xl mx-auto">
              <div className="absolute -inset-4 rounded-3xl pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 30%, #4FC3F715 0%, transparent 70%)" }} />
              <div className="relative rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden shadow-2xl text-left">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/70" />
                  <span className="font-mono text-[11px] text-slate-600 ml-2">Blue Chat · blueagent.dev</span>
                  <span className="ml-auto font-mono text-[10px] text-[#34D399] border border-[#34D399]/25 bg-[#34D399]/5 rounded px-2 py-0.5">500 cr free today</span>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="flex justify-end">
                    <div className="bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                      <span className="font-mono text-[13px] text-[#9BD9F5]">Draft a Base points contract, then audit it.</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[#4FC3F7]/15 flex items-center justify-center shrink-0">
                      <img src="/logomark.svg" alt="BlueAgent" width={16} height={16} className="rounded" />
                    </span>
                    <div className="flex-1 space-y-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/25 bg-[#4FC3F7]/5 rounded px-2 py-0.5">◆ Claude Opus 4.8 · Deep</span>
                        <span className="font-mono text-[10px] text-[#818CF8] border border-[#818CF8]/25 bg-[#818CF8]/5 rounded px-2 py-0.5">/build → /audit</span>
                        <span className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded px-2 py-0.5">200 cr</span>
                      </div>
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        <span className="text-white font-semibold">Points.sol</span> + Distributor scaffolded on Base 8453 — claim, rate-limit, reentrancy tests included. Audit flags one reentrancy path on <span className="text-[#FBBF24]">_claim()</span>; patch suggested. Ready to ship.
                      </p>
                      <p className="text-[11px] text-slate-600 font-mono">Virtuals inference · debited from today&apos;s free credits · non-custodial</p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[#15151f] flex items-center gap-2">
                  <div className="flex-1 bg-[#0f0f17] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-[12px] text-slate-600">Ask anything, or type /</div>
                  <span className="font-mono text-[10px] text-slate-600">8 models</span>
                  <span className="w-8 h-8 rounded-lg bg-[#4FC3F7]/15 flex items-center justify-center text-[#4FC3F7]">↑</span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ 01 THE FLOW — wallet → credit → chat ══════════ */}
        <section id="flow" className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d] scroll-mt-24">
          <SectionHead
            num="01" kicker="How it works" accent="#4FC3F7"
            title={<>One wallet. Credits in USDC. <span className="text-[#4FC3F7]">Every model.</span></>}
            sub="No accounts, no card, no subscription. Connect a wallet, fund it in USDC, and start spending in chat — the whole loop is non-custodial and settles on Base."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {FLOW.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="font-mono text-sm font-bold rounded-lg px-2.5 py-1" style={{ color: s.color, background: `${s.color}12`, border: `1px solid ${s.color}30` }}>{s.n}</span>
                    {i < FLOW.length - 1 && <span className="text-slate-700 text-lg">→</span>}
                  </div>
                  <div className="text-base font-semibold mb-2 text-white">{s.title}</div>
                  <p className="font-mono text-[12.5px] text-slate-500 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={260}>
            <p className="font-mono text-[12px] text-slate-500 mt-6">
              Rate: <span className="text-slate-300">1 USDC = 2,000 credits</span> · free tier <span className="text-slate-300">500 cr/day</span> for any wallet ·
              settled to the Blue treasury on Base via a direct USDC transfer you sign.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 02 EVERY MODEL ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="02" kicker="Inference" accent="#818CF8"
            title={<>One chat. <span className="text-[#818CF8]">Every frontier model.</span></>}
            sub="Switch models mid-conversation — frontier reasoning, fast and cheap, private E2EE, and live web search. One credit balance across all of them; you never juggle API keys."
          />
          <Reveal delay={80}>
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-6">
              {MODELS.map((m) => {
                const chip = (
                  <span
                    className={"flex items-center gap-2 font-mono text-[12px] sm:text-[13px] rounded-full border px-3.5 py-1.5 " + (m.href ? "hover:brightness-125 transition-all cursor-pointer" : "")}
                    style={{ borderColor: `${m.color}33`, background: `${m.color}0d`, color: m.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }} />
                    {m.name}
                    <span className="text-slate-500 text-[10px]">· {m.provider} · {m.note}</span>
                  </span>
                );
                return m.href
                  ? <a key={m.name} href={m.href} aria-label={`Open ${m.name} preset in Blue Chat`}>{chip}</a>
                  : <span key={m.name}>{chip}</span>;
              })}
            </div>
          </Reveal>
          <Reveal delay={140}>
            <p className="font-mono text-[12px] text-slate-500 text-center">
              6 on <span className="text-[#22C55E]">Virtuals</span> · 2 on <span className="text-[#EF4444]">Venice</span> — switch any time, one balance.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 03 HOW YOU USE IT ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="03" kicker="Modalities" accent="#34D399"
            title={<>One chat. <span className="text-[#34D399]">Every job.</span></>}
            sub="Chat, ship code, attach your tools over MCP — same window, same credits. Image and video are on the way."
          />
          <HowYouUse />
        </section>

        {/* ══════════ 04 BUILT ON VIRTUALS + VENICE ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="04" kicker="Powered by" accent="#A78BFA"
            title={<>The inference behind <span className="text-[#A78BFA]">Blue Chat.</span></>}
            sub="Blue Chat doesn't train its own model — it routes your message to two inference networks and settles the cost in credits. You bring a wallet; they bring the thinking."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {PROVIDERS.map((p, i) => (
              <Reveal key={p.name} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
                    <span className="text-lg font-semibold" style={{ color: p.color }}>{p.name}</span>
                  </div>
                  <p className="text-slate-400 text-[14px] leading-relaxed mb-4">{p.role}</p>
                  <p className="font-mono text-[11.5px] text-slate-500 leading-relaxed mb-5">{p.models}</p>
                  <a href={p.href} target="_blank" rel="noopener noreferrer"
                    className="mt-auto font-mono text-[12px] hover:underline" style={{ color: p.color }}>
                    {p.hrefLabel}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <p className="font-mono text-[12px] text-slate-500 mt-6">
              Blue Chat is listed as a powered-by-Venice project in the public <span className="text-slate-300">Built in Venice</span> directory.
              Frontier + private inference is served through Virtuals compute.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 05 PROOF — tested with real funds (live public stats) ══════════ */}
        <ProofStrip />

        {/* ══════════ 06 SKILLS — Hood + Hub, built from the agent ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="06" kicker="Skills, not separate apps" accent="#34D399"
            title={<>Products the agent <span className="text-[#34D399]">builds for you.</span></>}
            sub="Blue Hood and the Hub aren't other apps to log into — they're skills Blue Agent runs. Same wallet, same credits, same chat window."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Reveal>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎯</span>
                  <span className="text-base font-semibold text-[#34D399]">Blue Hood</span>
                </div>
                <p className="text-slate-400 text-[14px] leading-relaxed mb-4">
                  Oracle-vs-DEX drift on tokenized stocks — Base B20 and Robinhood Chain. Every signal is signed by
                  you, and every call is graded in public: hits and misses.
                </p>
                <div className="flex gap-4 mt-auto">
                  <Link href="/app/hood" className="font-mono text-[12px] text-[#34D399] hover:underline">Open Blue Hood →</Link>
                  <Link href="/track" className="font-mono text-[12px] text-slate-500 hover:underline">Track record →</Link>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🛒</span>
                  <span className="text-base font-semibold text-[#A78BFA]">Blue Hub</span>
                </div>
                <p className="text-slate-400 text-[14px] leading-relaxed mb-4">
                  {TOOL_COUNT} pay-per-call tools — RWA, on-chain data, security, DeFi, intelligence, builder.
                  Called right inside the chat, or over x402 from your own agent.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {HUB_CATEGORIES.map((c) => (
                    <span key={c.label} className="font-mono text-[10px] rounded px-2 py-0.5 border"
                      style={{ color: c.color, borderColor: `${c.color}30`, background: `${c.color}0d` }}>{c.label}</span>
                  ))}
                </div>
                <Link href="/hub" className="mt-auto font-mono text-[12px] text-[#A78BFA] hover:underline">Browse all {TOOL_COUNT} tools →</Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ 07 WHO BUILDS ON BLUE — personas ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="07" kicker="Who builds on Blue" accent="#4FC3F7"
            title={<>One agent, <span className="text-[#4FC3F7]">three ways to work.</span></>}
            sub="Founders ship products, traders read the market, agent builders rent the tooling — one wallet, one credit balance, and the same skills behind all three."
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {SOLUTIONS.map((s, i) => (
              <Reveal key={s.tag} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  <div className="font-mono text-[10px] tracking-widest uppercase mb-3" style={{ color: s.color }}>{s.tag}</div>
                  <div className="text-base font-semibold mb-2 text-white">{s.title}</div>
                  <p className="text-slate-400 text-[13.5px] leading-relaxed mb-4">{s.body}</p>
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {s.chips.map((c) => (
                      <span key={c} className="font-mono text-[10px] rounded px-2 py-0.5 border"
                        style={{ color: s.color, borderColor: `${s.color}30`, background: `${s.color}0d` }}>{c}</span>
                    ))}
                  </div>
                  <Link href={s.href} className="mt-auto font-mono text-[12px] hover:underline" style={{ color: s.color }}>{s.cta}</Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══════════ 08 CREDITS & PRICING — public ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="08" kicker="Credits & pricing" accent="#34D399"
            title={<>Every price, <span className="text-[#34D399]">in the open.</span></>}
            sub="No hidden tiers. Here is exactly what a message costs, what a top-up buys, and what you get for free."
          />

          {/* Free + top-up rails */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <Reveal>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col">
                <div className="text-sm font-semibold mb-3 text-[#34D399]">Free, every day</div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-white tracking-tight">500</span>
                  <span className="font-mono text-[12px] text-slate-500">credits / day · any connected wallet</span>
                </div>
                <p className="font-mono text-[12px] text-slate-500 leading-relaxed mt-2">
                  100 cr/day with no wallet at all. No token to hold, nothing to stake — the daily bucket resets every 24h.
                </p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col">
                <div className="text-sm font-semibold mb-3 text-[#4FC3F7]">Top up in USDC</div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-white tracking-tight">1 USDC</span>
                  <span className="font-mono text-[12px] text-slate-500">= 2,000 credits</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PACKS.map((p) => (
                    <div key={p.usdc} className="rounded-lg border p-2 text-center"
                      style={p.popular ? { borderColor: "#4FC3F740", background: "#4FC3F70d" } : { borderColor: "#1A1A2E" }}>
                      <div className="font-mono text-[13px] font-bold text-white">{p.usdc}</div>
                      <div className="font-mono text-[10px] text-slate-500">{p.credits}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Per-message model costs */}
          <Reveal delay={120}>
            <div className="ba-card rounded-2xl p-6">
              <div className="text-sm font-semibold mb-4 text-[#818CF8]">Per message, by model</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CHAT_PRICES.map((c) => (
                  <div key={c.label} className="rounded-lg border border-[#15151f] bg-[#0a0a10] p-3">
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-xl font-bold tracking-tight" style={{ color: c.accent }}>{c.cost}</span>
                      <span className="font-mono text-[10px] text-slate-600">cr</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-300 leading-tight">{c.label}</div>
                    <div className="font-mono text-[10px] text-slate-600 mt-0.5">{c.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <p className="font-mono text-[12px] text-slate-500 mt-6">
              Hub tools are pay-per-call in USDC over x402 — from <span className="text-slate-300">$0.05</span>.
              Non-custodial, no subscription; purchased credits don&apos;t expire, the free daily bucket resets every 24h.
              A failed model call is refunded automatically.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 09 RUNS WHERE YOU BUILD — MCP ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="09" kicker="In your editor" accent="#818CF8"
            title={<>Blue runs <span className="text-[#818CF8]">where you build.</span></>}
            sub="Chat is one way in. The other: attach Blue as an MCP server and call it straight from Claude Code, Cursor, or Claude Desktop — the five commands and the Hub skills, without leaving your editor."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-stretch">
            <Reveal>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
                  <span className="font-mono text-[11px] text-slate-600 ml-2">Claude Code · Cursor · Desktop</span>
                </div>
                <pre className="flex-1 p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed m-0">
<span className="text-slate-600"># one-line install — Claude Code</span>
{"\n"}<span className="text-slate-600">$ </span><span className="text-[#818CF8]">claude mcp add</span><span className="text-slate-300"> blue-agent \</span>
{"\n"}<span className="text-slate-500">    --transport http https://blueagent.dev/api/mcp</span>
{"\n\n"}<span className="text-slate-600"># …or drop into any MCP config</span>
{"\n"}<span className="text-slate-500">{'{ "mcpServers": {'}</span>
{"\n"}<span className="text-slate-500">{'    "blue-agent": { "url": '}</span><span className="text-[#34D399]">{'"https://blueagent.dev/api/mcp"'}</span><span className="text-slate-500">{' } } }'}</span>
                </pre>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="text-sm font-semibold mb-3 text-[#818CF8]">The commands, in your agent</div>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {["blue_idea", "blue_build", "blue_audit", "blue_ship", "blue_raise"].map((c) => (
                    <span key={c} className="font-mono text-[11px] text-[#818CF8] border border-[#818CF8]/25 bg-[#818CF8]/5 rounded px-2 py-1">{c}</span>
                  ))}
                </div>
                <p className="font-mono text-[12px] text-slate-500 leading-relaxed mb-5">
                  It&apos;s a remote HTTP server — nothing to install, no key to provision. Your editor calls the same skills the chat runs, from /idea all the way to /raise.
                </p>
                <Link href="/docs/mcp" className="mt-auto text-sm font-semibold text-[#818CF8] border border-[#818CF8]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#818CF8]/5 transition-all">
                  MCP setup →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ 10 BUILD ON THE API — x402 ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <SectionHead
            num="10" kicker="x402 API" accent="#60A5FA"
            title={<>Every skill is a <span className="text-[#60A5FA]">paid endpoint.</span></>}
            sub={<>Point your own agent at any of the {TOOL_COUNT} Hub tools over x402. It signs a USDC payment on Base and gets the result back — no account, no API key to provision, self-hosted through the Coinbase CDP facilitator.</>}
          />
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60" />
                <span className="font-mono text-[11px] text-slate-600 ml-2">terminal</span>
              </div>
              <pre className="p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed m-0">
<span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">curl</span><span className="text-slate-300"> https://blueagent.dev/api/x402/rh-stock-arb \</span>
{"\n"}<span className="text-slate-500">    -d </span><span className="text-[#34D399]">{'\'{"ticker":"NVDA"}\''}</span>
{"\n"}<span className="text-slate-500">→ </span><span className="text-slate-300">{'{"verdict":"ALIGNED","oracle":208.37,"dex":210.38,"drift":0.97,...}'}</span>
{"\n"}<span className="text-slate-600">Charged: </span><span className="text-[#FBBF24]">$0.05 USDC · Base</span>
              </pre>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Reveal>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {["Self-hosted x402", "EIP-3009", "Coinbase CDP facilitator", "USDC · Base 8453", "from $0.05 / call"].map((f) => (
                    <span key={f} className="font-mono text-[10px] text-[#60A5FA] border border-[#60A5FA]/25 bg-[#60A5FA]/5 rounded px-2 py-1">{f}</span>
                  ))}
                </div>
                <p className="font-mono text-[12px] text-slate-500 leading-relaxed">
                  No storefront in the middle — Blue builds its own 402 payment requirement and settles the USDC transfer you sign. The caller pays per call; nothing is metered or subscribed.
                </p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col justify-center gap-3">
                <Link href="/hub" className="text-sm font-semibold text-[#A78BFA] border border-[#A78BFA]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#A78BFA]/5 transition-all">
                  Browse all {TOOL_COUNT} tools →
                </Link>
                <Link href="/docs" className="text-sm font-semibold text-[#60A5FA] border border-[#60A5FA]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#60A5FA]/5 transition-all">
                  Read the API docs →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ CONVICTIONS ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
          <Reveal className="mb-10">
            <div className="font-mono text-[11px] tracking-[0.22em] mb-4">
              <span className="text-[#0052FF]">// principles</span>
              <span className="text-slate-600 ml-2 uppercase">What we won&apos;t do</span>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {CONVICTIONS.map((c, i) => (
              <Reveal key={c.title} delay={i * 70}>
                <div className="ba-card h-full rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                    <span className="text-base font-semibold text-white">{c.title}</span>
                  </div>
                  <p className="font-mono text-[12.5px] text-slate-500 leading-relaxed">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══════════ FINAL CTA ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-20 sm:py-28 border-t border-[#13131d]">
          <Reveal>
            <div className="rounded-3xl border border-[#4FC3F7]/20 p-8 sm:p-14 text-center" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 40%, #4FC3F710 0%, transparent 70%)" }}>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
                Pay in USDC. <span className="text-[#4FC3F7]">Think onchain.</span>
              </h2>
              <p className="text-slate-400 text-[15px] sm:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
                Connect a wallet and start with 500 free credits today — no card, no subscription.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
                  Open Blue Chat →
                </Link>
                <Link href="/hub" className="text-sm font-semibold text-[#A78BFA] border border-[#A78BFA]/30 px-7 py-3 rounded-xl hover:bg-[#A78BFA]/5 transition-all">
                  Browse the Hub
                </Link>
                <Link href="/docs/mcp" className="text-sm font-semibold text-slate-400 border border-[#1A1A2E] px-7 py-3 rounded-xl hover:text-white hover:border-[#4FC3F7]/30 transition-all">
                  Install MCP
                </Link>
                <Link href="/docs" className="text-sm font-semibold text-slate-400 border border-[#1A1A2E] px-7 py-3 rounded-xl hover:text-white hover:border-[#4FC3F7]/30 transition-all">
                  Read the docs
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
                <span className="text-xs text-slate-500">· The onchain agent</span>
              </div>
              <p className="font-mono text-[11px] text-slate-600">Built on Virtuals + Venice inference · x402 native · Base</p>
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
