import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../../_components/DocLayout";
import CodeBlock from "../../_components/CodeBlock";

export const metadata: Metadata = {
  title: "Register your API · Docs · Blue Hub",
  description: "Step-by-step guide to listing your API on Blue Agent's marketplace. Earn 80% USDC per call.",
};

export default function BuildersSubmit() {
  return (
    <DocLayout
      title="Register your API"
      intro="Get your endpoint listed on Blue Hub MCP server in under 10 minutes. Sign once with your wallet — no transaction, no gas."
    >

      <h2 className="font-mono text-lg font-bold mt-6 mb-3">Before you start</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Make sure you have:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li>An <strong>HTTPS endpoint</strong> that accepts <code className="text-[#4FC3F7]">POST</code> with a JSON body.</li>
        <li>The endpoint returns <strong>2xx for valid input</strong> and <strong>402 if you require payment</strong>.</li>
        <li>Response is <strong>parseable JSON</strong> (recommended — gets you the AI Ready badge).</li>
        <li>A <strong>Base wallet</strong> for signing the manifest and receiving USDC.</li>
        <li>A <strong>price</strong> in mind ($0–$100 per call).</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">1. Open the submit form</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Go to <Link href="/submit" className="text-[#4FC3F7] hover:underline">/submit</Link>. You&apos;ll see a single-page form with seven fields:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Slug</strong> — URL id, lowercase + hyphens. Used as <code className="text-[#4FC3F7]">/marketplace/[slug]</code>.</li>
        <li><strong>Display name</strong> — shown on cards and detail page.</li>
        <li><strong>Provider name</strong> — your agent or builder handle.</li>
        <li><strong>Description</strong> — 1 line, max 280 chars.</li>
        <li><strong>Category</strong> — pick one of nine.</li>
        <li><strong>HTTPS endpoint</strong> — your POST URL.</li>
        <li><strong>Price per call</strong> — in USD; settled as USDC on Base.</li>
        <li><strong>Revenue wallet</strong> — the Base address that receives 80% of every call.</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">2. Test your endpoint</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Click the <strong>Test</strong> button next to the endpoint field. We send an empty <code className="text-[#4FC3F7]">POST</code>
        {" "}from your browser; the response must be reachable within 8 seconds.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Acceptable status codes:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><code className="text-[#34D399]">2xx</code> — endpoint accepts free or pre-paid calls.</li>
        <li><code className="text-amber-400">402</code> — endpoint requires x402 payment (best for paid APIs).</li>
        <li><code className="text-red-400">other</code> — submission still works, but your AI Ready badge gets withheld until the probe passes.</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">3. Sign the manifest</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Click <strong>Sign &amp; submit</strong>. Your wallet pops a single message — no transaction, no gas, no value moved.
        The message looks like:
      </p>
      <CodeBlock
        hint="Signed message"
        code={`Blue Hub — Register API
slug:     weather-on-base
provider: WeatherCorp
endpoint: https://api.weather-on-base.io/v1/call
price:    200000 (USDC base units, 6 decimals)
wallet:   0x...
nonce:    a1b2c3...
ts:       1717843200`}
      />
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The signature proves you control the wallet. We use it to lock the listing to that address —
        only you can edit pricing, update the endpoint, or withdraw earnings.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">4. Within minutes — your API is live</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Once signed, your API appears in:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li>The <Link href="/marketplace" className="text-[#4FC3F7] hover:underline">marketplace</Link> at <code className="text-[#4FC3F7]">/marketplace/[slug]</code>.</li>
        <li>Your <Link href="/dashboard" className="text-[#4FC3F7] hover:underline">dashboard</Link> with call count + USDC earned.</li>
        <li>MCP <code className="text-[#4FC3F7]">tools/list</code> — every Claude Desktop / Cursor / Cline user gets it automatically.</li>
        <li>The public catalog endpoint (coming soon) — scrapers + AI agents discover it.</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Pricing your API</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Reference points across the existing catalog:
      </p>
      <div className="rounded-xl border border-[#1A1A2E] overflow-hidden my-4">
        <div className="grid grid-cols-[1fr_120px_2fr] gap-3 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0d0d12] font-mono text-[10px] text-slate-600 tracking-widest">
          <span>TIER</span>
          <span>PRICE</span>
          <span>EXAMPLES</span>
        </div>
        {[
          { tier: "Light",   price: "$0.05",         examples: "blue-idea, honeypot-check, airdrop-check" },
          { tier: "Medium",  price: "$0.10–$0.20",   examples: "risk-gate, dex-flow, token-pick-signal" },
          { tier: "Heavy",   price: "$0.30–$0.50",   examples: "investor-memo, deep-analysis, blue-build" },
          { tier: "Premium", price: "$1.00",         examples: "blue-audit (500+ security checks)" },
        ].map(t => (
          <div key={t.tier} className="grid grid-cols-[1fr_120px_2fr] gap-3 px-4 py-3 border-b border-[#1A1A2E] last:border-0 items-baseline">
            <p className="font-mono text-sm font-bold text-white">{t.tier}</p>
            <p className="font-mono text-sm text-[#34D399]">{t.price}</p>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{t.examples}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Rough rule: 1 second of compute ≈ $0.05–$0.10. LLM-heavy calls cost more.
        Don&apos;t over-price out of the gate — usage data tells you when to raise.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">After you list</h2>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li>Monitor calls + revenue on the <Link href="/dashboard" className="text-[#4FC3F7] hover:underline">dashboard</Link> (live data ships with backend wiring).</li>
        <li>Update pricing or endpoint anytime by re-signing the manifest.</li>
        <li>Apply for the <strong>✓ Verified</strong> badge after 100 successful calls (Blue Agent review).</li>
        <li>Tweet your listing URL <code className="text-[#4FC3F7]">/marketplace/[slug]</code> — every page has OG previews.</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Revenue split</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Every paid call settles USDC on Base. The split:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong className="text-[#34D399]">80%</strong> → your revenue wallet (the address you signed with).</li>
        <li><strong className="text-[#A78BFA]">20%</strong> → Blue Hub treasury (funds operations + ecosystem grants).</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        No subscription, no minimum payout. The first paid call lands USDC in your wallet within ~1 block.
      </p>

      <div className="rounded-xl border border-[#34D399]/20 bg-[#34D399]/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-[#34D399] mb-2">Ready?</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          Open <Link href="/submit" className="text-[#34D399] hover:underline">/submit</Link>{" "}
          and walk through the form. The first listing takes ~5 minutes. Questions?{" "}
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="text-[#34D399] hover:underline">Builder Telegram ↗</a>.
        </p>
      </div>
    </DocLayout>
  );
}
