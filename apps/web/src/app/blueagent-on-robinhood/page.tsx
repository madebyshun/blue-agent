import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BlueAgent on Robinhood Chain — via Virtuals ($BLUEAGENT · 2 tokens, 1 name)",
  description:
    "BlueAgent, the AI copilot for Base builders, is launching a new $BLUEAGENT token on Robinhood Chain via Virtuals Protocol. Two independent tokens, same name — Base $BLUEAGENT stays as the x402 utility asset; Robinhood $BLUEAGENT is the agent-economy leg. Bridge, send, and swap on RH — from chat.",
};

/**
 * Public marketing page for BlueAgent's Robinhood Chain launch via
 * Virtuals Protocol. Top-level route (/blueagent-on-robinhood) — shareable
 * without wallet, no fetches.
 *
 * Model: TWO independent tokens with the SAME name. Base $BLUEAGENT
 * (0xf895…6ba3) is untouched; Robinhood $BLUEAGENT is a fresh Virtuals
 * launch with its own contract, supply, and bonding curve. Not bridged.
 *
 * Alongside the token, chat gets new Robinhood Chain skills (bridge,
 * send, swap-expand) — generic RH capabilities, not $BLUEAGENT-specific.
 * See tasks #80–82 for the skill build plan.
 *
 * Full mechanics live in /docs/blueagent-on-robinhood.
 */
export default function BlueAgentOnRobinhoodPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-slate-200">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Header />
        <Hero />
        <Split />
        <ChatSurface />
        <Timeline />
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between mb-10">
      <Link href="/" className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
          style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
          BA
        </span>
        <span className="font-mono text-sm font-bold">BlueAgent</span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link href="/docs/blueagent-on-robinhood"
          className="font-mono text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-[#0d0d16] transition-colors">
          Docs
        </Link>
        <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
          className="font-mono text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-[#0d0d16] transition-colors">
          @blueagent_ ↗
        </a>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <section className="mb-14">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
        Launching soon · via Virtuals Protocol · Robinhood Chain
      </p>
      <h1 className="font-mono text-3xl md:text-5xl font-bold leading-tight mb-4">
        BlueAgent on Robinhood Chain.
      </h1>
      <p className="font-mono text-sm text-slate-500 tracking-wide mb-4">
        Same name. Two tokens. One agent.
      </p>
      <p className="font-mono text-base text-slate-400 leading-relaxed mb-6">
        BlueAgent — the AI copilot for Base builders — is launching a new{" "}
        <span className="text-slate-300">$BLUEAGENT</span> token on Robinhood
        Chain via Virtuals Protocol. Base&apos;s{" "}
        <span className="text-slate-300">$BLUEAGENT</span> (0xf895…6ba3) stays
        put as the x402 utility asset — powering paid tools and staked
        credits. The new Robinhood{" "}
        <span className="text-slate-300">$BLUEAGENT</span> is a separate
        contract on a fresh chain: Virtuals bonding curve, 1B supply, LP
        locked 10 years at graduation. Independent supplies. No bridge.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="https://app.virtuals.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center font-mono text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          style={{ background: "#4FC3F7", color: "#050508" }}
        >
          View on Virtuals ↗
        </a>
        <Link href="/docs/blueagent-on-robinhood"
          className="inline-flex items-center font-mono text-sm px-4 py-2.5 rounded-xl transition-colors"
          style={{ border: "1px solid #1A1A2E", color: "#94A3B8" }}
        >
          How it works
        </Link>
      </div>
    </section>
  );
}

function Split() {
  return (
    <section className="mb-14">
      <h2 className="font-mono text-lg font-bold mb-4">Two tokens, one name</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <TokenCard
          badge="Base"
          color="#0052FF"
          ticker="$BLUEAGENT"
          address="0xf895…6ba3"
          role="x402 payments + staked credits"
          detail={[
            "Purchases + tips + credits for /api/x402/* tools.",
            "Non-tradeable at product level; DEX-tradeable via Uniswap V4.",
            "Immutable. No mint. Existing holders unaffected.",
          ]}
        />
        <TokenCard
          badge="Robinhood"
          color="#0AC18E"
          ticker="$BLUEAGENT"
          address="TBD after launch"
          role="Agent-economy: fee buybacks + governance signal"
          detail={[
            "Launched via Virtuals Protocol on Robinhood Chain (chainId 4663).",
            "1B fixed supply. Bonding curve until 42K VIRTUAL graduation.",
            "Post-grad LP locked 10 years. 1% swap fee, 70% creator / 30% Treasury.",
          ]}
        />
      </div>
      <p className="font-mono text-[11px] text-slate-500 mt-4 leading-relaxed">
        Independent contracts on independent chains. No bridge between them —
        the two tokens do different jobs, and merging them would break either
        the x402 payment UX (bridging on every tool call) or the Virtuals
        launch (no distribution curve). Same name is intentional: one agent,
        two economic legs.
      </p>
    </section>
  );
}

function TokenCard({
  badge,
  color,
  ticker,
  address,
  role,
  detail,
}: {
  badge: string;
  color: string;
  ticker: string;
  address: string;
  role: string;
  detail: string[];
}) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-xs font-bold" style={{ color }}>{badge}</span>
        <span className="font-mono text-[9px] text-slate-600">{address}</span>
      </div>
      <div className="font-mono text-2xl font-bold mb-1">{ticker}</div>
      <div className="font-mono text-[11px] text-slate-400 mb-4">{role}</div>
      <ul className="space-y-1.5 font-mono text-[11px] text-slate-500 leading-relaxed">
        {detail.map((d) => (
          <li key={d} className="flex gap-2">
            <span className="text-slate-700 mt-0.5">·</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatSurface() {
  const skills = [
    {
      badge: "Bridge",
      color: "#4FC3F7",
      status: "Building",
      text: "Move any token — USDC, ETH, VIRTUAL, VEX — between Base and Robinhood. Ask: \"bridge 100 USDC to Robinhood\" → signed card, one click, LayerZero Scan tracker.",
    },
    {
      badge: "Send",
      color: "#22C55E",
      status: "Building",
      text: "Transfer any RH token to any address. \"Send 25 VIRTUAL to 0x…\" → signed card in chat.",
    },
    {
      badge: "Swap",
      color: "#F59E0B",
      status: "Live · expanding",
      text: "Buy/sell against the Virtuals cohort — $VEX, $CLAWBANK, $VIRTUAL, and the new $BLUEAGENT (RH). ETH↔token live; token↔token in flight.",
    },
    {
      badge: "Launch",
      color: "#0AC18E",
      status: "Live",
      text: "Deploy your own RH token via Bankr — 95/5 split, auto UniV3 pool. \"Launch a token called X on Robinhood\".",
    },
  ];
  return (
    <section className="mb-14">
      <h2 className="font-mono text-lg font-bold mb-2">Robinhood Chain — from chat</h2>
      <p className="font-mono text-[11px] text-slate-500 mb-4 leading-relaxed">
        The launch ships alongside a set of chat-native Robinhood Chain skills.
        Not $BLUEAGENT-specific — generic RH capabilities that work with any
        token on the chain.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        {skills.map((s) => (
          <div key={s.badge} className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs font-bold" style={{ color: s.color }}>{s.badge}</span>
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">{s.status}</span>
            </div>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Timeline() {
  const steps = [
    {
      title: "Now — announce",
      status: "current" as const,
      text: "This page + docs live. Agent metadata drafted for Virtuals. RH chat-skill build starts in parallel (send + swap-expand ship first).",
    },
    {
      title: "Ship chat skills",
      status: "next" as const,
      text: "hub_rh_send + robinhood_swap token↔token first (they're unblocked), then hub_rh_bridge behind them. Non-custodial calldata via server, user signs.",
    },
    {
      title: "T-day — create on Virtuals",
      status: "later" as const,
      text: "Submit agent at app.virtuals.io on Robinhood Chain. 100 VIRTUAL entry, sign with deployer wallet. Bonding curve opens instantly.",
    },
    {
      title: "Bonding phase",
      status: "later" as const,
      text: "Anyone can trade RH $BLUEAGENT on the curve. 1% fee (70% creator / 30% Virtuals Treasury). Anti-sniper tax decays 99% → 1% over the first minutes.",
    },
    {
      title: "42K VIRTUAL — graduation",
      status: "later" as const,
      text: "Virtuals auto-creates the AMM pool and locks the LP for 10 years. RH $BLUEAGENT is now permanently liquid on Robinhood.",
    },
    {
      title: "Post-grad integration",
      status: "later" as const,
      text: "RH $BLUEAGENT gets a token detail page. Swap-fee revenue routed into buybacks that accrue for Base $BLUEAGENT stakers — the two tokens stay separate but the flywheel connects them.",
    },
  ];
  return (
    <section className="mb-14">
      <h2 className="font-mono text-lg font-bold mb-4">Timeline</h2>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 flex gap-4 items-start">
            <div
              className={
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-mono text-[10px] font-bold"
              }
              style={
                s.status === "current"
                  ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                  : s.status === "next"
                    ? { background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E40" }
                    : { color: "#475569", border: "1px solid #1A1A2E" }
              }
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm font-bold text-slate-200">{s.title}</div>
              <div className="font-mono text-[11px] text-slate-500 mt-1 leading-relaxed">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Footer() {
  return (
    <footer className="pt-8 border-t border-[#1A1A2E] flex items-center justify-between font-mono text-[10px] text-slate-600">
      <span>BlueAgent · blueagent.dev</span>
      <div className="flex items-center gap-3">
        <Link href="/docs/blueagent-on-robinhood" className="hover:text-slate-400 transition-colors">
          docs
        </Link>
        <a href="https://app.virtuals.io" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-400 transition-colors">
          virtuals ↗
        </a>
        <a href="https://explorer.chain.robinhood.com" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-400 transition-colors">
          rh explorer ↗
        </a>
      </div>
    </footer>
  );
}
