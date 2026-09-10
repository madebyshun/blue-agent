"use client";

/**
 * Blue Hood — contextual sidebar.
 *
 * Mirrors the Chat sidebar convention (w-72, `#050508` bg, `#1A1A2E`
 * border, pulse dot at the top) so the whole app feels consistent. Blue
 * Hood's version replaces "conversations" with two live sections:
 *
 *   • WATCHLIST — every registry ticker with a color-coded status dot
 *     (verdict → dot). Click a row to scroll the drift board to that ticker.
 *   • RECENT ARROWS — last 8 non-test arrows with serial + relative time.
 *
 * The sidebar is a read-only client component; it consumes state props
 * from the parent so both panes render off the same fetch and stay in
 * sync (single source of truth = HoodClient's fetch loop).
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Arrow, HoodSnapshot, M5Verdict, TickerSnapshot } from "@/lib/blue-hood/types";
import { rowKey, chainOf } from "@/lib/blue-hood/types";

const RH_GREEN = "#34D399";
const BLUE = "#4FC3F7";
const AMBER = "#f5b342";
const RED = "#F87171";
const GREEN = "#34D399";
const MUTED = "#475569";
const INK2 = "#94A3B8";
const INK1 = "#E2E8F0";
const BORDER = "#1A1A2E";
const BG = "#050508";
const DUST_TVL_USD = 5_000;

// #RRGGBB → rgba() at a given alpha — for the tinted pill border derived from
// the dynamic market-status color. Falls back to the raw string for any
// non-6-digit-hex input so a named color can never crash the inline style.
function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Dust check matches the rule-engine gate: TOTAL token liquidity, not
// primary pool. Otherwise NVDA (bankr-robinhood WETH $21M + USDG $850k
// primary) would incorrectly badge dust in the sidebar picker.
function rowTotalTvlUi(r: TickerSnapshot): number {
  return r.total_tvl_usd ?? r.tvl_usd ?? 0;
}

function isDust(r: TickerSnapshot): boolean {
  return r.verdict !== "ERROR" && r.dex_usd !== null && rowTotalTvlUi(r) < DUST_TVL_USD;
}
function isNoData(r: TickerSnapshot): boolean {
  return r.verdict === "ERROR" || r.verdict === "INSUFFICIENT_DATA" || r.dex_usd === null;
}

function verdictDotColor(v: M5Verdict | "ERROR"): string {
  switch (v) {
    case "ALIGNED":
    case "LONG_DEX":
      return GREEN;
    case "SHORT_DEX":
      return RED;
    case "PREMARKET_DRIFT":
    case "AFTERHOURS_DRIFT":
      return AMBER;
    case "FROZEN_ALIGNED":
      return "#4b5563";
    case "INSUFFICIENT_DATA":
      return "#334155";
    default:
      return RED;
  }
}

export default function HoodSidebar({
  snap,
  arrows,
  marketLabel,
  marketColor,
  onSelectTicker,
  inboxUnread = 0,
}: {
  snap: HoodSnapshot | null;
  arrows: Arrow[] | null;
  marketLabel: string;
  marketColor: string;
  onSelectTicker: (ticker: string) => void;
  /** Unread arrow count for the Inbox nav badge. Optional; 0 = no badge. */
  inboxUnread?: number;
}) {
  // The sidebar is shared across /hood, /hood/inbox and /hood/arrows (via
  // HoodShellFrame), so the active nav pill has to follow the route, not sit
  // hard-coded on "Drift board" the way it used to on the two sub-pages.
  const pathname = usePathname();
  const section = pathname?.startsWith("/hood/inbox")
    ? "inbox"
    : pathname?.startsWith("/hood/arrows")
      ? "record"
      : "board";

  const rows: TickerSnapshot[] = snap?.tickers ?? [];

  // T2 — collapsible dust group. Tradable rows go up top; dust rows are
  // grouped, sorted, and hidden by default with a "· N dust pools" toggle.
  // NO DATA rows also cluster so a rate-limited cycle stays visible but
  // doesn't mingle with tradable rows.
  const tradable = rows.filter((r) => !isDust(r) && !isNoData(r));
  const dust = rows.filter(isDust);
  const noData = rows.filter(isNoData);
  const [dustOpen, setDustOpen] = useState(false);
  const [noDataOpen, setNoDataOpen] = useState(false);

  return (
    <aside
      className="hidden lg:flex flex-col w-[236px] shrink-0 h-full border-r"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      {/* Header — BLUEHOOD wordmark (HOOD in Blue-Agent primary) + live
          market-status pill. The pill is styled like the handoff's amber
          "AFTER HOURS" chip but colored dynamically by the real market
          session (marketLabel/marketColor), so it reads OPEN/PREMARKET/
          CLOSED honestly instead of a fixed label. */}
      <div
        className="flex items-center justify-between flex-wrap gap-2 min-h-[48px] px-3.5 py-2 border-b shrink-0"
        style={{ borderColor: BORDER }}
      >
        <span
          className="font-mono font-semibold text-[10.5px] tracking-[0.14em]"
          style={{ color: INK1 }}
        >
          BLUE<span style={{ color: BLUE }}>HOOD</span>
        </span>
        <span
          className="font-mono font-medium text-[8.5px] rounded-full px-[7px] py-0.5 whitespace-nowrap"
          style={{ color: marketColor, border: `1px solid ${alpha(marketColor, 0.3)}` }}
        >
          {marketLabel}
        </span>
      </div>

      {/* Nav strip — Drift board · Inbox (n) · Track record. Active pill
          follows the route (see `section` above). Before the sidebar had
          no path to /hood/inbox or /hood/arrows at all; RECENT ARROWS was
          the only clue another view existed (real bug 2026-07-23). */}
      <nav
        className="px-3 pt-3 flex flex-col gap-0.5"
        aria-label="Blue Hood sections"
      >
        <HoodNavItem href="/hood" label="Drift board" active={section === "board"} />
        <HoodNavItem href="/hood/inbox" label="Inbox" active={section === "inbox"} badge={inboxUnread} />
        <HoodNavItem href="/hood/arrows" label="Track record" active={section === "record"} />
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Watchlist — tradable first, then dust (collapsed by default),
            then NO DATA (also collapsed). Header stays sortable by |drift|. */}
        <div className="px-2 pt-3">
          <SectionLabel label="WATCHLIST" count={rows.length} />

          {rows.length === 0 ? (
            <SidebarEmpty text="Poller warming up…" />
          ) : (
            <>
              {tradable.length === 0 && (
                <SidebarEmpty text="No tradable rows this cycle." />
              )}
              <ul className="pb-1">
                {tradable
                  .slice()
                  .sort((a, b) => Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0))
                  .map((r) => (
                    <WatchRow key={rowKey(r)} r={r} kind="tradable" onSelect={onSelectTicker} />
                  ))}
              </ul>

              {dust.length > 0 && (
                <>
                  <button
                    onClick={() => setDustOpen((v) => !v)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff06]"
                    style={{ color: MUTED }}
                  >
                    <span className="font-mono text-[10px] tracking-widest">
                      {dustOpen ? "▾" : "▸"} · {dust.length} DUST POOLS
                    </span>
                  </button>
                  {dustOpen && (
                    <ul className="pb-1">
                      {dust
                        .slice()
                        .sort((a, b) => rowTotalTvlUi(b) - rowTotalTvlUi(a))
                        .map((r) => (
                          <WatchRow key={rowKey(r)} r={r} kind="dust" onSelect={onSelectTicker} />
                        ))}
                    </ul>
                  )}
                </>
              )}

              {noData.length > 0 && (
                <>
                  {(() => {
                    // T-B.1 #4 — surface the split so a throttle-tail
                    // (many fetch_failed) is legible at a glance.
                    const failed = noData.filter((r) => r.no_data_reason === "fetch_failed").length;
                    const noPool = noData.filter((r) => r.no_data_reason === "no_pool").length;
                    const label = failed > 0 && noPool > 0
                      ? `${noData.length} NO DATA · ${failed} fetch fail · ${noPool} no pool`
                      : failed > 0
                        ? `${noData.length} FETCH FAILED`
                        : `${noData.length} NO POOL`;
                    return (
                      <button
                        onClick={() => setNoDataOpen((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff06]"
                        style={{ color: MUTED }}
                      >
                        <span className="font-mono text-[10px] tracking-widest">
                          {noDataOpen ? "▾" : "▸"} · {label}
                        </span>
                      </button>
                    );
                  })()}
                  {noDataOpen && (
                    <ul className="pb-1">
                      {noData.map((r) => (
                        <WatchRow key={rowKey(r)} r={r} kind="no_data" onSelect={onSelectTicker} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Recent arrows — the same list that lives in the main pane's feed,
            trimmed to a strip for quick scanning without scrolling to the
            arrows section. */}
        <div className="px-2 pt-3 border-t" style={{ borderColor: BORDER }}>
          <SectionLabel
            label="RECENT ARROWS"
            count={arrows?.length ?? 0}
          />
          {!arrows || arrows.length === 0 ? (
            <SidebarEmpty text="No arrows yet." />
          ) : (
            <ul className="pb-3">
              {arrows.slice(0, 8).map((a) => {
                // T-A — hover tooltip shows brief.verdict_note if attached,
                // else falls back to outcome_detail (once graded) or type.
                const tooltip = a.brief?.verdict_note
                  ?? a.outcome_detail
                  ?? `${a.type} · ${a.expected_direction ?? ""}`;
                // Deep-link to the inbox card for this arrow. Before this,
                // the row was `<button onClick={onSelectTicker(a.ticker)}>`
                // which just scrolled the board to the ticker — you lost
                // the arrow context and had no path to Review & Sign.
                // The `#${a.id}` anchor is respected by InboxClient (see
                // its `rowRefs` scroll-to-hash logic). 2026-07-23 fix.
                return (
                  <li key={a.id}>
                    <Link
                      href={`/hood/inbox#${a.id}`}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff08]"
                      title={tooltip}
                    >
                      <span
                        className="font-mono text-[10px] tracking-wide shrink-0"
                        style={{ color: INK2 }}
                      >
                        {a.serial}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: INK2 }}>{a.ticker}</span>
                      <span className="font-mono text-[10px] uppercase" style={{ color: MUTED }}>
                        {a.type}
                      </span>
                      <span
                        className="ml-auto font-mono text-[10px] tracking-wider"
                        style={outcomeStyle(a)}
                      >
                        {outcomeLabel(a)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Footer — mirrors Blue Chat's sidebar credit-bar (px-5 py-3.5,
          border-t, shrink-0 to stay glued to the bottom). Live-cycle
          indicator dot on the left; tokens-tracked count in the middle;
          gear-icon docs link on the right. Same visual weight as the
          Chat surface for consistency. */}
      <Link
        href="/docs/blue-hood"
        className="px-3.5 py-3 border-t shrink-0 flex items-center gap-2.5 hover:bg-[#ffffff05] transition-colors group"
        style={{ borderColor: BORDER }}
        title="Docs — Blue Hood"
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 transition-all animate-pulse"
          style={{
            backgroundColor: snap ? RH_GREEN : "#334155",
            boxShadow: snap ? `0 0 6px ${RH_GREEN}80` : undefined,
          }}
        />
        <span className="font-mono text-[9.5px] flex-1 text-left" style={{ color: MUTED }}>
          {/* Denominator is the feed-eligible pool, not the whole registry —
              the poller can't watch a row with no Chainlink feed. Matches the
              "TOKENS WATCHED" card in HoodClient; keep the two in step. */}
          {snap
            ? `${snap.metrics.tokens_watched}/${snap.metrics.tokens_eligible ?? snap.metrics.registry_total} tokens · 30 Hub skills`
            : "warming up…"}
        </span>
        <span className="font-mono text-[9px] text-slate-700 group-hover:text-slate-500 transition-colors">
          docs
        </span>
      </Link>
    </aside>
  );
}

function HoodNavItem({
  href,
  label,
  active,
  badge = 0,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="relative flex items-center rounded-lg px-2.5 py-2 transition-colors hover:bg-[#ffffff08]"
      style={
        active
          ? { background: "rgba(79,195,247,.10)", boxShadow: "inset 0 0 0 1px rgba(79,195,247,.22)" }
          : undefined
      }
    >
      <span className="font-mono font-medium text-[11px]" style={{ color: INK1 }}>
        {label}
      </span>
      {badge > 0 && (
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold"
          style={{ color: BG, backgroundColor: BLUE }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function WatchRow({
  r,
  kind,
  onSelect,
}: {
  r: TickerSnapshot;
  kind: "tradable" | "dust" | "no_data";
  onSelect: (t: string) => void;
}) {
  const chain = chainOf(r) === "base" ? "BASE" : "RH";
  const drift = r.drift_pct ?? 0;
  const dotColor =
    kind === "no_data"
      ? "#3f4550" // T3 — plain gray dot (we don't know direction/thinness yet)
      : verdictDotColor(r.verdict);
  const rowOpacity = kind === "tradable" ? 1 : 0.7;

  return (
    <li>
      <button
        // Base P1 — hand the caller the (chain, ticker) identity, not the bare
        // ticker: the parent looks this up in `rowRefs` to scroll the board,
        // and both chains list NVDA/META/GOOGL/AAPL. RH ⟹ bare ticker, so
        // clicking an RH watchlist row behaves exactly as it did before.
        onClick={() => onSelect(rowKey(r))}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff08]"
        style={{ opacity: rowOpacity }}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${kind === "no_data" ? "" : ""}`}
          style={{ backgroundColor: dotColor }}
          title={kind === "no_data" ? "No pool data this cycle" : r.verdict}
        />
        <span className="font-mono text-[10.5px] tracking-wide" style={{ color: INK1 }}>
          {r.ticker}
        </span>
        <span
          className="font-mono text-[8.5px] font-medium tracking-wide"
          style={{ color: chain === "BASE" ? BLUE : MUTED }}
          title={chain === "BASE" ? "Coinbase B20 · Base 8453" : "Robinhood Chain 4663"}
        >
          {chain}
        </span>
        {kind === "dust" && (
          <span
            className="font-mono text-[9px] uppercase tracking-widest ml-1"
            style={{ color: AMBER }}
            title={`Below $${DUST_TVL_USD.toLocaleString()} pool TVL — engine gate`}
          >
            dust
          </span>
        )}
        {kind === "no_data" ? (
          <span
            className="ml-auto font-mono text-[10.5px]"
            style={{ color: MUTED }}
          >
            ·
          </span>
        ) : (
          <span
            className="ml-auto font-mono text-[10.5px] tabular-nums"
            style={{ color: driftColor(drift) }}
          >
            {drift === 0 ? "—" : `${drift > 0 ? "+" : ""}${drift.toFixed(2)}%`}
          </span>
        )}
      </button>
    </li>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="flex items-center justify-between px-3 pt-1 pb-1.5 font-mono font-medium text-[9px] tracking-[0.16em]"
      style={{ color: MUTED }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </div>
  );
}

function SidebarEmpty({ text }: { text: string }) {
  return (
    <p
      className="px-3 py-2 font-mono text-[11px]"
      style={{ color: MUTED }}
    >
      {text}
    </p>
  );
}

function driftColor(pct: number): string {
  if (Math.abs(pct) < 0.5) return "#94a3b8";
  return pct > 0 ? GREEN : RED;
}

function outcomeLabel(a: Arrow): string {
  if (a.status === "open") return "WATCHING";
  if (a.outcome === "hit") return "HIT";
  if (a.outcome === "miss") return "MISS";
  if (a.outcome === "informational") return "INFO";
  return "—";
}

function outcomeStyle(a: Arrow): React.CSSProperties {
  if (a.status === "open") return { color: BLUE };
  if (a.outcome === "hit") return { color: GREEN };
  if (a.outcome === "miss") return { color: RED };
  return { color: MUTED };
}
