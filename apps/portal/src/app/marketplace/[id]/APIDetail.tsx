"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketplaceAPI } from "../_data";
import { providerSlug } from "../_helpers";
import { sampleFor } from "../_samples";

interface Props {
  api:     MarketplaceAPI;
  related: MarketplaceAPI[];
}

type Lang = "curl" | "js" | "python" | "mcp";

export default function APIDetail({ api, related }: Props) {
  const [lang,   setLang]   = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);
  const sample = sampleFor(api.id);
  const [tryInput, setTryInput] = useState(() => Object.values(sample.input)[0] ?? "");
  const [tryRunning, setTryRunning] = useState(false);
  const [tryResult,  setTryResult]  = useState<unknown>(null);

  function runPreview() {
    setTryRunning(true);
    setTryResult(null);
    // Simulate latency for realistic feel; real calls go via MCP / x402.
    setTimeout(() => {
      setTryResult(sample.output);
      setTryRunning(false);
    }, 700);
  }

  const endpointUrl = `https://${api.endpoint}`;
  const snippets: Record<Lang, string> = {
    curl: `curl -X POST ${endpointUrl} \\
  -H 'Content-Type: application/json' \\
  -d '{ "prompt": "Your input here" }'

# First call returns 402 + payment requirements.
# Sign EIP-3009 USDC TransferWithAuthorization, retry with X-Payment header.`,
    js: `const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Your input here" }),
});

if (res.status === 402) {
  // Sign x402 payment, retry with X-Payment header
  const { accepts } = await res.json();
  // ... see /x402 docs
}
const data = await res.json();`,
    python: `import requests

res = requests.post(
    "${endpointUrl}",
    json={"prompt": "Your input here"},
)
# 402 = sign x402 payment, retry with X-Payment header
data = res.json()`,
    mcp: `// Add Blue Agent's MCP to claude_desktop_config.json:
{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}

// Then call from any MCP client:
// tools/call { "name": "${api.id.replace(/-/g, "_")}", ... }`,
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippets[lang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="px-5 sm:px-8 py-6 max-w-5xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-[11px]">
        <Link href="/marketplace" className="font-mono text-slate-500 hover:text-white transition-colors">
          ← Marketplace
        </Link>
        <span className="text-slate-700">/</span>
        <Link href={`/providers/${providerSlug(api.provider)}`} className="font-mono text-slate-500 hover:text-white transition-colors">
          {api.provider}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="font-mono text-slate-300">{api.name}</span>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-8">
        <div>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] flex items-center justify-center text-3xl shrink-0">
              {api.icon ?? "⚡"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest">
                  {api.category.toUpperCase()}
                </p>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">● LIVE</span>
                {api.verified && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
                )}
                {api.aiReady && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA]/90 bg-[#A78BFA]/5">🤖 AI Ready</span>
                )}
              </div>
              <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight mb-1">{api.name}</h1>
              <p className="font-mono text-[12px] text-slate-500">
                by <Link href={`/providers/${providerSlug(api.provider)}`} className="text-[#4FC3F7] hover:underline">{api.provider}</Link>
                {" · "}
                <span className="text-slate-600">Released {new Date(api.releasedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
              </p>
            </div>
          </div>
          <p className="font-mono text-sm text-slate-300 leading-relaxed">{api.desc}</p>
        </div>

        {/* Price card */}
        <div className="rounded-2xl border border-[#34D399]/25 bg-[#34D399]/5 p-5 flex flex-col">
          <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">PRICE PER CALL</p>
          <p className="font-mono text-3xl font-bold text-[#34D399] tabular-nums mb-3">
            {api.price}<span className="text-slate-700 font-normal text-base">/call</span>
          </p>
          <p className="font-mono text-[10px] text-slate-600 mb-4">
            Settled in USDC on Base. First call requires wallet signature (EIP-3009).
            No subscription, no minimum.
          </p>
          <div className="flex flex-col gap-2 mt-auto">
            <a href="#code" className="font-mono text-xs font-semibold px-4 py-2 rounded-lg bg-[#34D399] text-[#050508] hover:bg-emerald-400 transition-colors text-center">
              Call now →
            </a>
            <Link href="/agents" className="font-mono text-xs font-semibold px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all text-center">
              Or call via MCP
            </Link>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "LIFETIME CALLS", value: api.calls > 0 ? api.calls.toLocaleString() : "—", color: "#4FC3F7" },
          { label: "UPTIME (24H)",   value: "—",     color: "#34D399", note: "monitoring soon" },
          { label: "P95 LATENCY",    value: "—",     color: "#A78BFA", note: "monitoring soon" },
          { label: "AVG RATING",     value: "—",     color: "#F59E0B", note: "after first reviews" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-3">
            <p className="font-mono text-[9px] tracking-widest mb-1" style={{ color: s.color }}>{s.label}</p>
            <p className="font-mono text-xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
            {s.note && <p className="font-mono text-[9px] text-slate-700 mt-1">{s.note}</p>}
          </div>
        ))}
      </div>

      {/* Endpoint */}
      <section className="mb-8">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">ENDPOINT</p>
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#4FC3F7]/15 text-[#4FC3F7] shrink-0">POST</span>
          <code className="font-mono text-xs text-slate-300 truncate flex-1">{endpointUrl}</code>
        </div>
      </section>

      {/* Try-it widget */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">▶ TRY IT — preview mode</p>
          <span className="font-mono text-[9px] text-slate-700">Sample response · no payment · no wallet</span>
        </div>
        <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/[0.04] overflow-hidden">
          {/* Input row */}
          <div className="flex items-stretch border-b border-[#1A1A2E]">
            <span className="font-mono text-[10px] text-[#4FC3F7] px-3 py-3 self-center shrink-0">
              {Object.keys(sample.input)[0] ?? "input"}:
            </span>
            <input
              value={tryInput}
              onChange={e => setTryInput(e.target.value)}
              placeholder={Object.values(sample.input)[0]?.toString() ?? "Your input here"}
              className="flex-1 bg-transparent font-mono text-xs text-white placeholder-slate-700 outline-none px-2 py-3"
            />
            <button onClick={runPreview} disabled={tryRunning}
              className="font-mono text-[11px] font-semibold px-4 m-1.5 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] disabled:opacity-50 transition-colors shrink-0">
              {tryRunning ? "…" : "▶ Run"}
            </button>
          </div>

          {/* Output row */}
          {tryResult !== null && (
            <div className="px-4 py-3 bg-[#0a0a0f]">
              <p className="font-mono text-[10px] text-slate-600 mb-2">// SAMPLE RESPONSE — 700ms</p>
              <pre className="font-mono text-[11px] text-slate-300 leading-relaxed max-h-72 overflow-y-auto overflow-x-auto">
                <code>{JSON.stringify(tryResult, null, 2)}</code>
              </pre>
            </div>
          )}

          {tryResult === null && !tryRunning && (
            <div className="px-4 py-6 text-center bg-[#0a0a0f]">
              <p className="font-mono text-[11px] text-slate-600">Hit Run to see a sample response.</p>
              <p className="font-mono text-[10px] text-slate-700 mt-1">For real calls, install the MCP server or pay via x402.</p>
            </div>
          )}
        </div>
      </section>

      {/* Code samples */}
      <section id="code" className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">CODE SAMPLES</p>
          <div className="flex items-center gap-1 border border-[#1A1A2E] bg-[#0d0d12] rounded-lg p-0.5">
            {(["curl", "js", "python", "mcp"] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                  lang === l
                    ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                    : "text-slate-500 hover:text-slate-300"
                }`}>
                {l === "js" ? "JS" : l === "mcp" ? "MCP" : l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0d0d12]">
            <p className="font-mono text-[10px] text-slate-600">
              {lang === "curl" ? "Terminal" : lang === "js" ? "Node / Browser" : lang === "python" ? "Python 3" : "claude_desktop_config.json"}
            </p>
            <button onClick={copy}
              className={`font-mono text-[10px] px-2 py-1 rounded border transition-all ${
                copied
                  ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
                  : "text-slate-500 border-[#1A1A2E] hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30"
              }`}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <pre className="px-4 py-4 overflow-x-auto font-mono text-xs text-slate-300 leading-relaxed">
            <code>{snippets[lang]}</code>
          </pre>
        </div>
        <p className="font-mono text-[10px] text-slate-700 mt-2">
          Need full payment flow? See the <Link href="/x402" className="text-[#4FC3F7] hover:underline">x402 protocol page</Link>.
        </p>
      </section>

      {/* Related APIs */}
      {related.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">RELATED APIs · same category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {related.map(r => (
              <Link key={r.id} href={`/marketplace/${r.id}`}
                className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{r.icon ?? "⚡"}</span>
                  <p className="font-mono text-[10px] text-slate-700 truncate">{r.provider}</p>
                </div>
                <p className="font-mono text-sm font-bold truncate group-hover:text-[#4FC3F7] transition-colors">{r.name}</p>
                <p className="font-mono text-[10px] text-slate-500 line-clamp-2 leading-relaxed mt-1 mb-2">{r.desc}</p>
                <p className="font-mono text-[11px] font-bold text-[#34D399]">{r.price}<span className="text-slate-700 font-normal">/call</span></p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
