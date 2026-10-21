/**
 * paid-tools-test — chat tools that cost credits on top of the message ask
 * first (lib/chat/paid-tools.ts, 2026-10-21).
 */
import { PAID_CONFIRM_TOOLS, PAID_PENDING_MS, isFresh, paidPrompt } from "../src/lib/chat/paid-tools";
import { toolCreditCost } from "../src/lib/credit-pricing";
import { getTierInfo } from "../src/lib/credits";
import { readFileSync } from "node:fs";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }

const p = paidPrompt("hub_deep_analysis", 1000, 2500);
ok("the price is said before anything runs", p === "A deep analysis costs 1,000 credits on top of this message. You have 2,500. Reply **yes** to run it.", p);
ok("short of credits: says to top up first", /You have 180, so top up first/.test(paidPrompt("hub_honeypot", 200, 180)));
ok("balance unread: no invented number", !/You have/.test(paidPrompt("hub_honeypot", 200, null)));

const now = 1_800_000_000_000;
ok("a fresh parked call runs", isFresh({ tool: "hub_deep_analysis", args: {}, at: now - 1000 }, now));
ok("an old one does not", !isFresh({ tool: "hub_deep_analysis", args: {}, at: now - PAID_PENDING_MS - 1 }, now));
ok("a tool outside the paid set never runs from a parked call", !isFresh({ tool: "prepare_swap", args: {}, at: now }, now));

// Every paid chat tool maps to a catalog id that really costs credits.
const route = readFileSync("src/app/api/chat/route.ts", "utf8");
const t0 = getTierInfo(0);
for (const name of PAID_CONFIRM_TOOLS) {
  const id = route.match(new RegExp(`\\n\\s*${name}:\\s*"([a-z0-9-]+)"`))?.[1];
  ok(`${name} → ${id} costs credits`, !!id && toolCreditCost(id, t0) > 0);
}

console.log(failures === 0 ? "\npaid-tools-test: PASS" : `\npaid-tools-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
