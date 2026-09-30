"use client";

/**
 * Discovery → action (G0, 2026-09-30 — docs/rebuild-5-tang-2026-09-30.md §0b).
 *
 * The six discovery tools Chat gained (five Robinhood Chain ones and
 * safe-trending on Base) return lists of tokens. Before this card the model
 * restated them as prose and the user had to copy a contract into a new
 * message to trade one. Now each row carries a Swap button that opens the swap
 * card for THAT row: its chain, its contract. Never a ticker — a ticker does
 * not identify a token, and on these two chains the same ticker exists twice.
 *
 * What a row may NOT do is look like advice. Rows state facts from the tool;
 * the Swap button is the same neutral control the wallet has. A token the tool
 * itself measured as a honeypot gets no Swap button, and a factory deployment
 * our registry has not admitted yet gets none either (the pre-trade check, G2,
 * refuses stock tokens outside the registry — offering the button would only
 * lead to that refusal).
 */
import { useState, type ReactNode } from "react";

export type DiscoveryRow = {
  key: string;
  chain: "base" | "robinhood";
  /** The contract — the ONLY thing a Swap is armed with. */
  address: string | null;
  symbol: string;
  /** What kind of asset this is, in the issuer's terms (plan §1 table). */
  label?: string;
  facts: string[];
  swappable: boolean;
  /** Why there is no Swap button, when there is none. */
  noSwapReason?: string;
  /** Robinhood only: the pool's quote asset, which decides the swap card. */
  quoteVia?: "USDG" | "ETH";
};

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const usd = (v: unknown) => {
  const n = num(v);
  if (n == null) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`;
};
const pct = (v: unknown) => {
  const n = num(v);
  return n == null ? null : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const ADDR = /^0x[a-fA-F0-9]{40}$/;
const addrOrNull = (v: unknown) => (typeof v === "string" && ADDR.test(v) ? v : null);

/** Robinhood Chain stock/ETF tokens are Robinhood Assets (Jersey) debt
 *  securities that track a US share — the label says exactly that. */
function rhLabel(kind: unknown, ticker: string): string {
  return `${kind === "etf" ? "ETF token" : "Stock token"} (Robinhood, Jersey) · tracks ${ticker}`;
}

function rhRow(r: Json, extra: string[] = [], quoteVia: "USDG" | "ETH" = "USDG"): DiscoveryRow {
  const ticker = str(r.ticker) || "?";
  const address = addrOrNull(r.contract);
  return {
    key: `rh:${address ?? ticker}`,
    chain: "robinhood",
    address,
    symbol: ticker,
    label: rhLabel(r.kind, ticker),
    facts: [str(r.name), ...extra].filter(Boolean),
    swappable: !!address,
    noSwapReason: address ? undefined : "no token contract yet (oracle feed only)",
    quoteVia,
  };
}

/** The rows for one discovery tool's result, or null for any other tool. */
export function discoveryRows(tool: string, r: Json): { title: string; rows: DiscoveryRow[]; more: number; note?: string } | null {
  switch (tool) {
    case "hub_rh_movers": {
      const side = (list: unknown, tag: string) =>
        (Array.isArray(list) ? list : []).map((x: Json) =>
          rhRow(x, [
            tag,
            pct(x.change_24h_pct) ? `24h ${pct(x.change_24h_pct)}` : "",
            usd(x.price_usd) ? `price ${usd(x.price_usd)}` : "",
            usd(x.tvl_usd) ? `pool ${usd(x.tvl_usd)}` : "",
          ].filter(Boolean), /WETH/i.test(str(x.pool_name)) ? "ETH" : "USDG"));
      const rows = [...side(r.gainers, "gainer"), ...side(r.losers, "loser")];
      return { title: "Robinhood Chain movers · 24h", rows, more: 0, note: str(r.note) || undefined };
    }
    case "hub_rh_new_listings": {
      const unlisted = new Set(
        (Array.isArray(r.new_only) ? r.new_only : []).map((x: Json) => str(x.contract).toLowerCase()),
      );
      const rows = (Array.isArray(r.recent_deployments) ? r.recent_deployments : []).map((x: Json) => {
        const row = rhRow(x, [str(x.deployed_at).slice(0, 10) ? `deployed ${str(x.deployed_at).slice(0, 10)}` : ""].filter(Boolean));
        if (row.address && unlisted.has(row.address.toLowerCase())) {
          return { ...row, swappable: false, noSwapReason: "not yet in BlueAgent's token registry" };
        }
        return row;
      });
      return { title: "New Robinhood Chain listings", rows, more: 0, note: str(r.note) || undefined };
    }
    case "hub_rh_search": {
      const rows = (Array.isArray(r.matches) ? r.matches : []).map((x: Json) => rhRow(x));
      return { title: "Robinhood Chain token search", rows, more: 0 };
    }
    case "hub_rh_quote": {
      if (!r.ticker) return { title: "Robinhood Chain quote", rows: [], more: 0, note: str(r.error) || undefined };
      const stale = r.stale === true ? "oracle STALE" : "";
      return {
        title: "Robinhood Chain oracle quote",
        rows: [rhRow(r, [usd(r.price_usd) ? `oracle ${usd(r.price_usd)}` : "", stale].filter(Boolean))],
        more: 0,
      };
    }
    case "hub_rh_index": {
      const all = [
        ...(Array.isArray(r.stocks) ? r.stocks : []),
        ...(Array.isArray(r.etfs) ? r.etfs : []),
      ] as Json[];
      const SHOW = 12;
      return {
        title: "Robinhood Chain stock & ETF tokens",
        rows: all.slice(0, SHOW).map((x) => rhRow(x)),
        more: Math.max(0, all.length - SHOW),
      };
    }
    case "hub_safe_trending": {
      const rows = (Array.isArray(r.tokens) ? r.tokens : [])
        .filter((x: Json) => x.status === "ok")
        .map((x: Json) => {
          const address = addrOrNull(x.address);
          const hp = (x.honeypot as Json | null)?.verdict;
          const honeypot = hp === "HONEYPOT";
          return {
            key: `base:${address ?? str(x.symbol)}`,
            chain: "base" as const,
            address,
            symbol: str(x.symbol) || "?",
            facts: [
              usd(x.price_usd) ? `price ${usd(x.price_usd)}` : "",
              pct(x.change_24h) ? `24h ${pct(x.change_24h)}` : "",
              usd(x.liquidity_usd) ? `liquidity ${usd(x.liquidity_usd)}` : "",
              typeof hp === "string" ? `tax check ${hp}` : "",
              typeof x.exit_risk === "string" ? `exit risk ${x.exit_risk}` : "",
            ].filter(Boolean),
            swappable: !!address && !honeypot,
            noSwapReason: honeypot ? "measured as a honeypot" : address ? undefined : "no contract",
          };
        });
      return { title: "Trending on Base · tax measured", rows, more: 0 };
    }
    default:
      return null;
  }
}

export function DiscoveryCard({
  title, rows, more, note, renderSwap,
}: {
  title: string;
  rows: DiscoveryRow[];
  more: number;
  note?: string;
  /** The swap card for one row — supplied by ToolCards, which owns them. */
  renderSwap: (row: DiscoveryRow) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-2 uppercase">{title}</div>
      {rows.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-500">{note ?? "Nothing to show right now."}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border border-[#1A1A2E] px-2.5 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] text-slate-200">
                    <span className="font-bold">{row.symbol}</span>
                    <span className="text-slate-600"> · {row.chain === "base" ? "Base" : "Robinhood Chain"}</span>
                  </div>
                  {row.label && <div className="font-mono text-[9px] text-slate-500">{row.label}</div>}
                  {row.facts.length > 0 && <div className="font-mono text-[10px] text-slate-400 mt-0.5">{row.facts.join(" · ")}</div>}
                </div>
                {row.swappable ? (
                  <button
                    type="button"
                    onClick={() => setOpen(open === row.key ? null : row.key)}
                    className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                    style={{ background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F740" }}
                  >
                    {open === row.key ? "Close" : "Swap"}
                  </button>
                ) : (
                  <span className="font-mono text-[9px] text-slate-600 shrink-0" title={row.noSwapReason}>no swap</span>
                )}
              </div>
              {open === row.key && row.swappable && <div className="mt-2">{renderSwap(row)}</div>}
            </div>
          ))}
        </div>
      )}
      {more > 0 && <p className="font-mono text-[10px] text-slate-600 mt-2">…and {more} more — search by name to find one.</p>}
      <p className="font-mono text-[9px] text-slate-600 mt-2">Facts from the tool, not a buy signal · each Swap opens with that row&apos;s chain and contract; you review and sign.</p>
    </div>
  );
}
