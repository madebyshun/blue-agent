import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "x402 Ecosystem — Pay-per-call APIs on Base",
  description: "Blue Agent runs on x402 — the HTTP 402 standard for pay-per-call APIs. USDC settlement on Base via EIP-3009.",
};

export default function X402Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-[#4FC3F7]/30 bg-[#4FC3F7]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">USDC · EIP-3009 · BASE</span>
          </div>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            x402 — <span className="text-[#4FC3F7]">HTTP 402 reborn</span>
          </h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl mb-6 leading-relaxed">
            x402 is the open standard for pay-per-call HTTP APIs. Server returns
            <code className="text-[#4FC3F7] mx-1">402 Payment Required</code> with USDC settlement details,
            client signs once (EIP-3009 TransferWithAuthorization), retries with
            <code className="text-[#4FC3F7] mx-1">X-Payment</code> header, gets the result.
            No accounts. No card numbers. Just signatures.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#29ABE2] text-[#050508] hover:scale-[1.02] transition-transform">
              x402 spec ↗
            </a>
            <Link href="/docs/x402"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/[0.02] transition-all">
              Read our docs →
            </Link>
          </div>
        </div>
      </section>

      {/* Why x402 */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">⚡ WHY X402</p>
        <h2 className="font-mono text-2xl font-bold mb-8">Built for AI agents calling APIs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { emoji: "🔓", title: "No accounts",  desc: "Wallet signature only. No emails, no Stripe, no API keys to leak." },
            { emoji: "🤖", title: "Agent-native", desc: "Built for autonomous agents to pay each other without human approval per call." },
            { emoji: "⚡", title: "Sub-second",   desc: "Signature → settlement → result in one round-trip. No invoices, no Net-30." },
            { emoji: "💰", title: "Micropayments",desc: "Pay $0.05 per call. Pricing that wouldn't survive Stripe fees works here." },
            { emoji: "🌍", title: "Open standard",desc: "Any client, any server, any chain. Coinbase ships the reference impl." },
            { emoji: "🔵", title: "USDC on Base", desc: "Blue Agent uses Coinbase's CDP x402 facilitator on Base mainnet, chain 8453." },
          ].map(f => (
            <div key={f.title} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
              <div className="text-2xl mb-3">{f.emoji}</div>
              <p className="font-mono text-sm font-bold mb-2">{f.title}</p>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The flow */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">📡 THE FLOW</p>
        <h2 className="font-mono text-2xl font-bold mb-8">3 requests, 1 signature</h2>

        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden">
          {[
            { step: "1", label: "Request without payment",  code: `POST /api/x402/honeypot-check
{ "token": "0x..." }` },
            { step: "2", label: "Server returns 402 with USDC details", code: `HTTP/1.1 402 Payment Required
{ "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo":   "0xb058...3b5f",
    "maxAmountRequired": "50000"
}] }` },
            { step: "3", label: "Client signs EIP-3009 TransferWithAuthorization", code: `wallet.signTypedData({
  domain: { name: "USD Coin", verifyingContract: USDC, chainId: 8453 },
  types: { TransferWithAuthorization: [...] },
  message: { from, to: payTo, value: 50000, ... }
})` },
            { step: "4", label: "Retry with X-Payment header → result", code: `POST /api/x402/honeypot-check
X-Payment: base64({ signature, authorization })

→ 200 OK
{ "honeypot": false, "confidence": 0.94, ... }` },
          ].map(s => (
            <div key={s.step} className="border-b border-[#1A1A2E] last:border-0">
              <div className="px-4 py-2 border-b border-[#1A1A2E] bg-[#0d0d12] flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-[#4FC3F7] w-5">{s.step}</span>
                <p className="font-mono text-xs text-slate-300">{s.label}</p>
              </div>
              <pre className="px-4 py-3 font-mono text-[11px] text-slate-400 overflow-x-auto leading-relaxed">
                <code>{s.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* References */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mb-1">📚 REFERENCES</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Specs &amp; SDKs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "x402.org",           url: "https://x402.org",                              desc: "Official spec, examples, ecosystem index" },
            { name: "Coinbase CDP",       url: "https://portal.cdp.coinbase.com/products/x402", desc: "Reference facilitator + provider dashboard" },
            { name: "@coinbase/x402",     url: "https://www.npmjs.com/package/@coinbase/x402",  desc: "Server + client TypeScript SDKs" },
            { name: "EIP-3009",           url: "https://eips.ethereum.org/EIPS/eip-3009",       desc: "USDC TransferWithAuthorization standard" },
            { name: "USDC on Base",       url: "https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", desc: "0x833589…02913 · Circle native USDC" },
          ].map(p => (
            <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
               className="block rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover">
              <p className="font-mono text-sm font-bold mb-1">{p.name} ↗</p>
              <p className="font-mono text-[10px] text-slate-500">{p.desc}</p>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
