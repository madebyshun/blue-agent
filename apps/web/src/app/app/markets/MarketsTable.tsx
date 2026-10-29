"use client";

// The Markets table: stock tokens + trending crypto on Base 8453 and Robinhood
// Chain 4663 in one list. Logos, 24h change with a 24h sparkline, market cap,
// pool age, liquidity, 24h volume; sortable, searchable, paged. Sparklines load
// as rows scroll into view, two at a time, from the same cached candles the
// token page uses (GeckoTerminal is keyless and 429s on bursts).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StockMark from "@/components/blue-hood/StockMark";
import { resolveStockLogo } from "@/lib/blue-hood/stock-logo";

export interface MarketRow {
  chain: "base" | "robinhood";
  kind: "stock" | "etf" | "crypto" | "launch";
  token: string;
  symbol: string;
  name: string;
  logo: string | null;
  price: number | null;
  change: number | null;
  mcap: number | null;
  mcapIsFdv: boolean;
  liq: number | null;
  vol: number | null;
  createdAt: string | null;
  pool: string | null;
  side: "base" | "quote";
  read: boolean;
}

type SortKey = "vol" | "change" | "mcap" | "liq" | "age";
const PAGE = 25;
const CH = { base: "Base", robinhood: "Robinhood" } as const;
const usd = (n: number | null) => n === null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toPrecision(3)}` : "$0";
const ageDays = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);
const age = (iso: string | null) => { const d = ageDays(iso); return d === null ? "—" : d === 0 ? `${Math.max(1, Math.floor((Date.now() - Date.parse(iso!)) / 3_600_000))}h` : `${d}d`; };
const label = (r: MarketRow) => (r.chain === "base" && (r.kind === "stock" || r.kind === "etf") ? `${r.symbol}c` : r.symbol);

// ── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ r, size = 28 }: { r: MarketRow; size?: number }) {
  const [bad, setBad] = useState(false);
  if (r.logo && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.logo} alt="" width={size} height={size} onError={() => setBad(true)} className="rounded-full shrink-0 bg-[#0F121A] object-cover" style={{ width: size, height: size }} />;
  }
  // StockMark only where Blue Hood holds the company mark; its "?" means "not on
  // Hood's desk", which is wrong for a Coinbase-listed token. Monogram otherwise.
  if ((r.kind === "stock" || r.kind === "etf") && resolveStockLogo(r.chain, r.symbol).mark) return <StockMark ticker={r.symbol} chain={r.chain} size={size} />;
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0 border border-[#2a3350] bg-[#0F121A] text-[#94A3B8] font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>{r.symbol.slice(0, 2).toUpperCase()}</span>
  );
}

// ── Sparkline (lazy, shared queue) ───────────────────────────────────────────
const cache = new Map<string, number[] | null>();
const queue: (() => Promise<void>)[] = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => { running--; pump(); });
  }
}
function Spark({ r, up }: { r: MarketRow; up: boolean | null }) {
  const key = `${r.chain}:${r.pool}:${r.side}`;
  const [v, setV] = useState<number[] | null | undefined>(cache.get(key));
  const [refused, setRefused] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!r.pool || v !== undefined || !el.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      queue.push(async () => {
        if (cache.has(key)) { setV(cache.get(key)); return; }
        const j = await fetch(`/api/markets/candles?chain=${r.chain}&pool=${r.pool}&side=${r.side}&tf=1h`).then((x) => x.json()).catch(() => null);
        // null = GeckoTerminal refused (rate limit): leave blank, never "no history".
        const closes = Array.isArray(j?.candles) ? (j.candles as number[][]).slice(-24).map((c) => c[4]) : null;
        if (closes) cache.set(key, closes);
        setV(closes === null ? null : closes);
        if (closes === null) setRefused(true);
      });
      pump();
    });
    io.observe(el.current);
    return () => io.disconnect();
  }, [key, r.pool, r.chain, r.side, v]);
  const W = 200, H = 30;
  let path = null as string | null;
  if (v && v.length > 1) {
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || hi || 1;
    path = v.map((c, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${(H - 2 - ((c - lo) / span) * (H - 4)).toFixed(1)}`).join(" ");
  }
  const col = up === null ? "#64748B" : up ? "#34D399" : "#F87171";
  return (
    <div ref={el} className="h-[30px] w-full">
      {path ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <path d={`${path} L${W},${H} L0,${H} Z`} fill={col} opacity={0.1} />
          <path d={path} fill="none" stroke={col} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : <span className="block pt-2 text-center text-[12px] text-[#334155]">{!r.pool || (Array.isArray(v) && v.length < 2) ? "no history" : refused ? "·" : ""}</span>}
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────
export default function MarketsTable({ rows, readAt }: { rows: MarketRow[]; readAt: string | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<"all" | "stocks" | "crypto" | "launches">("all");
  const [chain, setChain] = useState<"all" | "base" | "robinhood">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "vol", dir: -1 });
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [kind, chain, q, sort]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const val = (r: MarketRow): number | null => sort.k === "age" ? ageDays(r.createdAt) : r[sort.k];
    return rows
      .filter((r) => kind === "all" || (kind === "crypto" ? r.kind === "crypto" : kind === "launches" ? r.kind === "launch" : r.kind === "stock" || r.kind === "etf"))
      .filter((r) => chain === "all" || r.chain === chain)
      .filter((r) => !t || r.symbol.toLowerCase().includes(t) || r.name.toLowerCase().includes(t) || r.token.toLowerCase() === t)
      .sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x - y) * sort.dir;
      });
  }, [rows, kind, chain, q, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const trending = useMemo(() => [...rows].filter((r) => r.vol !== null).sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0)).slice(0, 16), [rows]);

  const chip = (on: boolean) => `text-[13px] rounded-[7px] px-2.5 py-[5px] border transition-colors ${on ? "border-[#4FC3F7]/60 text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`;
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-2 font-medium ${className}`}>
      <button type="button" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 ${sort.k === k ? "text-[#E2E8F0] border border-[#2a3350] bg-[#0F121A]" : "hover:text-[#E2E8F0]"}`}>
        {children}<span className="text-[11px]">{sort.k === k ? (sort.dir === -1 ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div>
      {/* 24h trending strip */}
      <div className="flex items-center gap-3 overflow-x-auto rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-3 py-2 [scrollbar-width:none]">
        <span className="shrink-0 flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-[#E2E8F0]"><span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />24H TRENDING</span>
        {trending.map((r) => (
          <Link key={`t${r.chain}${r.token}`} href={`/markets/${r.chain}/${r.token}`} className="shrink-0 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[#0F121A]">
            <Logo r={r} size={20} />
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold text-[#E2E8F0]">{label(r)} <span className="font-normal text-[12px] text-[#64748B]">{CH[r.chain]}</span></span>
              <span className="block text-[12px] text-[#64748B]">vol {usd(r.vol)}{r.change !== null && <span className={r.change >= 0 ? "text-[#34D399]" : "text-[#F87171]"}> {r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</span>}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {([["all", "All"], ["stocks", "Stock tokens"], ["crypto", "Trending crypto"], ["launches", "Launched on Blue Agent"]] as const).map(([id, l]) => (
          <button key={id} type="button" onClick={() => setKind(id)} className={chip(kind === id)}>{l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#1A1A2E]" />
        {([["all", "Both chains"], ["base", "Base 8453"], ["robinhood", "Robinhood Chain 4663"]] as const).map(([id, l]) => (
          <button key={id} type="button" onClick={() => setChain(id)} className={chip(chain === id)}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets, ticker or 0x…"
          className="ml-auto w-[260px] bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-3 py-[7px] text-[14px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none" />
      </div>

      <div className="mt-3 overflow-x-auto rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]">
        <table className="w-full min-w-[1180px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] tracking-[0.08em] text-[#64748B] border-b border-[#1A1A2E]">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-2 font-medium">MARKET</th>
              <Th k="change" className="w-[300px]">24H CHANGE</Th>
              <Th k="age" className="text-right">AGE</Th>
              <Th k="mcap" className="text-right">MARKET CAP</Th>
              <Th k="liq" className="text-right">LIQUIDITY</Th>
              <Th k="vol" className="text-right">24H VOLUME</Th>
              <th className="px-3 text-right font-medium">TRADE</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-[#64748B]">{kind === "launches" ? "No token has been launched through Blue Agent yet." : readAt ? "No match." : "Market data unreadable right now."}</td></tr>}
            {slice.map((r, i) => {
              const up = r.change === null ? null : r.change >= 0;
              return (
                <tr key={`${r.chain}:${r.token}`}
                  // The whole row opens the token page (links inside keep their own targets).
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(`/markets/${r.chain}/${r.token}`); }}
                  className="cursor-pointer border-t border-[#1A1A2E] first:border-t-0 hover:bg-[#0F121A]">
                  <td className="px-3 py-2.5 text-[13px] text-[#64748B] tabular-nums">{page * PAGE + i + 1}</td>
                  <td className="px-2">
                    <Link href={`/markets/${r.chain}/${r.token}`} className="flex items-center gap-2.5 min-w-[220px]">
                      <Logo r={r} />
                      <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1.5"><span className="truncate max-w-[200px] font-prose text-[15px] text-[#E2E8F0]">{r.name}</span>
                          {(r.kind === "stock" || r.kind === "etf") && <span className="text-[11px] rounded-full border border-[#34D399]/30 px-1.5 text-[#34D399]">{r.kind === "etf" ? "ETF" : "STOCK"}</span>}
                          {r.kind === "launch" && <span className="text-[11px] rounded-full border border-[#4FC3F7]/40 px-1.5 text-[#4FC3F7]">VIA BLUE AGENT</span>}</span>
                        <span className="text-[12px] text-[#64748B]">${label(r)} · {CH[r.chain]}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-[56px] text-right tabular-nums text-[13px] ${up === null ? "text-[#64748B]" : up ? "text-[#34D399]" : "text-[#F87171]"}`}>{r.change === null ? "—" : `${r.change >= 0 ? "+" : ""}${r.change.toFixed(1)}%`}</span>
                      <div className="flex-1"><Spark r={r} up={up} /></div>
                    </div>
                  </td>
                  <td className="px-2 text-right text-[#94A3B8] tabular-nums">{age(r.createdAt)}</td>
                  <td className="px-2 text-right text-[#E2E8F0] tabular-nums" title={r.mcapIsFdv ? "fully diluted value (no market cap on file)" : undefined}>{r.mcap ? usd(r.mcap) : "—"}{r.mcap !== null && r.mcap > 0 && r.mcapIsFdv && <span className="text-[11px] text-[#64748B]"> FDV</span>}</td>
                  <td className="px-2 text-right text-[#94A3B8] tabular-nums">{!r.read ? "—" : usd(r.liq)}</td>
                  <td className="px-2 text-right text-[#E2E8F0] tabular-nums">{!r.read ? "—" : r.vol === null ? <span className="text-[#64748B]">no pool</span> : usd(r.vol)}</td>
                  <td className="px-3 text-right">
                    <Link href={`/markets/${r.chain}/${r.token}#trade`} className="inline-flex items-center whitespace-nowrap rounded-[8px] border border-[#2a3350] bg-[#0F121A] px-3.5 py-2 text-[13px] text-[#E2E8F0] hover:border-[#4FC3F7]/60 hover:text-[#4FC3F7]">Trade</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-[#64748B]">
        <span className="mr-2 tabular-nums">{shown.length ? `${page * PAGE + 1}–${Math.min(shown.length, (page + 1) * PAGE)} of ${shown.length}` : "0"}</span>
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 disabled:opacity-30 hover:text-[#E2E8F0]">‹</button>
        {Array.from({ length: pages }, (_, i) => i).filter((i) => i < 5 || Math.abs(i - page) <= 1 || i === pages - 1).map((i, k, arr) => (
          <span key={i} className="flex items-center">
            {k > 0 && arr[k - 1] !== i - 1 && <span className="px-1">…</span>}
            <button type="button" onClick={() => setPage(i)} className={`h-6 w-6 rounded-full tabular-nums ${i === page ? "border border-[#4FC3F7]/60 text-[#4FC3F7]" : "hover:text-[#E2E8F0]"}`}>{i + 1}</button>
          </span>
        ))}
        <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 disabled:opacity-30 hover:text-[#E2E8F0]">›</button>
      </div>
    </div>
  );
}
