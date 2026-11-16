/** Read-only live smoke: writes a local report, never KV or the graded registry. */
import { writeFileSync } from "node:fs";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { baseRpcUrls } from "../src/lib/base-rpc";
import { assessBaseStock, readOfficialCoverageCatalog } from "../src/lib/base-stocks/coverage";

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = Math.min(358, Math.max(1, Number(process.argv[limitArg + 1]) || 16));
  const outArg = process.argv.indexOf("--out");
  const out = outArg >= 0 ? process.argv[outArg + 1] : "/tmp/blue-stock-coverage-probe.json";
  const catalog = await readOfficialCoverageCatalog();
  const c = createPublicClient({ chain: base, transport: fallback(baseRpcUrls().slice(0, 2).map((u) => http(u, { timeout: 4500, retryCount: 0 }))) });
  if (await c.getChainId() !== 8453) throw new Error("not Base 8453");
  const block = await c.getBlockNumber();
  // Deliberately include both priced and unpriced issuer records in the smoke.
  const unpricedIssued = catalog.filter((s) => s.nav === null && s.totalSupply !== null && s.totalSupply > 0);
  const unpricedOther = catalog.filter((s) => s.nav === null && (s.totalSupply === null || s.totalSupply === 0));
  const picks = [...catalog.filter((s) => s.nav !== null), ...unpricedIssued.slice(0, 2), ...unpricedOther, ...unpricedIssued.slice(2)].slice(0, limit);
  const rows = [];
  for (let i = 0; i < picks.length; i += 2) rows.push(...await Promise.all(picks.slice(i, i + 2).map((s) => assessBaseStock(s, block))));
  writeFileSync(out, JSON.stringify({ chain_id: 8453, read_at: new Date().toISOString(), official_total: catalog.length,
    issuer_supply_positive: catalog.filter((s) => s.totalSupply !== null && s.totalSupply > 0).length,
    issuer_nav_available: catalog.filter((s) => s.nav !== null).length, note: "Selected smoke sample, not a full scan", rows }, null, 2));
  console.log(JSON.stringify({ official_total: catalog.length, checked: rows.length, comparable: rows.filter((r) => r.observed).length,
    rows: rows.map((r) => ({ ticker: r.ticker, identity: r.identity, explorer: r.explorer, issued: r.issued, pool: r.pool_status, reasons: r.reasons })), report: out }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
