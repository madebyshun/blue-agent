// BlueCube display feed — what an ESP32-S3 + ST7735 128×128 cube renders.
//
// The cube is a RENDERING ENDPOINT, not a client with logic: it fetches
// `/api/cube/<mode>`, prints `rows[].text` / `rows[].changeText`, and colours
// the change by the sign of `rows[].change`. Every number is formatted HERE so
// a copy or layout change never needs a firmware reflash, and so the 21-column
// budget of a 128px screen at text size 1 is enforced in one tested place.
//
// Data rules (CLAUDE.md "Tool quality rules"): every value comes from a live
// source, never an LLM; a missing source is `null` → the cube prints "--".
// A row is never dropped to hide a failure — five labels with "--" says
// "source down", while four rows would silently say "there are four coins".
//
// Deliberately NOT shown:
//   - $BLUEAGENT. The address in this repo is the pre-relaunch token
//     (lib/soul.ts: "never present it as the live reward asset").
//   - Hood arrows. Frozen 2026-09-30; the hood mode shows prices only.

import type { TickerSnapshot } from "@/lib/blue-hood/types";

export const CUBE_MODES = ["crypto", "base", "hood"] as const;
export type CubeMode = (typeof CUBE_MODES)[number];

export function isCubeMode(v: string): v is CubeMode {
  return (CUBE_MODES as readonly string[]).includes(v);
}

/** Max rows the 128×128 layout has room for (header 14px + 5 × 21px + footer). */
export const CUBE_MAX_ROWS = 5;

export interface CubeRow {
  /** ≤ 5 chars, left column. */
  label: string;
  /** Raw value, for clients that want to format themselves. */
  value: number | null;
  /** ≤ 9 chars, middle column. "--" when `value` is null. */
  text: string;
  /** Percent, signed. Null when unknown — never 0 for "unknown". */
  change: number | null;
  /** ≤ 7 chars, right column. "" when `change` is null. */
  changeText: string;
}

export interface CubeFeed {
  mode: CubeMode;
  /** ≤ 21 chars, shown in the footer. */
  title: string;
  /** What `change` means for every row in this feed — "24h", "7d", "vs oracle". */
  changeKind: string;
  rows: CubeRow[];
  /** Unix ms the feed was assembled. */
  ts: number;
}

// ─── formatting (21 columns: label 5 · value 9 · change 7) ───────────────────

/** Price in USD, fitted to 9 chars. Mirrors the firmware's old formatPrice. */
export function fmtPrice(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "--";
  if (v >= 1_000_000) return fmtCompact(v);
  if (v >= 10_000) return `$${Math.round(v)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

/** Large USD amounts as $12.3B / $845M / $9.1K. */
export function fmtCompact(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const abs = Math.abs(v);
  const [div, suf] =
    abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  const n = v / div;
  return `$${n >= 100 ? Math.round(n) : n.toFixed(1)}${suf}`;
}

/** Signed percent, fitted to 7 chars: "+1.2%", "-12%", "+999%". */
export function fmtChange(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.min(Math.abs(v), 999);
  return `${sign}${abs >= 10 ? Math.round(abs) : abs.toFixed(1)}%`;
}

function row(label: string, value: number | null, change: number | null, fmt: (v: number | null) => string): CubeRow {
  const c = change != null && Number.isFinite(change) ? change : null;
  return { label, value: value != null && Number.isFinite(value) ? value : null, text: fmt(value), change: c, changeText: fmtChange(c) };
}

// ─── sources (injected so the builders are testable without network) ─────────

export interface CoinQuote { usd: number | null; change24h: number | null }

export interface CubeSources {
  /** CoinGecko ids → quote. Missing id ⟹ unknown. */
  coins(ids: string[]): Promise<Record<string, CoinQuote>>;
  baseTvl(): Promise<{ tvlUsd: number | null; change7dPct: number | null } | null>;
  baseDexVol(): Promise<{ total24h: number | null; change1dPct: number | null } | null>;
  /** Fresh Base B20 desk rows, or null when absent / stale / unreadable. */
  hoodBaseRows(): Promise<TickerSnapshot[] | null>;
}

const CRYPTO: { label: string; id: string }[] = [
  { label: "BTC", id: "bitcoin" },
  { label: "ETH", id: "ethereum" },
  { label: "SOL", id: "solana" },
  { label: "BNB", id: "binancecoin" },
  { label: "XRP", id: "ripple" },
];

export async function buildCrypto(src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  const q = await src.coins(CRYPTO.map((c) => c.id)).catch(() => ({}) as Record<string, CoinQuote>);
  return {
    mode: "crypto",
    title: "CRYPTO 24H",
    changeKind: "24h",
    rows: CRYPTO.map((c) => row(c.label, q[c.id]?.usd ?? null, q[c.id]?.change24h ?? null, fmtPrice)),
    ts: now,
  };
}

export async function buildBase(src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  const [tvl, dex, q] = await Promise.all([
    src.baseTvl().catch(() => null),
    src.baseDexVol().catch(() => null),
    src.coins(["ethereum", "coinbase-wrapped-btc"]).catch(() => ({}) as Record<string, CoinQuote>),
  ]);
  return {
    mode: "base",
    title: "BASE CHAIN",
    changeKind: "mixed",
    rows: [
      // TVL change is 7d (DefiLlama daily series); DEX volume is day-over-day.
      row("TVL", tvl?.tvlUsd ?? null, tvl?.change7dPct ?? null, fmtCompact),
      row("DEX", dex?.total24h ?? null, dex?.change1dPct ?? null, fmtCompact),
      row("ETH", q["ethereum"]?.usd ?? null, q["ethereum"]?.change24h ?? null, fmtPrice),
      row("cbBTC", q["coinbase-wrapped-btc"]?.usd ?? null, q["coinbase-wrapped-btc"]?.change24h ?? null, fmtPrice),
    ],
    ts: now,
  };
}

/** Base B20 stocks: DEX price, and how far it sits from the Chainlink oracle. */
export async function buildHood(src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  const rows = (await src.hoodBaseRows().catch(() => null)) ?? [];
  const live = rows
    .filter((r) => r.chain === "base" && r.verdict !== "ERROR")
    .sort((a, b) => (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0) || a.ticker.localeCompare(b.ticker))
    .slice(0, CUBE_MAX_ROWS);
  return {
    mode: "hood",
    title: live.length ? "STOCKS ON BASE" : "STOCKS: NO DATA",
    changeKind: "vs oracle",
    rows: live.map((r) => row(r.ticker.slice(0, 5), r.dex_usd ?? r.oracle_usd, r.drift_pct, fmtPrice)),
    ts: now,
  };
}

export function buildFeed(mode: CubeMode, src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  switch (mode) {
    case "crypto": return buildCrypto(src, now);
    case "base": return buildBase(src, now);
    case "hood": return buildHood(src, now);
  }
}
