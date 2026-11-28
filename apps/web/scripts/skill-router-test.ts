/**
 * Verification suite for Blue Chat's 6 Domain Skill Packs & Tool-Subset Router.
 *
 * Checks:
 *  1. Every active Hub tool in route.ts (minus CHAT_HIDDEN_TOOLS) is covered by
 *     at least one of the 6 domain skills (zero orphaned tools).
 *  2. Zero tool names leak into any skill's `facts` or `buildCompactProductMap()`.
 *  3. Real prod prompts select the right domain(s) and keep B20 out of Quadra v3.
 *  4. Token load per domain drops dramatically vs the old ~23.8k-token baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ALL_DOMAIN_SKILL_IDS,
  DOMAIN_SKILLS,
  selectDomainSkills,
  selectToolSubset,
  buildSelectedSkillsPrompt,
} from "../src/lib/chat/skill-router";
import { CHAT_HIDDEN_TOOLS } from "../src/lib/chat-hidden-tools";
import { SOUL_MD } from "../src/lib/soul";
import { buildBaseSystem, buildAgentCapabilities, buildCompactProductMap } from "../src/app/api/chat/system-prompt";

const WEB = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const ROUTE = readFileSync(path.join(WEB, "src/app/api/chat/route.ts"), "utf8");

let checks = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const allRouteTools = [...ROUTE.matchAll(/^\s{4}name:\s*"([a-z0-9_]+)",$/gm)].map((m) => m[1]);
const activeTools = allRouteTools.filter((t) => !CHAT_HIDDEN_TOOLS.has(t));
const coveredTools = new Set<string>();
for (const id of ALL_DOMAIN_SKILL_IDS) {
  for (const t of DOMAIN_SKILLS[id].tools) coveredTools.add(t);
}
const orphaned = activeTools.filter((t) => !coveredTools.has(t));

check("all active Hub tools are covered by the 6 domain skills",
  orphaned.length === 0,
  orphaned.length ? `orphaned: ${orphaned.join(", ")}` : `${activeTools.length}/${activeTools.length} covered`);

const noToolText = [
  SOUL_MD,
  buildCompactProductMap(),
  buildSelectedSkillsPrompt(ALL_DOMAIN_SKILL_IDS, false),
].join("\n\n");
const leaked = allRouteTools.filter((t) => noToolText.includes(t));
check("zero tool names leak in compact map or any skill facts (hasTools=false)",
  leaked.length === 0,
  leaked.length ? `leaked: ${leaked.join(", ")}` : "0 leaked");

// Routing accuracy on key prod prompts
const routingCases: Array<{ prompt: string; mustInclude: string[]; mustExclude?: string[] }> = [
  { prompt: "Cách Quadra v3 launch token vào Uniswap v4", mustInclude: ["quadra-launchpad"], mustExclude: ["b20"] },
  { prompt: "B20 là gì và MINT_ROLE hoạt động thế nào?", mustInclude: ["b20"], mustExclude: ["quadra-launchpad"] },
  { prompt: "So sánh giá DEX vs Chainlink qua Oracle Drift", mustInclude: ["markets-stocks"], mustExclude: ["b20"] },
  { prompt: "Blue Chat gửi token trên Base bằng Basename được không?", mustInclude: ["trade-wallet-alerts"], mustExclude: ["b20"] },
  { prompt: "send 0.2 USDC to madebyshun.base.eth on Base", mustInclude: ["trade-wallet-alerts"] },
  { prompt: "Blue Agent đang build gì ở trang /exchange? Khác gì với /jobs?", mustInclude: ["exchange-x402"], mustExclude: ["b20"] },
  { prompt: "Kiểm tra token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 có honeypot không?", mustInclude: ["security-pretrade"] },
  { prompt: "Viết game rắn săn mồi bằng HTML", mustInclude: [], mustExclude: ["b20", "quadra-launchpad"] },
];

for (const tc of routingCases) {
  const got = selectDomainSkills([{ role: "user", content: tc.prompt }]);
  const okInc = tc.mustInclude.every((id) => got.includes(id as never));
  const okExc = (tc.mustExclude ?? []).every((id) => !got.includes(id as never));
  const subset = selectToolSubset(got);
  check(`route "${tc.prompt.slice(0, 46)}"`, okInc && okExc, `skills=[${got.join(",")}] tools=${subset.size}`);
}

// Token budget verification
const tok = (n: number) => Math.round(n / 4);
const coreWithTools = [
  SOUL_MD,
  buildBaseSystem({ hasWebSearch: false, hasTools: true, scopedTools: true }),
  buildAgentCapabilities(true),
  buildCompactProductMap(),
].join("\n\n");
const coreNoTools = [
  SOUL_MD,
  buildBaseSystem({ hasWebSearch: false, hasTools: false, scopedTools: true }),
  buildAgentCapabilities(false),
  buildCompactProductMap(),
].join("\n\n");

check("slim core prompt (hasTools=true) stays under 3,500 tokens",
  tok(coreWithTools.length) < 3500, `~${tok(coreWithTools.length)} tok (${coreWithTools.length} chars)`);
check("slim core prompt (hasTools=false) stays under 3,500 tokens",
  tok(coreNoTools.length) < 3500, `~${tok(coreNoTools.length)} tok (${coreNoTools.length} chars)`);

for (const id of ALL_DOMAIN_SKILL_IDS) {
  const fullSys = `${coreWithTools}\n\n${buildSelectedSkillsPrompt([id], true)}`;
  const subset = selectToolSubset([id]);
  check(`domain "${id}" system prompt under 4,500 tok & <= 10 tools`,
    tok(fullSys.length) < 4500 && subset.size <= 10,
    `~${tok(fullSys.length)} tok, ${subset.size} tools`);
}

// Disabled skill exclusion (must not leak back via DEFAULT_TOOL_SUBSET)
const disabledTrade = new Set(["trade-wallet-alerts"]);
const matchedTrade = selectDomainSkills([{ role: "user", content: "swap $10 eth to usdc" }])
  .filter((id) => !disabledTrade.has(id));
const subsetAfterDisable = selectToolSubset(matchedTrade, disabledTrade);
check("disabling trade-wallet-alerts strips prepare_swap/prepare_send/check_wallet from fallback",
  !subsetAfterDisable.has("prepare_swap") &&
  !subsetAfterDisable.has("prepare_send") &&
  !subsetAfterDisable.has("check_wallet") &&
  subsetAfterDisable.has("hub_token_price"),
  `tools=[${[...subsetAfterDisable].join(",")}]`);

console.log(`\n${failures ? "FAIL" : "PASS"} — ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
