import Link from "next/link";
import { DocHeader, H2, P, Card, CardGrid, Callout, PrevNext } from "../_ui";

export const metadata = {
  title: "Blue Hood — Blue Agent Docs",
  description:
    "24/7 non-custodial copilot for Robinhood Chain: oracle-vs-DEX drift monitoring, arrow signals, review-and-sign trading.",
};

const PILLARS = [
  {
    name: "THẤY (See)",
    accent: "#4FC3F7",
    items: [
      { k: "Hood", d: "Live drift board — 24 tokens, Chainlink oracle vs DEX pool spot, verdict every 5 min." },
      { k: "Radar", d: "Discovery — movers, flow, new-on-chain, whale watch. Coming in Stage 1." },
      { k: "Wallet", d: "Read-only position dashboard with per-token drift column. Coming in Stage 1." },
    ],
  },
  {
    name: "HÀNH ĐỘNG (Act)",
    accent: "#00C805",
    items: [
      { k: "Trade", d: "Standalone quote → prepare → sign panel. Non-custodial. Coming in Stage 2." },
      { k: "Bridge", d: "Route finder for Base/Arb/ETH → Robinhood Chain, deep-link to canonical bridge. Coming in Stage 2." },
    ],
  },
  {
    name: "TỰ ĐỘNG (Auto)",
    accent: "#A78BFA",
    items: [
      { k: "Tasks", d: "Scheduled agent jobs from 4 templates. Runs via cron + ERC-4337 session keys. Coming in Stage 3." },
      { k: "Chat", d: "Ask the agent anything — every skill in the Hub is one prompt away." },
    ],
  },
  {
    name: "BUILD",
    accent: "#FBBF24",
    items: [
      { k: "Hub", d: "74 x402 skills — call any tool for $0.05, no auth. B2B routing endpoints available for indexes." },
      { k: "Docs / Embed", d: "Public API + embed widgets for other builders." },
    ],
  },
];

const ARROWS = [
  { name: "arb", d: "Market OPEN + |drift| ≥ 1% + LONG_DEX or SHORT_DEX verdict." },
  { name: "drift", d: "Market CLOSED + |drift| ≥ 2% during premarket/afterhours." },
  { name: "flow", d: "Unusual buy/sell pressure per token. From D2 flow analytics." },
];

const GATES = [
  { name: "Dust gate", d: "Skips tokens with total_tvl_usd < $5k across ALL pools (not just primary)." },
  { name: "Feed staleness gate", d: "Skips arb when Chainlink last update is older than 15 min during regular hours." },
  { name: "Dedup gate", d: "Skips if there's already an open arrow for (ticker, type)." },
  { name: "V3 executability", d: "Trade panel refuses Sign if the pool is Uniswap V4-only (router is V3, will revert)." },
];

export default function BlueHoodDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Hood"
        lead="24/7 non-custodial copilot for Robinhood Chain — the intelligence layer nobody else on chain is building. Oracle vs DEX drift monitoring, arrow signals with a public track record, and a review-and-sign trade panel that keeps every private key with the user."
      />

      <Callout>
        <strong>Positioning.</strong> Uniswap has ~95% of RH Chain DEX
        volume; Arcus / Lighter / Rialto / Native own execution. Nobody
        owns oracle-vs-DEX drift monitoring, cross-pool discrepancy
        detection, or a public signal track record. Blue Hood is
        BlueAgent&apos;s wedge in that gap.
      </Callout>

      <H2>Four semantic layers</H2>
      <P>
        Blue Hood is built as four discrete layers. Each one has its own
        cron / route / doc anchor so you can trace any card back to the
        skill that produced it.
      </P>
      <CardGrid cols={4}>
        <Card title="T-A · THẤY">
          Poller measures drift between Chainlink oracle and DEX pool.
          Runs every 5 min via <code>/api/cron/blue-hood/poll</code>.
          Writes <code>bh:snapshot:latest</code> to KV.
        </Card>
        <Card title="T-B · GIẢI THÍCH">
          A4 rh-stock-agent-brief LLM chain (Virtuals → Venice → Bankr)
          writes a 1-line context for each fired arrow. Runs every 1 min
          via <code>/api/cron/blue-hood/brief-worker</code>.
        </Card>
        <Card title="T-C/D · BÁO">
          Drift board (<Link href="/hood" className="underline">/hood</Link>),
          inbox (<Link href="/hood/inbox" className="underline">/hood/inbox</Link>),
          + Web Push fan-out. Every arrow gets a serial <code>#0001…</code>.
        </Card>
        <Card title="T-E · HÀNH ĐỘNG">
          ReviewSignPanel — non-custodial, wagmi <code>useSendTransaction</code>,
          recipient = <code>useAccount().address</code> verbatim. Two
          signs: approve → swap.
        </Card>
      </CardGrid>

      <H2>Arrow types</H2>
      <P>Rule engine (<code>src/lib/blue-hood/rule-engine.ts</code>) fires an arrow when a snapshot row matches one of:</P>
      <CardGrid cols={3}>
        {ARROWS.map((a) => (
          <Card key={a.name} title={a.name}>{a.d}</Card>
        ))}
      </CardGrid>

      <H2>Safety gates</H2>
      <P>Every arrow candidate passes through in order. Any gate rejection = no arrow fired.</P>
      <CardGrid cols={2}>
        {GATES.map((g) => (
          <Card key={g.name} title={g.name}>{g.d}</Card>
        ))}
      </CardGrid>

      <H2>Product roadmap (4 groups, 9 nav items)</H2>
      <P>Blue Hood is the first pillar of the "Builder OS for Robinhood Chain" relaunch. All new features are surfaces on top of skills that already exist in <Link href="/hub" className="underline">/hub</Link> — no new engines.</P>
      {PILLARS.map((p) => (
        <div key={p.name} className="mt-8">
          <div className="font-mono text-[11px] tracking-widest uppercase mb-3" style={{ color: p.accent }}>
            {p.name}
          </div>
          <CardGrid cols={p.items.length === 2 ? 2 : 3}>
            {p.items.map((it) => (
              <Card key={it.k} title={it.k}>{it.d}</Card>
            ))}
          </CardGrid>
        </div>
      ))}

      <H2>Non-custodial guarantees</H2>
      <P>The T-E panel enforces five hard rules — search the codebase for any of them and the grep audit MUST catch every site:</P>
      <ul className="mt-4 space-y-2 text-slate-400 text-[15px] leading-relaxed">
        <li>1. No private-key storage, no session key delegated to the server, no gasless-relayer signing on user&apos;s behalf.</li>
        <li>2. Recipient = <code className="text-white">useAccount().address</code> VERBATIM. No default, no env fallback, no server-supplied recipient.</li>
        <li>3. No auto-execute. Every transaction is a deliberate user click.</li>
        <li>4. Warnings from tools display VERBATIM. The panel never edits warning text.</li>
        <li>5. Thà chặn nhầm còn hơn cho ký nhầm. When in doubt, disable Sign.</li>
      </ul>

      <PrevNext current="/docs/blue-hood" />
    </article>
  );
}
