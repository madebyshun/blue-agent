"use client";

/**
 * Submit API form — api.blueagent.dev registration.
 *
 * Real SIWE flow: connect wallet → fill manifest → sign the canonical message
 * (must match siweMessage() in @/lib/registry) → POST /api/register-api, which
 * verifies the signature server-side before persisting.
 */

import { useState } from "react";
import { useAccount, useSignMessage, useConnect, useDisconnect } from "wagmi";

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;

const CATEGORIES = ["Multi-Agent", "Intelligence", "Builder", "Trading", "Security", "On-chain", "Content", "Other"];

// Must match siweMessage() in @/lib/registry EXACTLY (client signs, server verifies).
function buildSiweMessage(
  spec: { id: string; name: string; endpoint: string; priceUSDC: number; builderAddress: string },
  nonce: string,
): string {
  return [
    `Blue Hub API Registration`,
    ``,
    `Wallet:    ${spec.builderAddress.toLowerCase()}`,
    `API ID:    ${spec.id}`,
    `Name:      ${spec.name}`,
    `Endpoint:  ${spec.endpoint}`,
    `Price:     ${spec.priceUSDC} USDC units (6 decimals)`,
    `Nonce:     ${nonce}`,
    ``,
    `By signing I confirm I control this wallet and agree to the Blue Hub`,
    `builder terms: 80/20 revenue split with the treasury, USDC settlement on Base.`,
  ].join("\n");
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Step = "form" | "signing" | "submitting" | "done" | "error";

export default function SubmitForm() {
  const { address, isConnected }      = useAccount();
  const { signMessageAsync }          = useSignMessage();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect }                = useDisconnect();

  const [slug, setSlug]               = useState("");
  const [name, setName]               = useState("");
  const [provider, setProvider]       = useState("");
  const [desc, setDesc]               = useState("");
  const [category, setCategory]       = useState(CATEGORIES[0]);
  const [endpoint, setEndpoint]       = useState("https://");
  const [priceUsd, setPriceUsd]       = useState("0.20");
  const [step, setStep]               = useState<Step>("form");
  const [error, setError]             = useState<string | null>(null);
  const [probe, setProbe]             = useState<{ ok: boolean; status: number; hint?: string } | null>(null);
  const [probing, setProbing]         = useState(false);

  const slugOk     = SLUG_RE.test(slug);
  const endpointOk = /^https:\/\/.+/.test(endpoint);
  const priceUSDC  = Math.round((parseFloat(priceUsd) || 0) * 1_000_000);
  const formOk     = slugOk && name.trim() && provider.trim() && desc.trim()
                   && endpointOk && priceUSDC >= 0 && isConnected && !!address;

  async function testEndpoint() {
    if (!endpointOk) return;
    setProbing(true);
    setProbe(null);
    try {
      const t0 = Date.now();
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
        signal:  AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      const ok = (res.status >= 200 && res.status < 300) || res.status === 402;
      setProbe({ ok, status: res.status, hint: ok ? `${res.status} · ${ms}ms` : `Got ${res.status} — expected 2xx or 402.` });
    } catch (e) {
      setProbe({ ok: false, status: 0, hint: `Unreachable: ${(e as Error).message}` });
    } finally {
      setProbing(false);
    }
  }

  async function handleSubmit() {
    if (!formOk || !address) return;
    setError(null);
    setStep("signing");

    const nonce   = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const message = buildSiweMessage({ id: slug, name, endpoint, priceUSDC, builderAddress: address }, nonce);

    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message });
    } catch (e) {
      setError(`Signature rejected: ${(e as Error).message}`);
      setStep("error");
      return;
    }

    setStep("submitting");
    try {
      const res = await fetch("/api/register-api", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:             slug,
          name,
          provider,
          description:    desc,
          category,
          endpoint,
          inputs:         [],
          priceUSDC,
          builderAddress: address,
          agentName:      provider,
          signature,
          nonce,
        }),
      });
      const data = await res.json() as { ok?: boolean; api?: { id: string }; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-[#34D399]/30 bg-[#34D399]/5 p-8 text-center">
        <div className="text-3xl mb-3">✅</div>
        <h2 className="font-mono text-lg font-bold mb-2">API registered</h2>
        <p className="font-mono text-[12px] text-slate-400 mb-6">
          <code className="text-[#34D399]">{slug}</code> has been added to Blue Hub — signature verified.
          Your listing is live in the catalog; the ✓ Verified badge appears after manual review.
        </p>
        <button onClick={() => { setStep("form"); setError(null); setSlug(""); setName(""); setProvider(""); setDesc(""); setEndpoint("https://"); }}
          className="font-mono text-xs font-semibold px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all">
          Register another →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 space-y-5">

      {/* Wallet connect */}
      <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
        <label className="block font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-2">Revenue wallet · sign-in</label>
        {isConnected && address ? (
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-[#34D399]">✓ {shortAddr(address)}</span>
            <button onClick={() => disconnect()}
              className="font-mono text-[10px] text-slate-500 hover:text-red-400 transition-colors">Disconnect</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <button key={c.uid} onClick={() => connect({ connector: c })} disabled={connecting}
                className="font-mono text-xs font-semibold px-3 py-2 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 disabled:opacity-40 transition-all">
                {connecting ? "Connecting…" : `Connect ${c.name}`}
              </button>
            ))}
          </div>
        )}
        <p className="font-mono text-[10px] text-slate-700 mt-2">Where 80% USDC goes. You sign one message — no transaction, no gas.</p>
      </div>

      <Field label="Slug (URL id)" hint="lowercase, digits, hyphens · 3-41 chars · e.g. weather-on-base">
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())}
          placeholder="weather-on-base" className={cls(!slug || slugOk)} />
        {slug && !slugOk && <p className="font-mono text-[10px] text-red-400 mt-1">Invalid slug — see hint.</p>}
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Display name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Weather on Base" maxLength={80} className={cls(true)} />
        </Field>
        <Field label="Provider name" hint="Your agent or builder handle">
          <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="WeatherCorp" maxLength={40} className={cls(true)} />
        </Field>
      </div>

      <Field label="Description" hint="One line · max 280 chars">
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Real-time weather for any city, returns JSON, MCP-compatible."
          rows={2} maxLength={280} className={cls(true)} />
      </Field>

      <Field label="Category">
        <select value={category} onChange={e => setCategory(e.target.value)} className={cls(true)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="HTTPS endpoint" hint="Your POST URL — must return 2xx or 402 for empty body">
        <div className="flex gap-2">
          <input value={endpoint} onChange={e => setEndpoint(e.target.value)}
            placeholder="https://your-service.com/api/weather"
            className={cls(!endpoint || endpointOk) + " flex-1"} />
          <button type="button" onClick={testEndpoint} disabled={!endpointOk || probing}
            className="font-mono text-xs px-3 py-2 rounded-lg border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/5 hover:bg-[#4FC3F7]/10 disabled:opacity-30 transition-all shrink-0">
            {probing ? "Testing…" : "Test"}
          </button>
        </div>
        {probe && (
          <p className={`font-mono text-[10px] mt-2 ${probe.ok ? "text-[#34D399]" : "text-red-400"}`}>
            {probe.ok ? "✓" : "✗"} {probe.hint}
          </p>
        )}
      </Field>

      <Field label="Price per call (USD)" hint="0 = free · settled in USDC on Base">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">$</span>
          <input type="number" step="0.01" min="0" max="100" value={priceUsd} onChange={e => setPriceUsd(e.target.value)}
            className={cls(true) + " w-32"} />
          <span className="font-mono text-[10px] text-slate-700">= {priceUSDC} units</span>
        </div>
      </Field>

      {/* Submit */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-[#1A1A2E]">
        <button onClick={handleSubmit} disabled={!formOk || step === "signing" || step === "submitting"}
          className="font-mono text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors disabled:opacity-40">
          {step === "signing" ? "✍ Signing…" : step === "submitting" ? "Submitting…" : "Sign & submit →"}
        </button>
        <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
          {isConnected ? "One signed message · no transaction, no gas · 80/20 split confirmed in signature" : "Connect a wallet to sign your manifest"}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="font-mono text-[11px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

function cls(valid: boolean): string {
  return `bg-[#050508] border ${valid ? "border-[#1A1A2E]" : "border-red-500/40"} rounded-lg px-3 py-2 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors w-full`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-1.5">{label}</label>
      {children}
      {hint && <p className="font-mono text-[10px] text-slate-700 mt-1">{hint}</p>}
    </div>
  );
}
