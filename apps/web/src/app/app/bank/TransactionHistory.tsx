"use client";

import { useState } from "react";
import { useBasename, shortAddr } from "@/lib/useBasename";

const KNOWN: Record<string, string> = {
  "0xa238dd80c259a72e81d7e4664a9801593f98d1c5": "Aave v3",
  "0x4e65fe4dba92790696d040ac24aa414708f5c0ab": "Aave · aUSDC",
  "0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61": "Morpho",
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x Swap",
  "0x8bab6d1b75f19e9ed9fce8b9bd338844ff79ae27": "Aave v3",
  "0x10f1a9d11cdf50041f3f8cb7191cbe2f31750acc": "Aave · aUSDC",
};

export type WalletTx = {
  hash: string; ts: number; category: string;
  kind: "received"|"sent"|"swap"|"contract";
  dir: "in"|"out"|"none";
  counterparty?: string; amount: number|null; asset?: string;
  status: "complete"|"pending"|"failed";
};

type TxMeta = { label: string; icon: string; color: string; bg: string; dot: string };
function txMeta(tx: WalletTx): TxMeta {
  const known = tx.counterparty ? KNOWN[tx.counterparty.toLowerCase()] : undefined;
  if (known?.startsWith("Aave") || known?.startsWith("Morpho"))
    return tx.dir === "out"
      ? { label: `Deposit → ${known}`, icon: "🌾", color: "#34D399", bg: "#34D39915", dot: "#34D399" }
      : { label: `Withdraw ← ${known}`, icon: "🏦", color: "#A78BFA", bg: "#A78BFA15", dot: "#A78BFA" };
  if (known?.includes("Swap") || tx.kind === "swap")
    return { label: "Token swap", icon: "⇄", color: "#4FC3F7", bg: "#4FC3F715", dot: "#4FC3F7" };
  if (tx.kind === "received")
    return { label: "Received", icon: "↓", color: "#34D399", bg: "#34D39915", dot: "#34D399" };
  if (tx.kind === "sent")
    return { label: "Sent", icon: "↑", color: "#EF4444", bg: "#EF444415", dot: "#EF4444" };
  return { label: known ?? "Contract call", icon: "⚡", color: "#A78BFA", bg: "#A78BFA15", dot: "#A78BFA" };
}

type Filter = "All"|"Earn"|"Send"|"Receive"|"Swap";
const FILTERS: Filter[] = ["All", "Earn", "Send", "Receive", "Swap"];

function matchFilter(tx: WalletTx, f: Filter): boolean {
  if (f === "All") return true;
  const known = tx.counterparty ? KNOWN[tx.counterparty.toLowerCase()] : undefined;
  if (f === "Earn")    return !!(known?.startsWith("Aave") || known?.startsWith("Morpho"));
  if (f === "Swap")    return tx.kind === "swap" || !!known?.includes("Swap");
  if (f === "Send")    return tx.kind === "sent" && !known;
  if (f === "Receive") return tx.kind === "received";
  return true;
}

const fmtDay  = (ts: number) => new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

function groupByDay(txs: WalletTx[]): { day: string; items: WalletTx[] }[] {
  const map = new Map<string, WalletTx[]>();
  for (const tx of txs) {
    const key = new Date(tx.ts).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([, items]) => ({ day: fmtDay(items[0].ts), items }));
}

export default function TransactionHistory({
  transactions, loading, error, needsKey, onRetry, explorer, address,
}: {
  transactions: WalletTx[]; loading: boolean; error: boolean;
  needsKey?: boolean; onRetry: () => void; explorer: string; address?: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const filtered = transactions.filter(tx => matchFilter(tx, filter));
  const groups = groupByDay(filtered);

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[9px] text-slate-500 tracking-widest">ONCHAIN TIMELINE</div>
        {address && (
          <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7] transition-colors">
            Basescan ↗
          </a>
        )}
      </div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="font-mono text-[9px] px-2.5 py-1 rounded-full transition-colors"
            style={filter === f
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#475569", border: "1px solid #1A1A2E" }}>
            {f}
          </button>
        ))}
      </div>
      {loading ? <Skeleton /> : error ? (
        <div className="py-6 text-center">
          <div className="font-mono text-[11px] text-slate-500 mb-2">Could not load history</div>
          <button onClick={onRetry} className="font-mono text-[10px] px-3 py-1.5 rounded-lg"
            style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>Retry</button>
        </div>
      ) : needsKey ? (
        <p className="font-mono text-[11px] text-slate-600 py-4">
          Live history needs a Moralis key (<span className="text-slate-400">MORALIS_API_KEY</span>).
          {address && <> View on <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7]">Basescan ↗</a></>}
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-600 py-6 text-center">No {filter !== "All" ? filter.toLowerCase() + " " : ""}transactions yet</p>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.day}>
              <div className="font-mono text-[9px] text-slate-600 mb-2 pl-1">{g.day}</div>
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-[#1A1A2E]" />
                {g.items.map(tx => <TxRow key={`${tx.hash}-${tx.ts}-${tx.asset ?? ""}`} tx={tx} explorer={explorer} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TxRow({ tx, explorer }: { tx: WalletTx; explorer: string }) {
  const cp = tx.counterparty;
  const known = cp ? KNOWN[cp.toLowerCase()] : undefined;
  const wantName = (tx.kind === "received" || tx.kind === "sent") && !known && !!cp;
  const { name } = useBasename(wantName ? cp : undefined);
  const cpLabel = known ?? name ?? (cp ? shortAddr(cp) : "");
  const meta = txMeta(tx);
  const heading =
    tx.kind === "received" ? `Received from ${cpLabel}`
    : tx.kind === "sent" ? `Sent to ${cpLabel}`
    : meta.label;
  const statusColor = tx.status === "pending" ? "#F59E0B" : tx.status === "failed" ? "#EF4444" : "#475569";
  return (
    <a href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 pl-7 py-2 -ml-1 rounded-lg hover:bg-[#0d0d12] transition-colors relative">
      <span className="absolute left-[9px] w-3 h-3 rounded-full border-2 border-[#050508] top-1/2 -translate-y-1/2"
        style={{ background: meta.dot }} />
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] shrink-0"
        style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[11px] text-slate-200 truncate">{heading}</div>
        <div className="font-mono text-[9px] flex items-center gap-1.5 mt-0.5">
          <span style={{ color: statusColor }}>{tx.status !== "complete" ? tx.status : fmtTime(tx.ts)}</span>
        </div>
      </div>
      {tx.amount != null && (
        <div className="font-mono text-[11px] shrink-0"
          style={{ color: tx.dir === "in" ? "#34D399" : tx.dir === "out" ? "#94a3b8" : "#64748b" }}>
          {tx.dir === "in" ? "+" : tx.dir === "out" ? "−" : ""}
          {tx.amount.toLocaleString("en-US", { maximumFractionDigits: tx.asset === "ETH" ? 5 : 2 })} {tx.asset ?? ""}
        </div>
      )}
    </a>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 pl-7">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-[#13131f] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-36 rounded bg-[#13131f] animate-pulse" />
            <div className="h-2 w-16 rounded bg-[#13131f] animate-pulse" />
          </div>
          <div className="h-2.5 w-16 rounded bg-[#13131f] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
