/**
 * Guard: SOUL is the one identity surface that speaks in prose, and `/api/chat`
 * prepends it to EVERY system prompt. A stale line here is not a docs bug — it
 * is the agent asserting something false to a user, in its own voice, on every
 * message.
 *
 * Run: `npx tsx scripts/soul-truth-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — imports soul.ts and reads two files off disk. No network.
 *
 * 🔴 MEASURED 2026-09-27. The identity block read:
 *     token  — "$BLUEAGENT · 0xf895…56ba3 (Base)"
 *     chains — "… $BLUEAGENT, the Hub, and token launches live there"
 * Both were stale, and every other surface already knew it. `/pledge` calls that
 * same address "old $BLUEAGENT", `/app/rewards` says the staking flow was pulled
 * for the relaunch, and `.well-known/agent.json` pins `"status": "pre-migration"`
 * next to "do not treat it as the live reward asset". So the machine-readable
 * manifest was right and the sentence a human reads was wrong — the inverse of
 * the usual drift, and worse, because nobody proof-reads a system prompt.
 * (Token launches died with the Bankr launchpad on 2026-09-06 and nothing
 * replaced them: no `b20-deploy` handler exists and `b20_encode_payment` is the
 * only `b20_` name in the manifest.)
 *
 * TWO assertions, because either one alone is escapable:
 *
 *   1. The generated root SOUL.md matches SOUL_MD. `sync-soul.ts` has carried a
 *      `--check` flag for precisely this since it was written, and its header
 *      says "so CI or a pre-commit hook can catch a soul.ts edit that forgot to
 *      sync" — but nothing ever called it. run-tests.ts discovers
 *      `scripts/*-test.ts` and `scripts/*-check.ts`; `sync-soul.ts` matches
 *      neither pattern, so it never ran. A guard nobody invokes is not a guard,
 *      which is the whole reason this file is named `-check`.
 *
 *   2. soul.ts and agent.json must AGREE on which token is current. Expressed as
 *      an equality rather than a hardcoded address, so the relaunch does not have
 *      to remember this file: swap the address in both and the check keeps
 *      passing; swap it in one and it fails. While agent.json says
 *      `pre-migration`, the SOUL row must also carry that status in words —
 *      paired with a presence assertion on the address, because otherwise
 *      deleting the row would satisfy the qualifier check while leaving the agent
 *      unable to answer "what is the token address" at all.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOUL_MD, SOUL_SECTIONS } from "../src/lib/soul";

const ROOT = process.cwd();
let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

// ── 1. the published artifact is not stale ───────────────────────────────────
// /soul links people at the raw GitHub URL and invites them to fork SOUL.md, so
// a drifted copy is a published lie, not an untidy build output.
const soulMdPath = join(ROOT, "..", "..", "SOUL.md");
const onDisk = (() => {
  try { return readFileSync(soulMdPath, "utf8"); } catch { return null; }
})();
check("1.1 repo-root SOUL.md exists", onDisk !== null);
check(
  "1.2 …and is byte-identical to SOUL_MD (run `npm run sync:soul`)",
  onDisk === SOUL_MD,
);

// ── 2. the token row agrees with the machine-readable manifest ───────────────
const agent = JSON.parse(
  readFileSync(join(ROOT, "public/.well-known/agent.json"), "utf8"),
) as { agent?: { token?: { address?: string; status?: string; note?: string } } };

const manifestAddr = agent.agent?.token?.address?.toLowerCase() ?? "";
const manifestStatus = agent.agent?.token?.status ?? "";
check(`2.1 agent.json publishes a token address (${manifestAddr || "none"})`,
      /^0x[0-9a-f]{40}$/.test(manifestAddr));

const identity = SOUL_SECTIONS.find((s) => s.id === "identity");
check("2.2 SOUL has an identity section", !!identity);
const tokenRow = identity?.content.find((r) => r.k === "token");
check("2.3 …with a `token` row", !!tokenRow);

const rowText = tokenRow?.v ?? "";
check(
  `2.4 the SOUL token row names the SAME address agent.json does (${manifestAddr})`,
  manifestAddr !== "" && rowText.toLowerCase().includes(manifestAddr),
);

// Only while the manifest itself says we are mid-relaunch. Once the new token
// ships, agent.json drops `pre-migration` and this stops demanding the caveat —
// no dated string in here to go stale.
if (manifestStatus === "pre-migration") {
  check(
    "2.5 …and, while agent.json says `pre-migration`, says so in words too",
    /\bpre-relaunch\b|\bOLD token\b/i.test(rowText),
  );
  check(
    "2.6 …and tells the agent not to present it as the live reward asset",
    /live reward asset/i.test(rowText),
  );
} else {
  // Not a silent skip: if the status changed, this file's premise changed, and
  // whoever changed it should confirm the SOUL row moved with it.
  check(
    `2.5 agent.json status is "${manifestStatus}", not "pre-migration" — re-read the SOUL token row and this header, then update both`,
    false,
  );
}

console.log(`\nsoul truth guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
