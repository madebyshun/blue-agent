"use client";
/**
 * ApprovalsPanel — the grants a wallet still has open, and a Revoke button per
 * grant that the OWNER signs in their own wallet (lib/approval-audit.ts, plan
 * 2026-10-06 task 1.3). Renders an audit it is handed (the chat tool result)
 * and re-reads it fresh after a revoke through the free catalog route.
 *
 * Non-custodial: the server only encoded `revoke.data`. Revoke is enabled only
 * when the connected wallet IS the audited wallet — anyone can read a wallet's
 * approvals, only its owner can change them.
 */
import { useEffect, useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";

type Level = "BLOCK" | "WARN" | "INFO";
export interface GrantView {
  type: "erc20" | "nft_operator" | "permit2";
  asset: string;
  symbol: string;
  spender: string;
  allowance: string;
  exposed: string | null;
  expires: string | null;
  spender_is_contract: boolean | null;
  level: Level;
  why: string;
  revoke: { chain_id: number; to: string; data: string; value: "0" };
}
export interface AuditView {
  wallet: string;
  chain: "base" | "robinhood";
  chain_id: number;
  grants: GrantView[];
  counts: { live: number; block: number; warn: number; info: number; closed_since: number };
  unread: string[];
  note: string | null;
  error?: string;
}

const COLOR: Record<Level, string> = { BLOCK: "#EF4444", WARN: "#F59E0B", INFO: "#94a3b8" };
const EXPLORER: Record<number, string> = { 8453: "https://basescan.org", 4663: "https://robinhoodchain.blockscout.com" };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const TYPE_LABEL: Record<GrantView["type"], string> = { erc20: "Allowance", nft_operator: "NFT operator", permit2: "Permit2" };

export function ApprovalsPanel({ audit: initial }: { audit: AuditView }) {
  const [audit, setAudit] = useState(initial);
  const [busy, setBusy] = useState<string>("");
  const [done, setDone] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const owner = !!address && address.toLowerCase() === audit.wallet.toLowerCase();
  const explorer = EXPLORER[audit.chain_id] ?? "";

  async function refresh() {
    setBusy("refresh"); setErr("");
    try {
      const r = await fetch("/api/x402/approval-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: audit.wallet, chain: audit.chain, fresh: true }),
      });
      const j = (await r.json()) as AuditView;
      if (!r.ok) setErr(j.error ?? `Could not re-read (HTTP ${r.status}).`);
      else setAudit(j);
    } catch (e) { setErr((e as Error).message.slice(0, 140)); }
    setBusy("");
  }

  async function revoke(g: GrantView) {
    const id = `${g.type}|${g.asset}|${g.spender}`;
    setBusy(id); setErr("");
    try {
      await switchChainAsync({ chainId: g.revoke.chain_id });
      const hash = await sendTransactionAsync({ to: g.revoke.to as `0x${string}`, data: g.revoke.data as `0x${string}`, value: 0n, chainId: g.revoke.chain_id });
      setDone((d) => ({ ...d, [id]: hash }));
    } catch (e) { setErr(((e as Error).message || String(e)).slice(0, 160)); }
    setBusy("");
  }

  const chainName = audit.chain === "robinhood" ? "Robinhood Chain 4663" : "Base 8453";
  return (
    <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#4FC3F730", background: "#4FC3F706" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[11px] font-bold text-slate-200">Open approvals · {chainName}</div>
        <button onClick={refresh} disabled={!!busy} className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#4FC3F730] text-[#4FC3F7] disabled:opacity-50">
          {busy === "refresh" ? "Reading…" : "Re-read"}
        </button>
      </div>
      <div className="font-mono text-[10px] text-slate-400 mb-2">
        {short(audit.wallet)} · {audit.counts.live} live
        {audit.counts.block ? ` · ${audit.counts.block} to revoke now` : ""}
        {audit.counts.warn ? ` · ${audit.counts.warn} to review` : ""}
        {audit.counts.closed_since ? ` · ${audit.counts.closed_since} already closed` : ""}
      </div>
      {audit.unread.length > 0 && (
        <div className="font-mono text-[10px] mb-2" style={{ color: "#F59E0B" }}>
          Incomplete — not read: {audit.unread.join("; ")}. Missing rows here are unknown, not clean.
        </div>
      )}
      {audit.grants.length === 0 && audit.unread.length === 0 && (
        <div className="font-mono text-[10px] text-slate-400">No open approvals were found on {chainName}.</div>
      )}
      <ul className="space-y-1.5">
        {audit.grants.map((g) => {
          const id = `${g.type}|${g.asset}|${g.spender}`;
          const hash = done[id];
          return (
            <li key={id} className="rounded-lg border px-2.5 py-2" style={{ borderColor: `${COLOR[g.level]}40` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-bold" style={{ color: COLOR[g.level] }}>
                    {g.level} · {TYPE_LABEL[g.type]} · {g.symbol}
                  </div>
                  <div className="font-mono text-[10px] text-slate-300 break-all">
                    {g.allowance}{g.exposed && g.allowance !== g.exposed ? ` (exposed now: ${g.exposed})` : ""} → {short(g.spender)}
                    {g.spender_is_contract === false ? " (plain wallet)" : ""}{g.expires ? ` · until ${g.expires}` : ""}
                  </div>
                  <div className="text-[9px] leading-relaxed text-slate-400">{g.why}</div>
                </div>
                {hash ? (
                  <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-[10px] px-2 py-1 rounded border border-[#22C55E40] text-[#22C55E]">Sent ↗</a>
                ) : (
                  <button onClick={() => revoke(g)} disabled={!owner || !!busy}
                    title={owner ? "Sign a revoke in your wallet" : "Connect the audited wallet to revoke"}
                    className="shrink-0 font-mono text-[10px] px-2 py-1 rounded border disabled:opacity-40"
                    style={{ borderColor: `${COLOR[g.level]}60`, color: COLOR[g.level] }}>
                    {busy === id ? "Signing…" : "Revoke"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {audit.note && <div className="font-mono text-[9px] text-slate-500 mt-2">{audit.note}</div>}
      {!owner && audit.grants.length > 0 && (
        <div className="font-mono text-[9px] text-slate-500 mt-2">Revoking needs the audited wallet connected — you sign each revoke yourself.</div>
      )}
      {Object.keys(done).length > 0 && <div className="font-mono text-[9px] text-slate-500 mt-1">After a revoke confirms, Re-read to see the updated list.</div>}
      {err && <div className="font-mono text-[10px] mt-2" style={{ color: "#EF4444" }}>{err}</div>}
    </div>
  );
}

/**
 * The Wallet page's "Approvals" view: reads the audit for the connected wallet
 * on the chosen chain through the free catalog route, then renders the panel.
 * Mounted only while the view is open, so it costs nothing otherwise.
 */
export function ApprovalsView({ address }: { address?: string | null }) {
  const [chain, setChain] = useState<"base" | "robinhood">("base");
  const [state, setState] = useState<{ key: string; audit: AuditView | null; error: string } | null>(null);
  const key = `${chain}|${address ?? ""}`;
  const loading = !!address && state?.key !== key;

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch("/api/x402/approval-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: address, chain }) })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as AuditView | null;
        if (live) setState({ key, audit: r.ok && j ? j : null, error: r.ok ? "" : (j?.error ?? `HTTP ${r.status}`) });
      })
      .catch((e) => { if (live) setState({ key, audit: null, error: (e as Error).message }); });
    return () => { live = false; };
  }, [address, chain, key]);

  if (!address) return <div className="font-mono text-[11px] text-slate-400 p-4">Connect a wallet to see what it has approved.</div>;
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
      <div className="flex gap-2 mb-2">
        {(["base", "robinhood"] as const).map((c) => (
          <button key={c} onClick={() => setChain(c)} className="font-mono text-[10px] px-2.5 py-1 rounded-lg border"
            style={{ borderColor: chain === c ? "#4FC3F7" : "#1A1A2E", color: chain === c ? "#4FC3F7" : "#94a3b8" }}>
            {c === "base" ? "Base 8453" : "Robinhood Chain 4663"}
          </button>
        ))}
      </div>
      {loading && <div className="font-mono text-[11px] text-slate-400">Reading approvals…</div>}
      {!loading && state?.error && <div className="font-mono text-[11px]" style={{ color: "#F59E0B" }}>Could not read approvals: {state.error}</div>}
      {!loading && state?.audit && <ApprovalsPanel key={state.key} audit={state.audit} />}
    </div>
  );
}
