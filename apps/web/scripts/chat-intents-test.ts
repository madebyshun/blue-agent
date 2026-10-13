/**
 * chat-intents-test — which questions force my_alerts (lib/chat/intents.ts).
 * Asking to SEE alerts must reach the alert store; asking to SET one must not
 * be hijacked (it needs set_price_alert and its arguments).
 */
import { forcedToolFor, tradeToolFor, wantsMyAlerts } from "../src/lib/chat/intents";

let failures = 0;
const u = (content: string) => [{ role: "user", content }];
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }

for (const q of ["summarize my alerts", "my alerts", "show my alerts", "what am I watching?", "list my price alerts", "check my automations", "cảnh báo của tôi"]) {
  ok(`forces my_alerts: "${q}"`, wantsMyAlerts(u(q)));
}
for (const q of ["alert me if ETH on Base drops 5% in 24h", "set a price alert for cbBTC above 100000", "notify me when NVDA on robinhood drops below $220", "báo tôi nếu ETH giảm 5%", "what's trending on Base?", "how do alerts work?"]) {
  ok(`does not force: "${q}"`, !wantsMyAlerts(u(q)));
}
ok("only the LAST message counts", !wantsMyAlerts([{ role: "user", content: "my alerts" }, { role: "assistant", content: "…" }]));
ok("a long message is not a bare request", !wantsMyAlerts(u("my alerts " + "x".repeat(200))));

// tradeToolFor — measured 2026-10-13: "Swap $1 eth to usdc on Base" ran no tool.
for (const q of ["Swap $1 eth to usdc on Base", "swap 0.5 USDC to ETH on Base", "Buy 1 USDC of NVDAc on Base", "sell 0.001 NVDAc for USDC", "convert 10 usdc to eth"]) {
  ok(`forces prepare_swap: "${q}"`, tradeToolFor(u(q)) === "prepare_swap");
}
ok("a Robinhood trade forces robinhood_swap", tradeToolFor(u("buy $5 of TSLA on robinhood")) === "robinhood_swap");
for (const q of ["should I buy 1 ETH?", "how do I swap 5 USDC?", "swap ETH to USDC", "what is a swap", "I sold 2 ETH yesterday"]) {
  ok(`does not force a trade: "${q}"`, tradeToolFor(u(q)) === null);
}

// forcedToolFor — measured 2026-10-13 (second manual test)
ok("a pasted EIP-712 payload forces hub_sign_check", forcedToolFor(u('{"domain":{"name":"Seaport","chainId":8453},"primaryType":"OrderComponents","message":{}} What does signing this do?')) === "hub_sign_check");
ok("'is 0x… safe?' forces hub_pretrade", forcedToolFor(u("Is 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b safe?")) === "hub_pretrade");
ok("a pool address 'is this safe?' forces hub_pretrade", forcedToolFor(u("0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9 is this safe?")) === "hub_pretrade");
ok("Vietnamese 'có an toàn không' forces hub_pretrade", forcedToolFor(u("0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b có an toàn không")) === "hub_pretrade");
ok("'send 1 USDC to name.base.eth' forces prepare_send", forcedToolFor(u("Send 1 USDC to madebyshun.base.eth")) === "prepare_send");
ok("a Robinhood send forces robinhood_send", forcedToolFor(u("send 5 USDG to 0x92c0a50966CcDB5e25770CFFD64B4B249ADf42e9 on robinhood")) === "robinhood_send");
ok("trades still fall through to the trade tool", forcedToolFor(u("Buy 1 USDC of NVDAc on Base")) === "prepare_swap");
ok("'is ETH safe?' with no address forces nothing", forcedToolFor(u("is ETH safe?")) === null);
ok("'how do I send USDC?' forces nothing", forcedToolFor(u("how do I send 5 USDC to a friend?")) === null);

// wallet_brief (2026-10-13)
for (const q of ["what changed in my wallet?", "wallet brief", "morning brief please", "anything new in my wallet overnight?", "ví mình có gì thay đổi", "What has changed in my portfolio since yesterday?"]) {
  ok(`forces wallet_brief: "${q}"`, forcedToolFor(u(q)) === "wallet_brief");
}
for (const q of ["what's in my wallet", "check my balance", "how do I change wallets?", "what changed in 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b's wallet"]) {
  ok(`does not force wallet_brief: "${q}"`, forcedToolFor(u(q)) !== "wallet_brief");
}

console.log(failures === 0 ? "\nchat-intents-test: PASS" : `\nchat-intents-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
