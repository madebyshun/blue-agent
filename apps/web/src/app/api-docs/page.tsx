"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

// ─── API catalog ──────────────────────────────────────────────────────────────

const BASE_URL = "https://blueagent.dev/api/v1";

interface Tool {
  name: string;
  price: string;
  desc: string;
  params: Array<{ name: string; type: string; required: boolean; desc: string }>;
  example: string;
}

const API_CATEGORIES: Array<{ id: string; label: string; color: string; tools: Tool[] }> = [
  {
    id: "security",
    label: "Security",
    color: "#f87171",
    tools: [
      {
        name: "honeypot-check",
        price: "$0.01",
        desc: "Detect honeypot tokens that cannot be sold after purchase.",
        params: [{ name: "token", type: "address", required: true, desc: "Token contract address on Base" }],
        example: `curl -X POST ${BASE_URL}/honeypot-check \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"token":"0x..."}'`,
      },
      {
        name: "contract-trust",
        price: "$0.05",
        desc: "Full smart contract risk review — reentrancy, access control, ownership, proxy patterns.",
        params: [
          { name: "address", type: "address", required: true, desc: "Contract address on Base" },
          { name: "chain_id", type: "number", required: false, desc: "Default: 8453 (Base)" },
        ],
        example: `curl -X POST ${BASE_URL}/contract-trust \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"address":"0x..."}'`,
      },
      {
        name: "aml-screen",
        price: "$0.01",
        desc: "AML screening for wallets — flagged activity, counterparties, mixer exposure.",
        params: [{ name: "address", type: "address", required: true, desc: "Wallet address to screen" }],
        example: `curl -X POST ${BASE_URL}/aml-screen \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"address":"0x..."}'`,
      },
      {
        name: "allowance-audit",
        price: "$0.005",
        desc: "Audit all token allowances for a wallet — flag excessive or risky approvals.",
        params: [{ name: "address", type: "address", required: true, desc: "Wallet address" }],
        example: `curl -X POST ${BASE_URL}/allowance-audit \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"address":"0x..."}'`,
      },
    ],
  },
  {
    id: "research",
    label: "Research",
    color: "#60a5fa",
    tools: [
      {
        name: "deep-analysis",
        price: "$0.001",
        desc: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals.",
        params: [
          { name: "token", type: "address", required: true, desc: "Token contract address" },
          { name: "chain_id", type: "number", required: false, desc: "Default: 8453" },
        ],
        example: `curl -X POST ${BASE_URL}/deep-analysis \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"token":"0x..."}'`,
      },
      {
        name: "whale-copy-signal",
        price: "$0.005",
        desc: "Track whale wallet movements and generate copy-trade signals for a token.",
        params: [
          { name: "token", type: "address", required: true, desc: "Token to track" },
          { name: "min_usd", type: "number", required: false, desc: "Min trade size to track. Default: 10000" },
        ],
        example: `curl -X POST ${BASE_URL}/whale-copy-signal \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"token":"0x...","min_usd":50000}'`,
      },
      {
        name: "token-pick-signal",
        price: "$0.01",
        desc: "AI token pick signal — falsifiable thesis, entry zone, kill criterion, sizing.",
        params: [
          { name: "context", type: "string", required: false, desc: "Market context or narrative to consider" },
        ],
        example: `curl -X POST ${BASE_URL}/token-pick-signal \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"context":"Base DeFi narratives this week"}'`,
      },
      {
        name: "narrative-position",
        price: "$0.005",
        desc: "Current narrative map with mindshare scores, velocity, phase, and position calls.",
        params: [
          { name: "narratives", type: "string[]", required: false, desc: "Specific narratives to score" },
        ],
        example: `curl -X POST ${BASE_URL}/narrative-position \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{}'`,
      },
      {
        name: "token-momentum-scanner",
        price: "$0.005",
        desc: "Scan for tokens with accelerating on-chain activity and social momentum on Base.",
        params: [
          { name: "limit", type: "number", required: false, desc: "Number of results. Default: 10" },
          { name: "min_confidence", type: "number", required: false, desc: "Min signal confidence 0-1. Default: 0.6" },
        ],
        example: `curl -X POST ${BASE_URL}/token-momentum-scanner \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"limit":10,"min_confidence":0.7}'`,
      },
    ],
  },
  {
    id: "builder",
    label: "Builder",
    color: "#34d399",
    tools: [
      {
        name: "builder-score",
        price: "$0.001",
        desc: "Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100).",
        params: [{ name: "handle", type: "string", required: true, desc: "X/Twitter handle (without @)" }],
        example: `curl -X POST ${BASE_URL}/builder-score \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"handle":"madebyshun"}'`,
      },
      {
        name: "agent-score",
        price: "$0.01",
        desc: "Agent Score — XP system for AI agents on Base. Tracks interactions, signals, uptime.",
        params: [{ name: "handle", type: "string", required: true, desc: "Agent handle or name" }],
        example: `curl -X POST ${BASE_URL}/agent-score \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"handle":"blue-agent"}'`,
      },
      {
        name: "base-grant-finder",
        price: "$0.01",
        desc: "Find active grants and funding opportunities for your project on Base.",
        params: [
          { name: "project", type: "string", required: true, desc: "Project description" },
          { name: "stage", type: "string", required: false, desc: "idea | build | live" },
        ],
        example: `curl -X POST ${BASE_URL}/base-grant-finder \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"project":"DEX aggregator on Base","stage":"build"}'`,
      },
      {
        name: "market-fit",
        price: "$0.01",
        desc: "Market fit analysis for a Base project — problem clarity, timing, competition, demand signals.",
        params: [
          { name: "project", type: "string", required: true, desc: "Project description" },
          { name: "url", type: "string", required: false, desc: "Project URL for deeper analysis" },
        ],
        example: `curl -X POST ${BASE_URL}/market-fit \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"project":"AI-native DEX on Base"}'`,
      },
      {
        name: "repo-health",
        price: "$0.005",
        desc: "GitHub repo health check — commit velocity, test coverage, dependency risk, bus factor.",
        params: [{ name: "url", type: "string", required: true, desc: "GitHub repository URL" }],
        example: `curl -X POST ${BASE_URL}/repo-health \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"url":"https://github.com/org/repo"}'`,
      },
      {
        name: "ecosystem-digest",
        price: "$0.005",
        desc: "Daily Base ecosystem digest — top launches, protocol updates, builder activity.",
        params: [
          { name: "date", type: "string", required: false, desc: "ISO date. Default: today" },
        ],
        example: `curl -X POST ${BASE_URL}/ecosystem-digest \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{}'`,
      },
    ],
  },
  {
    id: "premium",
    label: "Premium",
    color: "#a78bfa",
    tools: [
      {
        name: "risk-gate",
        price: "$0.05",
        desc: "Screen any transaction before execution — rug check, AML, malicious contract patterns.",
        params: [
          { name: "action", type: "string", required: true, desc: "transfer | swap | approve | call" },
          { name: "to", type: "address", required: true, desc: "Target address" },
          { name: "value", type: "string", required: false, desc: "Amount in Wei" },
          { name: "data", type: "string", required: false, desc: "Call data hex" },
        ],
        example: `curl -X POST ${BASE_URL}/risk-gate \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"action":"transfer","to":"0x...","value":"1000000"}'`,
      },
      {
        name: "wallet-pnl",
        price: "$0.005",
        desc: "Realized and unrealized PnL across all positions for a wallet.",
        params: [
          { name: "address", type: "address", required: true, desc: "Wallet address" },
          { name: "chain_id", type: "number", required: false, desc: "Default: 8453" },
        ],
        example: `curl -X POST ${BASE_URL}/wallet-pnl \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"address":"0x..."}'`,
      },
      {
        name: "token-launch-readiness",
        price: "$0.02",
        desc: "Pre-launch token readiness check — contract, tokenomics, liquidity, community, timing.",
        params: [
          { name: "token", type: "address", required: false, desc: "Token address if deployed" },
          { name: "project", type: "string", required: true, desc: "Project name and description" },
        ],
        example: `curl -X POST ${BASE_URL}/token-launch-readiness \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"project":"Blue Agent token launch"}'`,
      },
    ],
  },
];

// ─── Code snippets ────────────────────────────────────────────────────────────

const CODE_EXAMPLES: Record<string, string> = {
  curl: `# Example: builder-score
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="font-mono text-xs px-2.5 py-1 rounded border border-[#1A1A2E] text-slate-500 hover:text-white hover:border-slate-600 transition-all"
    >
      {copied ? "✓" : label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const [activeCategory, setActiveCategory] = useState("security");
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [codeLang, setCodeLang] = useState<"curl" | "node" | "python">("curl");

  const category = API_CATEGORIES.find((c) => c.id === activeCategory)!;

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <div className="flex pt-16">

        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-r border-[#1A1A2E] px-6 py-8 overflow-y-auto">
          <div className="font-mono text-xs text-slate-500 mb-4 tracking-widest">API REFERENCE</div>

          <a href="#overview" className="font-mono text-sm text-slate-400 hover:text-white py-1.5 transition-colors">Overview</a>
          <a href="#auth" className="font-mono text-sm text-slate-400 hover:text-white py-1.5 transition-colors">Authentication</a>
          <a href="#errors" className="font-mono text-sm text-slate-400 hover:text-white py-1.5 transition-colors">Errors</a>

          <div className="mt-4 mb-2 font-mono text-xs text-slate-600 tracking-widest">ENDPOINTS</div>
          {API_CATEGORIES.map((cat) => (
            <button key={cat.id}
              onClick={() => { setActiveCategory(cat.id); document.getElementById("endpoints")?.scrollIntoView({ behavior: "smooth" }); }}
              className={`font-mono text-sm py-1.5 text-left transition-colors flex items-center gap-2 ${
                activeCategory === cat.id ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeCategory === cat.id ? cat.color : "#334155" }} />
              {cat.label}
              <span className="ml-auto font-mono text-xs text-slate-600">{cat.tools.length}</span>
            </button>
          ))}

          <div className="mt-auto pt-6 border-t border-[#1A1A2E] space-y-2">
            <div className="font-mono text-xs text-slate-600 mb-1">BASE URL</div>
            <div className="font-mono text-xs text-[#4FC3F7] bg-[#4FC3F7]/5 px-3 py-2 rounded break-all">
              blueagent.dev/api/v1
            </div>
            <Link href="/hub" className="font-mono text-xs text-slate-500 hover:text-slate-300 transition-colors block pt-1">
              → Try tools in Hub UI
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 px-6 sm:px-8 lg:px-12 py-10 max-w-4xl">

          {/* Header */}
          <div className="mb-12">
            <div className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-4">PUBLIC API</div>
            <h1 className="font-mono text-3xl font-bold text-white mb-3">
              Blue Agent <span className="text-[#4FC3F7]">API</span>
            </h1>
            <p className="font-mono text-slate-400 text-sm leading-relaxed max-w-xl">
              REST API for Blue Agent tools. Pay per call with USDC via x402.
              No subscriptions, no API keys — just send a payment token and call any endpoint.
            </p>
          </div>

          {/* Overview */}
          <section id="overview" className="mb-12">
            <h2 className="font-mono text-lg font-bold text-white mb-4">Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {[
                { label: "Base URL", value: "blueagent.dev/api/v1", color: "#4FC3F7" },
                { label: "Protocol", value: "HTTPS · REST · JSON", color: "#34d399" },
                { label: "Payment", value: "x402 · USDC on Base", color: "#fbbf24" },
              ].map((item) => (
                <div key={item.label} className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg px-4 py-3">
                  <div className="font-mono text-xs text-slate-500 mb-1">{item.label}</div>
                  <div className="font-mono text-sm font-semibold" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Total tools */}
            <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl p-5">
              <div className="font-mono text-xs text-slate-500 mb-3 tracking-widest">AVAILABLE TOOLS</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {API_CATEGORIES.map((cat) => (
                  <button key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className="text-left p-3 rounded-lg border border-[#1A1A2E] hover:border-slate-600 transition-all group">
                    <div className="font-mono text-xl font-bold group-hover:text-white" style={{ color: cat.color }}>
                      {cat.tools.length}
                    </div>
                    <div className="font-mono text-xs text-slate-500 mt-1">{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Auth */}
          <section id="auth" className="mb-12">
            <h2 className="font-mono text-lg font-bold text-white mb-4">Authentication</h2>
            <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl p-5 space-y-4">
              <p className="font-mono text-sm text-slate-400 leading-relaxed">
                Blue Agent API uses <strong className="text-white">x402</strong> — HTTP 402 micropayments.
                Each call costs a small USDC amount paid directly onchain. No API keys or subscriptions.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-[#4FC3F7] w-5 shrink-0 mt-0.5">1.</span>
                  <div>
                    <div className="font-mono text-sm text-white mb-0.5">Make a request without payment</div>
                    <div className="font-mono text-xs text-slate-400">The API returns HTTP 402 with a payment requirement object.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-[#4FC3F7] w-5 shrink-0 mt-0.5">2.</span>
                  <div>
                    <div className="font-mono text-sm text-white mb-0.5">Sign the payment with your wallet</div>
                    <div className="font-mono text-xs text-slate-400">Use the x402 client or Bankr facilitator to create a payment token.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-[#4FC3F7] w-5 shrink-0 mt-0.5">3.</span>
                  <div>
                    <div className="font-mono text-sm text-white mb-0.5">Retry with X-Payment header</div>
                    <div className="font-mono text-xs text-slate-400">Include the signed payment token. Request processes and result is returned.</div>
                  </div>
                </div>
              </div>

              <div className="bg-[#050508] border border-[#1A1A2E] rounded-lg p-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-slate-500">HTTP 402 response</span>
                </div>
                <pre className="font-mono text-xs text-[#34d399] overflow-x-auto">{`{
  "error": "Payment required",
  "x402": {
    "version": 1,
    "accepts": [{
      "scheme": "exact",
      "network": "base-mainnet",
      "maxAmountRequired": "10000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x...",
      "description": "Blue Agent — honeypot-check"
    }]
  }
}`}</pre>
              </div>
            </div>
          </section>

          {/* Code examples */}
          <section className="mb-12">
            <h2 className="font-mono text-lg font-bold text-white mb-4">Quick Start</h2>
            <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E]">
                <div className="flex gap-1">
                  {(["curl", "node", "python"] as const).map((lang) => (
                    <button key={lang}
                      onClick={() => setCodeLang(lang)}
                      className={`font-mono text-xs px-3 py-1.5 rounded transition-all ${
                        codeLang === lang
                          ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                          : "text-slate-500 hover:text-slate-300"
                      }`}>
                      {lang}
                    </button>
                  ))}
                </div>
                <CopyBtn text={CODE_EXAMPLES[codeLang]} label="Copy" />
              </div>
              <pre className="font-mono text-xs text-slate-300 p-4 overflow-x-auto leading-relaxed">
                {CODE_EXAMPLES[codeLang]}
              </pre>
            </div>
          </section>

          {/* Endpoint reference */}
          <section id="endpoints">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono text-lg font-bold text-white">Endpoints</h2>
              {/* Category tabs */}
              <div className="flex gap-1">
                {API_CATEGORIES.map((cat) => (
                  <button key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`font-mono text-xs px-3 py-1.5 rounded transition-all ${
                      activeCategory === cat.id
                        ? "text-white"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                    style={activeCategory === cat.id ? { backgroundColor: cat.color + "20", color: cat.color } : {}}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {category.tools.map((tool) => {
                const isOpen = expandedTool === tool.name;
                return (
                  <div key={tool.name}
                    className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedTool(isOpen ? null : tool.name)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#0D0D1A]/60 transition-colors group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="font-mono text-xs px-2 py-0.5 rounded text-white font-semibold bg-[#4FC3F7]/10 text-[#4FC3F7] shrink-0">
                          POST
                        </span>
                        <span className="font-mono text-sm text-white">/api/v1/{tool.name}</span>
                        <span className="font-mono text-xs text-slate-500 truncate hidden sm:block">{tool.desc}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="font-mono text-xs px-2 py-1 rounded"
                          style={{ backgroundColor: category.color + "15", color: category.color }}>
                          {tool.price}
                        </span>
                        <svg className={`w-4 h-4 text-slate-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-[#1A1A2E] px-5 py-5 space-y-5">
                        <p className="font-mono text-sm text-slate-300">{tool.desc}</p>

                        {/* Parameters */}
                        <div>
                          <div className="font-mono text-xs text-slate-500 mb-2 tracking-wider">PARAMETERS</div>
                          <div className="border border-[#1A1A2E] rounded-lg overflow-hidden">
                            <table className="w-full text-xs font-mono">
                              <thead>
                                <tr className="border-b border-[#1A1A2E] bg-[#0D0D1A]">
                                  <th className="text-left px-3 py-2 text-slate-500 font-normal">name</th>
                                  <th className="text-left px-3 py-2 text-slate-500 font-normal">type</th>
                                  <th className="text-left px-3 py-2 text-slate-500 font-normal">required</th>
                                  <th className="text-left px-3 py-2 text-slate-500 font-normal hidden sm:table-cell">description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tool.params.map((p) => (
                                  <tr key={p.name} className="border-b border-[#1A1A2E] last:border-b-0">
                                    <td className="px-3 py-2 text-[#4FC3F7]">{p.name}</td>
                                    <td className="px-3 py-2 text-[#34d399]">{p.type}</td>
                                    <td className="px-3 py-2">
                                      <span className={`px-1.5 py-0.5 rounded text-xs ${p.required ? "bg-red-500/15 text-red-400" : "bg-slate-700/30 text-slate-500"}`}>
                                        {p.required ? "required" : "optional"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 hidden sm:table-cell">{p.desc}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Example */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-mono text-xs text-slate-500 tracking-wider">EXAMPLE</div>
                            <CopyBtn text={tool.example} />
                          </div>
                          <pre className="font-mono text-xs text-slate-300 bg-[#050508] border border-[#1A1A2E] rounded-lg p-3 overflow-x-auto leading-relaxed">
                            {tool.example}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* More tools note */}
            <div className="mt-6 bg-[#0A0A14] border border-[#1A1A2E] rounded-xl p-5 flex items-start gap-3">
              <span className="text-[#4FC3F7] mt-0.5">ℹ</span>
              <div>
                <div className="font-mono text-sm text-white mb-1">
                  {API_CATEGORIES.reduce((s, c) => s + c.tools.length, 0)} endpoints shown ·{" "}
                  <Link href="/hub" className="text-[#4FC3F7] hover:underline">54+ tools in Hub</Link>
                </div>
                <div className="font-mono text-xs text-slate-500">
                  All Hub tools are available via the API. See the Hub page for the full catalog.
                  Agent-to-agent access: POST signals to{" "}
                  <Link href="/api/signal" className="text-[#4FC3F7] hover:underline">/api/signal</Link>.
                </div>
              </div>
            </div>
          </section>

          {/* Errors */}
          <section id="errors" className="mt-12">
            <h2 className="font-mono text-lg font-bold text-white mb-4">Errors</h2>
            <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-xl overflow-hidden">
              {[
                { code: "400", title: "Bad Request", desc: "Missing or invalid parameters." },
                { code: "402", title: "Payment Required", desc: "No payment token sent or payment insufficient." },
                { code: "429", title: "Too Many Requests", desc: "Rate limit exceeded — 100 req/min per IP." },
                { code: "502", title: "Bad Gateway", desc: "Upstream service unreachable. Retry in a few seconds." },
              ].map((err, i, arr) => (
                <div key={err.code} className={`flex items-start gap-4 px-5 py-4 ${i < arr.length - 1 ? "border-b border-[#1A1A2E]" : ""}`}>
                  <span className="font-mono text-sm font-bold text-red-400 w-10 shrink-0">{err.code}</span>
                  <div>
                    <div className="font-mono text-sm text-white">{err.title}</div>
                    <div className="font-mono text-xs text-slate-500 mt-0.5">{err.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
