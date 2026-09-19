"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import LiveUsage from "@/components/LiveUsage";
import { useLang } from "@/lib/i18n/context";
import { TOOL_COUNT } from "@/lib/agent-tools";

// Marketing surface → mono-forward. JetBrains Mono is the PRIMARY brand voice
// here (display headlines + reading body). DM Sans (.font-ui) is reserved for the
// product app's UI chrome — chat bubbles, dense tables — not this hero page.
const MONO = "'JetBrains Mono', monospace";

// Single-accent by design (2026-09-19): the landing uses ONE blue, #4FC3F7, for
// every accent. `ACCENT` is that blue as a literal — used for dots, glowing
// fills, low-opacity tint backgrounds and borders, which read fine on both the
// dark and light palettes. Accent TEXT that must stay WCAG-readable on a white
// card uses the `.ln-accent` class instead (it resolves to --ln-accent-ink,
// which darkens to sky-600 in light mode). Everything non-accent is neutral and
// flips with the theme via the `.ln-*` tone classes (see globals.css).
const ACCENT = "#4FC3F7";

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

// Chat capabilities — honest, NOT a fake slash menu. The five founder workflows
// run in plain language (there is no literal `/idea`); the ONLY literal slash
// command is `/skill` (install skill packs, ChatInput.tsx). Models switch
// mid-thread on one balance; MCP + Hub tools, web search and file upload are all
// live. Do not reintroduce `/pick`, `/scan`, `/wallet` or `/launch` — none are
// real commands and `/launch` names a retired surface.
const CHAT_CAPS = [
  "idea · build · audit · ship · raise",
  "/skill packs",
  "8 models, one balance",
  "MCP + Hub tools",
  "web search · file upload",
];

// Wallet actions that run INSIDE Blue Chat — each is a real, registered chat
// tool (api/chat schemas), and each is NON-CUSTODIAL: Blue only *prepares* the
// transaction (a 0x/route quote + calldata) and YOU sign it from your own
// wallet. Base 8453 unless the row names Robinhood Chain (4663). The Base-MCP
// get_wallets/send/swap primitives are intentionally excluded — still "soon",
// not wired (chat/agent-skills.ts), so listing them would over-promise.
const WALLET_ACTIONS: { label: string; note: string }[] = [
  { label: "Check balance", note: "portfolio + tokens" },
  { label: "Send",         note: "USDC / ERC-20 · Base" },
  { label: "Swap",         note: "0x quote · Base" },
  { label: "Earn yield",   note: "supply to a vault" },
  { label: "RH swap",      note: "Robinhood Chain" },
  { label: "Bridge",       note: "Base ↔ RH" },
];

// Models available in Blue Chat — the 8 real presets from api/_lib/llm.ts
// (VIRTUALS_PRESETS). `provider` and the per-message credit note are the LIVE
// values; models are switchable mid-conversation and share one credit balance.
// Split: 6 on Virtuals, 2 on Venice (free + live search).
const MODELS: { name: string; provider: "Virtuals" | "Venice"; note: string; href?: string }[] = [
  { name: "Claude Opus 4.8",   provider: "Virtuals", note: "200 cr" },
  { name: "Claude Sonnet 5",   provider: "Virtuals", note: "50 cr" },
  { name: "DeepSeek V4 Flash", provider: "Virtuals", note: "10 cr" },
  { name: "Gemini 2.5 Flash",  provider: "Virtuals", note: "10 cr" },
  { name: "Grok 4",            provider: "Virtuals", note: "2M ctx" },
  { name: "Qwen 3.5 9B",       provider: "Venice",   note: "free" },
  { name: "Grok 4.3 · Search", provider: "Venice",   note: "live web" },
  // Backed by `e2ee-deepseek-v4-flash` in the Virtuals catalog — the claim is
  // real. Links to the Private preset so it's one click to select.
  { name: "Private · E2EE",    provider: "Virtuals", note: "no logs", href: "/app/chat?preset=private" },
];

// The core mechanic — wallet → credit → chat. Every number here is the live
// constant from lib/payments.ts (CREDITS_PER_USDC) + lib/credits.ts
// (WALLET_DAILY). Do not hardcode a different figure.
const FLOW: { n: string; title: string; body: string }[] = [
  { n: "01", title: "Connect a wallet",
    body: "Bring your own, or create a free Coinbase Smart Wallet in one tap — no seed phrase, nothing to install. Non-custodial: you hold the keys, we never touch them." },
  { n: "02", title: "Top up USDC → credits",
    body: "Send USDC on Base and it settles to credits on-chain: 1 USDC = 2,000 credits. Or start free — 500 credits every day for any connected wallet, no token to hold." },
  { n: "03", title: "Spend it in chat",
    body: "Credits debit per message, priced by the model you pick — switch models any time. If a model call fails, the credits are refunded automatically." },
];

// The two inference networks behind Blue Chat (Halo-style "who powers the
// thinking" block). Roles are the real routing in api/_lib/llm.ts: Virtuals
// serves the frontier + private presets, Venice serves the free tier + the
// only live-web-search preset. The "Built in Venice" link points at the real
// directory repo where Blue Chat is listed (veniceai/builtinvenice, PR #64).
// `logo` is a drop-in provider mark (public/models/<slug>.svg, same convention
// as the model-maker marks); it hides itself on 404 until the SVG is added.
const PROVIDERS: { name: string; role: string; models: string; href: string; hrefLabel: string; logo: string }[] = [
  { name: "Virtuals", logo: "/models/virtuals.svg",
    role: "Frontier + private inference — the 6 paid presets.",
    models: "Claude Opus 4.8 · Sonnet 5 · DeepSeek V4 · Gemini 2.5 Flash · Grok 4 · E2EE",
    href: "https://compute.virtuals.io", hrefLabel: "compute.virtuals.io ↗" },
  { name: "Venice", logo: "/models/venice.svg",
    role: "The free tier + the only live-web-search model. Privacy-first, no key of yours upstream.",
    models: "Qwen 3.5 9B (free) · Grok 4.3 (live search)",
    href: "https://github.com/veniceai/builtinvenice", hrefLabel: "Listed in Built in Venice ↗" },
];

// USDC credit packs — the live CREDIT_PACKS from lib/payments.ts
// (5/20/50/100 USDC → ×2,000 credits). Amounts are round so the on-chain
// transfer and the "≈ N credits" preview agree exactly. `cr` is numeric so the
// "≈ N messages" estimate is DERIVED in code (cr ÷ SONNET_CR), never a
// marketing figure.
const PACKS: { usdc: string; cr: number; label: string; popular?: boolean }[] = [
  { usdc: "$5",   cr: 10_000,  label: "Starter" },
  { usdc: "$20",  cr: 40_000,  label: "Plus", popular: true },
  { usdc: "$50",  cr: 100_000, label: "Pro" },
  { usdc: "$100", cr: 200_000, label: "Scale" },
];

// Sonnet 5 per-message credit cost (the MODELS note). The single anchor for the
// honest "≈ N messages" yardstick on the free tier + each pack — every tier
// gets EVERY model, so this is only a scale reference, not a gated feature.
const SONNET_CR = 50;
const FREE_DAILY = 500; // WALLET_DAILY (credits.ts) — free credits per wallet/day.

const HUB_CATEGORIES = [
  { label: "RH RWA",       tools: "rh-stock-arb · rh-stock-movers · rh-stock-swap · rh-rwa-dca" },
  { label: "On-chain",     tools: "token price · pool scan · gas tracker · bridge route" },
  { label: "Security",     tools: "honeypot · risk gate · scam detector · scam-clone check" },
  { label: "Intelligence", tools: "token alpha · narrative pulse · whale tracker" },
  { label: "DeFi",         tools: "cross-protocol yield · liquidity depth · morpho vault" },
  { label: "Builder",      tools: "repo health · founder check · roadmap validator" },
];

// Who builds on Blue — persona routing to the real surfaces. Founder → the five
// commands (fixed USDC prices, packages/core BLUE_AGENT_PRICING). Trader → Blue
// Hood (graded in public). Agent-dev → the Hub over x402 + the MCP server.
const SOLUTIONS: { tag: string; title: string; body: string; chips: string[]; href: string; cta: string }[] = [
  { tag: "Founders", title: "Idea → raise, one thread",
    body: "Run the five commands end to end: /idea to shape it, /build for architecture, /audit for a go/no-go, /ship for the launch checklist, /raise for the pitch. A fixed USDC price each — no retainer.",
    chips: ["/idea · $0.05", "/build · $0.50", "/audit · $1.00", "/ship · $0.10", "/raise · $0.20"],
    href: "/app/chat", cta: "Start with /idea →" },
  { tag: "Traders", title: "Signals graded in public",
    body: "Blue Hood tracks oracle-vs-DEX drift on tokenized stocks across Base B20 and Robinhood Chain. Every call is signed by you and scored in the open — the misses too, not just the hits.",
    chips: ["Base 8453", "Robinhood 4663", "hits + misses"],
    href: "/track", cta: "See the track record →" },
  { tag: "Agent builders", title: "Rent the tools, per call",
    body: "Point your own agent at the Hub over x402 — pay per call in USDC, no key exchange, settled on Base. Or attach the MCP server and call Blue from Claude Code, Cursor, or Desktop.",
    chips: [`${TOOL_COUNT} tools`, "x402", "MCP"],
    href: "/hub", cta: "Browse the Hub →" },
];

// How you use Blue — modality tabs (Dot-style). `k` maps to home.use_<k>_label/desc.
// `soon` modalities render a placeholder preview instead of a live mock.
const USE_TABS: { k: string; icon: string; soon?: boolean }[] = [
  { k: "chat",    icon: "💬" },
  { k: "code",    icon: "‹›" },
  { k: "connect", icon: "🧩" },
  { k: "image",   icon: "🎨", soon: true },
  { k: "video",   icon: "🎬", soon: true },
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

function SectionHead({ num, kicker, title, sub }: {
  num: string; kicker: string; title: React.ReactNode; sub?: React.ReactNode;
}) {
  return (
    <Reveal className="mb-10 sm:mb-14">
      <div className="font-mono text-[11px] tracking-[0.22em] mb-4">
        <span className="ln-accent">// {num}</span>
        <span className="ln-faint ml-2 uppercase">{kicker}</span>
      </div>
      <h2 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight leading-[1.06] mb-4 max-w-2xl ln-h">
        {title}
      </h2>
      {sub && <p className="ln-body text-[15px] sm:text-lg leading-relaxed max-w-2xl">{sub}</p>}
    </Reveal>
  );
}

// ─── Chat mockup with typing animation ────────────────────────────────────────
// A dark "screen" — stays dark in both themes, like a real terminal. Reads the
// chain: the response numbers cite a live source (DexScreener + onchain
// transfers), not a fabricated multi-agent framing. Single-accent: blue for
// keywords/values-of-note, neutral slate for everything else.

const CHAT_SEGMENTS: { t: string; cls: string }[] = [
  { t: "Is AERO an asymmetric setup right now?", cls: "text-slate-300" },
  { t: "\n↳ token-pick-signal · whale-tracker", cls: "text-slate-500" },
  { t: "\n\n{ ", cls: "text-slate-500" },
  { t: '"signal"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: '"BUY"', cls: "text-[#4FC3F7] font-semibold" },
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
  { t: "✓", cls: "text-[#4FC3F7]" },
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
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
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
// `chat`/`code`/`connect` are live; `image`/`video` are Soon placeholders. The
// preview panels are dark "screens" and stay dark in both themes.

function UsePreview({ tab }: { tab: string }) {
  if (tab === "chat") return <ChatMockup />;

  if (tab === "code") {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
          <span className="font-mono text-[12px] text-[#4FC3F7]">/build · Opus 4.8</span>
          <span className="ml-auto font-mono text-[10px] text-slate-600">200 cr</span>
        </div>
        <pre className="flex-1 p-4 sm:p-5 whitespace-pre-wrap break-words font-mono text-[12px] sm:text-[13px] leading-relaxed m-0">
<span className="text-[#4FC3F7]">/build</span><span className="text-slate-400"> a Base points program</span>
{"\n\n"}<span className="text-[#4FC3F7]">▸ stack</span><span className="text-slate-400">   Next.js · viem · Base 8453</span>
{"\n"}<span className="text-[#4FC3F7]">▸ contracts</span><span className="text-slate-400"> Points.sol · Distributor.sol</span>
{"\n"}<span className="text-[#4FC3F7]">▸ tests</span><span className="text-slate-400">   claim · rate-limit · reentrancy</span>
{"\n\n"}<span className="text-slate-500">→ next: </span><span className="text-[#4FC3F7]">/audit</span>
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
          <span className="font-mono text-[12px] text-[#4FC3F7]">Blue Connector · MCP</span>
          <span className="ml-auto font-mono text-[10px] text-slate-600">attached</span>
        </div>
        <div className="flex-1 p-4 sm:p-5 space-y-2.5">
          {conns.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-lg border border-[#15151f] bg-[#0a0a10] px-3 py-2.5">
              <span className="text-lg">{c.icon}</span>
              <span className="font-mono text-[13px] text-slate-300">{c.name}</span>
              <span className="ml-auto font-mono text-[11px] text-slate-600">{c.tools}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" style={{ boxShadow: "0 0 6px #4FC3F7" }} />
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
      <span className="font-mono text-[11px] uppercase tracking-wider text-[#4FC3F7] border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 rounded px-2 py-0.5">Soon</span>
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
        <div className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl border ln-brd" style={{ background: "var(--ln-card)" }}>
          {USE_TABS.map((x) => {
            const on = x.k === active;
            return (
              <button key={x.k} onClick={() => setActive(x.k)}
                className={"flex items-center gap-2 font-mono text-[12px] sm:text-[13px] rounded-xl px-3.5 py-2 transition-all " + (on ? "" : "ln-mut")}
                style={on
                  ? { background: "#4FC3F71a", color: "var(--ln-accent-ink)", border: "1px solid #4FC3F740" }
                  : { border: "1px solid transparent" }}>
                <span>{x.icon}</span>
                {t(`home.use_${x.k}_label`)}
                {x.soon && <span className="text-[9px] uppercase tracking-wider ln-faint">soon</span>}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Panel */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
        <Reveal key={`copy-${active}`}>
          <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col justify-center">
            <div className="text-lg font-semibold mb-2 ln-accent">
              {t(`home.use_${tab.k}_label`)}
            </div>
            <p className="ln-body text-[14px] sm:text-[15px] leading-relaxed mb-5">
              {t(`home.use_${tab.k}_desc`)}
            </p>
            {tab.k === "chat" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {CHAT_CAPS.map((c) => (
                    <span key={c} className="font-mono text-[12px] ln-accent border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-lg px-2.5 py-1">{c}</span>
                  ))}
                </div>
                {/* Wallet skills — real chat tools, non-custodial (you sign). */}
                <div className="mt-5 pt-5 border-t ln-hair">
                  <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase ln-faint mb-2.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
                    Wallet actions · you sign every tx
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {WALLET_ACTIONS.map((w) => (
                      <span key={w.label} className="inline-flex items-baseline gap-1.5 font-mono text-[12px] rounded-lg border ln-brd px-2.5 py-1">
                        <span className="ln-body">{w.label}</span>
                        <span className="ln-faint text-[10px]">{w.note}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </>
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
    <div className="landing-root min-h-screen" style={{ fontFamily: MONO }}>
      <Navbar />

      {/* Ambient — Halo-style: a masked grid, two slow-drifting aurora blobs,
          and the base radial wash. pointer-events-none + aria-hidden; the blobs
          pin still under prefers-reduced-motion (see globals.css). */}
      <div className="fixed inset-x-0 top-0 h-[820px] pointer-events-none overflow-hidden" aria-hidden>
        <div className="ln-hero-grid absolute inset-0" />
        <div className="ln-aurora ln-aurora-a" style={{ top: "-170px", left: "7%", width: "520px", height: "520px", background: "radial-gradient(circle, #4FC3F7 0%, transparent 70%)", opacity: 0.5 }} />
        <div className="ln-aurora ln-aurora-b" style={{ top: "-130px", right: "5%", width: "460px", height: "460px", background: "radial-gradient(circle, #29ABE2 0%, transparent 70%)", opacity: 0.4 }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 75% 50% at 50% -8%, #4FC3F71f 0%, transparent 70%)" }} />
      </div>

      <main className="relative">

        {/* ══════════ HERO ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-24 text-center">
          <img src="/logomark.svg" alt="BlueAgent" width={40} height={40} className="mx-auto mb-6 rounded-xl animate-breathe" />

          <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3.5 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[10px] ln-accent tracking-[0.18em] uppercase">Blue Chat · non-custodial · live on Base</span>
          </div>

          {/* Hero — the core product is the wallet + credit + chat loop. Two-beat
              mono headline: pay in USDC, then think onchain across every model. */}
          <h1 className="text-[2.75rem] leading-[1.04] sm:text-6xl lg:text-7xl font-bold tracking-tight mb-5 ln-h">
            Pay in USDC.<br className="hidden sm:block" /> <span className="ln-accent">Think onchain.</span>
          </h1>
          <p className="text-base sm:text-xl ln-body mb-9 max-w-2xl mx-auto leading-relaxed">
            Blue Chat is a non-custodial AI workspace. Create a wallet, top up USDC for credits, and
            spend them across every frontier model — reasoning, code, live web, onchain tools. No
            subscription, no token to hold. Every number verifiable on Base.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
              Open Blue Chat →
            </Link>
            <a href="#flow" className="text-sm font-semibold ln-accent border border-[#4FC3F7]/30 px-7 py-3 rounded-xl hover:bg-[#4FC3F7]/5 transition-all">
              How credits work
            </a>
            <Link href="/hub" className="text-sm font-semibold ln-body border ln-brd px-7 py-3 rounded-xl hover:border-[#4FC3F7]/40 transition-all">
              Browse the Hub
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[11px] ln-faint">
            {SOCIAL_PROOF.map((s, i) => (
              <span key={s} className="flex items-center gap-3">
                {i > 0 && <span className="ln-faint opacity-50">·</span>}
                {s}
              </span>
            ))}
          </div>

          {/* Product mockup — Blue Chat window: a prompt, the model it ran on,
              the answer, and the credit cost debited. A dark "screen" — stays
              dark in both themes. Shows the real loop (chat + model choice +
              credits), not a fabricated framing. */}
          <Reveal delay={120} className="mt-14 sm:mt-20">
            <div className="relative max-w-3xl mx-auto">
              <div className="absolute -inset-4 rounded-3xl pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 30%, #4FC3F715 0%, transparent 70%)" }} />
              <div className="relative rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden shadow-2xl text-left">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/70" />
                  <span className="font-mono text-[11px] text-slate-600 ml-2">Blue Chat · blueagent.dev</span>
                  <span className="ml-auto font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/25 bg-[#4FC3F7]/5 rounded px-2 py-0.5">500 cr free today</span>
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
                        <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/25 bg-[#4FC3F7]/5 rounded px-2 py-0.5">/build → /audit</span>
                        <span className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded px-2 py-0.5">200 cr</span>
                      </div>
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        <span className="text-white font-semibold">Points.sol</span> + Distributor scaffolded on Base 8453 — claim, rate-limit, reentrancy tests included. Audit flags one reentrancy path on <span className="text-slate-200">_claim()</span>; patch suggested. Ready to ship.
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
        <section id="flow" className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide scroll-mt-24">
          <SectionHead
            num="01" kicker="How it works"
            title={<>One wallet. Credits in USDC. <span className="ln-accent">Every model.</span></>}
            sub="No accounts, no card, no subscription. Connect a wallet, fund it in USDC, and start spending in chat — the whole loop is non-custodial and settles on Base."
          />
          {/* The crossing, in three spans (rialto-style): each card leads with a
              large numeral over a "span N / 3" index, so the three steps read as
              one bridge rather than three disconnected boxes. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {FLOW.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  <div className="flex items-baseline justify-between mb-5">
                    <span className="text-4xl sm:text-5xl font-bold tabular-nums leading-none ln-accent">{s.n}</span>
                    <span className="font-mono text-[10px] tracking-[0.2em] uppercase ln-faint">span {i + 1} / {FLOW.length}</span>
                  </div>
                  <div className="text-base font-semibold mb-2 ln-h">{s.title}</div>
                  <p className="font-mono text-[12.5px] ln-mut leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={260}>
            <p className="font-mono text-[12px] ln-mut mt-6">
              Rate: <span className="ln-body">1 USDC = 2,000 credits</span> · free tier <span className="ln-body">500 cr/day</span> for any wallet ·
              settled to the Blue treasury on Base via a direct USDC transfer you sign.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 02 EVERY MODEL ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="02" kicker="Inference"
            title={<>One chat. <span className="ln-accent">Every frontier model.</span></>}
            sub="Switch models mid-conversation — frontier reasoning, fast and cheap, private E2EE, and live web search. One credit balance across all of them; you never juggle API keys."
          />
          <Reveal delay={80}>
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-6">
              {MODELS.map((m) => {
                const chip = (
                  <span
                    className={"flex items-center gap-2 font-mono text-[12px] sm:text-[13px] rounded-full border px-3.5 py-1.5 ln-accent " + (m.href ? "hover:brightness-110 transition-all cursor-pointer" : "")}
                    style={{ borderColor: "#4FC3F733", background: "#4FC3F70d" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
                    {m.name}
                    <span className="ln-faint text-[10px]">· {m.provider} · {m.note}</span>
                  </span>
                );
                return m.href
                  ? <a key={m.name} href={m.href} aria-label={`Open ${m.name} preset in Blue Chat`}>{chip}</a>
                  : <span key={m.name}>{chip}</span>;
              })}
            </div>
          </Reveal>
        </section>

        {/* ══════════ 03 HOW YOU USE IT ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="03" kicker="Modalities"
            title={<>One chat. <span className="ln-accent">Every job.</span></>}
            sub="Chat, ship code, attach your tools over MCP — same window, same credits. Image and video are on the way."
          />
          <HowYouUse />
        </section>

        {/* ══════════ 04 BUILT ON VIRTUALS + VENICE ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="04" kicker="Powered by"
            title={<>The inference behind <span className="ln-accent">Blue Chat.</span></>}
            sub="Blue Chat doesn't train its own model — it routes your message to two inference networks and settles the cost in credits. You bring a wallet; they bring the thinking."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {PROVIDERS.map((p, i) => (
              <Reveal key={p.name} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  {/* Wordmark only — no plate/card. Theme-adaptive monochrome via
                      `.provider-logo` (white on dark, near-black on light), so one
                      colored SVG serves both palettes. Hides itself on 404. */}
                  <div className="flex items-center gap-2.5 mb-5">
                    <img
                      src={p.logo}
                      alt={p.name}
                      className="provider-logo h-5 sm:h-6 w-auto object-contain"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
                  </div>
                  <p className="ln-body text-[14px] leading-relaxed mb-4">{p.role}</p>
                  <p className="font-mono text-[11.5px] ln-mut leading-relaxed mb-5">{p.models}</p>
                  <a href={p.href} target="_blank" rel="noopener noreferrer"
                    className="mt-auto font-mono text-[12px] ln-accent hover:underline">
                    {p.hrefLabel}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Live aggregate usage — a real total from /api/stats/public
              (forward-only tokens meter) over three sub-stats, never a fabricated
              number. Halo-style headline of what the two inference nets have
              actually served; renders "—" for any unread/zero meter. `models` is
              the live preset count so the sub-stat can't drift from the chips. */}
          <Reveal delay={160} className="mt-4">
            <LiveUsage models={MODELS.length} />
          </Reveal>

          <Reveal delay={220}>
            <p className="font-mono text-[12px] ln-mut mt-6">
              Blue Chat is listed as a powered-by-Venice project in the public <span className="ln-body">Built in Venice</span> directory.
              Frontier + private inference is served through Virtuals compute.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 05 SKILLS — Hood + Hub, built from the agent ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="05" kicker="Skills, not separate apps"
            title={<>Products the agent <span className="ln-accent">builds for you.</span></>}
            sub="Blue Hood and the Hub aren't other apps to log into — they're skills Blue Agent runs. Same wallet, same credits, same chat window."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Reveal>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎯</span>
                  <span className="text-base font-semibold ln-accent">Blue Hood</span>
                </div>
                <p className="ln-body text-[14px] leading-relaxed mb-4">
                  Oracle-vs-DEX drift on tokenized stocks — Base B20 and Robinhood Chain. Every signal is signed by
                  you, and every call is graded in public: hits and misses.
                </p>
                <div className="flex gap-4 mt-auto">
                  <Link href="/app/hood" className="font-mono text-[12px] ln-accent hover:underline">Open Blue Hood →</Link>
                  <Link href="/track" className="font-mono text-[12px] ln-mut hover:underline">Track record →</Link>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🛒</span>
                  <span className="text-base font-semibold ln-accent">Blue Hub</span>
                </div>
                <p className="ln-body text-[14px] leading-relaxed mb-4">
                  {TOOL_COUNT} pay-per-call tools — RWA, on-chain data, security, DeFi, intelligence, builder.
                  Called right inside the chat, or over x402 from your own agent.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {HUB_CATEGORIES.map((c) => (
                    <span key={c.label} className="font-mono text-[10px] rounded px-2 py-0.5 border ln-accent"
                      style={{ borderColor: "#4FC3F730", background: "#4FC3F70d" }}>{c.label}</span>
                  ))}
                </div>
                <Link href="/hub" className="mt-auto font-mono text-[12px] ln-accent hover:underline">Browse all {TOOL_COUNT} tools →</Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ 06 WHO BUILDS ON BLUE — personas ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="06" kicker="Who builds on Blue"
            title={<>One agent, <span className="ln-accent">three ways to work.</span></>}
            sub="Founders ship products, traders read the market, agent builders rent the tooling — one wallet, one credit balance, and the same skills behind all three."
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {SOLUTIONS.map((s, i) => (
              <Reveal key={s.tag} delay={i * 80}>
                <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                  <div className="font-mono text-[10px] tracking-widest uppercase mb-3 ln-accent">{s.tag}</div>
                  <div className="text-base font-semibold mb-2 ln-h">{s.title}</div>
                  <p className="ln-body text-[13.5px] leading-relaxed mb-4">{s.body}</p>
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {s.chips.map((c) => (
                      <span key={c} className="font-mono text-[10px] rounded px-2 py-0.5 border ln-accent"
                        style={{ borderColor: "#4FC3F730", background: "#4FC3F70d" }}>{c}</span>
                    ))}
                  </div>
                  <Link href={s.href} className="mt-auto font-mono text-[12px] ln-accent hover:underline">{s.cta}</Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ══════════ 07 CREDITS & PRICING — public ══════════ */}
        <section id="pricing" className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide scroll-mt-24">
          <SectionHead
            num="07" kicker="Credits & pricing"
            title={<>Every price, <span className="ln-accent">in the open.</span></>}
            sub="No hidden tiers, no per-model fine print. Start free, top up in USDC when you want more, or call the Hub per request. That's the whole menu."
          />

          {/* Pay-with rail — USDC is live; $BLUEAGENT lands after the relaunch. Credits
              never require the token (credits.ts is token-free), so this is an added
              rail, not a gate. No monthly/yearly toggle: Blue is pay-as-you-go, so a
              billing-cycle switch would be dishonest. */}
          <Reveal className="mb-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px]">
              <span className="tracking-widest uppercase ln-faint">Pay with</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4FC3F7]/40 bg-[#4FC3F7]/10 px-3 py-1 ln-body">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" /> USDC · Base
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border ln-hair px-3 py-1 ln-faint">
                $BLUEAGENT <span className="text-[9px] tracking-widest uppercase ln-faint">soon</span>
              </span>
              <span className="ln-faint ml-auto">Pay-as-you-go · no subscription</span>
            </div>
          </Reveal>

          {/* Free tier — the daily bucket as its own banner above the packs (Dot's
              free row). FREE_DAILY (500) is the live WALLET_DAILY constant; the
              "≈ N messages" line is derived (FREE_DAILY ÷ SONNET_CR). */}
          <Reveal className="mb-4">
            <div className="ba-card rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-semibold ln-h">Free</span>
                  <span className="font-mono text-[12px] ln-accent">{FREE_DAILY} credits every day</span>
                  <span className="font-mono text-[11px] ln-faint">≈ {Math.round(FREE_DAILY / SONNET_CR)} Sonnet 5 msgs / day</span>
                </div>
                <p className="font-mono text-[12px] ln-mut mt-1.5">
                  Any connected wallet — no card, no token to hold. Resets every 24h; every model included.
                </p>
              </div>
              <Link href="/app/chat" className="shrink-0 text-sm font-semibold ln-accent border border-[#4FC3F7]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#4FC3F7]/5 transition-all">
                Start free →
              </Link>
            </div>
          </Reveal>

          {/* Credit packs — the live CREDIT_PACKS (5/20/50/100 USDC → ×2,000).
              The cards escalate by PRICE + CREDITS only; every tier gets every
              model and every feature (credits.ts is a flat, token-free allowance),
              so the checklist is identical BY DESIGN — the difference is the credit
              count and the derived "≈ N messages". This is not feature-gating. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {PACKS.map((p, i) => (
              <Reveal key={p.usdc} delay={i * 70}>
                <div className={"h-full rounded-2xl p-6 flex flex-col ba-card" + (p.popular ? " ba-card--hot" : "")}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[11px] tracking-widest uppercase ln-accent">{p.label}</span>
                    {p.popular && (
                      <span className="font-mono text-[9px] tracking-widest uppercase ln-accent border border-[#4FC3F7]/30 bg-[#4FC3F7]/10 rounded px-1.5 py-0.5">Popular</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold ln-h tracking-tight">{p.usdc}</span>
                    <span className="font-mono text-[11px] ln-mut">one-off</span>
                  </div>
                  <div className="mt-2 font-mono text-[13px] ln-accent">{p.cr.toLocaleString("en-US")} credits</div>
                  <div className="font-mono text-[11px] ln-faint mt-0.5">≈ {Math.round(p.cr / SONNET_CR).toLocaleString("en-US")} Sonnet 5 msgs</div>
                  <ul className="mt-4 space-y-1.5 font-mono text-[11.5px] flex-1">
                    {["All 8 models", "Credits never expire", "Failed call refunded", "Non-custodial"].map((f) => (
                      <li key={f} className="ln-mut"><span className="ln-accent">✓</span> {f}</li>
                    ))}
                  </ul>
                  <Link href="/app/chat"
                    className={"mt-5 inline-flex items-center justify-center rounded-lg px-4 py-2.5 font-mono text-[12px] font-semibold transition-colors " + (p.popular ? "bg-[#4FC3F7] text-black hover:bg-[#7ad3f9]" : "border ln-brd ln-accent hover:bg-[#4FC3F7]/5")}>
                    Top up {p.usdc} →
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={180}>
            <p className="font-mono text-[12px] ln-mut mt-6 text-center max-w-2xl mx-auto">
              Same features on every tier — more USDC just buys more credits (1 USDC = 2,000, they never expire).
              A failed model call is refunded automatically. Paying in <span className="ln-body">$BLUEAGENT</span> arrives
              after the token relaunch; credits stay free to earn and pay-per-use in USDC either way.
            </p>
          </Reveal>
        </section>

        {/* ══════════ 08 RUNS WHERE YOU BUILD — MCP ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="08" kicker="In your editor"
            title={<>Blue runs <span className="ln-accent">where you build.</span></>}
            sub="Chat is one way in. The other: attach Blue as an MCP server and call it straight from Claude Code, Cursor, or Claude Desktop — the five commands and the Hub skills, without leaving your editor."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-stretch">
            <Reveal>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                  <span className="font-mono text-[11px] text-slate-600 ml-2">Claude Code · Cursor · Desktop</span>
                </div>
                <pre className="flex-1 p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed m-0">
<span className="text-slate-600"># one-line install — Claude Code</span>
{"\n"}<span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">claude mcp add</span><span className="text-slate-300"> blue-agent \</span>
{"\n"}<span className="text-slate-500">    --transport http https://blueagent.dev/api/mcp</span>
{"\n\n"}<span className="text-slate-600"># …or drop into any MCP config</span>
{"\n"}<span className="text-slate-500">{'{ "mcpServers": {'}</span>
{"\n"}<span className="text-slate-500">{'    "blue-agent": { "url": '}</span><span className="text-[#4FC3F7]">{'"https://blueagent.dev/api/mcp"'}</span><span className="text-slate-500">{' } } }'}</span>
                </pre>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 sm:p-7 flex flex-col">
                <div className="text-sm font-semibold mb-3 ln-accent">The commands, in your agent</div>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {["blue_idea", "blue_build", "blue_audit", "blue_ship", "blue_raise"].map((c) => (
                    <span key={c} className="font-mono text-[11px] ln-accent border border-[#4FC3F7]/25 bg-[#4FC3F7]/5 rounded px-2 py-1">{c}</span>
                  ))}
                </div>
                <p className="font-mono text-[12px] ln-mut leading-relaxed mb-5">
                  It&apos;s a remote HTTP server — nothing to install, no key to provision. Your editor calls the same skills the chat runs, from /idea all the way to /raise.
                </p>
                <Link href="/docs/mcp" className="mt-auto text-sm font-semibold ln-accent border border-[#4FC3F7]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#4FC3F7]/5 transition-all">
                  MCP setup →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ 09 BUILD ON THE API — x402 ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t ln-divide">
          <SectionHead
            num="09" kicker="x402 API"
            title={<>Every skill is a <span className="ln-accent">paid endpoint.</span></>}
            sub={<>Point your own agent at any of the {TOOL_COUNT} Hub tools over x402. It signs a USDC payment on Base and gets the result back — no account, no API key to provision, self-hosted through the Coinbase CDP facilitator.</>}
          />
          <Reveal>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a10] overflow-hidden mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#15151f]">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />
                <span className="font-mono text-[11px] text-slate-600 ml-2">terminal</span>
              </div>
              <pre className="p-4 sm:p-5 overflow-x-auto font-mono text-[12px] leading-relaxed m-0">
<span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">curl</span><span className="text-slate-300"> https://blueagent.dev/api/x402/rh-stock-arb \</span>
{"\n"}<span className="text-slate-500">    -d </span><span className="text-slate-300">{'\'{"ticker":"NVDA"}\''}</span>
{"\n"}<span className="text-slate-500">→ </span><span className="text-slate-300">{'{"verdict":"ALIGNED","oracle":208.37,"dex":210.38,"drift":0.97,...}'}</span>
{"\n"}<span className="text-slate-600">Charged: </span><span className="text-[#4FC3F7]">$0.05 USDC · Base</span>
              </pre>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Reveal>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {["Self-hosted x402", "EIP-3009", "Coinbase CDP facilitator", "USDC · Base 8453", "from $0.05 / call"].map((f) => (
                    <span key={f} className="font-mono text-[10px] ln-accent border border-[#4FC3F7]/25 bg-[#4FC3F7]/5 rounded px-2 py-1">{f}</span>
                  ))}
                </div>
                <p className="font-mono text-[12px] ln-mut leading-relaxed">
                  No storefront in the middle — Blue builds its own 402 payment requirement and settles the USDC transfer you sign. The caller pays per call; nothing is metered or subscribed.
                </p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="ba-card h-full rounded-2xl p-6 flex flex-col justify-center gap-3">
                <Link href="/hub" className="text-sm font-semibold ln-accent border border-[#4FC3F7]/30 px-5 py-2.5 rounded-xl text-center hover:bg-[#4FC3F7]/5 transition-all">
                  Browse all {TOOL_COUNT} tools →
                </Link>
                <Link href="/docs" className="text-sm font-semibold ln-body border ln-brd px-5 py-2.5 rounded-xl text-center hover:border-[#4FC3F7]/40 transition-all">
                  Read the API docs →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════ FINAL CTA ══════════ */}
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-20 sm:py-28 border-t ln-divide">
          <Reveal>
            <div className="rounded-3xl border border-[#4FC3F7]/20 p-8 sm:p-14 text-center" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 40%, #4FC3F710 0%, transparent 70%)" }}>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 ln-h">
                Pay in USDC. <span className="ln-accent">Think onchain.</span>
              </h2>
              <p className="ln-body text-[15px] sm:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
                Connect a wallet and start with 500 free credits today — no card, no subscription.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/app/chat" className="text-sm font-semibold px-7 py-3 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 26px #4FC3F733" }}>
                  Open Blue Chat →
                </Link>
                <Link href="/hub" className="text-sm font-semibold ln-accent border border-[#4FC3F7]/30 px-7 py-3 rounded-xl hover:bg-[#4FC3F7]/5 transition-all">
                  Browse the Hub
                </Link>
                <Link href="/docs/mcp" className="text-sm font-semibold ln-body border ln-brd px-7 py-3 rounded-xl hover:border-[#4FC3F7]/30 transition-all">
                  Install MCP
                </Link>
                <Link href="/docs" className="text-sm font-semibold ln-body border ln-brd px-7 py-3 rounded-xl hover:border-[#4FC3F7]/30 transition-all">
                  Read the docs
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer className="border-t ln-brd px-5 sm:px-6 py-10 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <img src="/logomark.svg" alt="BlueAgent" width={20} height={20} className="rounded-md" />
                <span className="font-semibold ln-h">BlueAgent</span>
                <span className="text-xs ln-mut">· The onchain agent</span>
              </div>
              <p className="font-mono text-[11px] ln-faint">Built on Virtuals + Venice inference · x402 native · Base</p>
            </div>
            <div className="flex items-center gap-5 font-mono text-xs">
              <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="ln-link">X</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="ln-link">Telegram</a>
              <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="ln-link">GitHub</a>
              <Link href="/docs" className="ln-link">Docs</Link>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
