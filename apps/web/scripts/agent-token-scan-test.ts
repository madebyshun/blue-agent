/**
 * Control test — the AgentToken owner-power read must never turn an UNREAD
 * field into the reassuring answer.
 *
 * Run: `npx tsx scripts/agent-token-scan-test.ts` from `apps/web/`.
 * Hermetic — pure functions over synthetic ABI words. No RPC, no network, no
 * LLM, no clock. CI has no outbound network and this file must not want one.
 *
 * WHAT THIS PINS, AND WHY IT IS SHARPER THAN THE USUAL "null not 0" RULE.
 *
 * Three fields on this template have a meaningful zero and ALL THREE ARE THE
 * CALMING VALUE:
 *     owner() == 0x0                        → ownership renounced
 *     pendingOwner() == 0x0                 → no takeover queued
 *     botProtectionDurationInSeconds() == 0 → no trading restriction
 * So the usual failure — a failed read degrading to `0` — does not merely lose
 * information here. It fabricates the single most reassuring answer each field
 * can give, on a tool whose entire purpose is to say what the owner can still
 * do to you. Section D is the one that would catch that, and Section F proves
 * Section D can actually go red.
 *
 * MEASURED FIXTURES, NOT INVENTED ONES. The `BLUEAGENT` words below are the
 * real `eth_call` results read from `0x765eecec…27b3` on Robinhood Chain 4663
 * on 2026-09-27 — 1% buy, 1% sell, owner not renounced, blacklist lever
 * present, bot window 0. A test written against a token nobody deployed proves
 * the decoder agrees with the test author.
 *
 * WHY THE GUARD CANNOT BE SATISFIED BY DELETING THINGS. "Unread fields are
 * null" passes trivially in a build that returns null for EVERYTHING. So every
 * unread assertion is paired against the measured fixture, which must decode to
 * exact values — and Section F re-runs the battery against four deliberately
 * broken interpreters, each of which MUST fail. A guard that has never once
 * gone red is not a guard.
 */
import {
  AGENT_TOKEN_SELECTORS,
  AGENT_TOKEN_UNREAD,
  BLACKLIST_CALLDATA,
  HIGH_TAX_BPS,
  ZERO_ADDRESS,
  agentTokenFlags,
  agentTokenUnread,
  interpretAgentToken,
  makeAgentTokenProbe,
  readAgentToken,
  type AgentTokenProbes,
  type AgentTokenRead,
} from "../src/lib/agent-token";
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

// ── Word builders ──────────────────────────────────────────────────────────
// Built here rather than pasted so a fixture cannot drift into a malformed
// word that the decoder rejects for the wrong reason.

const ok = (data: string) => ({ ok: true as const, data });
const fail = { ok: false as const };

/** uint → 32-byte ABI word. */
const uintWord = (n: bigint | number) => ok(`0x${BigInt(n).toString(16).padStart(64, "0")}`);
/** address → 32-byte ABI word (12 zero bytes + 20 address bytes). */
const addrWord = (a: string) => ok(`0x${"0".repeat(24)}${a.replace(/^0x/, "").toLowerCase()}`);
/** dynamic string → offset + length + padded data. */
function strWord(s: string) {
  const hex = Buffer.from(s, "utf8").toString("hex");
  const len = (hex.length / 2).toString(16).padStart(64, "0");
  const body = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return ok(`0x${(32).toString(16).padStart(64, "0")}${len}${body}`);
}

// ── Fixture: $BLUEAGENT on Robinhood Chain 4663, measured 2026-09-27 ───────
//
// NOT the Base 8453 token of the same name. The two chains share no state and
// a ticker string identifies nothing — CLAUDE.md hard rule 1.

const BA_OWNER = "0xE220329659D41B2a9F26E83816B424bDAcF62567";
const BA_TAX_RECIPIENT = "0x6D80B81d9Fc56A7A839b1Af9006Eb49151961ce7";
const BA_VAULT = "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007";

const BLUEAGENT: AgentTokenProbes = {
  name: strWord("BLUEAGENT"),
  symbol: strWord("BLUEAGENT"),
  decimals: uintWord(18),
  totalSupply: uintWord(10n ** 27n),
  owner: addrWord(BA_OWNER),
  pendingOwner: addrWord(ZERO_ADDRESS),
  projectTaxRecipient: addrWord(BA_TAX_RECIPIENT),
  vault: addrWord(BA_VAULT),
  botProtection: uintWord(0),
  buyTax: uintWord(100),
  sellTax: uintWord(100),
  blacklist: uintWord(0), // answered `false` — the LEVER exists, that is the point
};

/** Same token with the levers given away: renounced, no blacklist (V1). */
const RENOUNCED: AgentTokenProbes = {
  ...BLUEAGENT,
  owner: addrWord(ZERO_ADDRESS),
  blacklist: fail,
};

/** An EOA, or the right address on the WRONG chain: nothing answers. */
const NOTHING: AgentTokenProbes = {};

/**
 * The trap this whole file exists for: the RPC answered the cheap ERC-20
 * getters and dropped every owner-power call. A build that defaults those to
 * `0` reports "renounced, no pending owner, no bot window" — three clean bills
 * of health it never measured.
 */
const PARTIAL: AgentTokenProbes = {
  name: strWord("BLUEAGENT"),
  symbol: strWord("BLUEAGENT"),
  decimals: uintWord(18),
  buyTax: uintWord(100),
  sellTax: uintWord(100),
  blacklist: uintWord(0),
  owner: fail,
  pendingOwner: fail,
  projectTaxRecipient: fail,
  vault: fail,
  botProtection: fail,
};

type Interpret = (p: AgentTokenProbes) => AgentTokenRead;

function main() {
  console.log("\nAgentToken owner-power scan — control test\n");

  // ── A. selectors are DERIVED, not transcribed ───────────────────────────
  //
  // A hand-copied selector is a silent call to a different function that
  // happens to answer, which is indistinguishable from a correct read.
  console.log("A. selectors derived from signatures:");
  // Expected values below were derived by a SECOND implementation — foundry's
  // `cast sig '<signature>'` — not copied from this file's own output, which
  // would only assert viem agrees with itself.
  check("totalBuyTaxBasisPoints() selector", AGENT_TOKEN_SELECTORS.buyTax === "0xeeae0f97",
    AGENT_TOKEN_SELECTORS.buyTax);
  check("totalSellTaxBasisPoints() selector", AGENT_TOKEN_SELECTORS.sellTax === "0x038272b6",
    AGENT_TOKEN_SELECTORS.sellTax);
  check("owner() selector", AGENT_TOKEN_SELECTORS.owner === "0x8da5cb5b",
    AGENT_TOKEN_SELECTORS.owner);
  check("pendingOwner() selector", AGENT_TOKEN_SELECTORS.pendingOwner === "0xe30c3978",
    AGENT_TOKEN_SELECTORS.pendingOwner);
  check("botProtectionDurationInSeconds() selector",
    AGENT_TOKEN_SELECTORS.botProtection === "0x63a9c1f2",
    AGENT_TOKEN_SELECTORS.botProtection);
  check("blacklists calldata carries the zero address as its ARGUMENT",
    BLACKLIST_CALLDATA.length === 2 + 8 + 64 && BLACKLIST_CALLDATA.endsWith("0".repeat(64)),
    `${BLACKLIST_CALLDATA.slice(0, 10)}…(${BLACKLIST_CALLDATA.length} chars)`);
  check("every selector is a distinct 4-byte value",
    new Set(Object.values(AGENT_TOKEN_SELECTORS)).size === Object.keys(AGENT_TOKEN_SELECTORS).length,
    `${Object.keys(AGENT_TOKEN_SELECTORS).length} selectors`);

  // ── B. the measured fixture decodes to the measured values ─────────────
  console.log("\nB. $BLUEAGENT (RH 4663) decodes to what the chain returned:");
  const ba = interpretAgentToken(BLUEAGENT);
  check("template is AgentTokenV4", ba.template === "AgentTokenV4", `${ba.template}`);
  check("buy tax 100 bps", ba.buy_tax === 100, `${ba.buy_tax}`);
  check("sell tax 100 bps", ba.sell_tax === 100, `${ba.sell_tax}`);
  check("bps formatted in code, not by a model", ba.buy_tax_pct === "1%", `${ba.buy_tax_pct}`);
  check("owner decoded EIP-55 checksummed", ba.owner === BA_OWNER, `${ba.owner}`);
  check("projectTaxRecipient decoded", ba.project_tax_recipient === BA_TAX_RECIPIENT,
    `${ba.project_tax_recipient}`);
  check("vault decoded", ba.vault === BA_VAULT, `${ba.vault}`);
  check("symbol decoded from a dynamic string", ba.symbol === "BLUEAGENT", `${ba.symbol}`);
  check("decimals 18", ba.decimals === 18, `${ba.decimals}`);
  check("totalSupply kept as a STRING — 1e27 does not survive Number",
    ba.total_supply === "1000000000000000000000000000", `${ba.total_supply}`);
  check("bot window 0 is a MEASURED zero, not a null", ba.bot_protection_seconds === 0,
    `${ba.bot_protection_seconds}`);
  check("nothing is unread", agentTokenUnread(ba).length === 0, agentTokenUnread(ba).join(",") || "none");

  // ── C. flags are derived in code, and only from values that were READ ──
  console.log("\nC. deterministic flags:");
  const baFlags = agentTokenFlags(ba);
  check("OWNER_NOT_RENOUNCED on a live owner", baFlags.includes("OWNER_NOT_RENOUNCED"), baFlags.join(","));
  check("BLACKLIST_CAPABLE — the lever answered", baFlags.includes("BLACKLIST_CAPABLE"), baFlags.join(","));
  check("TAX_MUTABLE — template present AND owner alive", baFlags.includes("TAX_MUTABLE"), baFlags.join(","));
  check("no HIGH_TAX at 1% (threshold is >5%)", !baFlags.includes("HIGH_TAX"), `${HIGH_TAX_BPS} bps`);
  check("no BOT_PROTECTION_ACTIVE at 0 seconds", !baFlags.includes("BOT_PROTECTION_ACTIVE"), baFlags.join(","));
  check("no OWNERSHIP_TRANSFER_PENDING at pendingOwner 0x0",
    !baFlags.includes("OWNERSHIP_TRANSFER_PENDING"), baFlags.join(","));
  check("no NOT_AGENT_TOKEN on a real template", !baFlags.includes("NOT_AGENT_TOKEN"), baFlags.join(","));

  const renounced = interpretAgentToken(RENOUNCED);
  const rFlags = agentTokenFlags(renounced);
  check("renounced owner is the ZERO ADDRESS, not null — it was measured",
    renounced.owner === ZERO_ADDRESS, `${renounced.owner}`);
  check("renounced ⇒ no OWNER_NOT_RENOUNCED", !rFlags.includes("OWNER_NOT_RENOUNCED"), rFlags.join(","));
  check("renounced ⇒ no TAX_MUTABLE — nobody is left to call the setter",
    !rFlags.includes("TAX_MUTABLE"), rFlags.join(","));
  check("silent blacklists on a real template ⇒ measured false, template AgentToken",
    renounced.has_blacklist === false && renounced.template === "AgentToken",
    `${renounced.has_blacklist} / ${renounced.template}`);
  check("V1 ⇒ no BLACKLIST_CAPABLE", !rFlags.includes("BLACKLIST_CAPABLE"), rFlags.join(","));

  const high = interpretAgentToken({ ...BLUEAGENT, sellTax: uintWord(1500) });
  check("HIGH_TAX fires at 15% sell", agentTokenFlags(high).includes("HIGH_TAX"),
    `${high.sell_tax_pct}`);
  const boundary = interpretAgentToken({ ...BLUEAGENT, sellTax: uintWord(HIGH_TAX_BPS) });
  check("HIGH_TAX is strictly greater-than — exactly 5% does not fire",
    !agentTokenFlags(boundary).includes("HIGH_TAX"), `${boundary.sell_tax_pct}`);
  const honeypot = interpretAgentToken({ ...BLUEAGENT, sellTax: uintWord(10_000) });
  check("a 100% sell tax SURVIVES to the verdict — that is the honeypot itself",
    honeypot.sell_tax === 10_000 && agentTokenFlags(honeypot).includes("HIGH_TAX"),
    `${honeypot.sell_tax_pct}`);
  const collision = interpretAgentToken({ ...BLUEAGENT, sellTax: uintWord(40_000) });
  check("above 100% is a fallback collision, not a tax ⇒ unread, not a 400% tax",
    collision.sell_tax === null && collision.template === null, `${collision.sell_tax}`);

  const pending = interpretAgentToken({ ...BLUEAGENT, pendingOwner: addrWord(BA_VAULT) });
  check("OWNERSHIP_TRANSFER_PENDING on a non-zero pendingOwner",
    agentTokenFlags(pending).includes("OWNERSHIP_TRANSFER_PENDING"), `${pending.pending_owner}`);
  const botted = interpretAgentToken({ ...BLUEAGENT, botProtection: uintWord(600) });
  check("BOT_PROTECTION_ACTIVE at 600s", agentTokenFlags(botted).includes("BOT_PROTECTION_ACTIVE"),
    `${botted.bot_protection_seconds}s`);

  // ── D. THE ZERO TRAP — unread must never become the calming answer ──────
  console.log("\nD. an unread field is null, never the reassuring zero:");
  const partial = interpretAgentToken(PARTIAL);
  check("unread owner is null, NOT the zero address (which would read renounced)",
    partial.owner === null, `${partial.owner}`);
  check("unread pendingOwner is null, NOT 0x0 (which would read no-takeover)",
    partial.pending_owner === null, `${partial.pending_owner}`);
  check("unread bot window is null, NOT 0 (which would read no-restriction)",
    partial.bot_protection_seconds === null, `${partial.bot_protection_seconds}`);
  check("unread vault is null", partial.vault === null, `${partial.vault}`);
  check("unread tax recipient is null", partial.project_tax_recipient === null,
    `${partial.project_tax_recipient}`);
  const pFlags = agentTokenFlags(partial);
  check("an unread owner raises NO owner flag in either direction",
    !pFlags.includes("OWNER_NOT_RENOUNCED") && !pFlags.includes("TAX_MUTABLE"), pFlags.join(",") || "none");
  check("`unread` names every field that failed, so empty flags cannot read as clean",
    ["owner", "pending_owner", "project_tax_recipient", "vault", "bot_protection_seconds"]
      .every((f) => agentTokenUnread(partial).includes(f)),
    agentTokenUnread(partial).join(","));

  const nothing = interpretAgentToken(NOTHING);
  check("nothing answered ⇒ template null", nothing.template === null, `${nothing.template}`);
  check("nothing answered ⇒ has_blacklist is null, NOT false — false is a measurement",
    nothing.has_blacklist === null, `${nothing.has_blacklist}`);
  check("nothing answered ⇒ NOT_AGENT_TOKEN and no other flag",
    agentTokenFlags(nothing).join() === "NOT_AGENT_TOKEN", agentTokenFlags(nothing).join(","));
  check("AGENT_TOKEN_UNREAD is that same shape",
    JSON.stringify(AGENT_TOKEN_UNREAD) === JSON.stringify(nothing), "identical");

  // Garbage that is *shaped* like an answer is the subtle one: a fallback()
  // returning arbitrary bytes must not be reported as an address.
  const garbage = interpretAgentToken({
    ...BLUEAGENT,
    owner: ok(`0x${"ff".repeat(32)}`),
    symbol: ok("0xdeadbeef"),
  });
  check("a 32-byte word with dirty high bytes is NOT an address",
    garbage.owner === null, `${garbage.owner}`);
  check("a malformed string does not decode to a symbol", garbage.symbol === null, `${garbage.symbol}`);
  check("a short word is not a word", interpretAgentToken({ owner: ok("0x1234") }).owner === null, "rejected");

  // ── E. the address gate, and the injected probe ─────────────────────────
  console.log("\nE. address gate and probe injection:");
  const seen: string[] = [];
  const spy = async (a: string) => { seen.push(a); return BLUEAGENT; };
  return Promise.resolve()
    .then(async () => {
      check("a ticker is not an address — no probe is attempted",
        (await readAgentToken("BLUEAGENT", spy)).template === null && seen.length === 0,
        `${seen.length} probes`);
      check("a truncated address is rejected before the network",
        (await readAgentToken("0x765eecec", spy)).template === null && seen.length === 0,
        `${seen.length} probes`);
      const live = await readAgentToken(`0x765eecec6B7BEe0474D00FAf76e61fCA8ed027b3`, spy);
      check("a valid address is probed exactly once", seen.length === 1, `${seen.length} probes`);
      check("the injected read flows through", live.template === "AgentTokenV4", `${live.template}`);
      const thrower = async () => { throw new Error("RPC down"); };
      check("a throwing probe degrades to UNREAD, it does not 500",
        (await readAgentToken("0x765eecec6B7BEe0474D00FAf76e61fCA8ed027b3", thrower)).template === null,
        "unread");
      check("the live probe is a factory over a chain, not a Base-pinned constant",
        typeof makeAgentTokenProbe("robinhood") === "function"
          && makeAgentTokenProbe("robinhood") !== makeAgentTokenProbe("base"),
        "distinct per chain");

      // ── F. NEGATIVE CONTROL — the assertions above can go red ───────────
      //
      // Each mutant is one plausible wrong implementation. If a mutant passes,
      // the section that should have caught it is decorative.
      console.log("\nF. negative controls — each broken build must FAIL:");
      const mutants: [string, Interpret, (r: AgentTokenRead) => boolean][] = [
        ["unread owner defaults to 0x0 (reads as RENOUNCED)",
          (p) => ({ ...interpretAgentToken(p), owner: interpretAgentToken(p).owner ?? ZERO_ADDRESS }),
          (r) => r.owner === null],
        ["unread bot window defaults to 0 (reads as NO RESTRICTION)",
          (p) => ({ ...interpretAgentToken(p), bot_protection_seconds: interpretAgentToken(p).bot_protection_seconds ?? 0 }),
          (r) => r.bot_protection_seconds === null],
        ["silent blacklists reported as a measured false",
          (p) => ({ ...interpretAgentToken(p), has_blacklist: interpretAgentToken(p).has_blacklist ?? false }),
          (r) => r.has_blacklist === null],
        ["everything returns null (the guard must not pass by deleting data)",
          () => interpretAgentToken({}),
          (r) => r.owner === BA_OWNER],
      ];
      let caught = 0;
      for (const [label, mutate, survives] of mutants) {
        // PARTIAL for the three degradations, BLUEAGENT for the delete-everything one.
        const probes = survives(interpretAgentToken(BLUEAGENT)) ? BLUEAGENT : PARTIAL;
        const red = !survives(mutate(probes));
        check(`caught: ${label}`, red, red ? "assertion went red" : "MUTANT SURVIVED");
        if (red) caught++;
      }
      check("every mutant was caught", caught === mutants.length, `${caught}/${mutants.length}`);

      // ── G. wired — a handler nobody registered is a file ────────────────
      //
      // Matches an IMPORT plus a CALL, never the bare word: this repo mentions
      // tool ids in prose everywhere, and an assertion a comment can satisfy
      // punishes documenting the fix.
      console.log("\nG. registered in BOTH maps — a tool in one is not live:");
      const handlerSrc = readFileSync(new URL("../src/app/api/x402/_handlers/rh-token-scan.ts", import.meta.url), "utf8");
      check("the handler imports and calls readAgentToken",
        /import\s*\{[\s\S]*?\breadAgentToken\b[\s\S]*?\}\s*from/.test(handlerSrc)
          && /readAgentToken\s*\(/.test(handlerSrc),
        /readAgentToken\s*\(/.test(handlerSrc) ? "called" : "NOT CALLED");
      check("the handler names its chain in the response — hard rule 1",
        /chain_id:\s*RH\.chainId/.test(handlerSrc) && /chain:\s*"robinhood"/.test(handlerSrc),
        "chain + chain_id emitted");
      check("the handler ships `unread`, not just `flags`",
        /\bunread,/.test(handlerSrc), "unread emitted");
      const idx = readFileSync(new URL("../src/app/api/x402/_handlers/index.ts", import.meta.url), "utf8");
      check("registered in HANDLERS", /"rh-token-scan":\s*\w+/.test(idx), "present");
      const cat = readFileSync(new URL("../src/lib/agent-tools.ts", import.meta.url), "utf8");
      check("registered in AGENT_TOOLS", /id:\s*"rh-token-scan"/.test(cat), "present");
      check("priced free — a gated safety check is a safety check nobody runs",
        /id:\s*"rh-token-scan"[\s\S]{0,1400}?priceUSDC:\s*0\b/.test(cat), "$0.00");

      console.log(failures === 0
        ? "\n✓ all AgentToken owner-power assertions passed\n"
        : `\n✗ ${failures} assertion(s) failed\n`);
      process.exit(failures === 0 ? 0 : 1);
    });
}

main();
