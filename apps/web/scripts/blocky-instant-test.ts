// Instant Blocky hire (2026-11-18): only exact per-Blocky URLs are relayable.
import { parseBlockyUrl, blockyUrl, blockyServices, instantToolForSkill } from "../src/lib/blocky-instant";
import { agentRecord, type LedgerEntry } from "../src/lib/agent-ledger";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  check("exact per-Blocky URL parses", JSON.stringify(parseBlockyUrl(blockyUrl("nav-premium", "101"))) === '{"tool":"nav-premium","n":"101"}');
  check("blocky=any refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=nav-premium&blocky=any") === null);
  check("other host refused", parseBlockyUrl("https://basecity.space.evil.io/api/x402?tool=nav-premium&blocky=1") === null);
  check("bare apex host refused (exact origin only)", parseBlockyUrl("https://basecity.space/api/x402?tool=nav-premium&blocky=1") === null);
  check("unknown tool refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=drain&blocky=1") === null);
  check("extra params refused", parseBlockyUrl("https://www.basecity.space/api/x402?tool=nav-premium&blocky=1&to=0xabc") === null);
  check("param order must be canonical", parseBlockyUrl("https://www.basecity.space/api/x402?blocky=1&tool=nav-premium") === null);
  check("services carry both tools at catalog prices", blockyServices("7").map((s) => `${s.url}|${s.priceUsd}`).join(",") === `${blockyUrl("nav-premium", "7")}|0.02,${blockyUrl("after-hours-volume", "7")}|0.01`);
  check("skill maps to instant tool; weekend gap does not", instantToolForSkill("stock-nav-premium")?.id === "nav-premium" && instantToolForSkill("stock-weekend-gap") === null);
  const owner = "0x" + "a".repeat(40), payTo = owner;
  const e = (did: string, payer: string, kind?: "instant"): LedgerEntry => ({ jobId: "instant", did, title: "t", skill: "stock-nav-premium", ticker: "NVDA", at: "", priceUnits: 20_000, payTo, ...(kind ? { kind } : {}), unlock: { tx: null, payer, at: "" } });
  const r = await agentRecord([e("1", "0x" + "b".repeat(40), "instant"), e("2", "0x" + "c".repeat(40), "instant"), e("3", owner, "instant")], [owner]);
  check("instant calls kept out of job totals", r.delivered === 0 && r.purchased === 0);
  check("instant self-paid excluded, others counted", r.instantCalls === 2 && Math.abs(r.instantUsd - 0.04) < 1e-9);
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
