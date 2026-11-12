"use client";

// Landing, client half. Structure (approved 2026-11-12): hero, 01 Chat,
// 02 Agents, 03 Markets, 04 For builders, 05 Before you plug in, live strip.
// Every number arrives as a prop measured on the server (../page.tsx); when a
// prop is null its figure is not drawn. No fabricated metrics, no Coinbase logo.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const MONO = "'JetBrains Mono', monospace";

export interface LandingData {
  toolCount: number;
  freeCount: number;
  mcpCount: number;
  stockCount: number;
  scorecard: {
    calls: number; hits: number; ready: boolean; hitRate: number | null;
    bigCalls: number; bigHits: number; weekends: number;
    latest: { friday: string; ticker: string; move: number; gap: number } | null;
  } | null;
  sessions: { open: number; nights: number; weekend: number; totalUsd: number; weeks: number; tickers: number; window: string | null } | null;
  exchange: { days: number; revenueUsd: number; sellersListed: number; payers: number; payersFloor: boolean } | null;
}

// The chat mock answers with the real tool and the field names it really
// returns (`weekend-scorecard`, Base 8453, weekend of 2026-11-06 as graded).
// Facts only: no verdict, confidence or entry (token-pick-facts-test pins it).
const CHAT_SEGMENTS: { t: string; cls: string }[] = [
  { t: "How did NVDAc trade on Base last weekend?", cls: "text-slate-300" },
  { t: "\n↳ weekend-scorecard", cls: "text-slate-500" },
  { t: "\n\n{ ", cls: "text-slate-500" },
  { t: '"ticker"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: '"NVDA"', cls: "text-[#4FC3F7] font-semibold" },
  { t: ", ", cls: "text-slate-500" },
  { t: '"chain_id"', cls: "text-slate-400" },
  { t: ": 8453,\n  ", cls: "text-slate-500" },
  { t: '"weekend_move_pct"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: "-2.37", cls: "text-white" },
  { t: ", ", cls: "text-slate-500" },
  { t: '"open_gap_pct"', cls: "text-slate-400" },
  { t: ": ", cls: "text-slate-500" },
  { t: "-5.13", cls: "text-white" },
  { t: ",\n  ", cls: "text-slate-500" },
  { t: '"source"', cls: "text-slate-400" },
  { t: ': "Chainlink + Base DEX" }', cls: "text-slate-500" },
  { t: "\n\nfree · Base 8453 ", cls: "text-slate-500" },
  { t: "✓", cls: "text-[#4FC3F7]" },
];

// Catalog groups shown in "For builders". No id from lib/tool-halts.ts: a
// halted tool refuses every call (pinned by token-pick-facts-test).
const HUB_CATEGORIES = [
  { label: "Stocks",       tools: "stock quote · stock movers · weekend scorecard · corporate actions" },
  { label: "On-chain",     tools: "token price · pool scan · gas tracker · bridge route" },
  { label: "Security",     tools: "honeypot · risk gate · scam detector · wallet risk" },
  { label: "DeFi",         tools: "cross-protocol yield · liquidity depth · morpho vault" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Does Blue Agent hold my keys?", a: "No. Chat prepares a transaction and your own wallet signs it. Credits are USDC you send from your wallet; nothing is pulled." },
  { q: "Where do the numbers come from?", a: "Each answer names its source: Chainlink feeds, DEX pools via GeckoTerminal and DexScreener, DefiLlama, Blockscout, and the contracts themselves. When a source cannot be read, the answer says unknown." },
  { q: "Which chains?", a: "Base 8453 first. Robinhood Chain 4663 is also covered for its stock tokens. Every figure carries its chain, because a ticker can exist on both as different tokens." },
  { q: "What does an agent pay?", a: "Paid tools settle per call in USDC on Base over x402: no API key, no account. Free tools never ask for a payment." },
];

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`);
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(18px)", transition: `opacity .6s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .6s cubic-bezier(.22,1,.36,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

function Head({ num, kicker, title, sub }: { num: string; kicker: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Reveal className="mb-10 sm:mb-12">
      <div className="font-mono text-[11px] tracking-[0.22em] mb-4"><span className="ln-accent">// {num}</span><span className="ln-faint ml-2 uppercase">{kicker}</span></div>
      <h2 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight leading-[1.06] mb-4 max-w-3xl ln-h">{title}</h2>
      {sub && <p className="ln-body text-[15px] sm:text-lg leading-relaxed max-w-2xl">{sub}</p>}
    </Reveal>
  );
}

function Stat({ n, l, sub }: { n: string; l: string; sub?: string }) {
  return (
    <div className="ba-card rounded-2xl px-5 py-4">
      <div className="text-[28px] font-bold ln-h leading-none">{n}</div>
      <div className="text-[13px] ln-body mt-2">{l}</div>
      {sub && <div className="text-[11px] ln-faint mt-1">{sub}</div>}
    </div>
  );
}

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#15151f]">
        <img src="/logomark.svg" alt="" width={18} height={18} className="rounded" />
        <span className="font-mono text-[12px] text-slate-300">{title}</span>
        <span className="ml-auto flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="w-2.5 h-2.5 rounded-full bg-slate-600/60" />)}</span>
      </div>
      {children}
    </div>
  );
}

function ChatMockup() {
  const chars = useMemo(() => {
    const out: { ch: string; cls: string }[] = [];
    for (const s of CHAT_SEGMENTS) for (const ch of Array.from(s.t)) out.push({ ch, cls: s.cls });
    return out;
  }, []);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(chars.length); return; }
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= chars.length) clearInterval(id); }, 18);
    return () => clearInterval(id);
  }, [chars.length]);
  const groups: { cls: string; text: string }[] = [];
  for (let k = 0; k < n && k < chars.length; k++) {
    const c = chars[k], last = groups[groups.length - 1];
    if (last && last.cls === c.cls) last.text += c.ch; else groups.push({ cls: c.cls, text: c.ch });
  }
  return (
    <Window title="Blue Chat">
      <pre className="flex-1 p-4 sm:p-5 whitespace-pre-wrap break-words font-mono text-[12px] sm:text-[13px] leading-relaxed m-0 min-h-[220px]">
        {groups.map((g, i) => <span key={i} className={g.cls}>{g.text}</span>)}
        <span className="animate-blink text-[#4FC3F7]">_</span>
      </pre>
    </Window>
  );
}

function CopyBlock({ text, children }: { text: string; children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
        className="absolute top-3 right-3 text-[11px] font-mono px-2 py-1 rounded-md border border-[#1A1A2E] text-slate-400 hover:text-[#4FC3F7]">{done ? "copied" : "copy"}</button>
      {children}
    </div>
  );
}

const MCP_CONFIG = `{ "mcpServers": {
    "blue-agent": { "url": "https://blueagent.dev/api/mcp" } } }`;

export default function Landing({ data }: { data: LandingData }) {
  const { scorecard: sc, sessions: ss, exchange: ex } = data;
  return (
    <div className="landing-root min-h-screen" style={{ fontFamily: MONO }}>
      <Navbar />
      <div className="fixed inset-x-0 top-0 h-[820px] pointer-events-none overflow-hidden" aria-hidden>
        <div className="ln-hero-grid absolute inset-0" />
        <div className="ln-aurora ln-aurora-a" style={{ top: "-170px", left: "7%", width: "520px", height: "520px", background: "radial-gradient(circle, #4FC3F7 0%, transparent 70%)", opacity: 0.5 }} />
        <div className="ln-aurora ln-aurora-b" style={{ top: "-130px", right: "5%", width: "460px", height: "460px", background: "radial-gradient(circle, #29ABE2 0%, transparent 70%)", opacity: 0.4 }} />
      </div>

      <main className="relative">
        {/* HERO */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-32 sm:pt-40 pb-20 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3.5 py-1.5 mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
              <span className="font-mono text-[10px] ln-accent tracking-[0.18em] uppercase">live on Base 8453 · non-custodial</span>
            </div>
            <h1 className="text-[2.6rem] leading-[1.04] sm:text-6xl font-bold tracking-tight mb-5 ln-h">
              One agent for Base.<br /><span className="ln-accent italic">Chat, hire, trade.</span>
            </h1>
            <p className="text-base sm:text-lg ln-body mb-8 max-w-xl leading-relaxed">
              Ask in plain words and get answers that name their source. Find and pay any agent on Base. Follow {data.stockCount} stocks that trade around the clock. Your wallet signs everything.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/app/chat" className="rounded-xl bg-[#4FC3F7] text-[#04121C] font-semibold px-5 py-3 text-[14px] hover:brightness-110">Open Chat →</Link>
              <a href="#builders" className="rounded-xl border border-[#4FC3F7]/40 ln-accent px-5 py-3 text-[14px] hover:bg-[#4FC3F7]/10">Add to Claude (MCP)</a>
            </div>
          </div>
          <Reveal><ChatMockup /></Reveal>
        </section>

        {/* 01 CHAT */}
        <section id="chat" className="scroll-mt-24 max-w-6xl mx-auto px-5 sm:px-6 py-20">
          <Head num="01" kicker="Chat" title={<>Ask in plain words. <span className="ln-accent italic">You sign.</span></>}
            sub="Top up credits with USDC from your own wallet, pick a model, and ask. Swaps, sends and bridges come back as a transaction to review; your wallet signs it, Blue Agent never does." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Credits in USDC", "Sent from your wallet on Base. 500 free credits a day."],
              ["Every model, one balance", "Switch models mid-thread. Inference by Virtuals and Venice."],
              ["Skills and connectors", "Install skill packs, connect MCP servers, run tasks on a schedule."],
              ["Review & sign", "Actions arrive as one line and a button. Nothing moves until you sign."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 60}><div className="ba-card rounded-2xl p-5 h-full"><div className="text-[14px] font-semibold ln-h mb-2">{t}</div><div className="text-[13px] ln-body leading-relaxed">{b}</div></div></Reveal>
            ))}
          </div>
          <Reveal className="mt-6"><Link href="/app/chat" className="ln-link text-[14px]">Open Chat →</Link></Reveal>
        </section>

        {/* 02 AGENTS */}
        <section id="agents" className="scroll-mt-24 max-w-6xl mx-auto px-5 sm:px-6 py-20">
          <Head num="02" kicker="Agents" title={<>Every paid agent on Base. <span className="ln-accent italic">Measured.</span></>}
            sub="The Agent Exchange reads x402 settlements on Base and lists who actually gets paid. List your own service, browse the services Blue Agent sells, or hire it for a job." />
          {ex && (
            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              <Reveal><Stat n={fmtUsd(ex.revenueUsd)} l={`paid to x402 sellers · ${ex.days}d`} sub="USDC on Base 8453, measured on chain" /></Reveal>
              <Reveal delay={60}><Stat n={ex.sellersListed.toLocaleString("en-US")} l="x402 sellers on Base" sub="from the CDP Bazaar list" /></Reveal>
              <Reveal delay={120}><Stat n={`${ex.payersFloor ? "≥" : ""}${ex.payers.toLocaleString("en-US")}`} l={`paying wallets · ${ex.days}d`} sub="distinct" /></Reveal>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Exchange", "Every agent Blue Agent knows on Base, listed first.", "/app/exchange"],
              ["Discovered", "Every x402 seller on Base, with what it earned.", "/app/exchange/discovered"],
              ["Services", "Blue Agent's own tools, priced per call.", "/app/services"],
              ["Jobs", "Hire Blue Agent through Virtuals ACP.", "/app/jobs"],
            ].map(([t, b, h], i) => (
              <Reveal key={t} delay={i * 60}><Link href={h} className="ba-card rounded-2xl p-5 h-full block hover:border-[#4FC3F7]/40"><div className="text-[14px] font-semibold ln-h mb-2">{t} →</div><div className="text-[13px] ln-body leading-relaxed">{b}</div></Link></Reveal>
            ))}
          </div>
        </section>

        {/* 03 MARKETS */}
        <section id="markets" className="scroll-mt-24 max-w-6xl mx-auto px-5 sm:px-6 py-20">
          <Head num="03" kicker="Markets" title={<>Stocks on Base, <span className="ln-accent italic">around the clock.</span></>}
            sub={`${data.stockCount} Coinbase stock tokens on Base 8453, each checked on chain. Their Chainlink feeds stop on Friday; their pools do not. Blue Agent grades what Base prices over the weekend against Monday's open.`} />
          <div className="grid lg:grid-cols-2 gap-4">
            {ss && (
              <Reveal>
                <div className="ba-card rounded-2xl p-6 h-full">
                  <div className="text-[11px] tracking-[0.16em] ln-faint uppercase">When it trades · {ss.tickers} stock tokens · {ss.window ?? `last ${ss.weeks} weeks`}</div>
                  <div className="text-[22px] sm:text-[26px] font-bold ln-h mt-2">{Math.round(100 - ss.open)}% of the volume trades while NYSE is closed.</div>
                  <div className="text-[12px] ln-faint mt-1">{fmtUsd(ss.totalUsd)} of DEX volume on Base 8453</div>
                  <div className="mt-5 flex h-[42px] rounded-xl overflow-hidden text-[14px] font-semibold">
                    <div style={{ width: `${ss.open}%` }} className="bg-[#334155] text-white flex items-center justify-center">{Math.round(ss.open)}%</div>
                    <div style={{ width: `${ss.nights}%` }} className="bg-[#2B7FB0] text-white flex items-center justify-center">{Math.round(ss.nights)}%</div>
                    <div style={{ width: `${ss.weekend}%` }} className="bg-[#4FC3F7] text-[#04121C] flex items-center justify-center">{Math.round(ss.weekend)}%</div>
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] ln-faint"><span>NYSE open</span><span>nights, pre/post</span><span>weekend</span></div>
                </div>
              </Reveal>
            )}
            {sc && (
              <Reveal delay={60}>
                <div className="ba-card rounded-2xl p-6 h-full">
                  <div className="text-[11px] tracking-[0.16em] ln-faint uppercase">Weekend scorecard · {sc.weekends} weekends</div>
                  <div className="text-[22px] sm:text-[26px] font-bold ln-h mt-2">Does Sunday&apos;s Base price call Monday&apos;s open?</div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div><div className="text-[30px] font-bold ln-accent">{sc.ready && sc.hitRate != null ? `${Math.round(sc.hitRate * 100)}%` : `${sc.hits}/${sc.calls}`}</div><div className="text-[12px] ln-body">direction right · {sc.hits} of {sc.calls}</div></div>
                    <div><div className="text-[30px] font-bold ln-h">{sc.bigHits}/{sc.bigCalls}</div><div className="text-[12px] ln-body">when Base moved 1% or more</div></div>
                  </div>
                  {sc.latest && <div className="mt-4 text-[12px] ln-faint">Weekend of {day(sc.latest.friday)}: {sc.latest.ticker}c {pct(sc.latest.move)} on Base by Sunday, opened {pct(sc.latest.gap)}.</div>}
                </div>
              </Reveal>
            )}
          </div>
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            {[
              ["Markets", `All ${data.stockCount} stock tokens on Base, priced from their pools.`, "/app/markets"],
              ["Weekend scorecard", "Every weekend call since Aug 28, graded in public.", "/app/markets/weekend"],
              ["Portfolio", "A wallet's stock tokens and crypto on Base.", "/app/portfolio"],
            ].map(([t, b, h], i) => (
              <Reveal key={t} delay={i * 60}><Link href={h} className="ba-card rounded-2xl p-5 h-full block hover:border-[#4FC3F7]/40"><div className="text-[14px] font-semibold ln-h mb-2">{t} →</div><div className="text-[13px] ln-body leading-relaxed">{b}</div></Link></Reveal>
            ))}
          </div>
        </section>

        {/* 04 BUILDERS */}
        <section id="builders" className="scroll-mt-24 max-w-6xl mx-auto px-5 sm:px-6 py-20">
          <Head num="04" kicker="For builders" title={<>Plug it in. <span className="ln-accent italic">One line.</span></>}
            sub={`${data.mcpCount} tools over MCP in Claude, Cursor and Claude Code. ${data.toolCount} in the x402 catalog: ${data.toolCount - data.freeCount} paid per call in USDC on Base, ${data.freeCount} free.`} />
          <div className="grid lg:grid-cols-2 gap-4">
            <Reveal>
              <Window title="mcp-config.json">
                <CopyBlock text={MCP_CONFIG}>
                  <pre className="p-5 font-mono text-[12.5px] leading-relaxed m-0 text-slate-400 whitespace-pre-wrap">
                    <span className="text-slate-600"># Claude Code</span>{"\n"}<span className="text-[#4FC3F7]">claude mcp add</span> blue-agent --transport http https://blueagent.dev/api/mcp{"\n\n"}<span className="text-slate-600"># any MCP client</span>{"\n"}{MCP_CONFIG}
                  </pre>
                </CopyBlock>
              </Window>
            </Reveal>
            <Reveal delay={60}>
              <div className="ba-card rounded-2xl p-6 h-full">
                <div className="text-[14px] font-semibold ln-h mb-3">In the catalog</div>
                <div className="flex flex-col gap-3">
                  {HUB_CATEGORIES.map((c) => <div key={c.label}><div className="text-[12px] ln-accent">{c.label}</div><div className="text-[13px] ln-body">{c.tools}</div></div>)}
                </div>
                <div className="mt-5 flex flex-wrap gap-4 text-[13px]">
                  <Link href="/docs" className="ln-link">Docs →</Link>
                  <Link href="/app/services" className="ln-link">Services →</Link>
                  <a href="https://t.me/blueagentbot_bot" className="ln-link" target="_blank" rel="noreferrer">Telegram bot →</a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 05 FAQ */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-20">
          <Head num="05" kicker="The details" title={<>Before you <span className="ln-accent italic">plug in.</span></>} />
          <div className="grid sm:grid-cols-2 gap-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 50}><div className="ba-card rounded-2xl p-5 h-full"><div className="text-[14px] font-semibold ln-h mb-2">{f.q}</div><div className="text-[13px] ln-body leading-relaxed">{f.a}</div></div></Reveal>
            ))}
          </div>
        </section>

        {/* CLOSE */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-28 text-center">
          {sc?.latest && <div className="font-mono text-[12px] ln-faint mb-5">Last graded weekend on Base 8453: {sc.latest.ticker}c {pct(sc.latest.move)} by Sunday, {pct(sc.latest.gap)} at the open</div>}
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight ln-h mb-8">Base, <span className="ln-accent italic">read and signed by you.</span></h2>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/app/chat" className="rounded-xl bg-[#4FC3F7] text-[#04121C] font-semibold px-5 py-3 text-[14px]">Open Chat</Link>
            <Link href="/app/exchange" className="rounded-xl border border-[#4FC3F7]/40 ln-accent px-5 py-3 text-[14px]">Explore Agents</Link>
            <Link href="/app/markets" className="rounded-xl border border-[#4FC3F7]/40 ln-accent px-5 py-3 text-[14px]">See Markets</Link>
          </div>
        </section>

        <footer className="border-t ln-brd px-5 sm:px-6 py-10 max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <img src="/logomark.svg" alt="BlueAgent" width={20} height={20} className="rounded-md" />
                <span className="font-semibold ln-h">BlueAgent</span>
                <span className="text-xs ln-mut">· The onchain agent</span>
              </div>
              <p className="font-mono text-[11px] ln-faint">Base 8453 · x402 native · Virtuals + Venice inference</p>
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
