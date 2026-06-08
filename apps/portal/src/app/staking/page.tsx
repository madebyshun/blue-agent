import Link from "next/link";
import type { Metadata } from "next";
import CopyContractButton from "./CopyContractButton";

export const metadata: Metadata = {
  title: "$BLUEAGENT Staking · Blue Hub",
  description: "Stake $BLUEAGENT to earn from marketplace fees. 50% of the 20% Hub treasury cut goes to stakers, proportionally.",
};

export default function StakingPage() {
  return (
    <div className="px-5 sm:px-8 py-10 max-w-5xl mx-auto">

      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <span className="font-mono text-[10px] text-[#F59E0B] tracking-widest">$BLUEAGENT · 0xf895…6ba3 · BASE</span>
        </div>
        <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3 leading-tight">
          Stake. <span className="text-[#F59E0B]">Earn marketplace fees</span> in USDC.
        </h1>
        <p className="font-mono text-sm text-slate-400 leading-relaxed max-w-2xl mx-auto mb-6">
          Every paid call on Blue Hub splits revenue 80/20 — 80% to the API provider,
          20% to the Hub treasury.
          <strong className="text-white"> 50% of that treasury cut flows back to $BLUEAGENT stakers</strong>,
          proportionally to your share of total staked supply.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
          <CopyContractButton />
          <button disabled
             className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-[#F59E0B]/40 text-[#F59E0B]/60 bg-[#F59E0B]/5 cursor-not-allowed">
            Stake (wallet connect soon)
          </button>
        </div>
        <p className="font-mono text-[10px] text-slate-700">
          Copy contract address into your DEX of choice · verified on Basescan
        </p>
      </section>

      {/* The math */}
      <section className="mb-12">
        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-1">💸 THE MATH</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Every call, every USDC, every block</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Visual split */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">FOR EVERY $1.00 CALL</p>
            <div className="space-y-3">
              <Flow label="API provider"            pct={80} usd="$0.80" color="#34D399" />
              <Flow label="$BLUEAGENT stakers"     pct={10} usd="$0.10" color="#F59E0B" />
              <Flow label="Hub treasury"           pct={10} usd="$0.10" color="#A78BFA" />
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-4">
              Hub treasury = ops + ecosystem grants + insurance fund.
              Stakers&apos; share is automatic — claim anytime.
            </p>
          </div>

          {/* Example projection */}
          <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-6">
            <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mb-4">EXAMPLE YIELD</p>
            <p className="font-mono text-[12px] text-slate-400 mb-4 leading-relaxed">
              Marketplace does <strong className="text-white">$10,000 monthly volume</strong>.
              Stakers earn 10% of gross = <strong className="text-[#F59E0B]">$1,000/month USDC</strong>.
              If you stake 1% of total $BLUEAGENT supply:
            </p>
            <div className="font-mono text-4xl font-bold text-[#F59E0B] mb-1">$10/mo</div>
            <p className="font-mono text-[10px] text-slate-700">USDC, claimable anytime, no lock period</p>
            <div className="border-t border-[#F59E0B]/15 mt-5 pt-4 space-y-1.5 font-mono text-[11px] text-slate-500">
              <p>· Your yield scales with marketplace volume</p>
              <p>· No staking minimum, no maximum</p>
              <p>· USDC settles on Base — same chain as marketplace</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-12">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">⚡ HOW IT WORKS</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Stake-to-earn, 4 steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: "01", t: "Buy or earn $BLUEAGENT",  d: "On Uniswap v4 (Base), or earn via Hub leaderboard rewards." },
            { n: "02", t: "Stake on Base",            d: "Lock tokens in the staking contract — 7-day cooldown on unstake." },
            { n: "03", t: "Marketplace earns",        d: "Every paid call flows 10% of gross to the staking contract's USDC pool." },
            { n: "04", t: "Claim your share",         d: "Anytime — your share = (your stake / total staked) × pool." },
          ].map(s => (
            <div key={s.n} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
              <p className="font-mono text-2xl font-bold text-[#F59E0B]/40 mb-3">{s.n}</p>
              <p className="font-mono text-sm font-bold mb-2">{s.t}</p>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-12">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">❓ FAQ</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Common questions</h2>
        <div className="space-y-3">
          {[
            {
              q: "Is this the same staking as Blue Chat?",
              a: "Same token, same contract. Different utility on each surface: Blue Chat (blueagent.dev) gives you daily AI credits + tool discount. Marketplace (api.blueagent.dev) gives you USDC fee-share from API calls. One stake → both benefits.",
            },
            {
              q: "When does the fee-share start flowing?",
              a: "When the Phase 4 splitter contract ships. Until then, paid calls flow 80% to providers directly (no on-chain split yet). Your stake position is preserved — you start earning from the splitter activation block forward.",
            },
            {
              q: "What's the lock-up period?",
              a: "None to stake. 7-day cooldown when you unstake (deposit a request, wait 7 days, withdraw). During cooldown you don't earn fee-share — encourages long-term alignment without permanent lock.",
            },
            {
              q: "What if marketplace volume is low?",
              a: "Your yield in USDC scales 1:1 with marketplace gross. If gross is $0 in a month, stakers earn $0 that month. As Blue Agent's catalog grows from 30 to 300+ APIs, expected gross compounds — early stakers benefit from compounding.",
            },
            {
              q: "Is there a tax event when I claim?",
              a: "Claiming USDC from a staking contract is generally a taxable event (income). Not financial advice — consult your accountant. The dashboard exports a CSV of all claims for tax season.",
            },
            {
              q: "Can stakers vote on Hub policy?",
              a: "Not yet. Governance is on the roadmap (post-Phase 5) — stakers will vote on fee % changes, listing standards, and treasury allocation.",
            },
          ].map((f, i) => (
            <details key={i} className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden group">
              <summary className="cursor-pointer px-5 py-4 font-mono text-sm font-semibold text-white hover:bg-white/[0.02] flex items-center justify-between gap-3">
                <span>{f.q}</span>
                <span className="font-mono text-xs text-slate-700 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 pb-4 font-mono text-[12px] text-slate-400 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section>
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">🛣️ ROADMAP</p>
        <h2 className="font-mono text-2xl font-bold mb-6">What ships when</h2>
        <ul className="space-y-3">
          {[
            { soon: false, t: "$BLUEAGENT token live on Base",                 d: "Tradeable on Uniswap v4. Contract verified on Basescan." },
            { soon: false, t: "Blue Chat staking — credits + discount",         d: "Live now on blueagent.dev/app/rewards. Tier-based daily AI credits + tool discounts." },
            { soon: true,  t: "Marketplace fee-share splitter contract",        d: "Phase 4 — onchain 80% / 10% / 10% split per paid call." },
            { soon: true,  t: "Stake from this portal",                         d: "Wallet connect + stake/unstake UI directly on api.blueagent.dev." },
            { soon: true,  t: "Claim history + USDC export",                    d: "Dashboard claim history + CSV export for taxes." },
            { soon: true,  t: "Governance — stakers vote on Hub policy",        d: "Fee %, listing standards, treasury allocation." },
          ].map((r, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
              <span className={`mt-0.5 font-mono text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${
                r.soon
                  ? "border-amber-500/30 text-amber-400 bg-amber-500/5"
                  : "border-[#34D399]/30 text-[#34D399] bg-[#34D399]/5"
              }`}>
                {r.soon ? "SOON" : "LIVE"}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-white">{r.t}</p>
                <p className="font-mono text-[11px] text-slate-500 leading-relaxed mt-0.5">{r.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="font-mono text-[10px] text-slate-700 text-center mt-12">
        Want full token details? Read the{" "}
        <a href="https://basescan.org/token/0xf895783b2931c919955e18b5e3343e7c7c456ba3" target="_blank" rel="noopener noreferrer" className="text-[#F59E0B] hover:underline">$BLUEAGENT contract ↗</a>
        {" "}on Basescan or follow{" "}
        <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#F59E0B] hover:underline">@blueagent_ ↗</a>
        {" "}for fee-share activation date.
      </p>
    </div>
  );
}

function Flow({ label, pct, usd, color }: { label: string; pct: number; usd: string; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="font-mono text-[11px] text-slate-300">{label}</p>
        <p className="font-mono text-[12px] font-bold" style={{ color }}>{usd} <span className="text-slate-700 font-normal">({pct}%)</span></p>
      </div>
      <div className="h-2 rounded-full bg-[#1A1A2E] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
