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
import type { Arrow, HoodSnapshot, M5Verdict, TickerSnapshot } from "@/lib/blue-hood/types";

const RH_GREEN = "#00C805";
const BLUE = "#4FC3F7";
const AMBER = "#f5b342";
const RED = "#ef4444";
const GREEN = "#22c55e";
const MUTED = "#6b7280";
const BORDER = "#1A1A2E";
const DUST_TVL_USD = 5_000;

function isDust(r: TickerSnapshot): boolean {
  return r.verdict !== "ERROR" && r.dex_usd !== null && (r.tvl_usd ?? 0) < DUST_TVL_USD;
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
}: {
  snap: HoodSnapshot | null;
  arrows: Arrow[] | null;
  marketLabel: string;
  marketColor: string;
  onSelectTicker: (ticker: string) => void;
}) {
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
      className="hidden lg:flex flex-col w-72 shrink-0 h-full border-r"
      style={{ backgroundColor: "#050508", borderColor: BORDER }}
    >
      {/* Header row — mirrors Chat sidebar's pulse-dot header */}
      <div
        className="px-5 h-14 flex items-center border-b shrink-0"
        style={{ borderColor: BORDER }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mr-2 animate-pulse"
          style={{ backgroundColor: RH_GREEN }}
        />
        <span className="font-mono text-[12px] text-white tracking-wide">
          BLUE<span style={{ color: RH_GREEN }}>HOOD</span>
        </span>
        <span
          className="ml-auto font-mono text-[9px] tracking-widest"
          style={{ color: marketColor }}
        >
          {marketLabel}
        </span>
      </div>

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
                    <WatchRow key={r.ticker} r={r} kind="tradable" onSelect={onSelectTicker} />
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
                        .sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0))
                        .map((r) => (
                          <WatchRow key={r.ticker} r={r} kind="dust" onSelect={onSelectTicker} />
                        ))}
                    </ul>
                  )}
                </>
              )}

              {noData.length > 0 && (
                <>
                  <button
                    onClick={() => setNoDataOpen((v) => !v)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff06]"
                    style={{ color: MUTED }}
                  >
                    <span className="font-mono text-[10px] tracking-widest">
                      {noDataOpen ? "▾" : "▸"} · {noData.length} NO POOL DATA
                    </span>
                  </button>
                  {noDataOpen && (
                    <ul className="pb-1">
                      {noData.map((r) => (
                        <WatchRow key={r.ticker} r={r} kind="no_data" onSelect={onSelectTicker} />
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
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => onSelectTicker(a.ticker)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff08]"
                      title={tooltip}
                    >
                      <span
                        className="font-mono text-[11px] tracking-wide shrink-0"
                        style={{ color: RH_GREEN }}
                      >
                        {a.serial}
                      </span>
                      <span className="font-mono text-[12px] text-slate-200">{a.ticker}</span>
                      <span className="font-mono text-[10px] uppercase" style={{ color: MUTED }}>
                        {a.type}
                      </span>
                      <span
                        className="ml-auto font-mono text-[10px] tracking-wider"
                        style={outcomeStyle(a)}
                      >
                        {outcomeLabel(a)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Footer attribution — matches the main pane's footer language */}
      <div
        className="px-4 py-3 border-t text-[10px] font-mono"
        style={{ borderColor: BORDER, color: MUTED }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: BLUE }}
          />
          <span>Powered by 30 Blue Hub skills</span>
        </div>
      </div>
    </aside>
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
  const drift = r.drift_pct ?? 0;
  const dotColor =
    kind === "no_data"
      ? "#3f4550" // T3 — plain gray dot (we don't know direction/thinness yet)
      : verdictDotColor(r.verdict);
  const rowOpacity = kind === "tradable" ? 1 : 0.7;

  return (
    <li>
      <button
        onClick={() => onSelect(r.ticker)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-[#ffffff08]"
        style={{ opacity: rowOpacity }}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${kind === "no_data" ? "" : ""}`}
          style={{ backgroundColor: dotColor }}
          title={kind === "no_data" ? "No pool data this cycle" : r.verdict}
        />
        <span className="font-mono text-[12px] text-slate-200 tracking-wide">
          {r.ticker}
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
            className="ml-auto font-mono text-[11px]"
            style={{ color: MUTED }}
          >
            ·
          </span>
        ) : (
          <span
            className="ml-auto font-mono text-[11px] tabular-nums"
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
      className="flex items-center justify-between px-3 pt-1 pb-1.5 font-mono text-[9px] tracking-widest"
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
