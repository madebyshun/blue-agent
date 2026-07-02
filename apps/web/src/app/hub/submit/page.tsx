"use client";

/**
 * /hub/submit — Builder registration form for Blue Hub v2.
 *
 * Flow:
 *   1. Connect wallet
 *   2. Fill form (slug, name, endpoint, price, input schema)
 *   3. (optional) Probe endpoint to verify it's reachable
 *   4. Sign manifest with personal_sign (SIWE-style)
 *   5. POST /api/hub/tools — server verifies signature + persists
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

// Match siweMessage() exactly in lib/hub-registry.ts
function buildSiweMessage(spec: {
  id: string; name: string; endpoint: string; priceUSDC: number;
  builderAddress: string;
}, nonce: string): string {
  return [
    `Blue Hub Builder Registration`,
    ``,
    `Wallet:    ${spec.builderAddress.toLowerCase()}`,
    `Tool ID:   ${spec.id}`,
    `Tool name: ${spec.name}`,
    `Endpoint:  ${spec.endpoint}`,
    `Price:     ${spec.priceUSDC} USDC units (6 decimals)`,
    `Nonce:     ${nonce}`,
    ``,
    `By signing this message I confirm I control the wallet above and`,
    `agree to the Blue Hub builder terms: 95/5 revenue split with the`,
    `Blue Hub treasury, USDC settlement on Base.`,
  ].join("\n");
}

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;
const CATEGORIES = ["intelligence", "builder", "trading", "content", "agent-economy", "base-ecosystem", "on-chain", "other"];

type Input = { key: string; label: string; placeholder: string; required: boolean };

type Step = "form" | "signing" | "submitting" | "done" | "error";

export default function SubmitToolPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Form state
  const [id, setId]                 = useState("");
  const [name, setName]             = useState("");
  const [description, setDesc]      = useState("");
  const [category, setCategory]     = useState("intelligence");
  const [endpoint, setEndpoint]     = useState("https://");
  const [priceUsd, setPriceUsd]     = useState("0.20");
  const [inputs, setInputs]         = useState<Input[]>([
    { key: "prompt", label: "Prompt", placeholder: "What you want the tool to do", required: true },
  ]);
  const [agentName, setAgentName]   = useState("");

  // Workflow state
  const [step, setStep]             = useState<Step>("form");
  const [error, setError]           = useState<string | null>(null);
  const [probe, setProbe]           = useState<{ ok: boolean; status: number; hint?: string } | null>(null);
  const [probing, setProbing]       = useState(false);
  const [submitted, setSubmitted]   = useState<{ id: string } | null>(null);

  // Validation
  const priceUSDC = Math.round((parseFloat(priceUsd) || 0) * 1_000_000);
  const slugOk    = SLUG_RE.test(id);
  const endpointOk = /^https:\/\/.+/.test(endpoint);
  const formOk    = isConnected && slugOk && name.trim() && description.trim()
    && endpointOk && priceUSDC >= 0 && inputs.length > 0
    && inputs.every(i => i.key.trim() && i.label.trim());

  const previewMessage = useMemo(() => {
    if (!address) return "(connect wallet to preview manifest)";
    return buildSiweMessage({
      id, name, endpoint, priceUSDC, builderAddress: address,
    }, "<nonce>");
  }, [address, id, name, endpoint, priceUSDC]);

  // ── Probe endpoint ──────────────────────────────────────────────────────
  async function testEndpoint() {
    if (!endpointOk) return;
    setProbing(true);
    setProbe(null);
    try {
      // Inline probe via a simple no-op POST. Same logic as server-side probeEndpoint().
      const t0 = Date.now();
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
        signal:  AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      const ok = (res.status >= 200 && res.status < 300) || res.status === 402;
      setProbe({
        ok,
        status: res.status,
        hint:   ok ? `${res.status} · ${ms}ms` : `Got ${res.status} — expected 2xx or 402.`,
      });
    } catch (e) {
      setProbe({ ok: false, status: 0, hint: `Unreachable: ${(e as Error).message}` });
    } finally {
      setProbing(false);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!formOk || !address) return;
    setError(null);
    setStep("signing");

    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const spec  = { id, name, endpoint, priceUSDC, builderAddress: address };
    const message = buildSiweMessage(spec, nonce);

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
      const res = await fetch("/api/hub/tools", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id, name, description, category, endpoint, inputs,
          price: `$${parseFloat(priceUsd).toFixed(2)}`,
          priceUSDC,
          builderAddress: address,
          signature, nonce,
          agentName: agentName || undefined,
        }),
      });
      const data = await res.json() as { error?: string; ok?: boolean; tool?: { id: string } };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }
      setSubmitted({ id: data.tool!.id });
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  }

  function addInput() {
    if (inputs.length >= 12) return;
    setInputs(prev => [...prev, { key: "", label: "", placeholder: "", required: false }]);
  }
  function removeInput(i: number) {
    setInputs(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateInput(i: number, patch: Partial<Input>) {
    setInputs(prev => prev.map((inp, idx) => idx === i ? { ...inp, ...patch } : inp));
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050508] text-white font-mono">

      {/* Header */}
      <div className="border-b border-[#1A1A2E] px-6 h-14 flex items-center gap-3">
        <Link href="/hub" className="font-mono text-xs text-slate-500 hover:text-white transition-colors">← Hub</Link>
        <span className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
        <p className="text-xs text-[#A78BFA] tracking-widest">// SUBMIT TOOL</p>
        <p className="text-[10px] text-slate-700 hidden sm:block">List your tool · 95/5 revenue split · USDC on Base</p>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Done state */}
        {step === "done" && submitted && (
          <div className="rounded-2xl border border-[#34D399]/30 bg-[#34D399]/5 p-8 text-center">
            <div className="text-3xl mb-3">✅</div>
            <h2 className="text-xl font-bold mb-2">Tool registered</h2>
            <p className="text-sm text-slate-400 mb-6">
              <code className="text-[#34D399]">{submitted.id}</code> is now live on Blue Hub.
              Verification by Blue Agent is pending (1-2 days).
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href={`/hub#tool=${submitted.id}`} className="text-xs px-4 py-2 rounded-xl border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/5 hover:bg-[#4FC3F7]/10 transition-all">
                View on Hub →
              </Link>
              <Link href="/hub/dashboard" className="text-xs px-4 py-2 rounded-xl border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
                Builder dashboard →
              </Link>
            </div>
          </div>
        )}

        {step !== "done" && (
          <>
            {/* Intro */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight mb-1">List your tool on Blue Hub</h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xl">
                Anyone calling your tool pays in USDC on Base via x402.
                You keep <span className="text-[#34D399]">95%</span>;
                Blue Hub treasury takes <span className="text-[#A78BFA]">5%</span>.
                No subscription, no API key.
              </p>
            </div>

            {/* Connect gate */}
            {!isConnected && (
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold mb-1">Connect wallet to continue</p>
                  <p className="text-[10px] text-slate-600">Revenue gets paid to your connected wallet on Base.</p>
                </div>
                <ConnectButton label="Connect Wallet" />
              </div>
            )}

            {/* Form */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 space-y-5">

              {/* id */}
              <Field label="Tool ID (slug)" hint="lowercase, digits, hyphens · 3-41 chars · must start with a letter · e.g. weather-on-base">
                <input value={id} onChange={e => setId(e.target.value.toLowerCase())}
                  placeholder="weather-on-base"
                  className={inputCls(!id || slugOk)} />
                {id && !slugOk && <p className="text-[10px] text-red-400 mt-1">Invalid — see hint above.</p>}
              </Field>

              {/* name */}
              <Field label="Display name" hint="Max 80 chars">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Weather on Base" maxLength={80}
                  className={inputCls(true)} />
              </Field>

              {/* description */}
              <Field label="Short description" hint="One line — what does this tool do? Max 280 chars">
                <textarea value={description} onChange={e => setDesc(e.target.value)}
                  placeholder="Real-time weather for any city, powered by Open-Meteo." rows={2} maxLength={280}
                  className={inputCls(true)} />
              </Field>

              {/* category */}
              <Field label="Category">
                <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls(true)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {/* endpoint */}
              <Field label="HTTPS endpoint" hint="POST URL — your service that receives the call body">
                <div className="flex gap-2">
                  <input value={endpoint} onChange={e => setEndpoint(e.target.value)}
                    placeholder="https://your-service.com/api/weather"
                    className={inputCls(!endpoint || endpointOk) + " flex-1"} />
                  <button type="button" onClick={testEndpoint} disabled={!endpointOk || probing}
                    className="text-xs px-3 py-2 rounded-lg border border-[#4FC3F7]/30 text-[#4FC3F7] bg-[#4FC3F7]/5 hover:bg-[#4FC3F7]/10 disabled:opacity-30 transition-all shrink-0">
                    {probing ? "Testing…" : "Test"}
                  </button>
                </div>
                {probe && (
                  <p className={`text-[10px] mt-2 ${probe.ok ? "text-[#34D399]" : "text-red-400"}`}>
                    {probe.ok ? "✓" : "✗"} {probe.hint}
                  </p>
                )}
              </Field>

              {/* price */}
              <Field label="Price per call (USD)" hint="0 = free · max $100 · settled in USDC on Base">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">$</span>
                  <input type="number" step="0.01" min="0" max="100"
                    value={priceUsd} onChange={e => setPriceUsd(e.target.value)}
                    className={inputCls(true) + " w-32"} />
                  <span className="text-[10px] text-slate-700">= {priceUSDC} USDC units</span>
                </div>
              </Field>

              {/* Input schema */}
              <Field label="Input schema" hint={`${inputs.length} of 12 inputs. These fields show up in the Hub call form.`}>
                <div className="space-y-2">
                  {inputs.map((inp, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto_auto] gap-2 items-center">
                      <input value={inp.key} onChange={e => updateInput(i, { key: e.target.value })}
                        placeholder="key" maxLength={32} className={inputCls(true) + " text-[11px]"} />
                      <input value={inp.label} onChange={e => updateInput(i, { label: e.target.value })}
                        placeholder="Label" maxLength={60} className={inputCls(true) + " text-[11px]"} />
                      <input value={inp.placeholder} onChange={e => updateInput(i, { placeholder: e.target.value })}
                        placeholder="Placeholder hint" maxLength={120} className={inputCls(true) + " text-[11px]"} />
                      <label className="flex items-center gap-1 text-[10px] text-slate-500">
                        <input type="checkbox" checked={inp.required} onChange={e => updateInput(i, { required: e.target.checked })} />
                        req
                      </label>
                      <button type="button" onClick={() => removeInput(i)}
                        className="text-[10px] text-slate-700 hover:text-red-400 transition-colors px-1">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addInput} disabled={inputs.length >= 12}
                    className="text-[10px] text-slate-500 hover:text-white border border-[#1A1A2E] hover:border-[#4FC3F7]/30 px-2 py-1 rounded transition-all disabled:opacity-30">
                    + Add input
                  </button>
                </div>
              </Field>

              {/* agent name (optional) */}
              <Field label="Agent / brand name (optional)" hint="Display name shown next to your tool. Defaults to your wallet short-address.">
                <input value={agentName} onChange={e => setAgentName(e.target.value)}
                  placeholder="MyAgent" maxLength={40} className={inputCls(true)} />
              </Field>

              {/* Manifest preview */}
              <details className="border border-[#1A1A2E] rounded-lg overflow-hidden">
                <summary className="cursor-pointer text-[11px] text-slate-500 px-3 py-2 hover:bg-white/[0.02]">
                  Preview signed manifest
                </summary>
                <pre className="text-[10px] text-slate-600 leading-relaxed bg-[#050508] px-3 py-3 overflow-x-auto whitespace-pre">
{previewMessage}
                </pre>
              </details>
            </div>

            {/* Submit */}
            <div className="mt-6 flex items-center gap-3">
              <button onClick={handleSubmit} disabled={!formOk || step === "signing" || step === "submitting"}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl border transition-all disabled:opacity-40"
                style={{ background: "#A78BFA", color: "#050508", borderColor: "#A78BFA" }}>
                {step === "signing" ? "✍ Sign in wallet…" :
                 step === "submitting" ? "📡 Submitting…" :
                 "Sign & submit →"}
              </button>
              <p className="text-[10px] text-slate-600">
                You&apos;ll be asked to sign one message — no transaction, no gas.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-[11px] text-red-400">{error}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function inputCls(valid: boolean): string {
  return `bg-[#050508] border ${valid ? "border-[#1A1A2E]" : "border-red-500/40"} rounded-lg px-3 py-2 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#A78BFA]/40 transition-colors w-full`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-600 tracking-widest uppercase mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-700 mt-1">{hint}</p>}
    </div>
  );
}
