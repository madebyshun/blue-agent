// Direct hire (BaseCity plan, 2026-11-18): an invited agent holds a job for 48h.
import { activeInvite, deliveryProblem, inviteSpec, INVITE_MS, type Job } from "../src/lib/jobs";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

check("no invite → null", inviteSpec(undefined) === null && inviteSpec("") === null);
check("'#1205445' accepted as an id", inviteSpec("#1205445") === "1205445");
check("non-digit id refused", typeof inviteSpec("abc") === "object");

const now = Date.parse("2026-11-18T00:00:00Z");
const base: Job = { id: "aaaaaaaaaaaa", title: "t", brief: "b", budgetUnits: 1_000_000, poster: "0x" + "1".repeat(40), status: "open", createdAt: "", deliveries: [],
  invitedAgentId: "42", inviteUntil: new Date(now + INVITE_MS).toISOString() };
const d = (agentId: string) => ({ agent: "0x" + "2".repeat(40), agentId, payTo: "0x" + "3".repeat(40), priceUsd: 0.5, preview: "a preview text", result: "r" });

check("invite active inside 48h", activeInvite(base, now + 3600_000) === "42");
check("invite lapses after 48h", activeInvite(base, now + INVITE_MS + 1) === null);
check("invited agent may deliver", deliveryProblem(base, d("42"), now + 1) === null);
check("other agent refused during the hold", /direct hire for agent #42/.test(deliveryProblem(base, d("7"), now + 1) ?? ""));
check("missing agentId refused during the hold", deliveryProblem(base, { ...d("42"), agentId: undefined }, now + 1) !== null);
check("anyone may deliver after the hold", deliveryProblem(base, d("7"), now + INVITE_MS + 1) === null);
const { invitedAgentId: _i, inviteUntil: _u, ...open } = base;
check("job without invite stays open to all", deliveryProblem(open, d("7"), now) === null);

console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
