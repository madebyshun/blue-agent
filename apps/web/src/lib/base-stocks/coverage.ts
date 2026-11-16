/** Bounded, read-only Base inventory. Never mutates BASE_STOCKS or historical cohorts. */
import { createPublicClient, erc20Abi, fallback, getAddress, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { baseRpcUrls } from "@/lib/base-rpc";
import { kvGetProbe, kvSetOrThrow, kvTryLock, kvDel, isKVEnabled } from "@/lib/kv";
import { FACTORY_ABI, TOKEN_READ_ABI } from "@/lib/b20/inspect-abi";
import { BASE_STOCKS, B20_FACTORY } from "./registry";
import { BASE_PRICE_SOURCE } from "@/lib/robinhood/rwa-price";
import { fetchCoinbaseCatalog } from "./coinbase-catalog";
import { runCoverageBatch, finishCoverageAssessment, isStockCoverageInventory, selectCoveragePool, type CoveragePair, type CoverageAssessment, type CoverageStock, type CoverageInventory } from "../../../../../packages/core/src/stock-coverage";

export const KV_STOCK_COVERAGE = "stocks:base:coverage:v1";
const LOCK = "stocks:base:coverage:lock:v1";
const MULTIPLIER = parseAbi(["function multiplier() view returns (uint256)"]);
const client = createPublicClient({ chain: base, transport: fallback(baseRpcUrls().slice(0, 2).map((u) => http(u, { timeout: 4500, retryCount: 0 }))) });
const headers = { accept: "application/json", "user-agent": "blue-agent/1.0 (+https://blueagent.dev)" };

export async function readOfficialCoverageCatalog(): Promise<CoverageStock[]> {
  const [issuer, r] = await Promise.all([
    fetchCoinbaseCatalog(),
    fetch("https://www.base.org/api/stocks", { headers, signal: AbortSignal.timeout(8000) }),
  ]);
  if (!issuer || !r.ok) throw new Error("official catalog unreadable; prior coverage retained");
  const j = await r.json() as { stocks?: { address: string; ticker: string }[] };
  if (!Array.isArray(j.stocks) || !j.stocks.length) throw new Error("official catalog has no stock records");
  const official = new Map(j.stocks.map((s) => [getAddress(s.address).toLowerCase(), s.ticker]));
  if (official.size !== j.stocks.length || official.size !== issuer.length || issuer.some((s) => official.get(s.contract) !== s.symbol)) {
    throw new Error("Base and Coinbase catalogs disagree by address/symbol; prior coverage retained");
  }
  return issuer.map((s) => ({ ...s, contract: getAddress(s.contract) }));
}

async function poolObservation(token: string): Promise<Pick<CoverageAssessment, "pool_status" | "pool" | "activity">> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { pool_status: "unknown", pool: null, activity: "unknown" };
    const j = await r.json() as { pairs?: CoveragePair[] | null };
    if (!(j.pairs === null || Array.isArray(j.pairs))) return { pool_status: "unknown", pool: null, activity: "unknown" };
    return selectCoveragePool(j.pairs ?? [], token, BASE_PRICE_SOURCE.anchors);
  } catch { return { pool_status: "unknown", pool: null, activity: "unknown" }; }
}

async function explorerObservation(token: string): Promise<CoverageAssessment["explorer"]> {
  try {
    const r = await fetch(`https://basescan.org/token/${token}`, { headers: { "user-agent": headers["user-agent"] }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return "unknown";
    const text = (await r.text()).toLowerCase();
    // An HTTP 200 challenge or generic page is not explorer verification.
    return text.includes(token.toLowerCase()) && /token tracker|token contract|token overview/.test(text) ? "pass" : "unknown";
  } catch { return "unknown"; }
}

export async function assessBaseStock(s: CoverageStock, block: bigint | null): Promise<CoverageAssessment> {
  const at = new Date().toISOString();
  const baseRow: CoverageAssessment = {
    contract: s.contract, symbol: s.symbol, ticker: s.ticker, name: s.name, chain_id: 8453,
    assessed_at: at, block_number: block?.toString() ?? null, identity: "unknown", explorer: "unknown", issued: null,
    supply_raw: null, multiplier: null, transfer_paused: null, reference_usd: s.nav, reference_at: s.navAt,
    reference_source: "coinbase_api_nav", feed_mapping: BASE_STOCKS.some((x) => x.token.toLowerCase() === s.contract.toLowerCase()) ? "verified_registry" : "not_verified",
    pool_status: "not_checked", pool: null, price_unit: "usd_per_token", gap_pct: null,
    observed: false, activity: "not_checked", grading_admitted: BASE_STOCKS.some((x) => x.token.toLowerCase() === s.contract.toLowerCase()), reasons: [],
  };
  if (block === null) return { ...baseRow, reasons: ["rpc_block_unreadable"] };
  try {
    const token = getAddress(s.contract);
    const results = await client.multicall({ allowFailure: true, blockNumber: block, contracts: [
      { address: B20_FACTORY, abi: FACTORY_ABI, functionName: "isB20", args: [token] },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
      { address: token, abi: erc20Abi, functionName: "totalSupply" },
      { address: token, abi: MULTIPLIER, functionName: "multiplier" },
      { address: token, abi: TOKEN_READ_ABI, functionName: "isPaused", args: [0] },
    ] });
    const identity = results.slice(0, 3);
    baseRow.identity = identity.some((r) => r.status !== "success") ? "unknown" :
      results[0].result === true && results[1].result === s.symbol && results[2].result === 8 ? "pass" : "fail";
    if (baseRow.identity !== "pass") return { ...baseRow, reasons: [baseRow.identity === "fail" ? "identity_mismatch" : "identity_unreadable"] };
    const supply = results[3].status === "success" ? results[3].result as bigint : null;
    const mult = results[4].status === "success" ? results[4].result as bigint : null;
    baseRow.issued = supply === null ? null : supply > 0n;
    baseRow.supply_raw = supply?.toString() ?? null;
    baseRow.multiplier = mult !== null && mult > 0n ? Number(mult) / 1e18 : null;
    baseRow.transfer_paused = results[5].status === "success" ? results[5].result as boolean : null;
    if (baseRow.issued === null) baseRow.reasons.push("supply_unreadable");
    if (baseRow.issued === false) baseRow.reasons.push("not_issued");
    if (baseRow.multiplier === null) baseRow.reasons.push("multiplier_unreadable");
    if (s.multiplier === null || baseRow.multiplier === null || Math.abs(s.multiplier - baseRow.multiplier) > Math.max(1, s.multiplier) * 1e-9) baseRow.reasons.push("reference_multiplier_mismatch");
    if (baseRow.transfer_paused !== false) baseRow.reasons.push(baseRow.transfer_paused ? "transfer_paused" : "transfer_pause_unreadable");
    if (s.nav === null) baseRow.reasons.push("issuer_nav_not_published");
    if (baseRow.feed_mapping === "not_verified") baseRow.reasons.push("feed_mapping_not_verified");
    const [explorer, pool] = await Promise.all([
      explorerObservation(s.contract),
      baseRow.issued === true ? poolObservation(s.contract) : Promise.resolve({ pool_status: "not_checked" as const, pool: null, activity: "not_checked" as const }),
    ]);
    baseRow.explorer = explorer;
    if (explorer !== "pass") baseRow.reasons.push("explorer_unreadable");
    if (pool.pool_status !== "readable") baseRow.reasons.push(`pool_${pool.pool_status}`);
    return finishCoverageAssessment({ ...baseRow, ...pool });
  } catch { return { ...baseRow, reasons: [...baseRow.reasons, "rpc_read_failed"] }; }
}

export async function runStockCoverage(deadline: number, batchSize = 12) {
  if (process.env.NODE_ENV === "production" && !isKVEnabled()) throw new Error("durable coverage storage unavailable");
  return runCoverageBatch({
    acquire: () => kvTryLock(LOCK, "coverage", 90),
    release: () => kvDel(LOCK),
    read: () => kvGetProbe<CoverageInventory>(KV_STOCK_COVERAGE),
    write: (v) => kvSetOrThrow(KV_STOCK_COVERAGE, v),
    catalog: readOfficialCoverageCatalog,
    issuer: fetchCoinbaseCatalog,
    chainId: () => client.getChainId(),
    block: () => client.getBlockNumber().catch(() => null),
    assess: assessBaseStock,
    now: Date.now,
  }, deadline, batchSize);
}

export async function readStockCoverage() {
  const p = await kvGetProbe<CoverageInventory>(KV_STOCK_COVERAGE);
  if (p.status === "hit" && !isStockCoverageInventory(p.value)) return { status: "error" as const, message: "Invalid coverage record" };
  return p;
}
