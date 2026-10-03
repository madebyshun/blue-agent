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
// Modes:
//   crypto    the owner's coins (CoinGecko — no Base tool prices majors)
//   hood      the owner's tokenized stocks on Base          (tool: hood-live)
//   trending  Base trending tokens, each with its tax read  (tool: safe-trending)
//   status    are the data sources the tools read up?       (tool: blue-doctor)
// A `base` mode (TVL, DEX volume, ETH, cbBTC) was retired 2026-10-03: every
// number on it is free on DefiLlama/DexScreener, so it showed nothing Blue
// Agent knows that a DEX site does not.
//
// Deliberately NOT shown:
//   - $BLUEAGENT. The address in this repo is the pre-relaunch token
//     (lib/soul.ts: "never present it as the live reward asset").
//   - Hood arrows. Frozen 2026-09-30; the hood mode shows prices only.
//   - The word "safe". safe-trending's own header calls its name the most
//     dangerous thing about it: a clean row means "tax verified", never "buy".
//     The cube shows a neutral mark, not a verdict.

import type { TickerSnapshot } from "@/lib/blue-hood/types";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";

export const CUBE_MODES = ["crypto", "hood", "trending", "status"] as const;
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
  /**
   * 24h shape for the cube's big-number layouts, oldest → newest, scaled to
   * 0..100 (0 = the window's low, 100 = its high). Present only when the feed
   * has ≤ SPARK_MAX_ROWS rows — a 5-row list has no room to draw it, so it
   * would be bytes the cube parses and throws away. Absent ≠ flat: absent
   * means "no series", and the cube simply draws no chart.
   */
  spark?: number[];
  /**
   * trending rows only — what the tax read found, as a neutral mark:
   *   clean       tax read from the contract, no flags
   *   flagged     at least one flag (high tax, blacklist-capable, dumping, …)
   *   unverified  the tax could not be read — unverified, NOT clean
   */
  mark?: "clean" | "flagged" | "unverified";
  /** status rows only — the probe result, `unknown` = not measured, not down. */
  state?: "ok" | "degraded" | "down" | "unknown";
}

/** Feeds with at most this many rows carry a sparkline per row. */
export const SPARK_MAX_ROWS = 2;
/** Points per sparkline: one per ~2.7px on a 128px screen. */
export const SPARK_POINTS = 48;

/**
 * Downsample a price series to `SPARK_POINTS` bucket averages and scale it to
 * 0..100. Null when there is no real shape to draw — fewer than 2 finite
 * points — rather than inventing a flat line. A genuinely flat window (low ==
 * high) IS real, so it draws as a level line at 50.
 */
export function toSpark(prices: number[], points = SPARK_POINTS): number[] | null {
  const xs = prices.filter((p) => Number.isFinite(p));
  if (xs.length < 2) return null;
  const n = Math.min(points, xs.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * xs.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * xs.length) / n));
    const slice = xs.slice(a, b);
    out.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  const lo = Math.min(...out), hi = Math.max(...out);
  return out.map((v) => (hi === lo ? 50 : Math.round(((v - lo) / (hi - lo)) * 100)));
}

export interface CubeFeed {
  mode: CubeMode;
  /** Which layout the cube draws: priced rows, or the status board. */
  kind: "list" | "status";
  /** ≤ 21 chars, shown in the footer. */
  title: string;
  /** What `change` means for every row in this feed — "24h", "7d", "vs oracle". */
  changeKind: string;
  rows: CubeRow[];
  /**
   * Where the numbers came from: Blue Agent tool ids (the same handlers sold at
   * /api/x402/<id>, run in-process) or a named upstream where no tool covers
   * the data. Published so "the cube runs on Blue Agent's tools" is checkable
   * per feed rather than a claim about all of them.
   */
  via: string[];
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
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  // Sub-cent prices keep 2 significant digits. `toFixed(4)` printed PEPE
  // ($0.0000097) as "$0.0000" — a price of zero on screen.
  if (v >= 0.00001) return `$${Number(v.toPrecision(2)).toFixed(-Math.floor(Math.log10(v)) + 1)}`;
  if (v > 0) return `$${v.toExponential(1)}`;
  return "$0";
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

/** The fields of a Blue Hood row the cube reads — what `hood-live` publishes. */
export type HoodRow = Pick<TickerSnapshot, "ticker" | "chain" | "verdict" | "oracle_usd" | "dex_usd" | "drift_pct" | "volume_24h_usd">;

/** The fields of a `safe-trending` row the cube reads. */
export interface TrendingRow {
  status: "ok" | "error";
  symbol: string | null;
  price_usd: number | null;
  change_24h: number | null;
  /** `tax_read` is "template" (both tax selectors answered) or "failed" (not
   *  read — today that is every token outside the Virtuals AgentToken
   *  templates, by design of lib/token-tax.ts). It is a string, not a boolean. */
  honeypot: { verdict: string; tax_read: string };
  flags: string[];
}

/** The fields of a `blue-doctor` probe the cube reads. */
export interface DoctorProbe {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  latency_ms: number | null;
}

export interface CubeSources {
  /** CoinGecko ids → quote. Missing id ⟹ unknown. No Blue Agent tool prices
   *  non-Base majors (token-price is Base-only), so this one is direct. */
  coins(ids: string[]): Promise<Record<string, CoinQuote>>;
  /** Blue Agent tool `safe-trending`, in the tool's own ranking. */
  trending(): Promise<TrendingRow[] | null>;
  /** Blue Agent tool `blue-doctor`: every upstream, probed or not. */
  doctor(): Promise<DoctorProbe[] | null>;
  /** Blue Agent tool `hood-live` (chain=base): fresh Base B20 rows, or null. */
  hoodBaseRows(): Promise<HoodRow[] | null>;
  /** 24h USD price series for a CoinGecko id, oldest → newest. Null = unknown. */
  coinHistory(id: string): Promise<number[] | null>;
}

/**
 * Coins a cube owner can pick from. A closed list, not free-form CoinGecko ids:
 * every label here is checked to fit the 5-char column, and every id was
 * confirmed to price on CoinGecko (2026-10-03). It also lets the whole catalog
 * be ONE upstream call that every cube shares, whatever each one picked.
 */
export const CRYPTO_CATALOG: readonly { id: string; label: string }[] = [
  { id: "bitcoin", label: "BTC" },
  { id: "ethereum", label: "ETH" },
  { id: "solana", label: "SOL" },
  { id: "binancecoin", label: "BNB" },
  { id: "ripple", label: "XRP" },
  { id: "dogecoin", label: "DOGE" },
  { id: "cardano", label: "ADA" },
  { id: "avalanche-2", label: "AVAX" },
  { id: "chainlink", label: "LINK" },
  { id: "sui", label: "SUI" },
  { id: "the-open-network", label: "TON" },
  { id: "tron", label: "TRX" },
  { id: "litecoin", label: "LTC" },
  { id: "hyperliquid", label: "HYPE" },
  { id: "uniswap", label: "UNI" },
  { id: "pepe", label: "PEPE" },
  // Base ecosystem
  { id: "coinbase-wrapped-btc", label: "cbBTC" },
  { id: "aerodrome-finance", label: "AERO" },
  { id: "virtual-protocol", label: "VIRT" },
  { id: "zora", label: "ZORA" },
  { id: "degen-base", label: "DEGEN" },
  { id: "based-brett", label: "BRETT" },
];
export const CRYPTO_DEFAULT = ["bitcoin", "ethereum", "solana", "binancecoin", "ripple"];
const ALL_COIN_IDS = CRYPTO_CATALOG.map((c) => c.id);

/**
 * `?pick=a,b,c` → the owner's choices, in their order, validated against
 * `allowed`. Unknown entries are dropped (not 400'd) so a cube holding a pick
 * we later retire keeps showing the rest. Nothing valid ⟹ null ⟹ defaults.
 */
export function parsePicks(raw: string | null | undefined, allowed: readonly string[], norm: (s: string) => string): string[] | null {
  if (!raw) return null;
  const ok = new Set(allowed);
  const out: string[] = [];
  for (const p of raw.split(",")) {
    const v = norm(p.trim());
    if (v && ok.has(v) && !out.includes(v)) out.push(v);
    if (out.length === CUBE_MAX_ROWS) break;
  }
  return out.length ? out : null;
}

export async function buildCrypto(src: CubeSources, picks: string[] | null = null, now = Date.now()): Promise<CubeFeed> {
  const ids = picks ?? CRYPTO_DEFAULT;
  const withSpark = ids.length <= SPARK_MAX_ROWS;
  const [q, hist] = await Promise.all([
    src.coins(ALL_COIN_IDS).catch(() => ({}) as Record<string, CoinQuote>),
    withSpark
      ? Promise.all(ids.map((id) => src.coinHistory(id).catch(() => null)))
      : Promise.resolve([] as (number[] | null)[]),
  ]);
  return {
    mode: "crypto",
    kind: "list",
    title: "CRYPTO 24H",
    changeKind: "24h",
    rows: ids.map((id, i) => {
      const label = CRYPTO_CATALOG.find((c) => c.id === id)?.label ?? id.slice(0, 5).toUpperCase();
      const r = row(label, q[id]?.usd ?? null, q[id]?.change24h ?? null, fmtPrice);
      const spark = withSpark && hist[i] ? toSpark(hist[i]!) : null;
      return spark ? { ...r, spark } : r;
    }),
    // Named, not hidden: majors like BTC/SOL/XRP are not Base tokens, so no
    // Blue Agent tool prices them and this feed reads CoinGecko directly.
    via: ["coingecko"],
    ts: now,
  };
}

/**
 * The mark for one safe-trending row.
 *
 *   flagged     a MEASURED finding: any flag other than TAX_UNVERIFIED (unlock
 *               overhang, churn, dumping, micro-cap, impersonation, high tax,
 *               blacklist), or a HONEYPOT / SUSPICIOUS verdict. Wins over
 *               "unverified": a real finding is information, an unread tax
 *               is only its absence.
 *   clean       the tax WAS read from the contract, verdict SAFE, no flags.
 *   unverified  everything else, including every errored scan.
 *
 * MEASURED 2026-10-03: 10 of 10 trending tokens came back tax_read "failed" —
 * AERO included — because the tax read only understands the Virtuals
 * templates. Treating "failed" as a flag painted every row the same colour,
 * which is a mark that carries no information. Hence the precedence above.
 */
export function trendingMark(r: TrendingRow): NonNullable<CubeRow["mark"]> {
  if (r.status !== "ok") return "unverified";
  const realFlags = (r.flags ?? []).filter((f) => f !== "TAX_UNVERIFIED");
  const verdict = r.honeypot?.verdict;
  if (realFlags.length > 0 || verdict === "HONEYPOT" || verdict === "SUSPICIOUS") return "flagged";
  if (r.honeypot?.tax_read === "template" && verdict === "SAFE") return "clean";
  return "unverified";
}

/**
 * Base trending tokens in safe-trending's own order (unflagged first by 24h
 * volume, then flagged, then errored). The cube takes the first 5 and never
 * re-ranks: flagged rows stay visible exactly as the tool ranks them.
 */
export async function buildTrending(src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  const rows = (await src.trending().catch(() => null)) ?? [];
  return {
    mode: "trending",
    kind: "list",
    title: rows.length ? "TRENDING ON BASE" : "TRENDING: NO DATA",
    changeKind: "24h",
    rows: rows.slice(0, CUBE_MAX_ROWS).map((t) => ({
      ...row((t.symbol ?? "?").slice(0, 5), t.price_usd, t.change_24h, fmtPrice),
      mark: trendingMark(t),
    })),
    via: ["safe-trending"],
    ts: now,
  };
}

/** Short names for blue-doctor's upstreams, ≤ 5 chars. */
const DOCTOR_LABELS: Record<string, string> = {
  base_rpc: "BASE",
  robinhood_rpc: "RH",
  dexscreener: "DEXS",
  geckoterminal: "GECKO",
  defillama: "LLAMA",
  github: "GH",
};
/** Rows the status layout has room for — every probed upstream, today 6. */
export const STATUS_MAX_ROWS = 6;

/**
 * Upstreams blue-doctor actually probed. The ones it deliberately does not
 * probe (needs a key, would spend credit) are counted in the title, never
 * drawn as a dot — a grey dot next to "down" ones would read as an outage.
 */
export async function buildStatus(src: CubeSources, now = Date.now()): Promise<CubeFeed> {
  const probes = (await src.doctor().catch(() => null)) ?? [];
  const probed = probes.filter((p) => p.status !== "unknown");
  const ok = probed.filter((p) => p.status === "ok").length;
  return {
    mode: "status",
    kind: "status",
    title: probes.length ? `SOURCES ${ok}/${probed.length} OK` : "SOURCES: NO DATA",
    changeKind: "latency",
    rows: probed.slice(0, STATUS_MAX_ROWS).map((p) => ({
      label: DOCTOR_LABELS[p.name] ?? p.name.slice(0, 5).toUpperCase(),
      value: p.latency_ms,
      text: p.status === "degraded" ? "slow" : p.status,
      change: null,
      changeText: p.latency_ms != null ? `${p.latency_ms}ms`.slice(0, 7) : "",
      state: p.status,
    })),
    via: ["blue-doctor"],
    ts: now,
  };
}

/**
 * Base B20 stocks: DEX price, and how far it sits from the Chainlink oracle.
 *
 * With picks, rows follow the owner's order and a picked ticker with no fresh
 * row still gets its label and "--" — the owner asked for TSLA, so the screen
 * says "TSLA: unknown", not a list that quietly lost a line. Without picks,
 * the five most-traded live rows.
 */
export async function buildHood(src: CubeSources, picks: string[] | null = null, now = Date.now()): Promise<CubeFeed> {
  const rows = ((await src.hoodBaseRows().catch(() => null)) ?? [])
    .filter((r) => r.chain === "base" && r.verdict !== "ERROR");
  const toRow = (t: string, r?: HoodRow) =>
    row(t.slice(0, 5), r ? r.dex_usd ?? r.oracle_usd : null, r ? r.drift_pct : null, fmtPrice);

  const out = picks
    ? picks.map((t) => toRow(t, rows.find((r) => r.ticker.toUpperCase() === t)))
    : rows
        .sort((a, b) => (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0) || a.ticker.localeCompare(b.ticker))
        .slice(0, CUBE_MAX_ROWS)
        .map((r) => toRow(r.ticker, r));
  return {
    mode: "hood",
    kind: "list",
    title: rows.length ? "STOCKS ON BASE" : "STOCKS: NO DATA",
    changeKind: "vs oracle",
    rows: out,
    via: ["hood-live"],
    ts: now,
  };
}

/** Tickers a cube owner can pick: the verified Base B20 registry, nothing else. */
export const HOOD_CATALOG = BASE_STOCKS.map((s) => ({ ticker: s.ticker.toUpperCase(), name: s.name }));

/** Everything a cube needs to render its own picker page. */
export function cubeOptions() {
  return {
    crypto: { catalog: CRYPTO_CATALOG, defaults: CRYPTO_DEFAULT },
    hood: { catalog: HOOD_CATALOG, defaults: null as string[] | null },
    maxPicks: CUBE_MAX_ROWS,
  };
}

export function buildFeed(mode: CubeMode, src: CubeSources, pickRaw: string | null = null, now = Date.now()): Promise<CubeFeed> {
  switch (mode) {
    case "crypto":
      return buildCrypto(src, parsePicks(pickRaw, ALL_COIN_IDS, (s) => s.toLowerCase()), now);
    case "hood":
      return buildHood(src, parsePicks(pickRaw, HOOD_CATALOG.map((h) => h.ticker), (s) => s.toUpperCase()), now);
    case "trending":
      return buildTrending(src, now);
    case "status":
      return buildStatus(src, now);
  }
}
