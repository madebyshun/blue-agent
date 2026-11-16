/** Base coverage is an inventory, never an automatic admission to a graded cohort. */
export type CoverageCheck = "pass" | "fail" | "unknown";
export interface CoverageStock {
  contract: string; symbol: string; ticker: string; name: string;
  multiplier: number | null; nav: number | null; navAt: string | null; totalSupply: number | null;
}
export interface CoverageAssessment {
  contract: string; symbol: string; ticker: string; name: string;
  chain_id: 8453; assessed_at: string; block_number: string | null;
  identity: CoverageCheck; explorer: CoverageCheck;
  issued: boolean | null; supply_raw: string | null; multiplier: number | null;
  transfer_paused: boolean | null;
  reference_usd: number | null; reference_at: string | null;
  reference_source: "coinbase_api_nav";
  feed_mapping: "verified_registry" | "not_verified";
  pool_status: "readable" | "not_indexed" | "no_anchored_quote" | "unknown" | "not_checked";
  pool: { address: string; price_usd: number; liquidity_usd: number | null; volume_24h_usd: number | null } | null;
  price_unit: "usd_per_token";
  gap_pct: number | null;
  observed: boolean;
  activity: "active" | "thin" | "unknown" | "not_checked";
  /** Candle liveness and independent admission bands are not inferred from 24h volume. */
  grading_admitted: boolean;
  reasons: string[];
}
export interface CoverageInventory {
  version: 1; chain_id: 8453;
  catalog_at: string; updated_at: string; completed_at: string | null;
  catalog: CoverageStock[]; rows: CoverageAssessment[]; cursor: number;
}

export function isStockCoverageInventory(value: unknown): value is CoverageInventory {
  const v = value as CoverageInventory | null;
  return !!v && v.version === 1 && v.chain_id === 8453 && Array.isArray(v.catalog) && v.catalog.length > 0 && Array.isArray(v.rows) &&
    Number.isInteger(v.cursor) && v.cursor >= 0 && v.cursor <= v.catalog.length && v.rows.length === v.cursor &&
    Number.isFinite(Date.parse(v.catalog_at)) && Number.isFinite(Date.parse(v.updated_at)) &&
    v.catalog.every((s) => !!s && typeof s.contract === "string" && /^0x[a-fA-F0-9]{40}$/.test(s.contract)) &&
    new Set(v.catalog.map((s) => s.contract.toLowerCase())).size === v.catalog.length &&
    v.rows.every((r, i) => !!r && r.chain_id === 8453 && typeof r.contract === "string" && r.contract.toLowerCase() === v.catalog[i].contract.toLowerCase()) &&
    (v.completed_at === null ? v.cursor < v.catalog.length : v.cursor === v.catalog.length && Number.isFinite(Date.parse(v.completed_at)));
}

export type CoveragePair = { chainId?: string; baseToken?: { address?: string }; quoteToken?: { address?: string }; priceUsd?: string; pairAddress?: string; liquidity?: { usd?: number }; volume?: { h24?: number } };
const nonnegative = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
export function selectCoveragePool(pairs: CoveragePair[], token: string, anchors: ReadonlySet<string>): Pick<CoverageAssessment, "pool_status" | "pool" | "activity"> {
  const onBase = pairs.filter((p) => p.chainId === "base" && p.baseToken?.address?.toLowerCase() === token.toLowerCase());
  if (!onBase.length) return { pool_status: "not_indexed", pool: null, activity: "not_checked" };
  const usable = onBase.filter((p) => anchors.has(p.quoteToken?.address?.toLowerCase() ?? "") &&
    Number.isFinite(Number(p.priceUsd)) && Number(p.priceUsd) > 0 && /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(p.pairAddress ?? ""))
    .sort((a, b) => (nonnegative(b.liquidity?.usd) ?? 0) - (nonnegative(a.liquidity?.usd) ?? 0));
  const p = usable[0];
  if (!p) return { pool_status: "no_anchored_quote", pool: null, activity: "not_checked" };
  const liquidity = nonnegative(p.liquidity?.usd), volume = nonnegative(p.volume?.h24);
  return { pool_status: "readable", pool: { address: p.pairAddress!, price_usd: Number(p.priceUsd), liquidity_usd: liquidity, volume_24h_usd: volume },
    activity: liquidity === null || volume === null ? "unknown" : liquidity >= 10_000 && volume > 0 ? "active" : "thin" };
}

export function summarizeStockCoverage(v: CoverageInventory) {
  const rows = v.rows;
  return {
    listed: v.catalog.length, assessed: rows.length,
    pending: v.catalog.length - rows.length,
    identity_verified: rows.filter((r) => r.identity === "pass").length,
    issued: rows.filter((r) => r.issued === true).length,
    unissued: rows.filter((r) => r.issued === false).length,
    issuance_unknown: rows.filter((r) => r.issued === null).length,
    issuer_reference_available: rows.filter((r) => r.reference_usd !== null).length,
    verified_feed_mapping: rows.filter((r) => r.feed_mapping === "verified_registry").length,
    pool_readable: rows.filter((r) => r.pool_status === "readable").length,
    pool_unknown: rows.filter((r) => r.pool_status === "unknown").length,
    observed: rows.filter((r) => r.observed).length,
    grading_admitted: rows.filter((r) => r.grading_admitted).length,
  };
}

export function finishCoverageAssessment(r: CoverageAssessment): CoverageAssessment {
  const referenceAge = (Date.parse(r.assessed_at) - Date.parse(r.reference_at ?? "")) / 1000;
  const validReference = r.reference_usd !== null && Number.isFinite(r.reference_usd) && r.reference_usd > 0 &&
    Number.isFinite(referenceAge) && referenceAge >= 0 && referenceAge <= 7 * 86400;
  const validPool = r.pool !== null && Number.isFinite(r.pool.price_usd) && r.pool.price_usd > 0;
  const observed = r.identity === "pass" && r.explorer === "pass" && r.issued === true &&
    r.multiplier !== null && Number.isFinite(r.multiplier) && r.multiplier > 0 && r.transfer_paused === false &&
    validReference && validPool && !r.reasons.includes("reference_multiplier_mismatch");
  const reasons = [...r.reasons];
  if (!validReference && !reasons.includes("issuer_nav_not_published")) reasons.push("reference_missing_invalid_or_older_than_7_days");
  if (r.activity === "thin") reasons.push("pool_activity_below_observation_floor");
  if (r.activity === "unknown") reasons.push("pool_activity_unreadable");
  return { ...r, reasons: [...new Set(reasons)], observed, gap_pct: observed ? (r.pool!.price_usd / r.reference_usd! - 1) * 100 : null };
}

/** Merge by Base address, not ticker. Progress must be a prefix of this catalog. */
export function advanceStockCoverage(v: CoverageInventory, rows: CoverageAssessment[], at: string): CoverageInventory {
  const expected = v.catalog.slice(v.cursor, v.cursor + rows.length);
  if (expected.length !== rows.length || rows.some((r, i) => r.chain_id !== 8453 || r.contract.toLowerCase() !== expected[i].contract.toLowerCase())) {
    throw new Error("coverage batch does not match its catalog cursor");
  }
  const byAddress = new Map(v.rows.map((r) => [r.contract.toLowerCase(), r]));
  rows.forEach((r) => byAddress.set(r.contract.toLowerCase(), r));
  const cursor = v.cursor + rows.length;
  return { ...v, rows: [...byAddress.values()], cursor, updated_at: at,
    completed_at: cursor === v.catalog.length ? at : null };
}

export interface CoverageRunDependencies {
  acquire(): Promise<"acquired" | "held" | "error">;
  release(): Promise<void>;
  read(): Promise<{ status: "hit"; value: unknown } | { status: "miss" } | { status: "error" }>;
  write(v: CoverageInventory): Promise<void>;
  catalog(): Promise<CoverageStock[]>;
  issuer(): Promise<CoverageStock[] | null>;
  chainId(): Promise<number>;
  block(): Promise<bigint | null>;
  assess(s: CoverageStock, block: bigint | null): Promise<CoverageAssessment>;
  now(): number;
}

/** Network and storage adapters are injected; unknown reads must never clear progress. */
export async function runCoverageBatch(d: CoverageRunDependencies, deadline: number, batchSize = 12) {
  const lock = await d.acquire();
  if (lock !== "acquired") return { status: lock === "held" ? "busy" : "storage_unavailable" };
  try {
    const prior = await d.read();
    if (prior.status === "error") throw new Error("coverage storage unreadable; no progress overwritten");
    if (prior.status === "hit" && !isStockCoverageInventory(prior.value)) throw new Error("invalid coverage record; refusing to overwrite it");
    let v = prior.status === "hit" ? prior.value as CoverageInventory : null;
    let fresh: CoverageStock[];
    if (v?.completed_at && d.now() - Date.parse(v.catalog_at) < 6 * 3600_000) return { status: "complete", summary: summarizeStockCoverage(v) };
    if (!v || v.completed_at) {
      fresh = await d.catalog();
      const at = new Date(d.now()).toISOString();
      const next: CoverageInventory = { version: 1, chain_id: 8453, catalog_at: at, updated_at: at, completed_at: null, catalog: fresh, rows: [], cursor: 0 };
      if (!isStockCoverageInventory(next)) throw new Error("invalid or incomplete official catalog");
      await d.write(next);
      v = next;
    } else {
      const latest = await d.issuer();
      if (!latest) throw new Error("issuer references unreadable; coverage progress retained");
      fresh = latest;
    }
    const byAddress = new Map(fresh.map((s) => [s.contract.toLowerCase(), s]));
    if (d.now() + 18_000 >= deadline) return { status: "progress", checked: 0, summary: summarizeStockCoverage(v) };
    if (await d.chainId() !== 8453) throw new Error("coverage RPC is not Base 8453");
    const block = await d.block();
    let checked = 0;
    const bound = Math.min(24, Math.max(1, Math.floor(batchSize) || 12));
    while (v.cursor < v.catalog.length && checked < bound && d.now() + 18_000 < deadline) {
      const stocks = v.catalog.slice(v.cursor, v.cursor + Math.min(2, bound - checked));
      const rows = await Promise.all(stocks.map((s) => {
        const current = byAddress.get(s.contract.toLowerCase());
        if (!current || current.symbol !== s.symbol) throw new Error("issuer changed during scan; coverage progress retained");
        return d.assess({ ...current, contract: s.contract }, block);
      }));
      const next = advanceStockCoverage(v, rows, new Date(d.now()).toISOString());
      await d.write(next);
      v = next;
      checked += rows.length;
    }
    return { status: v.completed_at ? "complete" : "progress", checked, summary: summarizeStockCoverage(v) };
  } finally { await d.release(); }
}
