"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Data ─────────────────────────────────────────────────────────────────────

const BASE_URL = "https://blueagent.dev/api/v1";

interface Param { name: string; type: string; required: boolean; desc: string }
interface Tool  { name: string; price: string; desc: string; params: Param[]; example: string }

const CATEGORIES: { id: string; label: string; color: string; sub: string; tools: Tool[] }[] = [
  {
    id: "security", label: "Security", color: "#f87171", sub: "4 tools",
    tools: [
      {
        name: "honeypot-check", price: "$0.01",
        desc: "Detect honeypot tokens that cannot be sold after purchase.",
        params: [{ name: "token", type: "address", required: true, desc: "Token contract address on Base" }],
        example: `curl -X POST ${BASE_URL}/honeypot-check \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"token":"0x..."}'`,
      },
      {
        name: "contract-trust", price: "$0.05",
        desc: "Smart contract risk review — reentrancy, access control, ownership, proxy patterns.",
        params: [
          { name: "address",  type: "address", required: true,  desc: "Contract address on Base" },
          { name: "chain_id", type: "number",  required: false, desc: "Default: 8453" },
        ],
        example: `curl -X POST ${BASE_URL}/contract-trust \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"address":"0x..."}'`,
      },
      {
        name: "aml-screen", price: "$0.01",
        desc: "AML screening for wallets — flagged activity, counterparties, mixer exposure.",
        params: [{ name: "address", type: "address", required: true, desc: "Wallet address to screen" }],
        example: `curl -X POST ${BASE_URL}/aml-screen \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"address":"0x..."}'`,
      },
      {
        name: "allowance-audit", price: "$0.005",
        desc: "Audit all token allowances — flag excessive or risky approvals.",
        params: [{ name: "address", type: "address", required: true, desc: "Wallet address" }],
        example: `curl -X POST ${BASE_URL}/allowance-audit \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"address":"0x..."}'`,
      },
    ],
  },
  {
    id: "research", label: "Research", color: "#60a5fa", sub: "5 tools",
    tools: [
      {
        name: "deep-analysis", price: "$0.001",
        desc: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals.",
        params: [
          { name: "token",    type: "address", required: true,  desc: "Token contract address" },
          { name: "chain_id", type: "number",  required: false, desc: "Default: 8453" },
        ],
        example: `curl -X POST ${BASE_URL}/deep-analysis \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"token":"0x..."}'`,
      },
      {
        name: "whale-copy-signal", price: "$0.005",
        desc: "Track whale wallet movements and generate copy-trade signals for a token.",
        params: [
          { name: "token",   type: "address", required: true,  desc: "Token to track" },
          { name: "min_usd", type: "number",  required: false, desc: "Min trade size. Default: 10000" },
        ],
        example: `curl -X POST ${BASE_URL}/whale-copy-signal \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"token":"0x...","min_usd":50000}'`,
      },
      {
        name: "token-pick-signal", price: "$0.01",
        desc: "AI token pick — falsifiable thesis, entry zone, kill criterion, sizing. Returns NO_PICK when nothing clears the bar.",
        params: [{ name: "context", type: "string", required: false, desc: "Market context or narrative" }],
        example: `curl -X POST ${BASE_URL}/token-pick-signal \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"context":"Base DeFi narratives"}'`,
      },
      {
        name: "narrative-position", price: "$0.005",
        desc: "Narrative map with mindshare scores, velocity, phase labels, and position calls.",
        params: [{ name: "narratives", type: "string[]", required: false, desc: "Specific narratives to score" }],
        example: `curl -X POST ${BASE_URL}/narrative-position \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{}'`,
      },
      {
        name: "token-momentum-scanner", price: "$0.005",
        desc: "Scan for tokens with accelerating on-chain activity and social momentum on Base.",
        params: [
          { name: "limit",          type: "number", required: false, desc: "Results. Default: 10" },
          { name: "min_confidence", type: "number", required: false, desc: "0–1. Default: 0.6" },
        ],
        example: `curl -X POST ${BASE_URL}/token-momentum-scanner \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"limit":10,"min_confidence":0.7}'`,
      },
    ],
  },
  {
    id: "builder", label: "Builder", color: "#34d399", sub: "6 tools",
    tools: [
      {
        name: "builder-score", price: "$0.001",
        desc: "Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100).",
        params: [{ name: "handle", type: "string", required: true, desc: "X/Twitter handle (without @)" }],
        example: `curl -X POST ${BASE_URL}/builder-score \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"handle":"madebyshun"}'`,
      },
      {
        name: "agent-score", price: "$0.01",
        desc: "Agent Score — XP system for AI agents on Base. Tracks interactions, signals, uptime.",
        params: [{ name: "handle", type: "string", required: true, desc: "Agent handle or name" }],
        example: `curl -X POST ${BASE_URL}/agent-score \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"handle":"blue-agent"}'`,
      },
      {
        name: "base-grant-finder", price: "$0.01",
        desc: "Find active grants and funding opportunities for your project on Base.",
        params: [
          { name: "project", type: "string", required: true,  desc: "Project description" },
          { name: "stage",   type: "string", required: false, desc: "idea | build | live" },
        ],
        example: `curl -X POST ${BASE_URL}/base-grant-finder \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"project":"DEX on Base","stage":"build"}'`,
      },
      {
        name: "market-fit", price: "$0.01",
        desc: "Market fit analysis — problem clarity, timing, competition, demand signals.",
        params: [
          { name: "project", type: "string", required: true,  desc: "Project description" },
          { name: "url",     type: "string", required: false, desc: "Project URL for deeper analysis" },
        ],
        example: `curl -X POST ${BASE_URL}/market-fit \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"project":"AI-native DEX on Base"}'`,
      },
      {
        name: "repo-health", price: "$0.005",
        desc: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor.",
        params: [{ name: "url", type: "string", required: true, desc: "GitHub repository URL" }],
        example: `curl -X POST ${BASE_URL}/repo-health \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"url":"https://github.com/org/repo"}'`,
      },
      {
        name: "ecosystem-digest", price: "$0.005",
        desc: "Daily Base ecosystem digest — top launches, protocol updates, builder activity.",
        params: [{ name: "date", type: "string", required: false, desc: "ISO date. Default: today" }],
        example: `curl -X POST ${BASE_URL}/ecosystem-digest \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{}'`,
      },
    ],
  },
  {
    id: "premium", label: "Premium", color: "#a78bfa", sub: "3 tools",
    tools: [
      {
        name: "risk-gate", price: "$0.05",
        desc: "Screen any transaction before execution — rug check, AML, malicious contract patterns.",
        params: [
          { name: "action", type: "string",  required: true,  desc: "transfer | swap | approve | call" },
          { name: "to",     type: "address", required: true,  desc: "Target address" },
          { name: "value",  type: "string",  required: false, desc: "Amount in Wei" },
          { name: "data",   type: "string",  required: false, desc: "Call data hex" },
        ],
        example: `curl -X POST ${BASE_URL}/risk-gate \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"action":"transfer","to":"0x...","value":"1000000"}'`,
      },
      {
        name: "wallet-pnl", price: "$0.005",
        desc: "Realized and unrealized PnL across all positions for a wallet.",
        params: [
          { name: "address",  type: "address", required: true,  desc: "Wallet address" },
          { name: "chain_id", type: "number",  required: false, desc: "Default: 8453" },
        ],
        example: `curl -X POST ${BASE_URL}/wallet-pnl \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"address":"0x..."}'`,
      },
      {
        name: "token-launch-readiness", price: "$0.02",
        desc: "Pre-launch token readiness — contract, tokenomics, liquidity, community, timing.",
        params: [
          { name: "project", type: "string",  required: true,  desc: "Project name and description" },
          { name: "token",   type: "address", required: false, desc: "Token address if already deployed" },
        ],
        example: `curl -X POST ${BASE_URL}/token-launch-readiness \\\n  -H "Content-Type: application/json" \\\n  -H "X-Payment: <token>" \\\n  -d '{"project":"Blue Agent token launch"}'`,
      },
    ],
  },
];

const CODE_SNIPPETS: Record<string, string> = {
  curl: `# builder-score — $0.001 per call
curl -X POST https://blueagent.dev/api/v1/builder-score \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"handle":"madebyshun"}'`,

  node: `// npm install node-fetch
import fetch from "node-fetch";

const res = await fetch("https://blueagent.dev/api/v1/builder-score", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Payment": "<x402-payment-token>",
  },
  body: JSON.stringify({ handle: "madebyshun" }),
});
const data = await res.json();
console.log(data);`,

  python: `import requests

resp = requests.post(
    "https://blueagent.dev/api/v1/builder-score",
    headers={
        "Content-Type": "application/json",
        "X-Payment": "<x402-payment-token>",
    },
    json={"handle": "madebyshun"},
)
print(resp.json())`,
};

type Section = "overview" | "auth" | "security" | "research" | "builder" | "premium";

const SIDEBAR_NAV: { key: Section; label: string; sub: string }[] = [
  { key: "overview",  label: "Overview",  sub: "Base URL · protocol · payment" },
  { key: "auth",      label: "Auth",      sub: "x402 USDC payment flow" },
  { key: "security",  label: "Security",  sub: "4 tools · $0.005–$0.05" },
  { key: "research",  label: "Research",  sub: "5 tools · $0.001–$0.01" },
  { key: "builder",   label: "Builder",   sub: "6 tools · $0.001–$0.01" },
  { key: "premium",   label: "Premium",   sub: "3 tools · $0.005–$0.05" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="font-mono text-[10px] px-2 py-1 rounded border border-[#1A1A2E] text-slate-600 hover:text-white hover:border-slate-600 transition-all"
    >
      {copied ? "✓ copied" : label}
    </button>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function OverviewSection() {
  const [lang, setLang] = useState<"curl" | "node" | "python">("curl");
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">REST API · x402 · USDC ON BASE</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Blue Agent <span className="text-[#4FC3F7]">API</span>
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Pay per call with USDC. No subscriptions, no API keys.<br />
          18 endpoints · all tools available.
        </p>
      </div>

      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto w-full space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Base URL", value: "blueagent.dev/api/v1", color: "#4FC3F7" },
            { label: "Protocol", value: "HTTPS · REST · JSON",  color: "#34d399" },
            { label: "Payment",  value: "x402 · USDC on Base",  color: "#fbbf24" },
          ].map((s) => (
            <div key={s.label} className="card-surface rounded-lg p-4">
              <p className="font-mono text-[10px] text-slate-600 mb-1">{s.label}</p>
              <p className="font-mono text-xs font-semibold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Quick start */}
        <div className="card-surface rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <div className="flex gap-1">
              {(["curl", "node", "python"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`font-mono text-[10px] px-3 py-1.5 rounded transition-all ${
                    lang === l ? "bg-[#4FC3F7]/10 text-[#4FC3F7]" : "text-slate-600 hover:text-slate-300"
                  }`}>
                  {l}
                </button>
              ))}
            </div>
            <CopyBtn text={CODE_SNIPPETS[lang]} />
          </div>
          <pre className="font-mono text-xs text-slate-300 p-5 overflow-x-auto leading-relaxed whitespace-pre">
            {CODE_SNIPPETS[lang]}
          </pre>
        </div>

        {/* Catalog overview */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// AVAILABLE TOOLS</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-[#1A1A2E] p-3">
                <p className="font-mono text-lg font-bold mb-1" style={{ color: cat.color }}>{cat.tools.length}</p>
                <p className="font-mono text-[10px] text-slate-600">{cat.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[#1A1A2E] flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-700">40+ total tools via gateway —</span>
            <Link href="/hub" className="font-mono text-[10px] text-[#4FC3F7] hover:underline">see Hub for full catalog →</Link>
          </div>
        </div>

        {/* Errors */}
        <div>
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-3">// ERROR CODES</p>
          <div className="card-surface rounded-xl overflow-hidden">
            {[
              { code: "400", title: "Bad Request",         desc: "Missing or invalid parameters." },
              { code: "402", title: "Payment Required",     desc: "No X-Payment header or payment insufficient." },
              { code: "429", title: "Too Many Requests",    desc: "Rate limit exceeded — 100 req/min per IP." },
              { code: "502", title: "Bad Gateway",          desc: "Upstream service unreachable. Retry shortly." },
            ].map((e, i, arr) => (
              <div key={e.code}
                className={`flex items-start gap-4 px-5 py-3 ${i < arr.length - 1 ? "border-b border-[#1A1A2E]" : ""}`}>
                <span className="font-mono text-xs font-bold text-red-400 w-8 shrink-0">{e.code}</span>
                <span className="font-mono text-xs text-white w-32 shrink-0">{e.title}</span>
                <span className="font-mono text-[10px] text-slate-600">{e.desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function AuthSection() {
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#fbbf24]/20 bg-[#fbbf24]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
          <span className="font-mono text-[10px] text-[#fbbf24] tracking-widest">x402 · USDC · NO API KEY NEEDED</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Pay per <span className="text-[#fbbf24]">call</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          x402 — HTTP 402 micropayments.<br />
          Each call costs a small USDC amount paid directly onchain.
        </p>
      </div>

      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto w-full space-y-4">

        {/* Steps */}
        <div className="card-surface rounded-xl p-5">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">// PAYMENT FLOW</p>
          <div className="space-y-4">
            {[
              { n: "01", title: "Request without payment",   desc: "The API returns HTTP 402 with a payment requirement object specifying the exact USDC amount." },
              { n: "02", title: "Sign payment with wallet",  desc: "Use the x402 client or Bankr facilitator to create a signed EIP-3009 TransferWithAuthorization." },
              { n: "03", title: "Retry with X-Payment header", desc: "Include the signed token in X-Payment. The request processes and result is returned immediately." },
            ].map((step) => (
              <div key={step.n} className="flex gap-4">
                <span className="font-mono text-[10px] text-[#4FC3F7] w-6 shrink-0 mt-0.5">{step.n}</span>
                <div>
                  <p className="font-mono text-xs text-white mb-0.5">{step.title}</p>
                  <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 402 response example */}
        <div className="card-surface rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-[10px] text-slate-600">HTTP 402 response</span>
            <span className="font-mono text-[10px] text-red-400 border border-red-500/20 px-2 py-0.5 rounded">402 Payment Required</span>
          </div>
          <pre className="font-mono text-xs text-[#34d399] p-5 overflow-x-auto leading-relaxed">{`{
  "error": "Payment required",
  "x402": {
    "version": 1,
    "accepts": [{
      "scheme":             "exact",
      "network":            "base-mainnet",
      "maxAmountRequired":  "10000",
      "asset":              "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo":              "0x...",
      "description":        "Blue Agent — honeypot-check"
    }]
  }
}`}</pre>
        </div>

        {/* Pricing note */}
        <div className="card-surface rounded-lg p-4 flex items-start gap-3">
          <span className="font-mono text-[10px] text-[#fbbf24] shrink-0 mt-0.5">$</span>
          <div>
            <p className="font-mono text-xs text-white mb-1">USDC on Base — 6 decimals</p>
            <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
              1 USDC = 1,000,000 units. A $0.01 tool returns{" "}
              <span className="text-[#4FC3F7]">maxAmountRequired: &quot;10000&quot;</span>.
              All prices denominated in USDC on Base (chain ID 8453).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

function EndpointsSection({ category }: { category: typeof CATEGORIES[number] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      {/* Hero */}
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 mb-6"
          style={{ borderColor: `${category.color}30`, backgroundColor: `${category.color}08` }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: category.color }} />
          <span className="font-mono text-[10px] tracking-widest" style={{ color: category.color }}>
            {category.label.toUpperCase()} · {category.tools.length} TOOLS
          </span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          {category.label} <span style={{ color: category.color }}>tools</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto">
          {category.tools.length} endpoints · POST · JSON · x402 payment
        </p>
      </div>

      {/* Endpoints */}
      <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto w-full space-y-3">
        {category.tools.map((tool) => {
          const open = expanded === tool.name;
          return (
            <div key={tool.name} className="card-surface rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(open ? null : tool.name)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#0D0D14]/50 transition-colors group"
              >
                <span className="font-mono text-[10px] px-2 py-0.5 rounded font-semibold shrink-0"
                  style={{ backgroundColor: `${category.color}15`, color: category.color }}>
                  POST
                </span>
                <span className="font-mono text-xs text-white group-hover:text-[#4FC3F7] transition-colors text-left">
                  /api/v1/{tool.name}
                </span>
                <span className="font-mono text-[10px] text-slate-600 text-left flex-1 hidden sm:block truncate">
                  {tool.desc}
                </span>
                <span className="font-mono text-[10px] px-2 py-1 rounded shrink-0"
                  style={{ backgroundColor: `${category.color}10`, color: category.color }}>
                  {tool.price}
                </span>
                <svg className={`w-3.5 h-3.5 text-slate-700 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {open && (
                <div className="border-t border-[#1A1A2E] px-5 py-5 space-y-4">
                  <p className="font-mono text-xs text-slate-400 leading-relaxed">{tool.desc}</p>

                  {/* Params table */}
                  <div>
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// PARAMETERS</p>
                    <div className="border border-[#1A1A2E] rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[#1A1A2E] bg-[#0D0D14]">
                            {["name","type","required","description"].map((h) => (
                              <th key={h} className="font-mono text-[10px] text-slate-600 font-normal text-left px-3 py-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tool.params.map((p) => (
                            <tr key={p.name} className="border-b border-[#1A1A2E] last:border-b-0">
                              <td className="font-mono text-[10px] text-[#4FC3F7] px-3 py-2">{p.name}</td>
                              <td className="font-mono text-[10px] text-[#34d399] px-3 py-2">{p.type}</td>
                              <td className="px-3 py-2">
                                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                  p.required ? "bg-red-500/10 text-red-400" : "bg-[#1A1A2E] text-slate-600"
                                }`}>{p.required ? "required" : "optional"}</span>
                              </td>
                              <td className="font-mono text-[10px] text-slate-500 px-3 py-2">{p.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Example */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-[10px] text-slate-600 tracking-widest">// EXAMPLE</p>
                      <CopyBtn text={tool.example.replace(/\\n/g, "\n").replace(/\\\n/g, "\\\n")} />
                    </div>
                    <pre className="font-mono text-xs text-slate-300 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg p-4 overflow-x-auto leading-relaxed">
                      {tool.example}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const [active, setActive] = useState<Section>("overview");

  const endpointCat = CATEGORIES.find((c) => c.id === active);

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// API REFERENCE</p>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {SIDEBAR_NAV.map((item) => {
              const cat = CATEGORIES.find((c) => c.id === item.key);
              return (
                <button key={item.key} onClick={() => setActive(item.key)}
                  className={`w-full text-left px-5 py-3 transition-all border-l-2 ${
                    active === item.key
                      ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                      : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                  }`}>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs font-medium">{item.label}</p>
                    {cat && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{ color: cat.color, backgroundColor: `${cat.color}10` }}>
                        {cat.tools.length}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-slate-700 mt-0.5">{item.sub}</p>
                </button>
              );
            })}
          </nav>

          <div className="px-5 py-4 border-t border-[#1A1A2E] space-y-2">
            <div className="bg-[#0D0D14] rounded px-3 py-2">
              <p className="font-mono text-[10px] text-slate-700 mb-0.5">base url</p>
              <p className="font-mono text-[10px] text-[#4FC3F7] break-all">blueagent.dev/api/v1</p>
            </div>
            <Link href="/hub"
              className="flex items-center justify-between font-mono text-[10px] text-slate-600 hover:text-white border border-[#1A1A2E] hover:border-[#4FC3F7]/30 rounded px-3 py-2 transition-all">
              <span>Try tools in Hub UI</span><span className="text-[#4FC3F7]">→</span>
            </Link>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">

          {/* Mobile tabs */}
          <div className="lg:hidden flex overflow-x-auto gap-1 px-4 py-3 border-b border-[#1A1A2E] bg-[#050508]">
            {SIDEBAR_NAV.map((item) => (
              <button key={item.key} onClick={() => setActive(item.key)}
                className={`font-mono text-xs px-3 py-1.5 rounded shrink-0 transition-all ${
                  active === item.key
                    ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30"
                    : "text-slate-500 hover:text-white"
                }`}>
                {item.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {active === "overview" && <OverviewSection />}
          {active === "auth"     && <AuthSection />}
          {endpointCat && active !== "overview" && active !== "auth" && (
            <EndpointsSection category={endpointCat} />
          )}

        </main>
      </div>
    </>
  );
}
