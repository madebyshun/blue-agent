"use client";

/**
 * Action history (G3, 2026-09-30) — the wallet's own swap / send / bridge
 * records (lib/actions.ts), read through GET /api/actions with the SIWE
 * session. Shown in Wallet → Activity and on /app/usage.
 *
 * Private by construction: without a session for THIS wallet nothing is read,
 * and the one signature (no transaction) is offered instead. A read that fails
 * says so — "could not read" is never drawn as "no actions".
 *
 * A row states what the record holds and nothing it infers:
 *   • the kind, and the chain it ran on, named with its id — Base 8453 and
 *     Robinhood 4663 share no state, so a row without its chain is ambiguous;
 *   • the tokens as the card showed them, with the contract beside any symbol
 *     (a symbol is a label a contract picks for itself);
 *   • the pre-trade check as it stood when the trade was prepared;
 *   • the status the CHAIN proved — `confirmed` / `reverted` come from a
 *     receipt, `submitted` is a hash not yet mined, `prepared` has no tx.
 * The tx link goes to the explorer of the record's own chain.
 */
import { useCallback, useEffect, useState } from "react";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { actionSummary } from "@/lib/action-summary";
import { sessionFetch } from "@/lib/session-client";

export type ActionRow = {
  id: string;
  kind: "swap" | "send" | "bridge";
  chain: "base" | "robinhood";
  source: "chat" | "wallet" | "hood" | "mcp";
  created_at: number;
  status: "prepared" | "submitted" | "confirmed" | "reverted";
  params: Record<string, string | number | null>;
  check?: { verdict: string; reasons: string[] } | null;
  tx_hash?: string;
};

type Load =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "signed-out" }
  | { s: "error"; message: string }
  | { s: "ok"; rows: ActionRow[] };

const STATUS: Record<ActionRow["status"], { text: string; color: string; title: string }> = {
  confirmed: { text: "CONFIRMED", color: "#34D399", title: "Mined and proven sent by this wallet (receipt read on-chain)." },
  reverted: { text: "REVERTED", color: "#F87171", title: "Mined, and the chain reverted it." },
  submitted: { text: "PENDING", color: "#FBBF24", title: "A hash was broadcast; no receipt yet." },
  prepared: { text: "NOT SIGNED", color: "#64748B", title: "Prepared, but no transaction was attached." },
};
const VERDICT_COLOR: Record<string, string> = { PASS: "#64748B", WARN: "#FBBF24", BLOCK: "#F87171" };

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function useActionHistory(address: string | undefined, limit = 50) {
  const { hasSession, ensureSession } = useEnsureSession();
  const [load, setLoad] = useState<Load>({ s: "idle" });

  const read = useCallback(async () => {
    if (!address) { setLoad({ s: "idle" }); return; }
    setLoad({ s: "loading" });
    try {
      if (!(await hasSession(address))) { setLoad({ s: "signed-out" }); return; }
      const r = await sessionFetch(`/api/actions?limit=${limit}`, { cache: "no-store" });
      if (r.status === 401) { setLoad({ s: "signed-out" }); return; }
      const j = (await r.json().catch(() => null)) as { ok?: boolean; actions?: ActionRow[]; error?: string } | null;
      if (!r.ok || !j?.ok || !Array.isArray(j.actions)) {
        setLoad({ s: "error", message: j?.error ?? `Could not read your actions (HTTP ${r.status}).` });
        return;
      }
      setLoad({ s: "ok", rows: j.actions });
    } catch {
      setLoad({ s: "error", message: "Could not read your actions — network error." });
    }
  }, [address, hasSession, limit]);

  useEffect(() => { void read(); }, [read]);

  const signIn = useCallback(() => {
    if (!address) return;
    void ensureSession(address).then(read).catch(() => {});
  }, [address, ensureSession, read]);

  return { load, reload: read, signIn };
}

export default function ActionHistory({ address, limit = 50, title = "Actions" }: {
  address: string | undefined;
  limit?: number;
  title?: string;
}) {
  const { load, reload, signIn } = useActionHistory(address, limit);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B] uppercase">{title}</span>
        <span className="font-mono text-[10px] text-[#64748B]">swap · send · bridge · newest first</span>
      </div>
      <div className="mt-[11px]">
        {load.s === "idle" || load.s === "loading" ? (
          <p className="font-mono text-[11px] text-[#64748B] px-4 py-6 text-center">Loading…</p>
        ) : load.s === "signed-out" ? (
          <p className="font-mono text-[11px] text-[#64748B] px-4 py-6 text-center">
            Your actions are private to the wallet.{" "}
            <button onClick={signIn} className="underline text-[#4FC3F7]">Sign in to see them</button>
            {" "}— one signature, no transaction.
          </p>
        ) : load.s === "error" ? (
          <p className="font-mono text-[11px] text-[#F87171] px-4 py-6 text-center">
            {load.message}{" "}
            <button onClick={() => { void reload(); }} className="underline">Retry</button>
          </p>
        ) : load.rows.length === 0 ? (
          <p className="font-mono text-[11px] text-[#64748B] px-4 py-6 text-center">
            No actions yet. Swaps, sends and bridges you sign here show up with the check they passed.
          </p>
        ) : (
          load.rows.map((r, i) => <ActionItem key={r.id} r={r} first={i === 0} />)
        )}
      </div>
    </div>
  );
}

function ActionItem({ r, first }: { r: ActionRow; first: boolean }) {
  const st = STATUS[r.status] ?? STATUS.prepared;
  const cfg = WALLET_CHAINS[r.chain];
  const verdict = r.check?.verdict;
  return (
    <div className={`px-1 py-2.5 ${first ? "" : "border-t border-[#1A1A2E]"}`}>
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className="font-bold tracking-widest text-[#E2E8F0]">{r.kind.toUpperCase()}</span>
        <span className="text-[#64748B]">{cfg ? `${cfg.short} ${cfg.chainId}` : r.chain}</span>
        {r.source === "mcp" && <span className="text-[#A78BFA]" title="Built by an agent over MCP">agent</span>}
        <span className="ml-auto font-bold" style={{ color: st.color }} title={st.title}>{st.text}</span>
      </div>
      <div className="font-mono text-[11px] text-[#CBD5E1] mt-1 break-all">{actionSummary(r)}</div>
      <div className="flex items-center gap-2 font-mono text-[9.5px] text-[#64748B] mt-1">
        <span>{ago(r.created_at)}</span>
        {verdict && (
          <span style={{ color: VERDICT_COLOR[verdict] ?? "#64748B" }} title={(r.check?.reasons ?? []).join("\n")}>
            check {verdict}
          </span>
        )}
        {r.tx_hash && cfg && (
          <a href={`${cfg.explorer}/tx/${r.tx_hash}`} target="_blank" rel="noopener noreferrer"
            className="ml-auto underline hover:text-[#E2E8F0]">
            {cfg.explorerName} ↗
          </a>
        )}
      </div>
    </div>
  );
}
