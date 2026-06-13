import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, PrevNext, Callout } from "../_ui";

export const metadata = { title: "Blue Hub — Blue Agent Docs" };

const CATEGORIES = [
  { title: "Security",  color: "#f87171", desc: "Honeypot, risk gate, contract trust, AML screen, key exposure, phishing scan." },
  { title: "Market",    color: "#4FC3F7", desc: "Token pick, momentum, narrative pulse, whale signal, competitor scan." },
  { title: "Onchain",   color: "#34D399", desc: "Wallet PnL, portfolio, transaction history, DeFi opportunity, allowance audit." },
  { title: "Agent",     color: "#A78BFA", desc: "Multi-agent consensus, agent score, builder DD, deep analysis clusters." },
];

export default function BlueHubDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Hub"
        lead="72 AI tools for Base — security, market, onchain, and multi-agent consensus. Built from a 3-agent collaboration (Blue Agent + Aeon + MiroShark) and paid per call via x402."
      />

      <P>
        The Hub is a marketplace of focused tools. Each one uses live data (never fabricated numbers) and is callable three ways:
        the <a href="/hub" className="text-[#4FC3F7] underline">Hub UI</a>, the{" "}
        <a href="https://api.blueagent.dev/docs" className="text-[#4FC3F7] underline">x402 API</a>, or any MCP client.
      </P>

      <H2 id="categories">Tool categories</H2>
      <CardGrid cols={2}>
        {CATEGORIES.map((c) => (
          <Card key={c.title} title={c.title} color={c.color}>{c.desc}</Card>
        ))}
      </CardGrid>

      <H2 id="consensus">3-agent consensus</H2>
      <P>
        High-stakes tools (deep analysis, risk gate, builder DD) run across three independent agents and reconcile their
        answers — so you get a consensus view, not a single model&apos;s guess. Real data in, cross-checked signal out.
      </P>

      <Callout color="#fbbf24" title="Pricing & full suite">
        Tools are pay-per-call in USDC on Base. See <Link href="/docs/x402" className="text-[#fbbf24] underline">x402 Tools</Link> for
        the 5 core commands, the extended blue-* suite, and live pricing.
      </Callout>

      <PrevNext current="/docs/blue-hub" />
    </article>
  );
}
