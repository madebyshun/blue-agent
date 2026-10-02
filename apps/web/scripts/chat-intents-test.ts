/**
 * chat-intents-test — which questions force my_alerts (lib/chat/intents.ts).
 * Asking to SEE alerts must reach the alert store; asking to SET one must not
 * be hijacked (it needs set_price_alert and its arguments).
 */
import { wantsMyAlerts } from "../src/lib/chat/intents";

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

console.log(failures === 0 ? "\nchat-intents-test: PASS" : `\nchat-intents-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
