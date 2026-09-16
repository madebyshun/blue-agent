"use client";

// Tokenized-stock holdings — the equity half of the Wallet, sitting under the
// crypto TokenTable. Data comes from /api/wallet/stocks (registry addresses +
// on-chain balances + Chainlink/DEX prices; see lib/wallet/stock-holdings.ts).
//
// The two venues are rendered as two labelled groups, never merged. NVDA on
// Base and NVDA on Robinhood Chain are different tokens at different addresses
// with different decimals, so a single "NVDA" row would be a lie about what the
// wallet holds — and the explorers are not interchangeable either, which is why
// each row links through its own leg's explorer.
//
// Four states are distinguished, per leg, via lib/wallet/read-state.ts: still
// reading, "we could not check", "we could only check part of it", and "you
// hold none". Only the last is a statement about the user. This file used to
// distinguish two of the four — it never read `leg.unread` at all, the field
// whose own doc comment says "the leg is incomplete by exactly this many
// tokens — never treat as zero" — so a leg with five failed balance reads and
// no holdings rendered "No Base stock tokens · 12 checked", asserting both the
// absence and a scan count larger than what had actually been read.

import { useEffect, useState } from "react";
import type { StockPortfolio, StockLeg, StockHolding, StockVenue } from "@/lib/wallet/stock-holdings";
import { resolveRead } from "@/lib/wallet/read-state";
import { useRhSellable, canSellRow, sellDashTitle, type SellMap } from "@/lib/wallet/rh-sellable";
import { DUST_USD, maskFigure, splitByValue, hiddenNote } from "@/lib/wallet/display";

const fmtUsd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmount(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return Math.round(n).toLocaleString("en-US");
  return s;
}

// Per-row quick-sell for a tokenized equity. Identical contract to the crypto
// tables': it PRE-FILLS the Convert panel and signs nothing.
function StockSellControl({ h, onQuickSell }: { h: StockHolding; onQuickSell: (h: StockHolding, pct: number) => void }) {
  return (
    <select
      aria-label={`Sell ${h.symbol}`}
      defaultValue=""
      onChange={e => { const p = Number(e.target.value); e.currentTarget.selectedIndex = 0; if (p > 0) onQuickSell(h, p); }}
      className="justify-self-end bg-[#050508] border border-[#1A1A2E] rounded-lg pl-1.5 pr-0.5 py-1 font-mono text-[9px] text-[#4FC3F7] outline-none cursor-pointer hover:border-[#4FC3F7]/40">
      <option value="">Sell ▾</option>
      <option value="25">25%</option>
      <option value="50">50%</option>
      <option value="100">100%</option>
    </select>
  );
}

function Row({ h, isLast, hideAmounts, gridCls, sellCol, sell }: {
  h: StockHolding;
  isLast: boolean;
  hideAmounts?: boolean;
  gridCls: string;
  /** Does the TABLE have a Sell column at all? Owned by the table, not the row,
   *  so a Base leg rendered beside a Robinhood one still lines up under the
   *  shared header instead of shifting three columns left. */
  sellCol?: boolean;
  /** Present only where a sell path exists for this row's venue. `sellCol`
   *  without `sell` is the Base-leg case: the column is there, this row has
   *  nothing to put in it. */
  sell?: { state: SellMap[string]; onQuickSell: (h: StockHolding, pct: number) => void };
}) {
  return (
    <div className={`grid ${gridCls} gap-3 items-center px-1 py-2 hover:bg-[#0d0d12] transition-colors ${isLast ? "" : "border-b border-[#1A1A2E]"}`}>
      <a href={h.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-mono text-[8px] text-slate-400"
          style={{ background: "#1A1A2E" }}>{h.ticker.slice(0, 4)}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* The on-chain SYMBOL, not the bare ticker — "NVDAc" is the Base
                token and "NVDA" is the RH one, and the difference is the point. */}
            <span className="font-mono text-[11px] font-bold text-slate-200 truncate">{h.symbol}</span>
            {h.kind === "etf" && <span className="font-mono text-[8px] px-1 rounded text-slate-500 shrink-0"
              style={{ border: "1px solid #1A1A2E" }}>ETF</span>}
          </div>
          <div className="font-mono text-[9px] text-slate-600 truncate">{h.name}</div>
        </div>
      </a>
      {/* Share count is masked too — shares × a public quote is the dollar
          figure back again, so hiding one column and not the other hides
          nothing. */}
      <span className="font-mono text-[10px] text-slate-300 text-right tabular-nums">
        {maskFigure(fmtAmount(h.amount), hideAmounts)}
      </span>
      <div className="text-right">
        <div className="font-mono text-[10px] text-slate-300 tabular-nums">
          {h.valueUsd == null ? "—" : maskFigure(fmtUsd(h.valueUsd), hideAmounts)}
        </div>
        {/* Why the value is blank, spelled out rather than left as a dash the
            user has to interpret as either zero or unknown. Left UNMASKED: the
            eye toggle hides amounts, and this line is a reason, not an amount. */}
        {h.valueUsd == null
          ? <div className="font-mono text-[8px] text-slate-600 leading-tight">{h.unpricedReason ?? "unknown"}</div>
          : h.priceSource === "dex-spot"
            ? <div className="font-mono text-[8px] text-slate-600 leading-tight">pool price</div>
            : null}
      </div>
      {/* Sell — drawn ONLY where a pool was measured for this exact contract.
          An equity is the case that most needs the measurement: a tokenized
          share is in the registry because it EXISTS, which says nothing at all
          about whether anyone has put liquidity behind it, and most RH names
          have none. The dash explains itself, and distinguishes "no pool" from
          "we could not check" — the second is our failure, not a fact about
          their position. */}
      {sellCol && (
        !sell
          ? <span className="justify-self-end font-mono text-[9px] text-slate-700"
              title="Selling tokenized shares is offered on Robinhood Chain only — this row is on another venue">—</span>
        : canSellRow(sell.state)
          ? <StockSellControl h={h} onQuickSell={sell.onQuickSell} />
          : <span className="justify-self-end font-mono text-[9px] text-slate-700"
              title={sellDashTitle(sell.state)}>—</span>
      )}
    </div>
  );
}

function Leg({ leg, hideDust, hideAmounts, onShowDust, gridCls, sellCol, onQuickSell }: {
  leg: StockLeg;
  hideDust?: boolean;
  hideAmounts?: boolean;
  onShowDust?: () => void;
  /** Column template, owned by the table so every leg lines up under one header. */
  gridCls: string;
  sellCol?: boolean;
  /** Present only on a leg that HAS a sell path — see the call site. */
  onQuickSell?: (h: StockHolding, pct: number) => void;
}) {
  // `priced` / `total` are computed over the WHOLE leg, never over `shown`. The
  // dust filter is a view; a view that moved this figure would let the user
  // watch their equity shrink by flipping a display switch.
  const priced = leg.holdings.filter(h => h.valueUsd != null);
  const total = priced.reduce((a, h) => a + (h.valueUsd ?? 0), 0);
  // The switch removes two different things and counts them apart: rows priced
  // under $1, and rows with no price at all. Unpriced equities are NOT dust —
  // on RH most tokenized names have no Chainlink feed — so they are hidden by
  // the same control and described by their own clause, never folded into the
  // "$1" count. `total` above is unaffected either way: it never included them.
  const hid   = splitByValue(leg.holdings, h => h.valueUsd, !!hideDust);
  const shown = hid.shown;
  const note  = hiddenNote(hid);

  // A leg is its own read — the two venues fail independently, which is the
  // whole reason they render as two labelled groups. `loading`/`received` are
  // fixed here because a leg only exists once the parent's fetch resolved; the
  // parent owns those two signals and passes the resolved legs down.
  //
  // `unread` is the signal this file had been ignoring. It is NOT the same as
  // `status: "unavailable"`: the chain answered, we walked the registry, and N
  // individual balance calls failed. The list is short by exactly N, so the leg
  // is `partial` — never `complete`, and with no holdings never `empty`.
  //
  // NOT fed in: unpriced holdings. That is a different axis — the LIST is
  // complete, a PRICE is missing — and the header already says "· N unpriced"
  // next to a total that excludes them. Folding it in here would put a "could
  // not read your holdings" banner over holdings that were read perfectly well.
  const read = resolveRead({
    loading:  false,
    received: true,
    failed:   leg.status === "unavailable",
    partial:  leg.unread > 0,
    rowCount: leg.holdings.length,
  });

  // Measured per contract, and only for a leg that actually has a sell path.
  // A tokenized equity is the case that most needs measuring: it is in the
  // registry because the token EXISTS, which says nothing about whether anyone
  // has put liquidity behind it — and on Robinhood Chain most names have none.
  // Probed over `shown` so the dust filter also bounds the RPC work; a hidden
  // row has no control to earn.
  const sellable = useRhSellable(onQuickSell ? shown.map(h => h.contract) : []);

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded text-[#4FC3F7]"
            style={{ border: "1px solid #4FC3F730", background: "#4FC3F710" }}>{leg.label}</span>
          <span className="font-mono text-[8px] text-slate-600">{leg.chainId}</span>
        </div>
        {/* Only totals what it could actually price — an unpriced holding is
            excluded from the sum and said so, never counted as $0. The "≥" is
            the OTHER caveat: rows that were never read at all cannot be in this
            sum either, and unlike the unpriced ones they cannot be counted. */}
        {priced.length > 0 && (
          <span className="font-mono text-[10px] text-slate-400 tabular-nums"
            title={read.totalIsFloor ? `${leg.unread} balance read(s) failed — at least this much` : undefined}>
            {read.totalIsFloor ? "≥ " : ""}{maskFigure(fmtUsd(total), hideAmounts)}
            {priced.length < leg.holdings.length && (
              <span className="text-slate-600"> · {leg.holdings.length - priced.length} unpriced</span>
            )}
          </span>
        )}
      </div>

      {read.body === "failed" ? (
        <div className="rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          {leg.note ?? "Could not reach this chain."} Your holdings are unknown here — this is not an empty portfolio.
        </div>
      ) : read.body === "partial" ? (
        // NEW state, and the one this file was getting wrong: the chain
        // answered but some balance reads did not, and nothing was found in
        // what did. That is not "you hold no stock tokens here". `leg.note`
        // already carries the count — it was being rendered UNDERNEATH the
        // sentence it contradicts.
        <div className="rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          {leg.note ?? `${leg.unread} balance read(s) failed.`} Nothing was found in the rest —
          but this leg is incomplete, not empty.
        </div>
      ) : read.body === "empty" ? (
        // Only from a complete leg, so `scanned` is now a count of rows that
        // were actually read. It used to print here on a partial leg too, where
        // it overstated the work by exactly `leg.unread`.
        <div className="py-3 text-center font-mono text-[9px] text-slate-600">
          No {leg.label} stock tokens · {leg.scanned} checked
        </div>
      ) : shown.length === 0 ? (
        // The leg holds equities; the filter hid all of them. Kept apart from
        // the "empty" branch above, which claims the venue holds nothing and
        // prints a scan count — a claim the filter has no business making.
        <div className="py-3 text-center font-mono text-[9px] text-slate-600">
          All {leg.holdings.length} position{leg.holdings.length > 1 ? "s" : ""} here are{" "}
          {hid.dust > 0 && hid.unpriced > 0
            ? `under $${DUST_USD} or unpriced`
            : hid.unpriced > 0 ? "unpriced" : `under $${DUST_USD}`}.{" "}
          {onShowDust && (
            <button type="button" onClick={onShowDust}
              className="underline text-slate-400 hover:text-[#4FC3F7] transition-colors">show them</button>
          )}
        </div>
      ) : (
        <div>
          {shown.map((h, i) => (
            <Row key={h.contract} h={h} isLast={i === shown.length - 1} hideAmounts={hideAmounts}
              gridCls={gridCls} sellCol={sellCol}
              sell={onQuickSell ? { state: sellable[h.contract.toLowerCase()], onQuickSell } : undefined} />
          ))}
        </div>
      )}

      {/* The same caveat as the partial banner, in the shape it takes when
          there are rows to qualify — `footnote` is true only in that case, so
          the two can never both be on screen. */}
      {read.footnote && leg.note && (
        <div className="mt-1.5 font-mono text-[9px] text-amber-500/80">{leg.note}</div>
      )}

      {/* Per LEG, not per table: the two venues hide different numbers of rows
          and a single combined count would not tell the user which chain their
          missing position is on. */}
      {note && shown.length > 0 && (
        <div className="mt-1.5 font-mono text-[9px] text-slate-600 leading-relaxed">
          {note}{" "}
          {onShowDust && (
            <button type="button" onClick={onShowDust}
              className="underline text-slate-500 hover:text-[#4FC3F7] transition-colors">show all</button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * `venue` narrows the table to ONE chain — the wallet's network switcher now
 * covers Base and Robinhood, and a page showing "Base" above a table listing RH
 * equities is the ticker-string confusion this file's header warns about, made
 * visual. Omitting it keeps the both-venues rendering (still used anywhere the
 * question really is "everything you hold").
 *
 * The filter is applied to the LEGS, after the fetch, and deliberately not
 * pushed into the request: each leg carries its own `status` / `unread`, so
 * dropping one at render time cannot alter what the other one reports. Fetching
 * per-venue would have made the two legs' completeness depend on which tab the
 * user was looking at.
 */
export default function StockTable({ address, venue, hideDust, hideAmounts, onShowDust, onQuickSell }: {
  address?: `0x${string}`;
  venue?: StockVenue;
  /**
   * Pre-fill + open the Convert panel for a tokenized share. Signs nothing.
   *
   * Honoured on the ROBINHOOD leg only, and even there only on rows where a
   * token/WETH pool was actually measured. Base is left out deliberately, not
   * by oversight: a Base B20 sell would route through 0x, nothing in this app
   * has measured that those share tokens are routable, and a Sell drawn on that
   * assumption is a promise made on an unmeasured claim. ShunTr's report named
   * Robinhood ("token và stock trên robinhood chain"); Base stays as it was
   * until its own route is read the same way this one was.
   */
  onQuickSell?: (h: StockHolding, pct: number) => void;
  /** View-only. Hides positions priced under $1 AND positions with no price,
   *  per leg, counted and worded apart. Never changes a leg total: the dust
   *  ones are already in it, the unpriced ones never were (the header says
   *  "· N unpriced" beside the figure). See lib/wallet/display.ts. */
  hideDust?: boolean;
  /** View-only. Masks figures the eye toggle has hidden. */
  hideAmounts?: boolean;
  /** Turn the dust filter off from inside the table, where the user notices it. */
  onShowDust?: () => void;
}) {
  const [data, setData] = useState<StockPortfolio | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) { setData(null); return; }
    let off = false;
    setLoading(true);
    fetch(`/api/wallet/stocks?address=${address}`)
      .then(r => r.json())
      .then((d: StockPortfolio) => { if (!off) setData(d); })
      .catch(() => { if (!off) setData({ address, legs: [], ts: Date.now(), error: "load failed" }); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [address]);

  if (!address) return null;

  // Filtered BEFORE `resolveRead` below, so "how many venues did we get" is
  // asked of the venues actually on screen. Reading it off the unfiltered list
  // would report a Base-only table as complete on the strength of an RH leg the
  // user cannot see.
  const legs = (data?.legs ?? []).filter(l => venue == null || l.venue === venue);
  const anyHeld = legs.some(l => l.holdings.length > 0);

  // The column is reserved by the TABLE, from the props — never from a probe
  // result. Sizing the grid off the measurement would make every row shift
  // sideways the moment the first pool read lands.
  const sellCol = !!onQuickSell && legs.some(l => l.venue === "robinhood");
  const gridCls = sellCol ? "grid-cols-[1fr_auto_5rem_auto]" : "grid-cols-[1fr_auto_5.5rem]";

  // The OUTER read: did we get a portfolio at all? Its rows are the legs, not
  // the holdings — each leg then resolves its own state inside <Leg>. `partial`
  // is structurally false here because a portfolio is either returned or not;
  // partialness lives one level down, per venue, where the two chains fail
  // independently.
  const read = resolveRead({
    loading,
    received: data !== null,
    failed:   !!data?.error,
    partial:  false,
    rowCount: legs.length,
  });

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] text-slate-500 tracking-widest">STOCKS</span>
        <span className="font-mono text-[8px] text-slate-600">tokenized equities</span>
      </div>

      {read.body === "pending" ? (
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">
          reading {venue == null ? "both chains" : venue === "base" ? "Base" : "Robinhood Chain"}…
        </div>
      ) : read.body === "failed" ? (
        <div className="py-6 text-center font-mono text-[10px] text-amber-500/80">
          Couldn&apos;t load stock holdings — {data?.error}
        </div>
      ) : read.body === "empty" || read.body === "partial" ? (
        // Zero legs from a read that did not error. `readStockHoldings` always
        // returns both venues, so with no filter this stays unreachable — but
        // `venue` made it REACHABLE, for the case where the response is missing
        // the one leg being asked for. Either way it is worded as a gap in OUR
        // answer rather than as a fact about the wallet, because "No data" read
        // as if the user held nothing.
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">
          {venue == null ? "No venues were checked" : "This venue was not in the response"} —
          this says nothing about what you hold.
        </div>
      ) : (
        <>
          <div className={`grid ${gridCls} gap-3 px-1 pb-1.5 font-mono text-[9px] text-slate-600 border-b border-[#1A1A2E] mb-2`}>
            <span>Token</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Value</span>
            {sellCol && <span className="text-right">Sell</span>}
          </div>
          {legs.map(l => (
            <Leg key={l.venue} leg={l}
              hideDust={hideDust} hideAmounts={hideAmounts} onShowDust={onShowDust}
              gridCls={gridCls} sellCol={sellCol}
              // Robinhood only — see the `onQuickSell` doc on this component.
              onQuickSell={l.venue === "robinhood" ? onQuickSell : undefined} />
          ))}
          {!anyHeld && legs.every(l => l.status === "ok") && (
            <div className="mt-1 font-mono text-[9px] text-slate-600 leading-relaxed">
              Only tokens from the verified registries are checked — a share token at any
              other address is not counted here, and shows up in Tokens above instead.
            </div>
          )}
        </>
      )}
    </div>
  );
}
