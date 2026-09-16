"use client";

// Full live token holdings — the Bankr-style portfolio centerpiece of the Wallet
// surface. Columns: Token · Balance · Value · (Sell). Data comes from
// /api/wallet/holdings (Moralis, spam-filtered, usd_value already priced). Value
// renders "—" whenever Moralis has no price for a token — we NEVER fabricate one.
//
// Chain: told, not guessed. `network` is a REQUIRED prop supplied by whichever
// surface mounts this table.
//
// It used to be derived here from `useChainId()` — the CONNECTED WALLET's chain
// — as `chainId === 84532 ? "baseSepolia" : "base"`, and that was wrong twice
// over. (1) The wallet's chain and the dashboard's selected chain are different
// things that routinely diverge; BankClient renders a whole `chainMismatch`
// banner about it, then this table quietly answered for the other one. A wallet
// left on Sepolia would fill the Base portfolio with testnet rows. (2) It is the
// `X ?? default` fail-open shape: every chain that is not 84532 collapsed to
// "base", so a wallet on Robinhood Chain 4663 got a full list of BASE holdings
// under whatever heading the page was showing. The caller knows which chain it
// is asking about; asking wagmi was asking the wrong object.
//
// The per-row quick-sell (25/50/100%) only shows on Base mainnet (0x has no
// testnet liquidity) — it just pre-fills + opens the Convert panel via
// onQuickSell; the user still reviews and signs there.
//
// This table is Base-ONLY and its header chip says so, because Moralis does not
// index Robinhood Chain. RH crypto is a separate table (`RhTokenTable`, via
// Blockscout) rather than extra rows here: quick-sell is 0x-on-Base and the
// trust verdict is computed against Base's address book, so an RH row folded in
// would inherit a Sell button that cannot fill. A PnL column is still a
// follow-up — it needs a real cost-basis source, not a UI change.
//
// TRUST: every row also carries `h.trust`, derived in holdings.ts from the token
// ADDRESS (see lib/wallet/token-trust.ts). This table used to render whatever
// Moralis returned, with an identical live `Sell ▾` on each row — including on a
// token whose symbol said "USDC" and whose name said "United States of Doge
// CashCat". Two things follow from trust here and both are load-bearing:
// an impostor gets NO trade control, and it does not count toward the total.

import { useEffect, useState } from "react";
import type { WalletHolding } from "@/lib/wallet/holdings";
import { canQuickSell, countsTowardTotal, TRUST_BADGE } from "@/lib/wallet/token-trust";
import { resolveRead } from "@/lib/wallet/read-state";
import { DUST_USD, maskFigure, splitByValue, hiddenNote, sumIsFloor } from "@/lib/wallet/display";

interface HoldingsResp {
  holdings:   WalletHolding[];
  source:     "moralis" | "discovery" | "rpc";
  partial:    boolean;
  /** Why the list may be short, written by the reader that knows which of three
   *  sources answered. Rendered verbatim — see the footnote below for why this
   *  table no longer composes that sentence itself. */
  partialReason?: string;
  explorer?:  string;
  addressUrl?: string;
  network?:   string;
  error?:     string;
}

const fmtUsd = (n?: number) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compact large balances (1_700_000 → "1.7M") but leave already-trimmed small
// amounts as-is — checkWallet() has already trimmed trailing zeros server-side.
function fmtAmount(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return Math.round(n).toLocaleString("en-US");
  return s;
}

// Compact per-row quick-sell: 25/50/100% → opens the Convert panel pre-filled.
// A native <select> so it never nests inside the row's explorer <a>.
function SellControl({ h, onQuickSell }: { h: WalletHolding; onQuickSell: (h: WalletHolding, pct: number) => void }) {
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

// `network` is narrowed to the two chains /api/wallet/holdings can actually
// answer for. Robinhood is deliberately NOT in this union: Moralis does not
// index 4663, RhTokenTable reads it through Blockscout instead, and a type that
// could accept "robinhood" would let a caller re-create the bug in the header
// by passing it here and receiving Base rows.
export default function TokenTable({ address, network, onQuickSell, hideDust, hideAmounts, onShowDust }: {
  address?: `0x${string}`;
  network: "base" | "baseSepolia";
  onQuickSell?: (h: WalletHolding, pct: number) => void;
  /** View-only. Hides rows priced under $1 AND rows with no price at all. The
   *  two are counted and worded separately below, and neither changes the total
   *  above — see lib/wallet/display.ts. */
  hideDust?: boolean;
  /** View-only. Masks figures the eye toggle has hidden. */
  hideAmounts?: boolean;
  /** Turn the dust filter off from inside the table, where the user notices it. */
  onShowDust?: () => void;
}) {
  const [data, setData] = useState<HoldingsResp | null>(null);
  const [loading, setLoading] = useState(false);

  const chainLabel = network === "baseSepolia" ? "Base Sepolia" : "Base";
  // Quick-sell only on Base mainnet (0x has no testnet liquidity).
  const showSell = !!onQuickSell && network === "base";
  const gridCls  = showSell ? "grid-cols-[1fr_auto_4.5rem_auto]" : "grid-cols-[1fr_auto_5rem]";

  useEffect(() => {
    if (!address) { setData(null); return; }
    let off = false;
    setLoading(true);
    fetch(`/api/wallet/holdings?address=${address}&network=${network}`)
      .then(r => r.json())
      .then((d: HoldingsResp) => { if (!off) setData(d); })
      // `partial: true`, NOT false. This path knows nothing at all — no list was
      // obtained — and `partial: false` is the literal claim "this is the
      // complete set of tokens you hold", which is the one thing a failed fetch
      // cannot support. `error` is what the render actually keys off, but a
      // reader who only checks `partial` must not be able to conclude
      // completeness from a request that never returned.
      .catch(() => { if (!off) setData({ holdings: [], source: "rpc", partial: true, error: "load failed" }); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [address, network]);

  if (!address) return null;

  const holdings = data?.holdings ?? [];
  // Impostors are excluded from the headline total. A scam token can quote any
  // price it likes through a pool it controls, so counting it would let the
  // impostor set the number this card presents as the user's portfolio value.
  //
  // Summed over `holdings`, NOT over `shown`. The dust filter is a view, and a
  // view must not be able to move a total — if hiding rows lowered this figure,
  // a user who flipped the switch would watch their portfolio shrink.
  const totalUsd  = holdings.reduce((a, h) => a + (countsTowardTotal(h.trust) ? (h.usdValue ?? 0) : 0), 0);
  const nFlagged  = holdings.filter(h => h.trust === "impostor").length;
  // What actually gets rows. The switch removes two DIFFERENT things — rows we
  // priced under $1, and rows we could not price at all — and `splitByValue`
  // returns them as separate counts because they license opposite sentences
  // about the total (see `hiddenNote`). They are never merged into one number.
  const hid   = splitByValue(holdings, h => h.usdValue, !!hideDust);
  const shown = hid.shown;
  const note  = hiddenNote(hid);
  // Rows that count toward the total but carry no price. They add 0 to the sum,
  // so their existence alone makes the header figure a LOWER BOUND. Computed
  // over `holdings`, never `shown` — hiding the unpriced rows must not also
  // hide the fact that the sum omits them.
  const unpricedInTotal = sumIsFloor(holdings, h => h.usdValue, h => countsTowardTotal(h.trust));
  const explorer  = data?.explorer ?? "https://basescan.org";
  const addressUrl = data?.addressUrl ?? `${explorer}/address/${address}`;

  // ── How complete is this list? ──────────────────────────────────────────────
  //
  // THREE states, not two — and the derivation is NOT here. It is in
  // `lib/wallet/read-state.ts`, shared with the two sibling tables, guarded by
  // `scripts/read-state-test.ts`, and imported rather than restated because
  // this exact question had been answered locally three times and two of the
  // three answers were wrong. This file was the one that got it right; that did
  // nothing for the other two, which is the argument for a module.
  //
  // MEASURED 2026-09-07 against production, on a real connected address:
  //   GET /api/wallet/holdings?address=0x2266…608E&network=base
  //   → {"holdings":[], "source":"rpc", "partial":true, …}
  // Moralis had not answered, so the route probed a curated-majors list only
  // (lib/wallet/holdings.ts:129) and said so in the payload. This table dropped
  // that and rendered "No tokens on Base yet" — stating as fact about the
  // user's wallet something the read could not establish.
  //
  // What this file still owns is the MAPPING from its own payload onto the
  // shared signals, which is the part that is genuinely per-endpoint:
  //
  //   `error`  → failed. Consulted as well as `partial` because two paths
  //              produce a response that is NOT a complete read while carrying
  //              `partial: false`: the route's own catch
  //              (api/wallet/holdings/route.ts:39) and its invalid-address
  //              guard (:24).
  //   `partial`→ partial. The route sets it when it fell back to the curated
  //              majors list.
  //   received → `data !== null`. The effect has not run yet otherwise: the
  //              address exists (guarded above) and the only other writer of
  //              `null` is the !address reset. Without this the first paint has
  //              loading=false and data=null, which lands on the empty branch
  //              and flashes "No tokens on Base yet" before the request has
  //              even been made.
  const read = resolveRead({
    loading,
    received: data !== null,
    failed:   !!data?.error,
    partial:  !!data?.partial,
    rowCount: holdings.length,
  });

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-slate-500 tracking-widest">TOKENS</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded text-[#4FC3F7]"
            style={{ border: "1px solid #4FC3F730", background: "#4FC3F710" }}>{chainLabel}</span>
        </div>
        {read.body === "rows" && (
          // On a degraded read this is the sum of the rows we could see, not the
          // value of the wallet — the same list that needs a caveat underneath
          // cannot produce an uncaveated total. "≥" is the entire claim being
          // made: the true figure cannot be lower than this, and we do not know
          // how much higher.
          //
          // TWO reasons it can be short, either sufficient, and the second was
          // missing until 2026-09-13: an incomplete LIST (`read.totalIsFloor`,
          // from read-state.ts) and rows in a complete list that we could not
          // PRICE. MEASURED on 0xb058…3b5f/base — 41 rows, 29 unpriced — this
          // header printed a flat, confident "$8.24" summed over the 12 it could
          // price. `net-worth.ts:129` already made "some tokens have no price"
          // a floor for the headline figure; the per-table totals did not.
          <span className="font-mono text-[10px] text-slate-400 tabular-nums"
            title={
              read.totalIsFloor && unpricedInTotal ? "At least this much — the token list is incomplete AND some tokens have no price"
              : read.totalIsFloor ? "Partial read — at least this much; the full token list was not available"
              : unpricedInTotal ? "At least this much — some tokens here have no price, so they add nothing to this figure"
              : undefined}>
            {read.totalIsFloor || unpricedInTotal ? "≥ " : ""}{maskFigure(fmtUsd(totalUsd), hideAmounts)}
          </span>
        )}
      </div>

      {/* Column head — only over something it actually heads. The loading line
          keeps it (unchanged appearance while the request is in flight); the
          two "unknown" banners below do not, because column titles over a
          "could not read" notice render as a table that failed rather than as
          the sentence it is. */}
      {(read.body === "pending" || read.body === "rows") && (
        <div className={`grid ${gridCls} gap-3 px-1 pb-1.5 font-mono text-[9px] text-slate-600 border-b border-[#1A1A2E]`}>
          <span>Token</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Value</span>
          {showSell && <span className="text-right">Sell</span>}
        </div>
      )}

      {/* Rows — or, when there are none, WHICH of the three no-row states it is.
          "empty", "we only checked part of it" and "we could not check" are
          three different facts about the user's wallet and only one of them is
          about the wallet at all.

          Branching on `read.body` rather than on a stack of independent
          booleans is the structural half of the fix: `body` is a single value,
          so there is no arrangement of flags that renders the empty message and
          suppresses the caveat that contradicts it — which is precisely what
          the old `partial && holdings.length > 0` did. */}
      {read.body === "pending" ? (
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">loading portfolio…</div>
      ) : read.body === "failed" ? (
        <div className="mt-2 rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          {chainLabel} holdings could not be read. What this wallet holds there is unknown —
          this is not an empty portfolio.{" "}
          <a href={addressUrl} target="_blank" rel="noopener noreferrer"
            className="underline hover:text-amber-400">check on the explorer ↗</a>
        </div>
      ) : read.body === "partial" ? (
        // A degraded read that found nothing. This is the banner form of the
        // footnote below, and the SAME sentence from the SAME writer — finding
        // nothing in a list you already know is short is not the same as holding
        // nothing, whichever source cut the list short. The trailing clause is
        // this table's, because it is the part that is about the branch rather
        // than about the read.
        <div className="mt-2 rounded-lg px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-500/80"
          style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
          {data?.partialReason ?? "This read is known to be incomplete."}{" "}
          Nothing was found in what could be checked — so anything else in this wallet is
          unknown, not absent.{" "}
          <a href={addressUrl} target="_blank" rel="noopener noreferrer"
            className="underline hover:text-amber-400">full list on the explorer ↗</a>
        </div>
      ) : read.body === "empty" ? (
        // Reachable ONLY from a complete read that found nothing — the module
        // makes that a property of the type, not of the ordering of the
        // ternaries above it. This is the one branch entitled to speak about
        // the wallet itself.
        <div className="py-6 text-center font-mono text-[10px] text-slate-600">No tokens on {chainLabel} yet</div>
      ) : shown.length === 0 ? (
        // Rows exist, the filter hid every one of them. NOT the "empty" branch —
        // that branch is a statement about the wallet ("No tokens on Base yet")
        // and this one is a statement about the filter. Rendering an empty
        // <div> here would have been the worst of both: a table that looks
        // broken, next to a total that still shows money.
        // The reason is composed from the two counts rather than asserted: this
        // line used to read "All N tokens here are under $1", which on the
        // measured wallet would have been false for 29 of the 41 rows it was
        // describing — they are not under a dollar, they have no price at all.
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
        <div className="divide-y divide-[#1A1A2E]">
          {shown.map(h => {
            const badge    = TRUST_BADGE[h.trust];
            const impostor = h.trust === "impostor";
            return (
            <div key={h.address || h.symbol}
              className={`grid ${gridCls} gap-3 items-center px-1 py-2 hover:bg-[#0d0d12] transition-colors ${impostor ? "opacity-60" : ""}`}>
              {/* Token — links to explorer */}
              <a href={`${explorer}/token/${h.address}?a=${address}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 min-w-0">
                {h.logo
                  ? // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.logo} alt="" className="w-6 h-6 rounded-full shrink-0"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-mono text-[9px] text-slate-400"
                      style={{ background: "#1A1A2E" }}>{h.symbol.slice(0, 3).toUpperCase()}</span>}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold truncate"
                      style={{ color: impostor ? "#94a3b8" : "#e2e8f0" }}>{h.symbol}</span>
                    {h.isB20 && <span className="font-mono text-[8px] px-1 rounded text-[#4FC3F7] shrink-0"
                      style={{ border: "1px solid #4FC3F730" }}>B20</span>}
                    {h.isNative && <span className="font-mono text-[8px] px-1 rounded text-slate-500 shrink-0"
                      style={{ border: "1px solid #1A1A2E" }}>native</span>}
                    {badge && <span className="font-mono text-[8px] px-1 rounded shrink-0"
                      style={{ color: badge.color, border: `1px solid ${badge.color}55` }}>{badge.label}</span>}
                  </div>
                  {h.name && <div className="font-mono text-[9px] text-slate-600 truncate">{h.name}</div>}
                </div>
              </a>
              {/* Balance — masked too. A token quantity beside a public market
                  price is the same disclosure with one extra step, so hiding
                  only the dollar column would not hide anything. */}
              <span className="font-mono text-[10px] text-slate-300 text-right tabular-nums">
                {maskFigure(fmtAmount(h.amount), hideAmounts)}
              </span>
              {/* Value — an impostor's price is its own claim, so it isn't shown.
                  The mask wraps only the branch that prints a figure: "—" means
                  "we have no price", and a masked "—" would turn that absence
                  into a secret the user thinks they are keeping. */}
              <span className="font-mono text-[10px] text-right tabular-nums"
                style={{ color: impostor ? "#64748b" : h.usdValue != null ? "#34D399" : "#64748b" }}>
                {impostor || h.usdValue == null ? "—" : maskFigure(fmtUsd(h.usdValue), hideAmounts)}
              </span>
              {/* Sell — pre-fills the Convert panel; user reviews + signs there.
                  Withheld on an impostor: being mistaken for another token is the
                  whole point of that token, and a trade button is the payoff.
                  The empty <span> keeps the row's grid slot so columns stay
                  aligned — the CONTROL is absent from the DOM, not hidden. */}
              {showSell && (canQuickSell(h.trust)
                ? <SellControl h={h} onQuickSell={onQuickSell!} />
                : <span className="justify-self-end font-mono text-[9px] text-slate-700" title="Name does not match this contract — trading disabled here">—</span>)}
            </div>
            );
          })}
        </div>
      )}

      {/* Partial / source note — the SAME caveat as the two banners above, in the
          form it takes when there are rows for it to qualify.
          `read.footnote` is `rows && !complete`, and the row count in it is the
          exact inverse of the bug this file fixes. The old code was
          `data?.partial && holdings.length > 0`, and the row count there
          SUPPRESSED the caveat entirely when the degraded read came back empty —
          leaving "No tokens on Base yet" standing unqualified, which is the case
          where the caveat mattered most. In the module the count only ROUTES the
          caveat: no rows means it is not a footnote, it is the whole message,
          and the banner branches above say it in full. The test pins both
          halves — "never a banner and a footnote at once", and "an incomplete
          read with rows always carries the footnote". */}
      {read.footnote && (
        <div className="mt-2 font-mono text-[9px] text-amber-500/80 leading-relaxed">
          {/* The caveat is the READER's sentence, not this table's. It used to be
              the literal string "Showing majors only — the full token list needs
              Moralis", which was true while `partial` had exactly one cause and
              became a confident, specific lie the moment on-chain discovery
              became the second source: a list built from an explorer index plus
              Multicall3 is neither majors-only nor waiting on Moralis. The UI
              cannot tell these apart — only the reader knows which source
              answered and what it could not cover — so the reader says it and
              this renders it. The fallback is for older payloads only. */}
          {read.state === "failed"
            ? "This list is incomplete — part of the read failed. Other tokens may be held here."
            : data?.partialReason ?? "This list may be incomplete. Other tokens may be held here."}{" "}
          <a href={addressUrl} target="_blank" rel="noopener noreferrer"
            className="underline hover:text-amber-400">full list on the explorer ↗</a>
        </div>
      )}

      {/* Hidden-rows note. A filter the user cannot SEE is a filter that makes
          the app look wrong — "my token is missing" is the same experience as a
          bug. So the count of what is hidden is always visible, with the way out
          next to it, and the sentence comes from `hiddenNote` so all three
          tables word it identically and the two clauses cannot be collapsed
          into one: a dust row is still inside the total, an unpriced row never
          was. `shown.length > 0` because the all-hidden branch above already
          says this in full; two copies of the same sentence is not twice the
          honesty. */}
      {note && shown.length > 0 && (
        <div className="mt-2 font-mono text-[9px] text-slate-600 leading-relaxed">
          {note}{" "}
          {onShowDust && (
            <button type="button" onClick={onShowDust}
              className="underline text-slate-500 hover:text-[#4FC3F7] transition-colors">show all</button>
          )}
        </div>
      )}

      {/* Say WHY a row is flagged, once, instead of leaving the badge to be guessed at. */}
      {nFlagged > 0 && (
        <div className="mt-2 font-mono text-[9px] text-red-400/80 leading-relaxed">
          {nFlagged} token{nFlagged > 1 ? "s" : ""} use{nFlagged > 1 ? "" : "s"} the name of a real
          asset at a different contract address. Not counted in the total, and not tradable here.
        </div>
      )}
    </div>
  );
}
