// stock_quote / stock_movers planning: which chain answers, decided in code
// before any price; a ticker no venue lists is refused (never charged).
import { planStockQuote, planStockMovers } from "../src/lib/mcp-stock-tools";
let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) fail++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` — got ${JSON.stringify(got)}`}`); };
const q = (a: Record<string, unknown>) => planStockQuote(a) as any;
ok("NVDA → both chains", JSON.stringify(q({ ticker: "NVDA" }).chains) === '["base","robinhood"]', q({ ticker: "NVDA" }));
ok("NVDAc on robinhood → asks RH for NVDA", q({ ticker: "NVDAc", chain: "robinhood" }).rhTicker === "NVDA", q({ ticker: "NVDAc", chain: "robinhood" }));
ok("unknown ticker refused", "refuse" in q({ ticker: "ZZZZQ" }), q({ ticker: "ZZZZQ" }));
ok("empty ticker refused", "refuse" in q({}), q({}));
ok("bad chain refused", "refuse" in q({ ticker: "NVDA", chain: "ethereum" }), q({ ticker: "NVDA", chain: "ethereum" }));
const base = q({ ticker: "0xb20000000000000000000078ee7ce2fe4908108c" });
ok("Base address → Base only", JSON.stringify(base.chains) === '["base"]', base);
const m = planStockMovers({}) as any;
ok("movers default both, limit 5", JSON.stringify(m) === '{"chains":["base","robinhood"],"limit":5}', m);
ok("movers limit 50 refused", "refuse" in (planStockMovers({ limit: 50 }) as any));
if (fail) { console.log(`mcp-stock-tools-test: ${fail} FAILED`); process.exit(1); }
console.log("mcp-stock-tools-test: all passed");
