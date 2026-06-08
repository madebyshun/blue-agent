"use client";

/**
 * APIDetail — Orbis-style detail page (post Persona 1 feedback).
 *
 * Layout, top to bottom:
 *   1. Breadcrumb
 *   2. Hero — provider logo, title, meta strip, big "Try it now" CTA top-right,
 *      live API-call counter
 *   3. About card — long description + tag chips
 *   4. Pricing tiers — side-by-side cards (Paid / Free)
 *   5. Endpoints — expandable list (only when api.endpoints[] is populated)
 *   6. Try-it widget (preview mode)
 *   7. Code samples
 *   8. Related APIs strip
 */

import Link from "next/link";
import { useState } from "react";
import type { MarketplaceAPI } from "../_data";
import { providerSlug } from "../_helpers";
import { sampleFor } from "../_samples";
import { detailFor } from "../_detail";
import { ProviderLogo } from "../../_components/Logos";

interface Props {
  api:     MarketplaceAPI;
  related: MarketplaceAPI[];
}

type Lang = "curl" | "js" | "python" | "mcp";

export default function APIDetail({ api, related }: Props) {
  const extras = detailFor(api.id);
  const tags          = api.tags          ?? extras?.tags          ?? [];
  const longDesc      = api.longDesc      ?? extras?.longDesc      ?? api.desc;
  const website       = api.website       ?? extras?.website;
  const docsUrl       = api.docsUrl       ?? extras?.docsUrl;
  const pricingTiers  = api.pricingTiers  ?? extras?.pricingTiers  ?? [
    { name: "Paid", price: api.price, desc: "Pay per call. Settled in USDC on Base. No subscription, no minimum.", flavor: "paid" as const },
  ];

  const [lang,   setLang]   = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);
  const sample = sampleFor(api.id);
  const [tryInput, setTryInput] = useState(() => Object.values(sample.input)[0] ?? "");
  const [tryRunning, setTryRunning] = useState(false);
  const [tryResult,  setTryResult]  = useState<unknown>(null);

  function runPreview() {
    setTryRunning(true);
    setTryResult(null);
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

      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 text-[11px]">
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

      {/* ── HERO — Orbis pattern ───────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6 mb-10">
        {/* Logo + Title + Meta strip */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="shrink-0">
            <ProviderLogo provider={api.provider} size={72} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {api.name}
              </h1>
              {api.status === "live" && (
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md border border-[#34D399]/40 text-[#34D399] bg-[#34D399]/10">
                  ● Active
                </span>
              )}
            </div>
            <p className="font-mono text-sm text-slate-400 mb-4 leading-relaxed">
              {api.desc}
            </p>

            {/* Meta strip — By {provider} · Website · Docs */}
            <div className="flex items-center gap-4 flex-wrap text-[11px]">
              <span className="font-mono text-slate-600 inline-flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                By <Link href={`/providers/${providerSlug(api.provider)}`} className="text-slate-400 hover:text-[#4FC3F7] transition-colors">{api.provider}</Link>
              </span>
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-slate-500 hover:text-[#4FC3F7] transition-colors inline-flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9v18m9-9H3"/></svg>
                  Website
                </a>
              )}
              {docsUrl && (
                <a href={docsUrl} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-slate-500 hover:text-[#4FC3F7] transition-colors inline-flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                  Docs
                </a>
              )}
              {api.verified && (
                <span className="font-mono text-[#34D399] inline-flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                  Verified
                </span>
              )}
              {api.aiReady && (
                <span className="font-mono text-[#A78BFA]">🤖 AI Ready</span>
              )}
            </div>
          </div>
        </div>

        {/* Right column — Try it now CTA + API calls counter */}
        <div className="shrink-0 flex flex-col items-stretch lg:items-end gap-3 lg:w-[260px]">
          <div className="text-left lg:text-right">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest">API CALLS</p>
            <p className="font-mono text-4xl font-black text-white tabular-nums leading-none mt-1">
              {api.calls > 0 ? api.calls.toLocaleString() : "—"}
            </p>
          </div>
          <a href="#try-it"
             className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#29ABE2] text-[#050508] hover:scale-[1.02] transition-transform text-center inline-flex items-center justify-center gap-2">
            <span>▶</span> Try it now
          </a>
          <p className="font-mono text-[10px] text-slate-700 text-left lg:text-right">
            Live playground · or pay per call via <Link href="/x402" className="text-[#4FC3F7] hover:underline">x402</Link>
          </p>
        </div>
      </div>

      {/* ── ABOUT ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 mb-8">
        <h2 className="font-mono text-base font-bold text-white mb-4">About</h2>
        <div className="font-mono text-[13px] text-slate-400 leading-relaxed mb-5 whitespace-pre-wrap">
          {longDesc}
        </div>
        {tags.length > 0 && (
          <>
            <div className="border-t border-[#1A1A2E] mb-4" />
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t}
                  className="font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded border border-[#1A1A2E] text-slate-500 bg-[#0a0a0f]">
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── PRICING TIERS ──────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="font-mono text-base font-bold text-white mb-4">Pricing</h2>
        <div className={`grid gap-3 ${pricingTiers.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
          {pricingTiers.map(t => {
            const isFree = t.flavor === "free";
            const accent = isFree ? "#A78BFA" : "#34D399";
            return (
              <div key={t.name}
                className="rounded-2xl border bg-[#0d0d12] p-5"
                style={{ borderColor: `${accent}30` }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-sm font-bold text-white">{t.name}</p>
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded border tracking-widest"
                        style={{ borderColor: `${accent}40`, color: accent, background: `${accent}10` }}>
                    X402
                  </span>
                </div>
                <p className="font-mono text-[11px] text-slate-500 mb-4 leading-relaxed min-h-[44px]">{t.desc}</p>
                <p className="mb-3">
                  <span className="font-mono text-4xl font-black text-white tabular-nums">{t.price}</span>
                  <span className="font-mono text-sm text-slate-600 ml-1">/ call</span>
                </p>
                <div className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded border border-[#1A1A2E] bg-[#0a0a0f] text-slate-400">
                  <span style={{ color: accent }}>◆</span>
                  USDC · BASE
                </div>
                <p className="font-mono text-[10px] text-slate-700 mt-2">
                  Pay from any EVM wallet — no account needed
                </p>
                <div className="mt-4 pt-3 border-t border-[#1A1A2E]">
                  <p className="font-mono text-[9px] tracking-widest text-slate-600 mb-1">ENDPOINT</p>
                  <code className="font-mono text-[10px] text-slate-400 break-all">{api.endpoint}</code>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ENDPOINTS LIST (only when populated) ──────────── */}
      {api.endpoints && api.endpoints.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-base font-bold text-white inline-flex items-center gap-2">
              Endpoints
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A2E] text-slate-500">
                {api.endpoints.length}
              </span>
            </h2>
          </div>
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E]">
            {api.endpoints.map((e, i) => <EndpointRow key={i} ep={e} />)}
          </div>
        </section>
      )}

      {/* ── STATS ROW ──────────────────────────────────────── */}
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

      {/* ── TRY IT WIDGET ──────────────────────────────────── */}
      <section id="try-it" className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-base font-bold text-white">▶ Try it · preview mode</h2>
          <span className="font-mono text-[9px] text-slate-700">Sample response · no payment · no wallet</span>
        </div>
        <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/[0.04] overflow-hidden">
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

      {/* ── CODE SAMPLES ───────────────────────────────────── */}
      <section id="code" className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-mono text-base font-bold text-white">Code samples</h2>
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

      {/* ── RELATED ────────────────────────────────────────── */}
      {related.length > 0 && (
        <section>
          <h2 className="font-mono text-base font-bold text-white mb-3">Related APIs · same category</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {related.map(r => (
              <Link key={r.id} href={`/marketplace/${r.id}`}
                className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
                <div className="flex items-center gap-2 mb-2">
                  <ProviderLogo provider={r.provider} size={24} />
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

// ─── Endpoint row (Orbis-style collapsible) ──────────────────────────────────

interface EndpointRowProps {
  ep: { method: "GET" | "POST"; path: string; desc: string; price: string; free?: boolean };
}

function EndpointRow({ ep }: EndpointRowProps) {
  const [open, setOpen] = useState(false);
  const methodColor = ep.method === "GET" ? "#34D399" : "#4FC3F7";
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left">
        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded shrink-0 w-12 text-center"
              style={{ background: `${methodColor}15`, color: methodColor }}>
          {ep.method}
        </span>
        <code className="font-mono text-xs text-slate-300 shrink-0">{ep.path}</code>
        <span className="font-mono text-[11px] text-slate-500 truncate flex-1">{ep.desc}</span>
        <span className="font-mono text-[10px] font-bold shrink-0"
              style={{ color: ep.free ? "#A78BFA" : "#34D399" }}>
          {ep.price}<span className="text-slate-700 font-normal">/call</span>
        </span>
        <span className={`text-slate-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-[#0a0a0f] border-t border-[#1A1A2E]">
          <p className="font-mono text-[11px] text-slate-400 leading-relaxed">{ep.desc}</p>
        </div>
      )}
    </div>
  );
}
