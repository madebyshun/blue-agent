/**
 * stock-report-test — the stock-token report (lib/brief/stock-report.ts,
 * 2026-10-16). Fixtures are the RH desk readings of 2026-10-16 16:09 UTC.
 */
import type { TickerSnapshot } from "../src/lib/blue-hood/types";
import { classifyDesk, cheaperVenue, renderReport, MIN_TVL_USD } from "../src/lib/brief/stock-report";
import { stockChainFromText } from "../src/lib/chat/intents";
import { toMarkdown } from "../src/lib/brief/run";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }

const row = (ticker: string, drift: number | null, tvl: number | null, vol = 50_000, extra: Partial<TickerSnapshot> = {}) =>
  ({ ticker, drift_pct: drift, total_tvl_usd: tvl, volume_24h_usd: vol, ...extra }) as unknown as TickerSnapshot;

const rh = [
  row("CRWV", 42.04, 132_250), row("SNDK", 21.84, 393_941), row("AMD", 14.78, 739_975),
  row("ORCL", 8.17, 121_659), row("COIN", -5.39, 1_728_980), row("PLTR", 4.57, 830_365),
  row("AAPL", 0.28, 1_699_820), row("GOOGL", -1.48, 1_927_247), row("MSTR", 2.9, 3_378_905),
  row("TINY", 6.0, 20_000), row("DUST", 0.1, 5_000), row("NOREAD", null, 900_000),
  row("OLD", 3, 900_000, 1, { provenance: "quarantined" }),
];
const d = classifyDesk("robinhood", rh);

ok("CRWV +42% and SNDK +21.8% are held back, not listed as prices", d.heldBack.map((r) => r.ticker).join() === "CRWV,SNDK");
ok("above the stock, largest first", d.above.map((r) => r.ticker).join() === "AMD,ORCL,PLTR,MSTR", d.above.map((r) => r.ticker).join());
ok("below the stock", d.below.map((r) => r.ticker).join() === "COIN");
ok("−1.48% is in line (under 1.5)", d.inLine.includes("GOOGL") && d.inLine.includes("AAPL"));
ok(`a gap on a pool under $${MIN_TVL_USD / 1000}K is counted, not listed`, d.thin === 1 && !d.above.some((r) => r.ticker === "TINY"));
ok("a quiet thin pool is simply in line", d.inLine.includes("DUST"));
ok("no reading and a quarantined row are unread, never classified", d.unread === 2);

const base = [row("MSTR", 1.6, 1_571_218), row("GOOGL", -1.2, 400_000), row("NVDA", 0.4, 900_000)];
const ch = cheaperVenue(base, rh);
ok("MSTR is cheaper on Base (1.6 vs 2.9)", ch[0]?.ticker === "MSTR" && ch[0].cheaper === "base" && ch[0].by === 1.3, JSON.stringify(ch));
ok("a difference under 0.5 points is not a line (GOOGL −1.2 vs −1.48)", !ch.some((r) => r.ticker === "GOOGL"));
ok("a ticker on one chain only is not compared", !ch.some((r) => r.ticker === "NVDA"));
ok("a held-back reading is never compared", cheaperVenue([row("CRWV", 1, 900_000)], rh).length === 0);

const text = renderReport({ desks: { robinhood: d }, cheaper: ch }, (s) => s, (s) => `**${s}**`).join("\n");
ok("rendered: a listed gap carries pool and volume", /AMD \+14\.8% · pool \$740K · 24h vol \$50K/.test(text), text);
ok("rendered: held-back line explains itself", /Held back: CRWV \+42\.0%, SNDK \+21\.8%\. A gap that size is more likely a bad reading/.test(text));
ok("rendered: cross-chain line names both gaps", /MSTR: 1\.3% cheaper on Base \(Base \+1\.6%, Robinhood Chain \+2\.9% vs the stock\)/.test(text));
ok("rendered: no verdict codes, no buy words", !/\b(PASS|WARN|BLOCK|buy now|sell now)\b/i.test(text));

// The chain the user asked about (2026-10-20: "stock tokens on base" got both).
ok("'stock tokens on base' → Base only", stockChainFromText("stock tokens on base") === "base");
ok("'cổ phiếu onchain trên Robinhood' → Robinhood Chain only", stockChainFromText("cổ phiếu onchain trên Robinhood") === "robinhood");
ok("'stock tokens today' → both", stockChainFromText("stock tokens today") === null);
ok("'NVDA on Base vs RH' → both", stockChainFromText("NVDA on Base vs RH") === null);
ok("'database' is not Base", stockChainFromText("stock database") === null);

// Markdown: one paragraph per line, bullets as a list.
const md = toMarkdown(["**Robinhood Chain**", "Priced above the stock:", "• AMD +14.8%", "• ORCL +5.5%", "In line: AAPL", "", "Note"]);
ok("markdown keeps lines apart and lists bullets", md === "**Robinhood Chain**\n\nPriced above the stock:\n\n- AMD +14.8%\n- ORCL +5.5%\n\nIn line: AAPL\n\nNote", JSON.stringify(md));

console.log(failures === 0 ? "\nstock-report-test: PASS" : `\nstock-report-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
