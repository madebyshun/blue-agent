"use client";

// Reads /api/markets/portfolio for the connected wallet (or any address typed in).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

interface Holding { chain: "base" | "robinhood"; symbol: string; name: string; contract: string | null; amount: number; priceUsd: number | null; valueUsd: number | null; kind: string }
interface Resp { address: string; holdings: Holding[]; unread: string[]; readAt: string }

const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const usd = (n: number | null) => n === null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(2)}k` : `$${n.toFixed(2)}`;
const amt = (n: number) => n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4) : n.toPrecision(3);
const CH = { base: "Base", robinhood: "Robinhood Chain" } as const;

export default function PortfolioClient() {
  const { address } = useAccount();
  const [typed, setTyped] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (address && !who) setWho(address); }, [address, who]);
  const load = useCallback(async (a: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/markets/portfolio?address=${a}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setD(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { if (who) load(who); }, [who, load]);

  const total = (c?: string) => (d?.holdings ?? []).filter((h) => !c || h.chain === c).reduce((a, h) => a + (h.valueUsd ?? 0), 0);
  const stocks = (d?.holdings ?? []).filter((h) => h.kind === "stock" || h.kind === "etf").reduce((a, h) => a + (h.valueUsd ?? 0), 0);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {!address && <ConnectButton label="Connect wallet" />}
        <form onSubmit={(e) => { e.preventDefault(); if (/^0x[0-9a-fA-F]{40}$/.test(typed.trim())) setWho(typed.trim()); }} className="flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="or look up any 0x address"
            className="w-[320px] bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-3 py-[7px] text-[11px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none" />
          <button className="text-[10.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[8px] px-3 hover:text-[#E2E8F0]">Look up</button>
        </form>
        {who && <span className="ml-auto text-[10px] text-[#64748B]">{who.slice(0, 6)}…{who.slice(-4)}{busy ? " · reading…" : d ? ` · read ${d.readAt.slice(11, 16)}Z` : ""}</span>}
      </div>
      {err && <p className="mt-3 text-[10.5px] text-[#F87171]">{err}</p>}
      {d && (
        <>
          <div className="mt-4 grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              ["TOTAL", usd(total()), "both chains, priced holdings"],
              ["BASE 8453", d.unread.includes("base") ? "unread" : usd(total("base")), "ETH, USDC, B20 stocks"],
              ["ROBINHOOD CHAIN 4663", d.unread.includes("robinhood") ? "unread" : usd(total("robinhood")), "ETH, USDG, stock tokens"],
              ["IN STOCK TOKENS", usd(stocks), "both chains"],
            ].map(([l, v, s]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>
          <div className={`${card} mt-4 overflow-x-auto`}>
            <table className="w-full min-w-[600px] text-[10.5px]">
              <thead>
                <tr className="text-left text-[9px] tracking-[0.12em] text-[#64748B] border-b border-[#1A1A2E]">
                  <th className="px-4 py-2.5 font-medium">ASSET</th><th className="px-2 font-medium">CHAIN</th><th className="px-2 text-right font-medium">AMOUNT</th>
                  <th className="px-2 text-right font-medium">PRICE</th><th className="px-4 text-right font-medium">VALUE</th>
                </tr>
              </thead>
              <tbody>
                {d.holdings.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-[#64748B]">Nothing held on either chain{d.unread.length ? ` that could be read (${d.unread.join(", ")} unreadable)` : ""}.</td></tr>}
                {d.holdings.map((h) => (
                  <tr key={`${h.chain}:${h.contract ?? "eth"}`} className="border-t border-[#1A1A2E] first:border-t-0">
                    <td className="px-4 py-2">
                      {h.contract ? <Link className="text-[#E2E8F0] font-semibold hover:text-[#4FC3F7]" href={`/markets/${h.chain}/${h.contract}`}>{h.chain === "base" && (h.kind === "stock") ? `${h.symbol}c` : h.symbol}</Link> : <span className="text-[#E2E8F0] font-semibold">{h.symbol}</span>}
                      <span className="ml-2 text-[#64748B] font-prose">{h.name}</span>
                    </td>
                    <td className="px-2 text-[#94A3B8]">{CH[h.chain]}</td>
                    <td className="px-2 text-right text-[#E2E8F0] tabular-nums">{amt(h.amount)}</td>
                    <td className="px-2 text-right text-[#94A3B8] tabular-nums">{h.kind === "stable" ? "$1 (stable)" : usd(h.priceUsd)}</td>
                    <td className="px-4 text-right text-[#E2E8F0] tabular-nums">{usd(h.valueUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[9.5px] text-[#475569]">Only ETH, each chain&apos;s dollar stable and verified stock tokens are read; other tokens are not listed. Stables are counted at $1. A holding with no market price shows —, and is left out of the totals.</p>
        </>
      )}
    </div>
  );
}
