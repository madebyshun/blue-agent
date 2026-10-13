/**
 * brief-test — the morning brief's arithmetic and wording (lib/brief/diff.ts,
 * render.ts). Pure: no network, no KV.
 */
import { baselineFor, diffSnapshots } from "../src/lib/brief/diff";
import { renderBrief } from "../src/lib/brief/render";
import type { GrantRow, HoldRow, Snapshot } from "../src/lib/brief/types";

let failures = 0;
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }

const W = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const h = (o: Partial<HoldRow>): HoldRow => ({ chain: "base", token: "native", symbol: "ETH", amount: "1", usd: 3000, trust: "verified", ...o });
const g = (o: Partial<GrantRow>): GrantRow => ({ chain: "base", key: "erc20|usdc|spender", type: "erc20", symbol: "USDC", spender: "0x2222222222222222222222222222222222222222", allowance: "UNLIMITED", unlimited: true, level: "INFO", why: "", ...o });
const snap = (o: Partial<Snapshot>): Snapshot => ({
  v: 1, at: 1_000_000_000_000, wallet: W, holdings: [], holdingsRead: { base: "ok", robinhood: "ok" }, grants: [], grantsRead: { base: true, robinhood: true }, ...o,
});
const DAY = 86_400_000;

// 1. First brief: no comparison, a baseline line, no "Balances" section.
{
  const cur = snap({ holdings: [h({})], grants: [g({})] });
  const d = diffSnapshots(cur, null);
  ok("1. first brief has no `since`", d.since === null);
  ok("1. no balance changes without a baseline", d.balances.length === 0 && d.grantsNew.length === 0);
  const t = renderBrief(d, "md");
  ok("1. says it is the baseline", /baseline/i.test(t) && !/\*\*Balances\*\*/.test(t));
  ok("1. counts open approvals", /1 open on Base/.test(t));
  ok("1. a chain with nothing priced says so, not $0.00", /Robinhood Chain 4663: 1 token, none priced/.test(renderBrief(diffSnapshots(snap({ holdings: [h({}), h({ chain: "robinhood", token: "0x9", usd: null, trust: "verified" })] }), null), "md")));
}

// 2. Changes: new, gone, changed, unchanged-below-threshold.
{
  const prev = snap({ holdings: [h({}), h({ token: USDC, symbol: "USDC", amount: "100", usd: 100 }), h({ token: "0xaaaa000000000000000000000000000000000001", symbol: "OLD", amount: "5", usd: 10, trust: "unverified" })] });
  const cur = snap({ at: prev.at + DAY, holdings: [h({ amount: "1.0000001", usd: 3000 }), h({ token: USDC, symbol: "USDC", amount: "150", usd: 150 }), h({ token: "0xbbbb000000000000000000000000000000000002", symbol: "NEWT", amount: "7", usd: 21, trust: "unverified" })] });
  const d = diffSnapshots(cur, prev);
  ok("2. ETH moved 0.00001% → not a change", !d.balances.some((c) => c.row.symbol === "ETH"));
  const u = d.balances.find((c) => c.row.symbol === "USDC");
  ok("2. USDC 100 → 150 is +50%", u?.kind === "changed" && Math.round(u.deltaPct ?? 0) === 50);
  ok("2. a priced unknown that arrived is a NEW holding", d.balances.some((c) => c.kind === "new" && c.row.symbol === "NEWT"));
  ok("2. a held token that left is GONE", d.balances.some((c) => c.kind === "gone" && c.row.symbol === "OLD"));
  ok("2. gone sorts first", d.balances[0]?.kind === "gone");
  ok("2. base total delta = +$61", d.totals.base?.before === 3110 && d.totals.base?.usd === 3171);
  const t = renderBrief(d, "md", { now: cur.at });
  ok("2. renders since 24h ago", /since 24h ago/.test(t));
  ok("2. renders the USDC line", /USDC \(Base\): 100 → 150 \(\+50\.0%\)/.test(t));
  ok("2. renders the value delta", /\+\$61\.00/.test(t));
}

// 3. Unsolicited: impostor and unpriced unknown go to their own section, not "new".
{
  const prev = snap({ holdings: [h({})] });
  const cur = snap({ at: prev.at + DAY, holdings: [h({}), h({ token: "0xcccc000000000000000000000000000000000003", symbol: "USDC", amount: "1000", usd: null, trust: "impostor" }), h({ token: "0xdddd000000000000000000000000000000000004", symbol: "CLAIM-REWARD.COM", amount: "1", usd: null, trust: "unverified" })] });
  const d = diffSnapshots(cur, prev);
  ok("3. both arrivals are unsolicited", d.unsolicited.length === 2);
  ok("3. neither is listed as a new holding", !d.balances.some((c) => c.kind === "new"));
  ok("3. the impostor is not counted in the value", d.totals.base?.usd === 3000);
  const t = renderBrief(d, "html", { now: cur.at });
  ok("3. html names the impostor as not the real USDC", /not the real USDC/.test(t));
  ok("3. html warns not to interact", /Do not trade, approve or open links/.test(t));
  ok("3. an unsolicited token that LEAVES is not news", !diffSnapshots(prev, cur).balances.some((c) => c.kind === "gone"));
}

// 4. Unread legs are never diffed, and the baseline keeps yesterday's reading.
{
  const prev = snap({ holdings: [h({}), h({ chain: "robinhood", token: "0xeeee000000000000000000000000000000000005", symbol: "TSLA", amount: "2", usd: 500 })], grants: [g({})] });
  const cur = snap({ at: prev.at + DAY, holdings: [h({})], holdingsRead: { base: "ok", robinhood: "unread" }, grants: [], grantsRead: { base: false, robinhood: true } });
  const d = diffSnapshots(cur, prev);
  ok("4. an unread RH leg reports nothing gone", !d.balances.some((c) => c.row.chain === "robinhood"));
  ok("4. unread approvals report nothing closed", d.grantsClosed.length === 0);
  ok("4. the unread parts are named", d.unread.includes("holdings on Robinhood Chain") && d.unread.includes("approvals on Base"));
  ok("4. renders 'Not read this time'", /Not read this time/.test(renderBrief(d, "md")));
  const d2 = diffSnapshots(snap({ grants: [g({ level: "WARN" })], grantsRead: { base: false, robinhood: true } }), null);
  ok("4. grants of an unread chain are not counted as flagged", d2.grantsRisky.length === 0);
  ok("4. no approvals read anywhere → the heading is not left empty", /Not read this time on either chain/.test(renderBrief(diffSnapshots(snap({ grantsRead: { base: false, robinhood: false } }), null), "md")));
  const base = baselineFor(cur, prev);
  ok("4. baseline keeps yesterday's RH holdings", base.holdings.some((r) => r.symbol === "TSLA") && base.holdingsRead.robinhood === "ok");
  ok("4. baseline keeps yesterday's Base grants", base.grants.length === 1 && base.grantsRead.base === true);
}

// 5. Approvals: new, closed, and risky-still-open.
{
  const prev = snap({ grants: [g({ key: "erc20|a|x" }), g({ key: "erc20|b|y", level: "WARN", why: "unlimited to an EOA" })] });
  const cur = snap({ at: prev.at + DAY, grants: [g({ key: "erc20|b|y", level: "WARN", why: "unlimited to an EOA" }), g({ key: "permit2|c|z", type: "permit2", symbol: "WETH", level: "BLOCK", why: "spender is a flagged drainer" })] });
  const d = diffSnapshots(cur, prev);
  ok("5. one new grant", d.grantsNew.length === 1 && d.grantsNew[0].key === "permit2|c|z");
  ok("5. one closed grant", d.grantsClosed.length === 1 && d.grantsClosed[0].key === "erc20|a|x");
  ok("5. risky lists BLOCK before WARN", d.grantsRisky.map((x) => x.level).join(",") === "BLOCK,WARN");
  const t = renderBrief(d, "md");
  ok("5. new grant line names Permit2 and the reason", /\[BLOCK\] unlimited WETH via Permit2 → 0x2222…2222 on Base: spender is a flagged drainer/.test(t));
  ok("5. counts flagged", /Flagged and still open: 1 BLOCK, 1 WARN/.test(t));
  ok("5. points at revoke in chat", /check my approvals/.test(t));
  ok("5. an old WARN is counted, not re-listed", !/unlimited to an EOA/.test(t));
}

// 6. HTML escaping: a token symbol cannot inject markup into a Telegram message.
{
  const prev = snap({ holdings: [h({})] });
  const cur = snap({ at: prev.at + DAY, holdings: [h({}), h({ token: "0xffff000000000000000000000000000000000006", symbol: "<a href=x>WIN</a>", amount: "1", usd: null, trust: "unverified" })] });
  const t = renderBrief(diffSnapshots(cur, prev), "html");
  ok("6. symbol is escaped in html", t.includes("&lt;a href=x&gt;WIN&lt;/a&gt;") && !t.includes("<a href=x>"));
}

console.log(failures === 0 ? "\nbrief-test: PASS" : `\nbrief-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
