// Instant Blocky hire: exact per-Blocky URLs only; skills and prices per Blocky.
import { payoutMessageNames, parseBlockyUrl, blockyUrl, servicesFrom, instantToolForSkill, skillForTool, MAX_PRICE_USD, type CatalogTool } from "../src/lib/blocky-instant";
import { agentRecord, type LedgerEntry } from "../src/lib/agent-ledger";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  check("exact per-Blocky URL parses (any tool id shape)", JSON.stringify(parseBlockyUrl(blockyUrl("token-safety", "740"))) === '{"tool":"token-safety","n":"740"}');
  check("blocky=any refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=nav-premium&blocky=any") === null);
  check("other host refused", parseBlockyUrl("https://basecity.space.evil.io/api/x402?tool=nav-premium&blocky=1") === null);
  check("bare apex host refused (exact origin only)", parseBlockyUrl("https://basecity.space/api/x402?tool=nav-premium&blocky=1") === null);
  check("odd tool id refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=../x&blocky=1") === null);
  check("extra params refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=nav-premium&blocky=1&to=0xabc") === null);
  check("param order must be canonical", parseBlockyUrl("https://www.basecity.space/api/x402?blocky=1&tool=nav-premium") === null);

  const catalog: CatalogTool[] = [
    { id: "token-safety", guild: "security", task: "Token safety", input: { properties: { token: {} } } },
    { id: "nav-premium", guild: "market", task: "NAV premium", input: { properties: { ticker: {} } } },
    { id: "blocky-card", guild: "creative", task: "Card", input: { properties: { blocky: {} } } },
  ];
  const svc = servicesFrom("740", catalog, { guild: "security", level: 1, skills: ["token-safety", "unknown-tool", "nav-premium"], prices: { "token-safety": 0.01, "nav-premium": 5 } });
  check("only this Blocky's catalog skills, at its own price", svc.length === 1 && svc[0].url === blockyUrl("token-safety", "740") && svc[0].priceUsd === 0.01);
  check("price above the hard ceiling dropped", MAX_PRICE_USD === 0.1 && !svc.some((s) => s.url.includes("nav-premium")));
  check("token example is USDC on Base", JSON.stringify(svc[0].example) === '{"token":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}');
  const tx = servicesFrom("1", [{ id: "tx-explain", input: { properties: { tx: {} } } }], { skills: ["tx-explain"], prices: { "tx-explain": 0.005 } });
  check("tx stays blank (no invented hash)", JSON.stringify(tx[0].example) === '{"tx":""}');
  const card = servicesFrom("7", catalog, { skills: ["blocky-card"], prices: { "blocky-card": 0.005 } });
  check("blocky field prefilled with the Blocky number", JSON.stringify(card[0].example) === '{"blocky":"7"}');
  check("stock tools map to job skills; others keep their id", instantToolForSkill("stock-weekend-gap")?.id === "weekend-gap" && skillForTool("nav-premium") === "stock-nav-premium" && skillForTool("token-safety") === "token-safety");

  const o = "0x" + "a".repeat(40), pay = "0x" + "e".repeat(40);
  const msg = `BaseCity: payout for Blocky Agents\n\nWallet ${o}\nBlockies 717,759\nPayout ${pay.toUpperCase().replace("0X", "0x")}\nIssued 2026-11-19T00:00:00Z`;
  check("payout message names owner, Blocky and payout", payoutMessageNames(msg, o, "759", pay));
  check("payout message refused for a Blocky it does not list", !payoutMessageNames(msg, o, "75", pay));
  check("payout message refused for another owner or payout", !payoutMessageNames(msg, "0x" + "b".repeat(40), "759", pay) && !payoutMessageNames(msg, o, "759", "0x" + "f".repeat(40)));
  check("payout message must be BaseCity's", !payoutMessageNames(msg.replace("BaseCity:", "Other:"), o, "759", pay));
  const owner = "0x" + "a".repeat(40), payTo = owner;
  const e = (did: string, payer: string): LedgerEntry => ({ jobId: "instant", did, title: "t", skill: "token-safety", ticker: null, at: "", priceUnits: 10_000, payTo, kind: "instant", unlock: { tx: null, payer, at: "" } });
  const r = await agentRecord([e("1", "0x" + "b".repeat(40)), e("2", owner), e("3", "0x00fd29b7d6dbf13afb879afbb239db1d48ce746f")], [owner]);
  check("instant: self-paid and team-paid excluded", r.instantCalls === 1 && r.delivered === 0);
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
