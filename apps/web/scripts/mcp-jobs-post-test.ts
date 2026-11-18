// MCP jobs_post (2026-11-18): first call returns a preview + v2 message, never posts.
import { mcpJobsPost } from "../src/lib/mcp-jobs";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  const r = await mcpJobsPost({ title: "NAV premium for NVDA on Base", brief: "Base 8453 only. Oracle vs pool at one block.", budgetUsd: 0.5, skill: "stock-nav-premium", token: "0xb20000000000000000000078ee7ce2fE4908108C", invitedAgentId: "1205445" });
  const j = JSON.parse(r.text);
  check("unsigned call returns needs_signature, not an error", !r.isError && j.status === "needs_signature");
  check("message is v2 with readable title and budget", j.sign.message.startsWith("Blue Agent job post v2\nDomain: blueagent.dev | Base 8453\ntitle: NAV premium for NVDA on Base\nbudget-usd: 0.50 USDC on Base"));
  check("preview carries the invite and the verified stock", j.preview.invited_agent_id === "1205445" && j.preview.stock.ticker === "NVDA" && j.preview.invite_hours === 48);
  check("web fallback link carries agent and skill", j.no_wallet.includes("/jobs?agent=1205445&skill=stock-nav-premium"));
  check("bad budget refused before anything", (await mcpJobsPost({ title: "abcd", brief: "0123456789", budgetUsd: 500 })).isError === true);
  check("ticker without token refused", (await mcpJobsPost({ title: "abcd", brief: "0123456789", budgetUsd: 1, skill: "stock-nav-premium", ticker: "NVDA" })).isError === true);
  check("bad blocky id refused", (await mcpJobsPost({ title: "abcd", brief: "0123456789", budgetUsd: 1, blocky: "x" })).isError === true);
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
