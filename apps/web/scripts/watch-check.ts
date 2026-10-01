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
import { evaluateWatch } from "../src/lib/watches/evaluate";
import { parseRule } from "../src/lib/watches/rules";
import { identify } from "../src/lib/watches/prices";
import { alertMessages } from "../src/app/chat/use-price-alerts";
import { describeRule, REARM_BAND, type Watch, type WatchReading } from "../src/lib/watches/types";
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

console.log(failures === 0 ? "\nwatch-check: PASS" : `\nwatch-check: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
