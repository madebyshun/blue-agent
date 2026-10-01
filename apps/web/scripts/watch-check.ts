/**
 * watch-check — price alerts (lib/watches), hermetic.
 *
 *  1. Trigger rule: fires once on the crossing, a one-shot deactivates, a
 *     repeating watch re-arms only after the price clears REARM_BAND or the
 *     change calms AND a window has passed. Missing data and a stale oracle
 *     never fire.
 *  2. Rule validation is the same for the API and the chat draft.
 *  3. Identity never by name: an unknown symbol is refused, ETH means WETH,
 *     a stock ticker resolves only from that chain's registry.
 *  4. Alerts become chat messages once each, oldest first, with a check chip.
 */
import { evaluateWatch, evaluateScheduled } from "../src/lib/watches/evaluate";
import { parseRule, parseTrade, parseCheckAt } from "../src/lib/watches/rules";
import { tradeToolLog } from "../src/app/chat/use-price-alerts";
import { nextCheckAfter } from "../src/lib/watches/tick";
import { identify } from "../src/lib/watches/prices";
import { alertMessages } from "../src/app/chat/use-price-alerts";
import { describeRule, describeWatch, REARM_BAND, type Watch, type WatchReading } from "../src/lib/watches/types";
import { findByTicker } from "../src/lib/robinhood/rwa-registry";
import { pinnedTokenFor } from "../src/lib/wallet/pinned-symbols";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const base: Watch = {
  id: "w1", chain: "robinhood", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", symbol: "NVDA", asset: "stock",
  feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", heartbeat: 86400, pool: "0xpool", poolBase: true,
  kind: "price", direction: "below", threshold: 220, repeat: false, active: true, armed: true, createdAt: 0,
};
const read = (p: number | null, extra: Partial<WatchReading> = {}): WatchReading =>
  ({ priceUsd: p, priceSource: "chainlink", stale: false, change1h: null, change24h: null, changeSource: "dexscreener", ...extra });

console.log("1. trigger rule");
let ev = evaluateWatch(base, read(225), 1);
ok("no fire above a 'below' level", !ev.fire && ev.next === base);
ev = evaluateWatch(base, read(219.4), 2);
ok("fires on the crossing", ev.fire && /NVDA \(Robinhood Chain\) fell below \$220\.00 — now \$219\.40 \(Chainlink oracle\)/.test(ev.text ?? ""), ev.text);
ok("a one-shot watch deactivates", ev.next.active === false && ev.next.armed === false && ev.next.lastTriggeredAt === 2);
ok("a stale oracle never fires a price watch", !evaluateWatch(base, read(200, { stale: true }), 3).fire);
ok("a missing price never fires", !evaluateWatch(base, read(null), 3).fire);
ok("an inactive watch never fires", !evaluateWatch({ ...base, active: false }, read(100), 3).fire);

const rep: Watch = { ...base, repeat: true };
const fired = evaluateWatch(rep, read(219), 10).next;
ok("a repeating watch stays active, disarmed", fired.active && !fired.armed);
ok("it does not fire again while still below", !evaluateWatch(fired, read(218), 11).fire);
ok("hovering just above the level does not re-arm", evaluateWatch(fired, read(220 * (1 + REARM_BAND / 2)), 12).next.armed === false);
const rearmed = evaluateWatch(fired, read(220 * (1 + REARM_BAND) + 0.5), 13).next;
ok("clearing the band re-arms", rearmed.armed === true);
ok("…and the next crossing fires again", evaluateWatch(rearmed, read(219.9), 14).fire);

const ch: Watch = { ...base, asset: "crypto", symbol: "ZIP", kind: "change", direction: "up", threshold: 20, window: "1h", repeat: true };
ev = evaluateWatch(ch, read(0.0001, { priceSource: "dexscreener", change1h: 25 }), 100);
ok("change up fires at ≥ threshold", ev.fire && /ZIP \(Robinhood Chain\) is up 25\.00% over the last hour.*\(pool change, DexScreener\)/.test(ev.text ?? ""), ev.text);
ok("change down does not fire on a rise", !evaluateWatch({ ...ch, direction: "down" }, read(1, { priceSource: "dexscreener", change1h: 25 }), 100).fire);
ok("change down fires on a fall", evaluateWatch({ ...ch, direction: "down" }, read(1, { priceSource: "dexscreener", change1h: -21 }), 100).fire);
ok("a null change never fires", !evaluateWatch(ch, read(1, { priceSource: "dexscreener" }), 100).fire);
const chFired = ev.next;
ok("calm but within the window: stays disarmed", evaluateWatch(chFired, read(1, { priceSource: "dexscreener", change1h: 2 }), 100 + 60_000).next.armed === false);
ok("calm after a window: re-arms", evaluateWatch(chFired, read(1, { priceSource: "dexscreener", change1h: 2 }), 100 + 3_600_000).next.armed === true);

console.log("2. rule validation");
ok("price above", "kind" in parseRule({ kind: "price", direction: "above", threshold: 3000 }));
ok("price with up/down refused", "error" in parseRule({ kind: "price", direction: "up", threshold: 3000 }));
ok("zero/negative refused", "error" in parseRule({ kind: "price", direction: "above", threshold: 0 }));
ok("change needs a window", "error" in parseRule({ kind: "change", direction: "up", threshold: 20 }));
ok("change under 1% refused", "error" in parseRule({ kind: "change", direction: "up", threshold: 0.5, window: "1h" }));
ok("change valid", "kind" in parseRule({ kind: "change", direction: "down", threshold: 10, window: "24h" }));
ok("rule text", describeRule({ ...ch, threshold: 20 }) === "ZIP on Robinhood Chain is up 20% or more over 1 hour");
ok("price rule text uses thousands separators", describeRule({ ...base, symbol: "ETH", chain: "base", direction: "above", threshold: 3000 }) === "ETH on Base rises to or above $3,000");

console.log("3. identity");
ok("an unknown symbol is refused, asking for the address", "error" in identify("base", "DEGEN") && /paste its 0x/.test((identify("base", "DEGEN") as { error: string }).error));
const eth = identify("base", "ETH");
ok("ETH on Base means WETH", "token" in eth && eth.token.toLowerCase() === pinnedTokenFor("base", "WETH")!.toLowerCase());
const nv = identify("robinhood", "NVDA");
ok("NVDA on Robinhood resolves from the RH registry", "token" in nv && nv.token.toLowerCase() === findByTicker("NVDA")!.contract.toLowerCase());
ok("an RH-only ticker does not resolve on Base", "error" in identify("base", "BABA"));
ok("an address passes as itself", "token" in identify("base", "0x4200000000000000000000000000000000000006"));

console.log("4. alerts → chat messages");
const alerts = [
  { id: "a2", watchId: "w", at: 200, chain: "base" as const, token: "0xT", symbol: "X", text: "second" },
  { id: "a1", watchId: "w", at: 100, chain: "robinhood" as const, token: "0xR", symbol: "Y", text: "first" },
  { id: "a0", watchId: "w", at: 50, chain: "base" as const, token: "0xQ", symbol: "Z", text: "old" },
];
const msgs = alertMessages(alerts, 60);
ok("only alerts after the synced mark", msgs.length === 2);
ok("oldest first", msgs[0].content.startsWith("🔔 first") && msgs[1].content.startsWith("🔔 second"));
ok("a one-tap check chip names the chain", msgs[0].content.includes("↳ Check 0xR on Robinhood Chain"));
ok("nothing new → nothing appended", alertMessages(alerts, 200).length === 0);

console.log("5. automations — prepared trades");
ok("buy needs dollars", "error" in parseTrade({ side: "buy", amount: "all" }));
ok("buy $50 → '50'", JSON.stringify(parseTrade({ side: "buy", amount: "$50" })) === '{"trade":{"side":"buy","amount":"50"}}');
ok("sell all", JSON.stringify(parseTrade({ side: "sell", amount: "ALL" })) === '{"trade":{"side":"sell","amount":"all"}}');
ok("sell 25%", "trade" in parseTrade({ side: "sell", amount: "25%" }));
ok("sell 150% refused", "error" in parseTrade({ side: "sell", amount: "150%" }));
ok("no trade → none", JSON.stringify(parseTrade(undefined)) === "{}");
ok("a bad side is refused", "error" in parseTrade({ side: "short", amount: "1" }));

const alertBase = { id: "x", watchId: "w", at: 1, chain: "base" as const, token: "0x4200000000000000000000000000000000000006", symbol: "ETH", text: "t" };
const buyLog = tradeToolLog({ ...alertBase, native: true, trade: { side: "buy", amount: "50", cash: "USDC" } });
const br = buyLog?.result as Record<string, string> | undefined;
ok("Base buy → the convert card, USDC → native ETH", buyLog?.tool === "prepare_swap" && br?.tokenIn === "USDC"
  && br?.tokenInAddress?.toLowerCase() === pinnedTokenFor("base", "USDC")!.toLowerCase()
  && br?.tokenOutAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" && br?.amountIn === "50", JSON.stringify(br));
const rhSell = tradeToolLog({ ...alertBase, chain: "robinhood", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", symbol: "NVDA", trade: { side: "sell", amount: "half", cash: "USDG" } });
const rr = rhSell?.result as Record<string, string> | undefined;
ok("RH sell → the Robinhood swap card, token → USDG", rhSell?.tool === "robinhood_swap" && rr?.token_in_address === "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"
  && rr?.token_address?.toLowerCase() === pinnedTokenFor("robinhood", "USDG")!.toLowerCase() && rr?.amount === "half", JSON.stringify(rr));
ok("a plain alert prepares nothing", tradeToolLog(alertBase) === null);
const scam = tradeToolLog({ ...alertBase, token: "0x1111111111111111111111111111111111111111", symbol: "ETH", trade: { side: "sell", amount: "all", cash: "USDC" } });
ok("a token that CALLS itself ETH sells that token, never native ETH", (scam?.result as Record<string, string>)?.tokenInAddress === "0x1111111111111111111111111111111111111111");
const withTrade = alertMessages([{ ...alertBase, at: 500, trade: { side: "buy", amount: "50", cash: "USDC" } }], 0, 600)[0];
ok("the alert message carries the card and says nothing executes unsigned", !!withTrade.toolLogs?.length && /nothing executes unless you do/.test(withTrade.content) && withTrade.alertId === "x");
ok("no 'Prepared: prepare' stutter", /Prepared trade: a buy of \$50 of ETH with USDC/.test(withTrade.content), withTrade.content);
const stale = alertMessages([{ ...alertBase, at: 500, trade: { side: "buy", amount: "50", cash: "USDC" } }], 0, 500 + 25 * 3600_000)[0];
ok("a prepared trade over a day old gets no live card", !stale.toolLogs && /condition may no longer hold/.test(stale.content));

console.log("6. automations — scheduled checks");
ok("check_at daily 9:00", JSON.stringify(parseCheckAt({ schedule: "daily", time: "9:00", tz: "Asia/Saigon" })) === '{"checkAt":{"schedule":"daily","time":"09:00","tz":"Asia/Saigon"}}');
ok("bad time refused", "error" in parseCheckAt({ schedule: "daily", time: "25:00" }));
ok("a junk tz is refused, never silently UTC", "error" in parseCheckAt({ schedule: "weekly", time: "08:30", tz: "x; drop" }));
ok("a non-IANA zone is refused (it would fire hours off)", "error" in parseCheckAt({ schedule: "daily", time: "09:00", tz: "Asia/Hanoi" }));
ok("a zone with digits is kept", JSON.stringify(parseCheckAt({ schedule: "daily", time: "09:00", tz: "Etc/GMT+7" })) === '{"checkAt":{"schedule":"daily","time":"09:00","tz":"Etc/GMT+7"}}');
{
  const slot = Date.parse("2026-10-01T23:58:00Z");
  const late: Watch = { ...base, checkAt: { schedule: "daily", time: "23:58", tz: "UTC" }, nextCheckAt: slot };
  ok("a check reached after midnight does not skip a day", new Date(nextCheckAfter(late, Date.parse("2026-10-02T00:00:05Z"))).toISOString() === "2026-10-02T23:58:00.000Z");
}
ok("buy amounts are rounded to cents, never '1e-7'", "error" in parseTrade({ side: "buy", amount: "0.0000001" }) && JSON.stringify(parseTrade({ side: "buy", amount: "12.345" })) === '{"trade":{"side":"buy","amount":"12.35"}}');
ok("sell amounts stay as typed decimals", JSON.stringify(parseTrade({ side: "sell", amount: "0.0000001" })) === '{"trade":{"side":"sell","amount":"0.0000001"}}');
ok("a sell of 1e308 is refused", "error" in parseTrade({ side: "sell", amount: "1e308" }));
const auto: Watch = { ...base, symbol: "ETH", chain: "base", asset: "crypto", direction: "below", threshold: 2500, repeat: true,
  checkAt: { schedule: "daily", time: "09:00" }, trade: { side: "buy", amount: "50" } };
ok("sentence: time, condition, prepared trade", describeWatch(auto) === "every day at 09:00, if ETH on Base falls to or below $2,500, prepare a buy of $50 of ETH with USDC", describeWatch(auto));
let se = evaluateScheduled(auto, read(2400, { priceSource: "dexscreener" }), 1000, 9999);
ok("condition holds → fires, stays active (repeat), next check set", se.fire && se.next.active && se.next.nextCheckAt === 9999 && se.next.lastCheckedAt === 1000);
se = evaluateScheduled(auto, read(2600, { priceSource: "dexscreener" }), 1000, 9999);
ok("condition fails → no fire, says what it saw", !se.fire && /\$2,600 \(DexScreener\) — not below \$2,500, nothing prepared/.test(se.text), se.text);
se = evaluateScheduled(auto, read(null), 1000, 9999);
ok("no reading → skipped, never 'condition false'", !se.fire && /could not be read/.test(se.text));
se = evaluateScheduled({ ...auto, asset: "stock" }, read(2000, { stale: true }), 1000, 9999);
ok("stale oracle → skipped, not fired", !se.fire && /market closed/.test(se.text));
ok("a one-shot automation stops after it fires", evaluateScheduled({ ...auto, repeat: false }, read(2400, { priceSource: "dexscreener" }), 1, 2).next.active === false);

console.log(failures === 0 ? "\nwatch-check: PASS" : `\nwatch-check: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
