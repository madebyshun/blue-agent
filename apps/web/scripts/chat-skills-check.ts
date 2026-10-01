/**
 * chat-skills-check — the Skills page (rebuilt 2026-10-01) only promises what
 * Chat can do. A skill card is a promise that typing its trigger reaches a
 * real tool; this file pins that promise to the chat route's own tool list.
 *
 *   §1  every tool a live skill names is registered in Chat (ALL_HUB_TOOLS)
 *       and not hidden (CHAT_HIDDEN_TOOLS)
 *   §2  every meter id is a real catalog id (or a /api/console blue_* counter)
 *   §3  "no tool fee" is true: NO_FEE_CHAT_TOOLS are native cards/readers or
 *       FREE_DIRECT in the route, and no metered skill uses only them
 *   §4  trade skills sign; every loop skill names its chains
 */
import fs from "node:fs";
import path from "node:path";
import { AGENT_SKILLS, NO_FEE_CHAT_TOOLS } from "../src/app/chat/agent-skills";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { CHAT_HIDDEN_TOOLS } from "../src/lib/chat-hidden-tools";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const route = fs.readFileSync(path.resolve(__dirname, "../src/app/api/chat/route.ts"), "utf8");
const toolsBlock = route.slice(route.indexOf("const ALL_HUB_TOOLS = ["), route.indexOf("const HUB_TOOLS ="));
const registered = new Set([...toolsBlock.matchAll(/^\s{4}name: "([a-z0-9_]+)"/gm)].map((m) => m[1]));
// Imported, not parsed: the set moved to lib/chat-hidden-tools.ts (2026-10-01).
const hidden = CHAT_HIDDEN_TOOLS;
const freeBlock = route.slice(route.indexOf("const FREE_DIRECT"), route.indexOf("const apiPath"));
const freeDirect = new Set([...freeBlock.matchAll(/^\s+(hub_[a-z0-9_]+):/gm)].map((m) => m[1]));
const catalog = new Set(AGENT_TOOLS.map((t) => t.id));

console.log(`\nchat registers ${registered.size} tools, hides ${hidden.size}, calls ${freeDirect.size} directly`);
ok("the parse found the chat tool list", registered.size > 20 && registered.has("prepare_swap") && registered.has("check_wallet"));
ok("the route filters by the shared hidden set", /import \{ CHAT_HIDDEN_TOOLS \} from "@\/lib\/chat-hidden-tools"/.test(route)
  && route.includes("ALL_HUB_TOOLS.filter((t) => !CHAT_HIDDEN_TOOLS.has(t.name))"));

console.log("\n1. every live skill's tools are offered in Chat");
const live = AGENT_SKILLS.filter((s) => s.status === "active");
for (const s of live) {
  const bad = (s.tools ?? []).filter((t) => !registered.has(t) || hidden.has(t));
  ok(`${s.id}: ${(s.tools ?? []).join(", ") || "(prompt-only)"}`, bad.length === 0, bad.join(", "));
}

console.log("\n2. meter ids are catalog ids");
for (const s of live) {
  const bad = (s.meterIds ?? []).filter((id) => !catalog.has(id) && !/^blue_(idea|build|audit|ship|raise)$/.test(id));
  if ((s.meterIds ?? []).length) ok(`${s.id}: ${s.meterIds!.join(", ")}`, bad.length === 0, bad.join(", "));
}

console.log("\n3. \"no tool fee\" is true");
// A native tool is answered inside the chat route itself: it has its own
// `if (toolName === "<name>")` branch and NO entry in TOOL_ENDPOINT, so it can
// never reach the x402 runner that bills. Derived from the route, not listed —
// a hand list here would let a renamed or re-routed tool keep its "no fee" tag.
const endpointBlock = route.slice(route.indexOf("const TOOL_ENDPOINT"), route.indexOf("};", route.indexOf("const TOOL_ENDPOINT")));
const endpointNames = new Set([...endpointBlock.matchAll(/^\s+([a-z0-9_]+):/gm)].map((m) => m[1]));
const native = new Set([...route.matchAll(/toolName === "([a-z0-9_]+)"/g)].map((m) => m[1]).filter((t) => !endpointNames.has(t)));
ok("TOOL_ENDPOINT was parsed (else every tool would look native)", endpointNames.size > 20, `${endpointNames.size}`);
for (const t of NO_FEE_CHAT_TOOLS) {
  ok(`${t} is a native card/reader or FREE_DIRECT in the route`, native.has(t) || freeDirect.has(t));
}
for (const s of live.filter((x) => x.tools?.length && x.tools.every((t) => NO_FEE_CHAT_TOOLS.has(t)))) {
  ok(`${s.id} runs only no-fee tools, so it carries no meter id`, !(s.meterIds ?? []).length);
}

console.log("\n4. the loop's shape");
for (const s of live.filter((x) => x.group && x.group !== "build")) {
  ok(`${s.id}: names its chains`, (s.chains ?? []).length > 0);
}
for (const s of live.filter((x) => x.group === "trade")) {
  ok(`${s.id}: a trade skill builds a card the user signs`, s.signs === true);
}

console.log(failures === 0 ? "\nchat-skills-check: PASS" : `\nchat-skills-check: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
