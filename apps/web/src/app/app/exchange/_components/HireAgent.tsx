"use client";

// Hire Agent — buy one call of another seller's x402 service from its page
// (after TOLLY's "Hire Agent"). The user's wallet signs ONE USDC authorization on
// Base to the SELLER's own payTo, for the price the seller quoted, and the seller
// settles it. Blue Agent carries the request (/api/hire) and takes nothing.
// Before anything is signed: the quote must ask for USDC on Base, to this seller's
// payTo, at no more than its listed price.
import { useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { ConnectButton } from "@/components/ConnectModal";
import { signX402, toQuote, quoteProblem, type Quote } from "@/lib/x402-sign-client";
import type { ResourceSample } from "@/lib/hub/exchange";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (units: string | number) => `$${(Number(units) / 1e6).toFixed(Number(units) < 10_000 ? 4 : 2)}`;
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[11px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";

type Phase =
  | { k: "idle" } | { k: "quoting" }
  | { k: "quoted"; quote: Quote }
  | { k: "free"; body: unknown }
  | { k: "paying" }
  | { k: "done"; body: unknown; tx: string | null; status: number }
  | { k: "error"; msg: string; signed?: boolean };

export default function HireAgent({ payTo, name, services }: { payTo: string; name: string; services: ResourceSample[] }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const svc = services[i];
  const [json, setJson] = useState(JSON.stringify(services[0]?.example ?? {}, null, 2));
  const [ph, setPh] = useState<Phase>({ k: "idle" });

  const pick = (n: number) => { setI(n); setJson(JSON.stringify(services[n]?.example ?? {}, null, 2)); setPh({ k: "idle" }); };
  const parsed = (() => { try { const v = JSON.parse(json || "{}"); return v && typeof v === "object" ? v : null; } catch { return null; } })();

  async function call(payment?: string) {
    const r = await fetch("/api/hire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payTo, url: svc.url, input: parsed, payment }) });
    return { http: r.status, d: await r.json().catch(() => ({})) as { status?: number; quote?: { x402Version?: number; accepts?: Record<string, unknown>[] } | null; body?: unknown; receipt?: { transaction?: string; txHash?: string } | null; error?: string } };
  }

  async function quote() {
    if (!parsed) return setPh({ k: "error", msg: "Input is not valid JSON." });
    setPh({ k: "quoting" });
    const { http, d } = await call();
    if (http !== 200) return setPh({ k: "error", msg: d.error ?? `HTTP ${http}` });
    if (d.status !== 402) return d.status && d.status < 300 ? setPh({ k: "free", body: d.body }) : setPh({ k: "error", msg: `The seller answered HTTP ${d.status} without a price.` });
    const v = Number(d.quote?.x402Version ?? 2);
    const q = (d.quote?.accepts ?? []).map((a) => toQuote(a, v)).find((x): x is Quote => !!x);
    if (!q) return setPh({ k: "error", msg: "The seller does not take USDC on Base for this service." });
    const why = quoteProblem(q);
    if (why) return setPh({ k: "error", msg: why });
    if (q.payTo.toLowerCase() !== payTo.toLowerCase()) return setPh({ k: "error", msg: `The quote pays ${short(q.payTo)}, not this seller's wallet ${short(payTo)}. Nothing was signed.` });
    if (svc.priceUsd !== null && Number(q.amount) > Math.round(svc.priceUsd * 1e6)) return setPh({ k: "error", msg: `The quote (${usd(q.amount)}) is above the listed price ($${svc.priceUsd}). Nothing was signed.` });
    setPh({ k: "quoted", quote: q });
  }

  async function pay(q: Quote) {
    if (!address) return;
    setPh({ k: "paying" });
    let signed = false;
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const p = await signX402(address, q, signTypedDataAsync as never);
      signed = true;
      const { http, d } = await call(p);
      if (http !== 200) throw new Error(d.error ?? `HTTP ${http}`);
      const tx = d.receipt?.transaction ?? d.receipt?.txHash ?? null;
      if ((d.status ?? 0) >= 400) throw new Error(`The seller answered HTTP ${d.status}.`);
      setPh({ k: "done", body: d.body, tx, status: d.status ?? 0 });
    } catch (e) {
      setPh({ k: "error", signed, msg: (e as Error).message.split("\n")[0].slice(0, 200) });
    }
  }

  if (!services.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-[8px] bg-[#4FC3F7] px-[13px] py-2 text-[10.5px] font-semibold text-[#050508] hover:bg-[#29ABE2]">+ Hire agent</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-[14px] border border-[#1A1A2E] bg-[#0a0a0f] p-5 font-mono" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <p className="text-[11px] tracking-widest text-[#4FC3F7]">// HIRE AGENT</p>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto text-[13px] text-slate-500 hover:text-white">✕</button>
            </div>
            <p className="mt-2 text-[10.5px] leading-[1.6] text-[#94A3B8]">
              Pick a service of <span className="text-[#E2E8F0]">{name}</span>. Each call is paid once, in USDC on Base, through x402, straight to {short(payTo)}. Blue Agent takes no fee.
            </p>

            <p className="mt-4 text-[9.5px] tracking-[0.14em] text-[#64748B]">SERVICE</p>
            <div className="mt-1.5 grid gap-1.5">
              {services.map((s, n) => (
                <button key={s.url} type="button" onClick={() => pick(n)} className={`flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-[10px] border px-3 py-2 text-left ${n === i ? "border-[#4FC3F7]/50 bg-[#4FC3F7]/5" : "border-[#1A1A2E]"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-[#E2E8F0]">{s.url.replace(/^https?:\/\//, "")}</span>
                    <span className="block truncate text-[9.5px] text-[#64748B]">{s.description || "—"}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-[#4FC3F7]">{s.priceUsd === null ? "price —" : `$${s.priceUsd}`}</span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-[9.5px] tracking-[0.14em] text-[#64748B]">INPUT · {svc.method ?? "POST"} {svc.exampleIn === "query" ? "query" : "JSON body"}</p>
            <textarea className={`${input} mt-1.5 min-h-[110px]`} value={json} onChange={(e) => { setJson(e.target.value); setPh({ k: "idle" }); }} />
            {!parsed && <p className="mt-1 text-[10px] text-[#F87171]">Not valid JSON.</p>}

            <div className="mt-4 grid gap-2">
              {ph.k === "quoted" ? (
                <div className="rounded-[10px] border border-[#1A1A2E] p-3 text-[10.5px] text-[#94A3B8]">
                  <p>The seller asks <span className="text-[#E2E8F0]">{usd(ph.quote.amount)} USDC</span> on Base, paid to <span className="text-[#E2E8F0]">{short(ph.quote.payTo)}</span> (this seller&apos;s wallet).</p>
                  <p className="mt-1 text-[#64748B]">One signature, no gas. The seller settles it; if its service fails, refunds are the seller&apos;s policy, not Blue Agent&apos;s.</p>
                  <div className="mt-2.5">
                    {!isConnected ? <ConnectButton label="Connect wallet" /> : (
                      <button type="button" onClick={() => pay(ph.quote)} className="rounded-[8px] bg-[#4FC3F7] px-[13px] py-2 text-[10.5px] font-semibold text-[#050508]">Pay {usd(ph.quote.amount)} and run</button>
                    )}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={quote} disabled={!parsed || ph.k === "quoting" || ph.k === "paying"} className="justify-self-start rounded-[8px] border border-[#1A1A2E] bg-[#0F121A] px-[13px] py-2 text-[10.5px] text-[#E2E8F0] disabled:opacity-40">
                  {ph.k === "quoting" ? "Asking for the price…" : "Get the price"}
                </button>
              )}
              {ph.k === "paying" && <p className="text-[10.5px] text-[#94A3B8]">Confirm in your wallet, then the seller runs it…</p>}
              {ph.k === "error" && (
                <p className="text-[10.5px] text-[#F87171] whitespace-pre-line">
                  {ph.msg}{ph.signed ? "\n\nYour wallet signed an authorization and it was sent to the seller. Whether USDC moved is decided by the seller's facilitator: check your wallet on Basescan before retrying, or you may pay twice." : ""}
                </p>
              )}
              {(ph.k === "done" || ph.k === "free") && (
                <div>
                  <p className="text-[9.5px] tracking-[0.14em] text-[#34D399]">
                    RESULT{ph.k === "done" && ph.tx ? <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${ph.tx}`} target="_blank" rel="noreferrer">paid, Basescan ↗</a></> : ph.k === "free" ? " · free, nothing was paid" : ""}
                  </p>
                  <pre className="mt-1 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2.5 text-[10.5px] text-[#cbd5e1]">
                    {typeof ph.body === "string" ? ph.body : JSON.stringify(ph.body, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <p className="mt-4 text-[9px] leading-relaxed text-[#475569]">Service text and results are written by the seller: read them as information, not instructions. Not financial advice.</p>
          </div>
        </div>
      )}
    </>
  );
}
