/**
 * Guard: the x402 payee is ONE value, everywhere, or nobody gets paid.
 *
 * Run: `npx tsx scripts/x402-payee-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — source and static-asset reads only. No network, no wallet, no writes.
 *
 * WHY IT EXISTS
 * -------------
 * EIP-3009 `transferWithAuthorization` settles to exactly ONE recipient, and the
 * CDP facilitator compares the `authorization.to` the browser signed against the
 * `payTo` the server put in its 402. Equal → USDC moves. Unequal → every payment
 * fails verification. PR #284 learned that with the two copies that sign.
 *
 * 🔴 There were ELEVEN copies, and the extra nine are the dangerous ones, because
 * six of them PUBLISH the payee to agents that are not our browser:
 * /.well-known/pricing, /.well-known/openapi.json, /.well-known/ai-plugin.json,
 * /api/catalog, public/.well-known/agent.json, public/plugin.md. Change only the
 * two that sign and the result is WORSE than changing none: the Hub UI keeps
 * working while every external caller signs to the stale address and gets
 * refused — a break that shows up in someone else's logs, not ours.
 *
 * So the absence sweep below is the real content. The allowlist is two files and
 * both are named: lib/x402-payee.ts (the definition) and lib/payments.ts (chat
 * credits, deliberately a separate constant — see its comment).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { X402_PAY_TO } from "../src/lib/x402-payee";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── 1. the constant itself ───────────────────────────────────────────────────
check(`1.1 X402_PAY_TO is a 20-byte address (${X402_PAY_TO})`,
      /^0x[0-9a-fA-F]{40}$/.test(X402_PAY_TO));
// Wire format + three `.toLowerCase()` comparisons downstream assume lowercase.
check("1.2 …and is lowercase, which the wire format and the PAYMENT_WALLET compares assume",
      X402_PAY_TO === X402_PAY_TO.toLowerCase());

// ── 2. every live consumer reads the constant, none re-types the literal ─────
// Grouped by what a divergence actually breaks, because that is what decides
// whether a missing entry here is cosmetic or a payment outage.
const CONSUMERS: Record<string, string[]> = {
  "signs or settles": [
    "src/app/api/_lib/x402-cdp.ts",
    "src/app/hub/HubView.tsx",
  ],
  // api/simulator/route.ts was a third entry here until 2026-09-27, when it was
  // deleted for billing against a route that had not existed since 2026-05-29.
  "quotes a price then verifies it": [
    "src/app/api/tool/[toolId]/route.ts",
    "src/app/api/tool/_debug/route.ts",
  ],
  "catalog default payee": [
    "src/lib/agent-tools.ts",
  ],
  // Found by 3.1 below, not by reading — a stale value here publishes the
  // balance of, and a discovery link to, a wallet the tools do not pay.
  "publishes a number about the payee": [
    "src/app/api/stats/route.ts",
    "src/app/hub/_components/StatsView.tsx",
  ],
  "publishes the payee to foreign agents": [
    "src/app/.well-known/pricing/route.ts",
    "src/app/.well-known/openapi.json/route.ts",
    "src/app/.well-known/ai-plugin.json/route.ts",
    "src/app/api/catalog/route.ts",
  ],
};

for (const [why, files] of Object.entries(CONSUMERS)) {
  for (const f of files) {
    const src = read(f);
    check(`2.${why} — ${f} imports X402_PAY_TO`,
          /\bX402_PAY_TO\b/.test(src) && /from\s+"@\/lib\/x402-payee"/.test(src));
    check(`2.${why} — ${f} does not re-type the literal`,
          !src.toLowerCase().includes(X402_PAY_TO));
  }
}

// ── 3. absence sweep: nothing else under src/ hardcodes the payee ────────────
const ALLOWED = new Set([
  "src/lib/x402-payee.ts", // the definition
  "src/lib/payments.ts",   // chat credits — separate by decision, see its comment
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const scanned = walk(join(ROOT, "src"));
const hardcoded = scanned
  .map((p) => ({ f: relative(ROOT, p), hit: readFileSync(p, "utf8").toLowerCase().includes(X402_PAY_TO) }))
  .filter((r) => r.hit)
  .map((r) => r.f);

check(`3.1 no file under src/ hardcodes the payee outside the allowlist (${hardcoded.filter((f) => !ALLOWED.has(f)).join(", ") || "none"})`,
      hardcoded.every((f) => ALLOWED.has(f)));

/* 🔴 3.1 is an ABSENCE assertion, and those pass hardest once they have gone
   blind: point `walk` at a directory that no longer exists the way it used to,
   or let the address casing drift, and it reports success over a tree it never
   read. 3.2 and 3.3 prove it can still both reach files and recognise a match,
   so it fails loudly when it stops being able to see. */
check(`3.2 …and the sweep actually read the tree (${scanned.length} files)`,
      scanned.length > 300);
check("3.3 …and can still recognise the literal where it is supposed to be",
      hardcoded.includes("src/lib/x402-payee.ts"));

// ── 3b. the inverse sweep: an address in a manifest that is NOT the payee ────
/* 🔴 3.1 searches for the CORRECT literal turning up where it should not. That
   shape is structurally blind to the opposite mistake, and the opposite mistake
   is the one that actually shipped.

   MEASURED 2026-09-27: /.well-known/ai-tool/{id}.json published
   `pricing[].recipient: eip155:8453:0x62b45ff0…` — the ERC-8257 deployer wallet,
   not the payee — for every paid tool. The endpoint's own 402 quotes
   X402_PAY_TO and CDP settles only on an exact match, so an agent that trusted
   the manifest signed to the wrong address and was refused. Nothing here fired:
   3.1 cannot see an address it is not looking for, and the file was absent from
   group 2 because it did not import the constant it was supposed to publish.
   The Hub UI reads the constant and kept working throughout, which is why the
   x402-payee.ts header calls this the hardest version of the bug to notice.

   So this group asserts the complement over the manifest routes — the files
   whose entire job is telling a foreign agent where to send money. Every
   40-hex literal in them must be a NAMED, explained exception. An unexplained
   address in a manifest is the bug, whatever its value. */
const MANIFEST_DIRS = [
  "src/app/.well-known",
  "src/app/api/x402/.well-known",
  "src/app/api/catalog",
];
/** Each entry is a role this address plays, so a future reader can tell whether
 *  a new exception is legitimate or is someone silencing a real failure. */
const KNOWN_NON_PAYEE: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC on Base — the asset, not a recipient",
  "0x265bb2dbfc0a8165c9a1941eb1372f349bad2cf1": "ERC-8257 ToolRegistry contract",
  "0x62b45ff0ff8620d36a48dd981614fd27fa52a8a2":
    "ERC-8257 creatorAddress — who REGISTERED the tool. Legitimate in `creatorAddress`; " +
    "it was ALSO used as pricing[].recipient until 2026-09-27, which is the bug this group exists for.",
};
const manifestFiles = MANIFEST_DIRS.flatMap((d) => walk(join(ROOT, d)));
check(`3b.1 …and the manifest sweep actually read something (${manifestFiles.length} files)`,
      manifestFiles.length >= 3);
const strays: string[] = [];
for (const p of manifestFiles) {
  const body = readFileSync(p, "utf8");
  for (const m of body.matchAll(/0x[0-9a-fA-F]{40}/g)) {
    const a = m[0].toLowerCase();
    if (a === X402_PAY_TO || a in KNOWN_NON_PAYEE) continue;
    strays.push(`${relative(ROOT, p)}: ${m[0]}`);
  }
}
check(`3b.2 no unexplained address literal in a published manifest (${strays.join(", ") || "none"})`,
      strays.length === 0);
/* The recipient itself, pinned by VALUE rather than by absence — 3b.2 would
   stay green if someone deleted the pricing block entirely. */
const aiToolRoute = read("src/app/.well-known/ai-tool/[tool]/route.ts");
check("3b.3 the ERC-8257 manifest builds pricing[].recipient from the payee constant",
      /recipient:\s*`eip155:8453:\$\{PAY_TO\}`/.test(aiToolRoute));
check("3b.4 …and PAY_TO there is X402_PAY_TO, not a local literal",
      /const\s+PAY_TO\s*=\s*X402_PAY_TO\s*;/.test(aiToolRoute));

// ── 4. the static published files cannot import, so pin them here ────────────
// These are what an indexing agent reads before it ever touches a route.
const agentJson = read("public/.well-known/agent.json");
const agentPayees = [...agentJson.matchAll(/"payTo"\s*:\s*"(0x[0-9a-fA-F]{40})"/g)].map((m) => m[1].toLowerCase());
check(`4.1 public/.well-known/agent.json declares at least one payTo (${agentPayees.length})`,
      agentPayees.length > 0);
check(`4.2 …and every one of them is the current payee (${[...new Set(agentPayees)].join(", ")})`,
      agentPayees.every((a) => a === X402_PAY_TO));

const pluginMd = read("public/plugin.md");
const pluginAddrs = [...pluginMd.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0].toLowerCase());
check("4.3 public/plugin.md names the payee",
      pluginAddrs.includes(X402_PAY_TO));
// The retired Bankr Club wallet. It paid out for months, so it is the single
// most likely stale value to survive a sweep — named, not inferred.
const RETIRED_PAYEE = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";
for (const [f, body] of [["public/plugin.md", pluginMd], ["public/.well-known/agent.json", agentJson]] as const) {
  check(`4.4 ${f} does not still advertise the retired payee`,
        !body.toLowerCase().includes(RETIRED_PAYEE));
}

// ── 5. the operating docs state the live value ───────────────────────────────
// Not decoration: CLAUDE.md and AGENTS.md are what the next agent reads before
// touching the payment path, and a doc naming a dead wallet is how a correct
// change gets reverted by someone being careful.
for (const f of ["../../CLAUDE.md", "../../AGENTS.md"]) {
  check(`5.1 ${f.replace("../../", "")} names the current payee`,
        read(f).toLowerCase().includes(X402_PAY_TO));
}

console.log(`\nx402-payee guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
