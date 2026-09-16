"use client";

// Robinhood Chain crypto holdings — the TOKENS table of the Portfolio view
// while the network switcher is on Robinhood, above StockTable's RH leg.
//
// WHY IT EXISTS: TokenTable is fed by Moralis, and Moralis does not index RH
// 4663. So the wallet used to show a holder's RH *stocks* and silently omit
// their RH *tokens* — USDG included, which is what that chain calls cash — with
// nothing on screen admitting a whole chain went unread. Blue Chat's wallet card
// has read both chains all along; this makes the wallet agree with it.
//
// It is a SEPARATE table rather than extra rows in TokenTable for the same
// reason StockTable renders its two venues as two labelled legs: these are
// different chains with different explorers, and the Base table's quick-sell
// (0x, Base-only) cannot settle here. A Sell button that cannot fill is worse
// than no button.
//
// ── SELL: measured per row, not granted per table ────────────────────────────
//
// This table used to be read-only, and said so: "none of those `can` flags is
// true on 4663". That sentence had gone STALE — `can.swap` is true for robinhood
// in lib/wallet/chains.ts and RhSwapCard is the 4663-native card that serves it,
// so the wallet could sell here and this table was declining on the strength of
// an out-of-date comment. It now offers Sell.
//
// But not the way the Base table does. There, `showSell` is one boolean for the
// whole table — the chain is Base, 0x covers Base, every row is fillable. That
// reasoning does not transfer: on 4663 the route for a sell is ONE Uniswap V3
// token/WETH pool (`swap-prepare` sell mode builds a single
// `swapExactInputSingleForETH`), and most RWA tokens on this chain have no pool
// at all. A table-level flag would put a live Sell on every row and let the user
// find out which ones are real by clicking them.
//
// So the gate is per ROW and it is a MEASUREMENT: `useRhSellable` probes the
// factory for each held token and the control is drawn only where a pool with
// non-zero liquidity came back. Unmeasured is not sellable — see rh-sellable.ts
// for why the third state exists and why the button and the label read it
// differently.

import { useEffect, useState } from "react";
import type { RhHolding, RhHoldingsResult } from "@/lib/wallet/rh-holdings";
import { getRhHoldings } from "@/lib/wallet/rh-holdings-cache";
import { canQuickSell, TRUST_BADGE } from "@/lib/wallet/token-trust";
import { useRhSellable, canSellRow, sellDashTitle } from "@/lib/wallet/rh-sellable";
import { resolveRead } from "@/lib/wallet/read-state";
import { DUST_USD, maskFigure, splitByValue, hiddenNote, sumIsFloor } from "@/lib/wallet/display";

const fmtUsd = (n?: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmount(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return Math.round(n).toLocaleString("en-US");
  return s;
}

// Compact per-row quick-sell — the Base table's control, same shape, same
// contract: it PRE-FILLS the Convert panel and never executes anything. A native
// <select> so it cannot nest inside the row's explorer <a>.
function RhSellControl({ h, onQuickSell }: { h: RhHolding; onQuickSell: (h: RhHolding, pct: number) => void }) {
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

export default function RhTokenTable({ address, onQuickSell, hideDust, hideAmounts, onShowDust }: {
  address?: `0x${string}`;
  /** Pre-fill + open the Convert panel on Robinhood, at this token and size.
   *
   *  Optional, and its absence is the only table-level way to turn Sell off —
   *  which is how the caller says "this surface does not trade". Supplying it
   *  does NOT put a control on every row: each row still has to be measured
   *  sellable. See `sellable` below. */
  onQuickSell?: (h: RhHolding, pct: number) => void;
  /** View-only. Hides rows priced under $1 AND rows with no price at all.
   *
   *  The second half matters MORE here than anywhere else on the app: most RH
   *  RWA tokens have no price feed, so on this chain the switch can hide real
   *  positions. That is exactly why the two are counted apart and the footer
   *  names the unpriced ones in their own sentence — "value unknown", never
   *  "under $1" — with `show all` beside it. See lib/wallet/display.ts. */
  hideDust?: boolean;
  /** View-only. Masks figures the eye toggle has hidden. */
  hideAmounts?: boolean;
  /** Turn the dust filter off from inside the table, where the user notices it. */
  onShowDust?: () => void;
}) {
  // `null` = the request has not resolved. `"threw"` = it resolved with nothing
  // at all. Two distinct facts that both used to be stored as `null`, which
  // made "we never asked" and "we asked and got nothing back" the same value —
  // and left the spinner as the only thing a thrown fetch could render once
  // completeness was derived from whether a response had arrived.
  const [data, setData] = useState<RhHoldingsResult | "threw" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) { setData(null); return; }
    let off = false;
    setLoading(true);
    // Through the shared cache, not `fetch` directly. This component unmounts
    // whenever the chain filter hides Robinhood, taking its state with it, so
    // every switch back used to be a cold read of a wallet that had not changed
    // — and the wallet page warms this same entry on mount, so by the time the
    // user switches here the read is usually already done. The cache stores
    // successful reads only; an explorer that refused us still lands in the
    // branches below, exactly as before.
    getRhHoldings(address)
      .then((d: RhHoldingsResult) => { if (!off) setData(d); })
      // A failed fetch is "we could not check", never an empty portfolio.
      .catch(() => { if (!off) setData("threw"); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [address]);

  // NOTE: no early return above this line, and none until after the last hook
  // below. `useRhSellable` is a hook, and `address` goes from undefined to a
  // string the moment a wallet connects — a `return null` in between would
  // change the hook count across that transition and throw "Rendered more hooks
  // than during the previous render". Neither `tsc` nor `next build` catches
  // that, so the ordering is asserted in scripts/rh-sell-gate-test.ts instead.
  // With no address the effect above keeps `data` null, so every derivation
  // here is the empty case and the probe list is `[]` — free.
  const resp = data === "threw" ? null : data;
  const holdings = resp?.holdings ?? [];
  const nFlagged = holdings.filter(h => h.trust === "impostor").length;
  // What actually gets rows. The header total is `resp.totalUsd` — summed
  // SERVER-side over the whole list — so the filter structurally cannot move it
  // here, which is the property the Base table has to maintain by hand.
  const hid   = splitByValue(holdings, h => h.usdValue, !!hideDust);
  const shown = hid.shown;
  const note  = hiddenNote(hid);
  // `resp.totalUsd` is summed SERVER-side over whatever it could price, so an
  // unpriced row contributes nothing to it — the figure is a floor the moment
  // one exists, exactly as on Base. Computed over `holdings`, not `shown`:
  // hiding those rows must not also hide that the total omits them.
  const unpricedInTotal = sumIsFloor(holdings, h => h.usdValue);

  // ── Which rows may offer a Sell ─────────────────────────────────────────────
  //
  // Probed over `shown`, not `holdings`: a hidden row has no control to draw, so
  // probing it would spend RPC calls on a question nobody asked. Native ETH is
  // excluded at the source — it is the OUT side of every sell on this chain, so
  // there is no ETH/WETH route to find and asking would burn four `getPool`
  // calls to learn something structural.
  //
  // Gated on `onQuickSell` too: no caller, no control, so no probe either.
  const sellable = useRhSellable(
    onQuickSell ? shown.filter(h => !h.isNative).map(h => h.address) : [],
  );
  // Reserve the column as soon as a seller is wired, NOT once something turns
  // out to be sellable. Sizing the grid off the probe result would make every
  // row on the table jump sideways the moment the first measurement lands.
  const showSell = !!onQuickSell;
  const gridCls  = showSell ? "grid-cols-[1fr_auto_4.5rem_auto]" : "grid-cols-[1fr_auto_5rem]";

  // Every hook has now run. Safe to leave.
  if (!address) return null;

  // ── How complete is this list? ──────────────────────────────────────────────
  //
  // Shared with the Base table and the stock table — see lib/wallet/read-state.ts
  // for why the derivation is not written here, and scripts/read-state-test.ts
  // for the guard that keeps it out.
  //
  // This file was the one that inspired the module's honesty and still got the
  // narrower question wrong: it had TWO states, so it treated its own payload's
  // two partial signals as decoration. Both are wired in now:
  //
  //   nativeUnread  Blockscout answered for the ERC-20 list but not for native
  //                 ETH. WITH ROWS that was a footnote and fine. With ZERO rows
  //                 the screen said "No tokens on Robinhood Chain" over a read
  //                 that had not looked at ETH — the same defect this table's
  //                 banner exists to prevent, one field over.
  //   truncated     The paging walk hit RH_MAX_TOKEN_PAGES. The list is short by
  //                 an unknown amount, and the header was rendering `totalUsd`
  //                 as a flat figure directly above a note admitting the list is
  //                 incomplete. It is a floor; it now renders as one.
  const read = resolveRead({
    loading,
    received: data !== null,
    failed:   resp === null || resp.status !== "ok",
    partial:  !!resp && resp.status === "ok" && (resp.nativeUnread || resp.truncated),
    rowCount: holdings.length,
  });

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-slate-500 tracking-widest">TOKENS</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded text-[#4FC3F7]"
            style={{ border: "1px solid #4FC3F730", background: "#4FC3F710" }}>Robinhood Chain</span>
          <span className="font-mono text-[8px] text-slate-600">4663</span>
        </div>
        {read.body === "rows" && resp?.status === "ok" && (
          // "≥" when the list is short — a total computed from a truncated walk
          // is a lower bound, and printing it bare put a confident figure
          // directly above the note saying the list is incomplete.
          <span className="font-mono text-[10px] text-slate-400 tabular-nums"
            title={
              read.totalIsFloor && unpricedInTotal ? "At least this much — the token list is incomplete AND some tokens have no price"
              : read.totalIsFloor ? "Partial read — at least this much; the full token list was not available"
              : unpricedInTotal ? "At least this much — some tokens here have no price, so they add nothing to this figure"
              : undefined}>
            {read.totalIsFloor || unpricedInTotal ? "≥ " : ""}{maskFigure(fmtUsd(resp.totalUsd), hideAmounts)}
          </span>
        )}
      </div>

      {read.body === "pending" ? (
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">reading Robinhood Chain…</div>
      ) : read.body === "failed" ? (
        // The one state this table exists to be able to say. An RH holder seeing
        // an empty list would conclude their tokens are gone.
        <div className="rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          Robinhood Chain explorer did not answer. Your holdings there are unknown — this is
          not an empty portfolio.
        </div>
      ) : read.body === "partial" ? (
        // NEW state. Only reachable via `nativeUnread` with no ERC-20 rows —
        // `truncated` implies rows by construction. Previously this rendered as
        // "No tokens on Robinhood Chain" with an amber footnote underneath
        // contradicting it; now the read says what it did and did not cover,
        // once.
        <div className="rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          No ERC-20 tokens found, but the native ETH balance could not be read. This is a
          partial answer, not an empty portfolio.
        </div>
      ) : read.body === "empty" ? (
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">No tokens on Robinhood Chain</div>
      ) : shown.length === 0 ? (
        // Rows exist, the filter hid all of them. Distinct from "empty" above:
        // that branch is a claim about the chain, this one is a claim about the
        // filter, and on RH the difference is sharp — a holder whose whole
        // position is sub-dollar must not read "No tokens on Robinhood Chain".
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">
          All {holdings.length} token{holdings.length > 1 ? "s" : ""} here are{" "}
          {hid.dust > 0 && hid.unpriced > 0
            ? `under $${DUST_USD} or unpriced`
            : hid.unpriced > 0 ? "unpriced" : `under $${DUST_USD}`}.{" "}
          {onShowDust && (
            <button type="button" onClick={onShowDust}
              className="underline text-slate-400 hover:text-[#4FC3F7] transition-colors">show them</button>
          )}
        </div>
      ) : (
        <>
          <div className={`grid ${gridCls} gap-3 px-1 pb-1.5 font-mono text-[9px] text-slate-600 border-b border-[#1A1A2E]`}>
            <span>Token</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Value</span>
            {showSell && <span className="text-right">Sell</span>}
          </div>
          <div className="divide-y divide-[#1A1A2E]">
            {shown.map(h => {
              const badge    = TRUST_BADGE[h.trust];
              const impostor = h.trust === "impostor";
              return (
                <div key={h.address}
                  className={`grid ${gridCls} gap-3 items-center px-1 py-2 hover:bg-[#0d0d12] transition-colors ${impostor ? "opacity-60" : ""}`}>
                  {/* Blockscout, not Basescan — the two chains share no state, so
                      a Basescan link for a 4663 address resolves to nothing. */}
                  <a href={h.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-mono text-[9px] text-slate-400"
                      style={{ background: "#1A1A2E" }}>{h.symbol.slice(0, 3).toUpperCase()}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold truncate"
                          style={{ color: impostor ? "#94a3b8" : "#e2e8f0" }}>{h.symbol}</span>
                        {h.isNative && <span className="font-mono text-[8px] px-1 rounded text-slate-500 shrink-0"
                          style={{ border: "1px solid #1A1A2E" }}>native</span>}
                        {badge && <span className="font-mono text-[8px] px-1 rounded shrink-0"
                          style={{ color: badge.color, border: `1px solid ${badge.color}55` }}>{badge.label}</span>}
                      </div>
                      {h.name && <div className="font-mono text-[9px] text-slate-600 truncate">{h.name}</div>}
                    </div>
                  </a>
                  <span className="font-mono text-[10px] text-slate-300 text-right tabular-nums">
                    {maskFigure(fmtAmount(h.amount), hideAmounts)}
                  </span>
                  {/* An impostor's price is its own claim, quoted through its own
                      pool — same withholding as the Base table. Unpriced stays a
                      literal "—": on this chain most RWA rows have no feed, and
                      masking them would read as "hidden" rather than "unknown". */}
                  <span className="font-mono text-[10px] text-right tabular-nums"
                    style={{ color: impostor ? "#64748b" : h.usdValue != null ? "#34D399" : "#64748b" }}>
                    {impostor || h.usdValue == null ? "—" : maskFigure(fmtUsd(h.usdValue), hideAmounts)}
                  </span>
                  {/* Sell — three independent gates, each answering a different
                      question, and a row needs all three:
                        · not native — ETH is what a sell pays OUT on 4663
                        · not an impostor — same rule as Base, a trade control is
                          the payoff for being mistaken for another token (#145)
                        · a pool was MEASURED — `swap-prepare` sell mode has one
                          route and this is it
                      The dash carries the reason so the absence is explained
                      rather than left as a gap the user has to interpret, and
                      "we couldn't check" is worded as OUR failure, never as a
                      fact about their token. */}
                  {showSell && (
                    h.isNative
                      ? <span className="justify-self-end font-mono text-[9px] text-slate-700"
                          title="ETH is what a sell pays out on Robinhood Chain — swap it for a token from the Convert panel">—</span>
                    : !canQuickSell(h.trust)
                      ? <span className="justify-self-end font-mono text-[9px] text-slate-700"
                          title="Name does not match this contract — trading disabled here">—</span>
                    : canSellRow(sellable[h.address.toLowerCase()])
                      ? <RhSellControl h={h} onQuickSell={onQuickSell!} />
                      : <span className="justify-self-end font-mono text-[9px] text-slate-700"
                          title={sellDashTitle(sellable[h.address.toLowerCase()])}>—</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Notes — each one says a thing the rows above cannot.

          The two completeness notes are gated on `read.footnote`, which is
          "there are rows AND the read was incomplete". Without it they would
          print underneath the partial BANNER as well, saying the same thing
          twice on one screen — the caveat has two shapes and exactly one of
          them is live at a time. */}
      {read.footnote && resp?.status === "ok" && resp.nativeUnread && (
        <div className="mt-2 font-mono text-[9px] text-amber-500/80">
          Native ETH balance could not be read — this list is short by up to one row.
        </div>
      )}
      {/* Blockscout pages this address 50 rows at a time, highest value first,
          and the walk stopped at the cap. Says "the list is short" and NOT "the
          total is wrong", because those are different claims and only the first
          one is true — see RH_MAX_TOKEN_PAGES for the measurement. */}
      {read.footnote && resp?.status === "ok" && resp.truncated && (
        <div className="mt-2 font-mono text-[9px] text-slate-600 leading-relaxed">
          This address holds more tokens than shown. These are the highest-valued ones —{" "}
          <a href={`${resp.explorer}/address/${address}?tab=tokens`}
            target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
            full list on Blockscout ↗
          </a>
        </div>
      )}
      {/* Hidden-rows note — a hidden row that nothing accounts for is
          indistinguishable from a missing one, and on RH that is the likely
          case rather than the edge case: this chain is where the unpriced
          clause does most of its work, because most RWA tokens here have no
          feed. The sentence is `hiddenNote`'s, shared with the two other
          tables, so "still counted" stays attached to the dust count and never
          to the unpriced one. */}
      {note && shown.length > 0 && (
        <div className="mt-2 font-mono text-[9px] text-slate-600 leading-relaxed">
          {note}{" "}
          {onShowDust && (
            <button type="button" onClick={onShowDust}
              className="underline text-slate-500 hover:text-[#4FC3F7] transition-colors">show all</button>
          )}
        </div>
      )}
      {nFlagged > 0 && (
        <div className="mt-2 font-mono text-[9px] text-red-400/80 leading-relaxed">
          {nFlagged} token{nFlagged > 1 ? "s" : ""} use{nFlagged > 1 ? "" : "s"} the ticker of a
          Robinhood-issued token at a different contract address. Not counted in the total.
        </div>
      )}
      {/* NOT gated on `footnote`: this is not a completeness caveat. Rows were
          deliberately withheld because StockTable renders them, and that is
          worth saying most of all when the list above is empty — otherwise a
          holder of nothing but tokenized equities reads "No tokens on Robinhood
          Chain" with no explanation of where they went. */}
      {resp?.status === "ok" && resp.equitiesHidden > 0 && (
        <div className="mt-2 font-mono text-[9px] text-slate-600 leading-relaxed">
          {resp.equitiesHidden} tokenized {resp.equitiesHidden > 1 ? "equities are" : "equity is"} held
          here too — shown in Stocks below, not counted twice.
        </div>
      )}
    </div>
  );
}
