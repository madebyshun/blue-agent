"use client";

// BlueBank — transaction history. Presentational: it renders the normalized
// wallet history fetched by BankClient from /api/wallet/transactions (Moralis),
// with four tab filters (All / Deposits / Withdrawals / Swaps), per-kind icons,
// status badges, and skeleton / empty / error states. No data fetching here so
// the parent can share the same fetch with the balance + stats cards.

import { useState } from "react";
import { shortAddr } from "@/lib/useBasename";

export type WalletTx = {
  hash: string;
  ts: number;
  category: string;
  kind: "received" | "sent" | "swap" | "contract";
  dir: "in" | "out" | "none";
  counterparty?: string;
  amount: number | null;
  asset?: string;
  status: "complete" | "pending" | "failed";
};

const TABS = [
  { id: "all", label: "All" },
  { id: "deposits", label: "Deposits" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "swaps", label: "Swaps" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ICON: Record<WalletTx["kind"], { glyph: string; fg: string; bg: string }> = {
  received: { glyph: "↓", fg: "#34D399", bg: "#34D39915" },
  sent: { glyph: "↑", fg: "#EF4444", bg: "#EF444415" },
  swap: { glyph: "⇄", fg: "#4FC3F7", bg: "#4FC3F715" },
  contract: { glyph: "⚡", fg: "#A78BFA", bg: "#A78BFA15" },
};

const STATUS: Record<WalletTx["status"], { label: string; color: string }> = {
  complete: { label: "Complete", color: "#34D399" },
  pending: { label: "Pending", color: "#F59E0B" },
  failed: { label: "Failed", color: "#EF4444" },
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function title(tx: WalletTx): string {
  const cp = tx.counterparty ? shortAddr(tx.counterparty) : "";
  if (tx.kind === "received") return `Received from ${cp}`;
  if (tx.kind === "sent") return `Sent to ${cp}`;
  if (tx.kind === "swap") return "Token swap";
  return "Contract call";
}

export default function TransactionHistory({
  transactions, loading, error, needsKey, onRetry, explorer, address,
}: {
  transactions: WalletTx[];
  loading: boolean;
  error: boolean;
  needsKey?: boolean;
  onRetry: () => void;
  explorer: string;
  address?: string;
}) {
  const [tab, setTab] = useState<TabId>("all");
  const filtered = transactions.filter((t) =>
    tab === "all" ? true
      : tab === "deposits" ? t.kind === "received"
      : tab === "withdrawals" ? t.kind === "sent"
      : t.kind === "swap",
  );

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest">TRANSACTION HISTORY</div>
        {address && (
          <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">Basescan ↗</a>
        )}
      </div>

      {/* Tab filters */}
      <div className="flex flex-wrap gap-1 mb-3">
        {TABS.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
            style={tab === tb.id
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#64748b", border: "1px solid #1A1A2E" }}>
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="py-6 text-center">
          <div className="font-mono text-[11px] text-slate-500 mb-2">Could not load history</div>
          <button onClick={onRetry} className="font-mono text-[10px] px-3 py-1.5 rounded-lg"
            style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
            Retry
          </button>
        </div>
      ) : needsKey ? (
        <p className="font-mono text-[11px] text-slate-600 py-4">
          Live history needs a Moralis key (set <span className="text-slate-400">MORALIS_API_KEY</span>).
          {address && (
            <> View on <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7]">Basescan ↗</a></>
          )}
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-600 py-4">No transactions yet</p>
      ) : (
        <div>
          {filtered.map((tx) => {
            const ic = ICON[tx.kind];
            const st = STATUS[tx.status];
            return (
              <a key={`${tx.hash}-${tx.ts}-${tx.asset ?? ""}`} href={`${explorer}/tx/${tx.hash}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between py-2.5 border-b border-[#13131f] last:border-0 hover:bg-[#0d0d12] -mx-2 px-2 rounded transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] shrink-0"
                    style={{ background: ic.bg, color: ic.fg }}>{ic.glyph}</span>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-slate-200 truncate">{title(tx)}</div>
                    <div className="font-mono text-[9px] text-slate-600 flex items-center gap-1.5">
                      <span style={{ color: st.color }}>{st.label}</span>
                      <span className="text-slate-700">·</span>
                      <span>{fmtDate(tx.ts)}</span>
                    </div>
                  </div>
                </div>
                {tx.amount != null && (
                  <div className="font-mono text-[12px] shrink-0 ml-2"
                    style={{ color: tx.dir === "in" ? "#34D399" : tx.dir === "out" ? "#e2e8f0" : "#94a3b8" }}>
                    {tx.dir === "in" ? "+" : tx.dir === "out" ? "−" : ""}
                    {tx.amount.toLocaleString("en-US", { maximumFractionDigits: tx.asset === "ETH" ? 5 : 2 })} {tx.asset ?? ""}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#13131f] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-32 rounded bg-[#13131f] animate-pulse" />
            <div className="h-2 w-20 rounded bg-[#13131f] animate-pulse" />
          </div>
          <div className="h-2.5 w-14 rounded bg-[#13131f] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
