/**
 * watch-deliver-test — fired watches reach Telegram (lib/watches/deliver.ts,
 * plan 2026-10-06 task 2.3). Hermetic: in-memory KV, Telegram API stubbed.
 *
 *   1. a wallet with no Telegram link gets nothing sent (opt-in only)
 *   2. a linked wallet gets one DM per alert; a re-run sends none (idempotent)
 *   3. the text names the chain, never offers to trade from Telegram, links to
 *      Blue Chat and says how to stop
 *   4. /alerts off mutes, /alerts on resumes
 *   5. a Telegram failure is counted, never thrown
 *   6. the tick calls delivery only after pushAlerts recorded the alert
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.TELEGRAM_BOT_TOKEN = "test-token";

import fs from "node:fs";
import path from "node:path";
import { kvSet } from "../src/lib/kv";
import { kvTgLinkByAddr } from "../src/lib/blue-hood/kv-keys";
import type { WatchAlert } from "../src/lib/watches/types";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const sent: { chat_id: unknown; text: string }[] = [];
let tgDown = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.telegram.org/")) {
    if (tgDown) return Response.json({ ok: false, description: "Too Many Requests" }, { status: 429 });
    const b = JSON.parse(String(init?.body ?? "{}"));
    sent.push({ chat_id: b.chat_id, text: b.text });
    return Response.json({ ok: true, result: {} });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;

const LINKED = "0x1111111111111111111111111111111111111111";
const LONER = "0x2222222222222222222222222222222222222222";
const alert = (id: string, trade = false): WatchAlert => ({
  id, watchId: "w1", at: Date.now(), chain: "base", token: "ETH", symbol: "ETH",
  text: "ETH fell 5.2% in 24h to $3,120 (Chainlink).", ...(trade ? { trade: { side: "buy", usd: 25, cash: "USDC" } as never } : {}),
});

(async () => {
  // Dynamic: lib/telegram/bot reads TELEGRAM_BOT_TOKEN at import time, and a
  // static import would be hoisted above the env line at the top of this file.
  const { deliverAlerts, renderAlert, setWatchAlertsMuted } = await import("../src/lib/watches/deliver");
  await kvSet(kvTgLinkByAddr(LINKED), { address: LINKED, tgUserId: "424242", linkedAt: new Date().toISOString() });

  console.log("1. opt-in only");
  let t = await deliverAlerts(LONER, [alert("w1:1")]);
  ok("an unlinked wallet: nothing sent", t.sent === 0 && t.skipped === 1 && sent.length === 0);

  console.log("2. once per alert");
  t = await deliverAlerts(LINKED, [alert("w1:2"), alert("w1:3", true)]);
  ok("two alerts → two DMs to the linked Telegram id", t.sent === 2 && sent.length === 2 && sent.every((m) => String(m.chat_id) === "424242"));
  t = await deliverAlerts(LINKED, [alert("w1:2")]);
  ok("the same alert id again → no second DM", t.sent === 0 && sent.length === 2);

  console.log("3. the message");
  const plain = renderAlert(alert("x")), traded = renderAlert(alert("y", true));
  ok("names the chain and the reading", /Base 8453/.test(plain) && /fell 5\.2%/.test(plain));
  ok("links to Blue Chat and says how to stop", /app\.blueagent\.dev\/chat\?alerts=1/.test(plain) && /\/alerts off/.test(plain));
  ok("a prepared trade is named, and says nothing was traded and the user signs", /review the check and sign it in your own wallet/.test(traded) && /Nothing was traded/.test(traded));
  ok("HTML is escaped", !/<script>/.test(renderAlert({ ...alert("z"), text: "<script>x</script>" })));

  console.log("4. /alerts off|on");
  await setWatchAlertsMuted("424242", true);
  t = await deliverAlerts(LINKED, [alert("w1:4")]);
  ok("muted → nothing sent", t.sent === 0 && sent.length === 2);
  await setWatchAlertsMuted("424242", false);
  t = await deliverAlerts(LINKED, [alert("w1:5")]);
  ok("unmuted → sent", t.sent === 1 && sent.length === 3);

  console.log("5. failures");
  tgDown = true;
  t = await deliverAlerts(LINKED, [alert("w1:6")]);
  ok("Telegram 429 → counted as failed, nothing thrown", t.failed === 1);
  tgDown = false;

  console.log("6. wiring");
  const tick = fs.readFileSync(path.resolve(__dirname, "../src/lib/watches/tick.ts"), "utf8");
  ok("the tick delivers only inside the pushAlerts-succeeded branch",
    /if \(await pushAlerts\(owner, out\)\) \{[\s\S]{0,300}?await deliverAlerts\(owner, out\);/.test(tick));
  const bot = fs.readFileSync(path.resolve(__dirname, "../src/app/api/telegram/webhook/route.ts"), "utf8");
  ok("the bot has /alerts, and no longer says 'No alerts are sent' while Hood is frozen",
    /case "\/alerts":/.test(bot) && !/No alerts are sent/.test(bot));

  console.log(failures === 0 ? "\nwatch-deliver-test: PASS" : `\nwatch-deliver-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
