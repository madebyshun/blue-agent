import Link from "next/link";
import { DocHeader, H2, P, PrevNext, Callout } from "../_ui";
import { TIERS } from "../_data";

export const metadata = { title: "Credits & Tiers — Blue Agent Docs" };

export default function CreditsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Platform"
        title="Credits & Tiers"
        lead="Every Blue Chat message spends credits. No wallet needed to start — and your tier is set by your $BLUEAGENT, where holding or staking both count."
      />

      <H2 id="tiers">Tiers</H2>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden my-5">
        {TIERS.map((r, i) => (
          <div key={r.tier} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-[#1A1A2E]" : ""}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="font-bold text-sm shrink-0" style={{ color: r.color }}>{r.tier}</span>
              <span className="font-mono text-[11px] text-slate-600 truncate">{r.need}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-300 shrink-0">{r.perk}</span>
          </div>
        ))}
      </div>

      <H2 id="holding-vs-staking">Holding vs. staking</H2>
      <P>
        Both holding and staking $BLUEAGENT set your tier. <strong className="text-slate-200">Staking is the better path</strong> — it counts toward your tier
        and accrues extra credits plus a share of x402 revenue (USDC) over time. Holding only sets your tier.
      </P>

      <Callout color="#A78BFA" title="Start earning">
        <Link href="/app/dashboard?tab=stake" className="text-[#A78BFA] underline">Stake $BLUEAGENT →</Link> to grow your daily credits and earn a share of protocol revenue.
      </Callout>

      <PrevNext current="/docs/credits" />
    </article>
  );
}
