/**
 * brief-stocks-test — the stock part of the brief (lib/brief/stocks.ts
 * assembleStocks, render.ts stockLine/renderStocks) and the Coinbase catalog
 * parser. Pure: fabricated desks, no network, no KV.
 */
import { assembleStocks } from "../src/lib/brief/stocks";
import { renderStocks, stockLine } from "../src/lib/brief/render";
import { navPremiumPct, parseCatalogRow } from "../src/lib/base-stocks/coinbase-catalog";
import type { TickerSnapshot } from "../src/lib/blue-hood/types";
import type { HoldRow } from "../src/lib/brief/types";

let failures = 0;
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }

const NVDA_BASE = "0xb20000000000000000000078ee7ce2fe4908108c";
const RKT_BASE = "0xb200000000000000000000000d3176ee4af1102d";
const NVDA_RH = "0x1111111111111111111111111111111111110001";
const row = (o: Partial<TickerSnapshot>): TickerSnapshot => ({
  ticker: "NVDA", chain: "base", name: "NVIDIA", contract: NVDA_BASE, verdict: "HOLD" as TickerSnapshot["verdict"],
  oracle_usd: 200, dex_usd: 202, tvl_usd: 1e5, total_tvl_usd: 1e5, volume_24h_usd: 1e4, drift_pct: 1,
  ...o,
} as TickerSnapshot);
const hold = (o: Partial<HoldRow>): HoldRow => ({ chain: "base", token: NVDA_BASE, symbol: "NVDAc", amount: "2", usd: 404, trust: "verified", ...o });
const catalog = [
  parseCatalogRow({ contract_address: "0xb20000000000000000000078ee7ce2fE4908108C", symbol: "NVDAc", name: "NVIDIA Corporation", nav_price: 200, nav_price_updated_at: "2026-10-13T00:00:00Z", multiplier: 1.0005 })!,
  parseCatalogRow({ contract_address: "0xb200000000000000000000000D3176ee4af1102d", symbol: "RKTc", name: "Rocket Companies", multiplier: 1 })!,
];
const SAT = Date.parse("2026-10-17T15:00:00Z");
const WED = Date.parse("2026-10-14T15:00:00Z");

// 1. Catalog parsing.
ok("1. ticker drops Coinbase's trailing c", catalog[0].ticker === "NVDA");
ok("1. contract is lowercased", catalog[0].contract === NVDA_BASE);
ok("1. a row with no nav_price has nav null, not 0", catalog[1].nav === null && catalog[1].navAt === null);
ok("1. a malformed contract is rejected", parseCatalogRow({ contract_address: "0x12", symbol: "Xc" }) === null);
ok("1. premium = dex / nav − 1", Math.abs(navPremiumPct(202, 200)! - 1) < 1e-9);
ok("1. premium is null without a NAV", navPremiumPct(202, null) === null);

// 2. Held stock on the Base desk: desk numbers + NAV premium; identity by contract.
{
  const d = assembleStocks({
    holdings: [hold({}), hold({ token: "0x4200000000000000000000000000000000000006", symbol: "NVDA", amount: "1" })],
    desks: { base: { state: "ok", rows: [row({})] }, robinhood: { state: "ok", rows: [] } },
    catalog, now: WED,
  });
  ok("2. one held stock — the token named NVDA at another address is not one", d.held.length === 1);
  const r = d.held[0];
  ok("2. reads oracle/dex/drift from the desk", r.oracle === 200 && r.dex === 202 && r.drift === 1 && r.onDesk);
  ok("2. premium vs NAV is 1%", Math.abs((r.premium ?? 0) - 1) < 1e-9);
  ok("2. line prints all three", stockLine(r) === "NVDA (Base) · 2 held: DEX $202.00 · oracle $200.00 (+1.00%) · NAV $200.00 (+1.00% vs NAV)");
}

// 3. Held Base stock NOT on the desk: price from the holdings read, NAV absent.
{
  const d = assembleStocks({
    holdings: [hold({ token: RKT_BASE, symbol: "RKTc", amount: "10", usd: 150 })],
    desks: { base: { state: "ok", rows: [row({})] }, robinhood: { state: "ok", rows: [] } },
    catalog, now: WED,
  });
  const r = d.held[0];
  ok("3. off-desk Coinbase stock is recognised by contract", r?.ticker === "RKT" && !r.onDesk);
  ok("3. price is holdings usd / amount", r?.dex === 15);
  ok("3. says it has no oracle read", /not on the Hood desk/.test(stockLine(r)));
}

// 4. RH: same ticker, different chain — matched by RH contract, quarantine respected.
{
  const d = assembleStocks({
    holdings: [hold({ chain: "robinhood", token: NVDA_RH, symbol: "NVDA", amount: "3", usd: null })],
    desks: { base: { state: "ok", rows: [row({})] }, robinhood: { state: "ok", rows: [row({ chain: "robinhood", contract: NVDA_RH, provenance: "quarantined", dex_usd: null, drift_pct: null })] } },
    catalog, now: WED,
  });
  ok("4. the RH NVDA row is the RH desk row, not Base's", d.held.length === 1 && d.held[0].chain === "robinhood" && d.held[0].nav === null);
  ok("4. a quarantined row prints 'withheld', no drift", /withheld/.test(stockLine(d.held[0])) && !/\(\+1\.00%\)/.test(stockLine(d.held[0])));
}

// 5. Movers: largest |drift| first; a stale desk shows none and says why.
{
  const d = assembleStocks({
    holdings: null,
    desks: {
      base: { state: "ok", rows: [row({ ticker: "A", drift_pct: 0.5 }), row({ ticker: "B", drift_pct: -3 }), row({ ticker: "C", drift_pct: null }), row({ ticker: "D", drift_pct: 1.5 })] },
      robinhood: { state: "stale", rows: [row({ chain: "robinhood", ticker: "X", drift_pct: 9 })] },
    },
    catalog: null, now: SAT,
  });
  ok("5. base movers sorted by |drift|, unmeasured dropped", d.movers.base.map((r) => r.ticker).join(",") === "B,D,A");
  ok("5. a stale desk has no movers", d.movers.robinhood.length === 0 && d.desk.robinhood === "stale");
  ok("5. Saturday is the weekend session", d.session === "weekend");
  const t = renderStocks(d, "md", { movers: true }).join("\n");
  ok("5. renders the stale desk reason", /older than ~11 minutes/.test(t));
  ok("5. renders the weekend note", /Friday's close/.test(t));
  ok("5. no buy/sell wording", !/\b(buy|sell|signal)\b/i.test(t));
}

// 6. A wallet with no stock tokens renders no "Your onchain stocks" section.
{
  const d = assembleStocks({ holdings: [hold({ token: "native", symbol: "ETH" })], desks: { base: { state: "ok", rows: [] }, robinhood: { state: "ok", rows: [] } }, catalog, now: WED });
  ok("6. nothing held → no section at all", renderStocks(d, "md", { held: true }).length === 0);
}

console.log(failures === 0 ? "\nbrief-stocks-test: PASS" : `\nbrief-stocks-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
