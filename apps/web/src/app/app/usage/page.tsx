"use client";

// /app/usage — everything the connected wallet has CONSUMED from BlueAgent,
// rebuilt to the design handoff's two-column layout.
//
// Two data sources, one page, because they answer one question from two angles:
//   • credits    — GET /api/credits/balance/[address] → the four KPI cells
//     (spendable / daily left / top-up pool / spent all-time) and the RECENT
//     ACTIVITY ledger. This is the ONE page that breaks the credit arithmetic
//     down; the dashboard used to reprint three of these figures and disagree.
//   • agent spend— useSpendSummary(address) → /api/wallet/spend-summary. Fed to
//     BOTH halves of the console: the CALLS-PER-DAY hero (left) and the
//     AGENT-SPEND-BY-TOOL rail (right). The page calls the hook ONCE and passes
//     the result into two <SpendConsole … bare only=…> mounts, so the expensive
//     two-rail aggregation runs a single time.
//
// 100% real data, no mock numbers. The console keeps USDC and credits in
// separate columns and never adds them — see SpendConsole's own header for why a
// single credit event has no honest dollar value.
//
// The header is `hidden lg:flex`; at mobile width the app shell's MobileTopBar
// renders "// USAGE" instead, so a second title never prints above it.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { WalletPickerModal } from "@/components/WalletPicker";
import TopUpModal from "@/components/TopUpModal";
import SpendConsole, { useSpendSummary, scopeLabel } from "@/components/SpendConsole";
import type { BalanceSummary, LedgerEvent } from "@/lib/credit-ledger";

// Compact "time ago" for ledger rows (ms epoch → "3m", "2h", "5d").
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// One KPI cell of the top strip. `bar` sits between the value and the sub (the
// DAILY LEFT allowance meter); every other cell leaves it undefined.
function Kpi({ label, value, sub, accent, last, bar }: {
  label: string; value: ReactNode; sub?: string; accent?: string; last?: boolean; bar?: ReactNode;
}) {
  return (
    <div className={`px-[18px] py-3.5 ${last ? "" : "border-r border-[#1A1A2E]"}`}>
      <div className="font-mono text-[9px] tracking-[0.15em] text-[#64748B]">{label}</div>
      <div className="font-mono text-2xl font-bold mt-[5px]" style={{ color: accent ?? "#E2E8F0" }}>
        {value}
      </div>
      {bar}
      {sub && <div className="font-mono text-[10px] text-[#64748B] mt-[3px]">{sub}</div>}
    </div>
  );
}

// One RECENT ACTIVITY row. Refunds move credits back IN, so they read like a
// top-up — but they are not one, and a bare "chat:private" would show a green
// line the user can't account for. Say what it was: a charge reversed.
function ActivityRow({ ev, first }: { ev: LedgerEvent; first: boolean }) {
  const isRefund   = ev.kind === "refund";
  const isIncoming = isRefund || ev.kind === "topup";
  return (
    <div
      className="grid items-center px-3.5 py-[11px]"
      style={{
        gridTemplateColumns: "minmax(0,1fr) auto auto",
        columnGap: 14,
        borderTop: `1px solid ${first ? "#1A1A2E" : "rgba(26,26,46,.55)"}`,
      }}
    >
      <span className="font-mono text-[11.5px] truncate" style={{ color: isIncoming ? "#34D399" : "#E2E8F0" }}>
        {isRefund && <span className="text-[#64748B]">refund · </span>}
        {ev.reason || ev.kind}
      </span>
      <span className="font-mono text-[10px] text-[#64748B]">
        {ago(ev.ts)} ago{isRefund ? " · no answer returned" : ""}
      </span>
      <span
        className="font-mono text-[11.5px] font-semibold text-right"
        style={{ color: isIncoming ? "#34D399" : "#F87171" }}
      >
        {isIncoming ? "+" : "−"}{ev.amount.toLocaleString()}
      </span>
    </div>
  );
}

export default function UsagePage() {
  const { address, isConnected } = useWallet();
  const [data, setData]       = useState<BalanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [picker, setPicker]   = useState(false);
  const [topup, setTopup]     = useState(false);

  // The spend rails + calls-per-day chart, fetched ONCE here and handed to both
  // console mounts below via their `summary` prop (see the file header).
  const spend = useSpendSummary(address);

  const load = useCallback(async () => {
    if (!address) { setData(null); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/credits/balance/${address}`);
      if (!res.ok) throw new Error(`Couldn't load balance (HTTP ${res.status}).`);
      setData((await res.json()) as BalanceSummary);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const dailyCr   = data?.dailyCr ?? 0;
  const dailyLeft = data?.dailyRemaining ?? 0;
  const pool      = data?.pool ?? 0;
  const dailyPct  = dailyCr > 0 ? Math.min(100, (dailyLeft / dailyCr) * 100) : 0;

  // "Spent all-time" needs BOTH halves. `spent` is only what came out of the
  // paid pool — a debit drains the free daily bucket first and just the overflow
  // lands there — so on its own it reads 0 forever for anyone living inside
  // their daily allowance, under a label claiming to count chat and tool runs.
  // `freeSpent` is the free half and has three states, not two:
  //   number, exact    → the wallet's whole history is counted
  //   number, partial  → counting began mid-life; the total is a FLOOR
  //   undefined        → never measured; say so instead of adding a 0
  const poolSpent  = data?.spent ?? 0;
  const freeSpent  = data?.freeSpent;
  const spentTotal = poolSpent + (freeSpent ?? 0);
  const spentSub =
    freeSpent === undefined  ? "top-up pool · free use not counted"
    : data?.freeSpentPartial ? "chat + tool runs · at least"
    :                          "chat + tool runs";

  const fmt = (n: number) => n.toLocaleString();
  const dash = (v: string) => (loading && !data ? "…" : v);

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white overflow-hidden">
      {/* Header — desktop only; MobileTopBar prints "// USAGE" below lg. */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// USAGE</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">
          credits &amp; agent spend · Coinbase x402{address ? ` · ${shortAddr(address)}` : ""}
        </span>
        {isConnected && (
          <span className="ml-auto flex items-center gap-2">
            <Link
              href="/plans"
              className="font-mono text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px] hover:border-[#4FC3F7]/40 hover:text-[#E2E8F0] transition-colors"
            >
              View plans
            </Link>
            <button
              onClick={() => setTopup(true)}
              className="font-mono text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] rounded-[7px] px-[11px] py-[5px] hover:opacity-90 transition-opacity"
            >
              Top up
            </button>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!isConnected ? (
          // ── Connect gate ──────────────────────────────────────────────────
          <div className="max-w-sm mx-auto mt-16 sm:mt-24 px-5 text-center">
            <p className="font-mono text-[13px] text-[#E2E8F0] font-bold">Connect a wallet</p>
            <p className="font-prose text-[11px] text-[#64748B] mt-2 leading-relaxed">
              Your credit balance and usage history are scoped to your connected wallet.
            </p>
            <button
              onClick={() => setPicker(true)}
              className="mt-5 font-mono text-[12px] font-bold text-[#050508] bg-[#4FC3F7] rounded-xl px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Connect wallet
            </button>
          </div>
        ) : (
          <>
            {err && (
              <p className="font-mono text-[11px] text-[#F87171] border border-[#F87171]/20 bg-[#F87171]/5 rounded-lg px-3 py-2 m-5 mb-0">
                {err}
              </p>
            )}

            {/* ── KPI strip — the credit arithmetic, broken down once ───────── */}
            <div
              className="grid border-b border-[#1A1A2E]"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}
            >
              <Kpi label="SPENDABLE NOW" value={dash(fmt(data?.balance ?? 0))} accent="#4FC3F7" sub="daily + pool" />
              <Kpi
                label="DAILY LEFT"
                value={dash(fmt(dailyLeft))}
                sub={`of ${fmt(dailyCr)} · resets 00:00 UTC`}
                bar={
                  <div className="h-[3px] rounded-[2px] bg-[#1A1A2E] mt-2">
                    <div className="h-full rounded-[2px] bg-[#4FC3F7]" style={{ width: `${dailyPct}%` }} />
                  </div>
                }
              />
              <Kpi label="TOP-UP POOL" value={dash(fmt(pool))} sub="bought with USDC · no reset" />
              <Kpi label="SPENT ALL-TIME" value={dash(fmt(spentTotal))} sub={spentSub} last />
            </div>

            {/* ── Split: left = over-time + ledger · right = by-tool ────────── */}
            <div className="flex flex-col lg:flex-row items-stretch">
              {/* Left column */}
              <div className="flex-1 min-w-0 px-5 py-[18px] space-y-6">
                {/* Calls-per-day hero (spend-summary `days`, plotted honestly) */}
                <div className="border border-[#1A1A2E] bg-[#0D0D14] rounded-2xl px-[18px] py-4">
                  <SpendConsole summary={spend} only="chart" bare />
                </div>

                {/* Recent activity — the raw credit ledger */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B] uppercase">
                      Recent activity
                    </span>
                    <span className="font-mono text-[10px] text-[#64748B]">credits · newest first</span>
                  </div>
                  <div className="mt-[11px]">
                    {loading && !data ? (
                      <p className="font-mono text-[11px] text-[#64748B] px-4 py-6 text-center">Loading…</p>
                    ) : (data?.recent?.length ?? 0) === 0 ? (
                      <p className="font-mono text-[11px] text-[#64748B] px-4 py-6 text-center">
                        No activity yet. Credits spent on chat and tool runs show up here.
                      </p>
                    ) : (
                      data!.recent.map((ev, i) => (
                        <ActivityRow key={`${ev.ts}-${i}`} ev={ev} first={i === 0} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right rail — AGENT SPEND · BY TOOL. The join no explorer can
                  make: the tool id only ever existed in the paying request. */}
              <div className="w-full lg:w-[330px] lg:flex-none border-t lg:border-t-0 lg:border-l border-[#1A1A2E] p-[18px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B] uppercase">
                    Agent spend · by tool · Coinbase x402
                  </span>
                  {spend.s === "ok" && scopeLabel(spend.d) && (
                    <span className="font-mono text-[9px] text-[#475569] shrink-0">{scopeLabel(spend.d)}</span>
                  )}
                </div>
                <p className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-2">
                  What your payments actually bought — the part no block explorer can see.
                </p>
                <div className="mt-3.5">
                  <SpendConsole summary={spend} only="rails" bare />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <WalletPickerModal open={picker} onClose={() => setPicker(false)} />
      <TopUpModal open={topup} onClose={() => setTopup(false)} onCredited={load} />
    </div>
  );
}
