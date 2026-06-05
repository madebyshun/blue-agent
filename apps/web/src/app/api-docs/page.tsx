"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Data ─────────────────────────────────────────────────────────────────────

const BASE_URL = "https://blueagent.dev/api/x402";

interface Param { name: string; type: string; required: boolean; desc: string }
interface Tool  { name: string; price: string; desc: string; params: Param[]; example: string }

const CATEGORIES: { id: string; label: string; color: string; sub: string; icon: string; tools: Tool[] }[] = [
  {
    id: "security", label: "Security", color: "#f87171", sub: "4 tools · $0.005–$0.05", icon: "🔐",
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
    id: "research", label: "Research", color: "#60a5fa", sub: "5 tools · $0.001–$0.01", icon: "🔭",
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
    id: "builder", label: "Builder", color: "#34d399", sub: "6 tools · $0.001–$0.01", icon: "🛠️",
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
    id: "premium", label: "Premium", color: "#a78bfa", sub: "3 tools · $0.005–$0.05", icon: "⚡",
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
curl -X POST https://blueagent.dev/api/x402/builder-score \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-token>" \\
  -d '{"handle":"madebyshun"}'`,

  node: `// npm install node-fetch
import fetch from "node-fetch";

const res = await fetch("https://blueagent.dev/api/x402/builder-score", {
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
    "https://blueagent.dev/api/x402/builder-score",
    headers={
        "Content-Type": "application/json",
        "X-Payment": "<x402-payment-token>",
    },
    json={"handle": "madebyshun"},
)
print(resp.json())`,
};

// ─── Components ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 mb-6">
      <div className="h-px w-8 bg-[#4FC3F740]" />
      <span className="font-mono text-[11px] text-[#4FC3F7] tracking-[0.2em] uppercase">{children}</span>
      <div className="h-px w-8 bg-[#4FC3F740]" />
    </div>
  );
}

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

function EndpointCard({ tool, color }: { tool: Tool; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#0a0a0f] transition-colors group"
      >
        <span className="font-mono text-[10px] px-2 py-0.5 rounded font-semibold shrink-0"
          style={{ backgroundColor: `${color}15`, color }}>
          POST
        </span>
        <span className="font-mono text-sm text-white group-hover:text-[#4FC3F7] transition-colors text-left flex-1 truncate">
          /api/x402/{tool.name}
        </span>
        <span className="font-mono text-[10px] px-2 py-1 rounded shrink-0 hidden sm:block"
          style={{ backgroundColor: `${color}10`, color }}>
          {tool.price}
        </span>
        <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[#1A1A2E] px-5 py-5 space-y-4">
          <p className="text-slate-400 text-sm leading-relaxed">{tool.desc}</p>

          <div>
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">// PARAMETERS</p>
            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1A1A2E] bg-[#0a0a0f]">
                    {["name", "type", "required", "description"].map((h) => (
                      <th key={h} className="font-mono text-[10px] text-slate-600 font-normal text-left px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tool.params.map((p) => (
                    <tr key={p.name} className="border-b border-[#1A1A2E] last:border-0">
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest">// EXAMPLE</p>
              <CopyBtn text={tool.example.replace(/\\n/g, "\n")} />
            </div>
            <pre className="font-mono text-xs text-slate-300 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl p-4 overflow-x-auto leading-relaxed">
              {tool.example}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const [lang, setLang] = useState<"curl" | "node" | "python">("curl");

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
        <div style={{ background: "radial-gradient(ellipse 70% 40% at 50% -5%, #fbbf2410 0%, transparent 70%)" }} className="absolute inset-0" />
      </div>

      <div className="relative">

        {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 pt-32 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#fbbf2430] bg-[#fbbf2408] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
            <span className="font-mono text-[11px] text-[#fbbf24] tracking-widest">x402 · USDC ON BASE · NO SUBSCRIPTION</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            API<br />
            <span className="text-[#4FC3F7]">Reference</span>
          </h1>

          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
            18 endpoints. Pay per call in USDC on Base via x402.
            No API key, no subscription — first call returns HTTP 402 with exact payment requirements.
          </p>

          <div className="inline-grid grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] mb-12">
            {[
              { value: "18",   label: "Endpoints", color: "#4FC3F7" },
              { value: "x402", label: "Protocol",  color: "#fbbf24" },
              { value: "USDC", label: "Payment",   color: "#34D399" },
              { value: "Base", label: "Network",   color: "#2563EB" },
            ].map((s) => (
              <div key={s.label} className="bg-[#0d0d12] px-6 py-5 text-center">
                <div className="font-mono text-xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono text-[10px] text-slate-600 tracking-widest">{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/hub"
              className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
              Try in Hub UI →
            </Link>
            <a href="/api/catalog"
              className="px-6 py-3 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
              Browse catalog →
            </a>
            <a href="/.well-known/pricing"
              className="px-6 py-3 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
              Pricing manifest →
            </a>
          </div>
        </section>

        {/* ══ QUICK START ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Quick Start</SectionLabel>
            <h2 className="text-3xl font-bold">Call your first endpoint</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-xl mx-auto">
              Base URL: <code className="font-mono text-[#4FC3F7]">https://blueagent.dev/api/x402</code> · All requests: POST · All responses: JSON
            </p>
          </div>

          {/* Code tabs */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden mb-8">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
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
            <pre className="font-mono text-sm text-slate-300 p-5 overflow-x-auto leading-relaxed whitespace-pre">
              {CODE_SNIPPETS[lang]}
            </pre>
          </div>

          {/* Stats by category */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 text-center">
                <div className="text-2xl mb-2">{cat.icon}</div>
                <div className="font-mono text-2xl font-bold mb-1" style={{ color: cat.color }}>{cat.tools.length}</div>
                <div className="font-mono text-[10px] text-slate-600 tracking-widest">{cat.label.toUpperCase()}</div>
                <div className="font-mono text-[10px] text-slate-700 mt-1">{cat.sub.split(" · ")[1]}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ PAYMENT FLOW ══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Authentication</SectionLabel>
            <h2 className="text-3xl font-bold">x402 · Pay per call</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-xl mx-auto">
              No API key. No signup. HTTP 402 micropayments in USDC on Base. One signed transfer per call.
            </p>
          </div>

          <div className="grid sm:grid-cols-4 gap-4 mb-8">
            {[
              { n: "01", title: "Probe",  desc: "POST to endpoint → HTTP 402 with payment requirements", color: "#4FC3F7" },
              { n: "02", title: "Decode", desc: "Parse requirements — asset, payTo, maxAmountRequired", color: "#A78BFA" },
              { n: "03", title: "Sign",   desc: "EIP-3009 USDC TransferWithAuthorization on Base", color: "#fbbf24" },
              { n: "04", title: "Retry",  desc: "POST with X-Payment header → 200 OK + result", color: "#34D399" },
            ].map((step) => (
              <div key={step.n} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 text-center">
                <div className="font-mono text-[10px] mb-3 px-2 py-0.5 rounded border inline-block"
                  style={{ color: step.color, borderColor: `${step.color}30` }}>{step.n}</div>
                <div className="font-bold text-white mb-2">{step.title}</div>
                <div className="font-mono text-[11px] text-slate-600 leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>

          {/* 402 response */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
              <span className="font-mono text-[10px] text-slate-600">HTTP 402 response — payment requirements</span>
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
      "payTo":              "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f",
      "description":        "Blue Agent — honeypot-check ($0.01)"
    }]
  }
}`}</pre>
          </div>

          {/* Error codes */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">ERROR CODES</span>
            </div>
            {[
              { code: "400", title: "Bad Request",      desc: "Missing or invalid parameters." },
              { code: "402", title: "Payment Required", desc: "No X-Payment header or payment insufficient." },
              { code: "429", title: "Rate Limited",     desc: "100 req/min per IP." },
              { code: "502", title: "Bad Gateway",      desc: "Upstream service unreachable. Retry shortly." },
            ].map((e, i, arr) => (
              <div key={e.code}
                className={`flex items-center gap-4 px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-[#1A1A2E]" : ""}`}>
                <span className="font-mono text-sm font-bold text-red-400 w-10 shrink-0">{e.code}</span>
                <span className="font-mono text-sm text-white w-32 shrink-0">{e.title}</span>
                <span className="font-mono text-[11px] text-slate-600">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ══ ENDPOINTS ═════════════════════════════════════════════════════════ */}
        {CATEGORIES.map((cat, idx) => (
          <section key={cat.id} className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
            <div className="text-center mb-14">
              <SectionLabel>{cat.label} Tools</SectionLabel>
              <h2 className="text-3xl font-bold">
                <span style={{ color: cat.color }}>{cat.icon}</span> {cat.label}
              </h2>
              <p className="text-slate-500 mt-3 text-sm">{cat.sub}</p>
            </div>

            <div className="space-y-3">
              {cat.tools.map((tool) => (
                <EndpointCard key={tool.name} tool={tool} color={cat.color} />
              ))}
            </div>
          </section>
        ))}

        {/* ══ SDK ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>SDK</SectionLabel>
            <h2 className="text-3xl font-bold">@blueagent/x402</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-xl mx-auto">
              Auto payment flow — probe → 402 → sign EIP-3009 → retry → 200 OK. No API key. Pay per call.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                </div>
                <span className="font-mono text-xs text-slate-600 ml-1">install</span>
              </div>
              <pre className="font-mono text-sm text-[#4FC3F7] p-5 leading-relaxed">{`$ npm install @blueagent/x402`}</pre>
            </div>

            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                <span className="font-mono text-xs text-slate-600">usage</span>
              </div>
              <pre className="font-mono text-xs text-slate-300 p-5 overflow-x-auto leading-relaxed">{`import { createX402Client } from "@blueagent/x402"

const client = createX402Client({ privateKey: "0x..." })

const brief = await client.idea("DeFi protocol on Base")
const audit = await client.audit("0x<contract>")
const pick  = await client.tokenPick()
const price = await client.priceOf("blue-audit")`}</pre>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-6">
            {[
              { label: "Network", value: "Base (eip155:8453)",            color: "#2563EB" },
              { label: "Asset",   value: "USDC 0x8335…02913",            color: "#34D399" },
              { label: "Scheme",  value: "x402 v2 · EIP-3009 + EIP-712", color: "#4FC3F7" },
            ].map((info) => (
              <div key={info.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 text-center">
                <div className="font-mono text-[10px] text-slate-600 mb-1 tracking-widest">{info.label.toUpperCase()}</div>
                <div className="font-mono text-sm font-bold" style={{ color: info.color }}>{info.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ CTA ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="rounded-2xl border border-[#4FC3F720] bg-[#4FC3F705] p-12 text-center"
            style={{ boxShadow: "0 0 60px #4FC3F708" }}>
            <h2 className="text-3xl font-bold mb-4">Ready to integrate?</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              18 endpoints. Pay per call in USDC on Base. No signup. No subscriptions.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <a href="/api/catalog"
                className="px-8 py-3.5 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
                Browse catalog →
              </a>
              <Link href="/hub"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
                Try in Hub UI
              </Link>
              <Link href="/docs"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
                Full Docs →
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
