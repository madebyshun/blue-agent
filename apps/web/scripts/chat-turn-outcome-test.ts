/**
 * chat-turn-outcome-test — what a finished chat turn is billed, shown and
 * remembered as, and that send() cannot run twice at once
 * (src/app/chat/turn-outcome.ts).
 *
 * Pinned to the 2026-10-01 pre-production review of the SIWE chat gate:
 *   • an `auth_required` refusal ("nothing was charged") printed "⚡ N cr" and
 *     a model label under it, and was stored in conversation memory, so later
 *     prompts carried "Q: … A: Couldn't verify your sign-in…";
 *   • send() awaited the SIWE session before setting `streaming`, so a second
 *     Enter during the whoami / signature prompt sent and billed the message
 *     twice;
 *   • a tool's insufficient-credits event that omitted `balance` (the server
 *     could not read one) rendered as "have 0".
 *
 * Hermetic — no React, no network. Group 4 pins the wiring the pure tests
 * cannot reach.
 */
import fs from "node:fs";
import path from "node:path";
import {
  readNoticeBalance, singleFlight, turnCreditsUsed, turnProducedAnswer, turnRanModel,
  type TurnFlags,
} from "../src/app/chat/turn-outcome";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const ANSWER: TurnFlags = { walletBlocked: false, upstreamFailed: false, authBlocked: false };
const AUTH: TurnFlags = { ...ANSWER, authBlocked: true };
const WALL: TurnFlags = { ...ANSWER, walletBlocked: true };
const UPSTREAM: TurnFlags = { ...ANSWER, upstreamFailed: true };

async function main() {
  console.log("\n1. a turn that is not an answer is neither billed nor remembered");
  check("1.1 an answered turn bills the message cost", turnCreditsUsed(ANSWER, 5, false) === 5);
  check("1.2 local dev bills nothing", turnCreditsUsed(ANSWER, 5, true) === 0);
  for (const [name, f] of [["auth_required", AUTH], ["wallet wall", WALL], ["upstream failure", UPSTREAM]] as const) {
    check(`1.3 ${name}: chip shows 0 cr`, turnCreditsUsed(f, 5, false) === 0);
    check(`1.4 ${name}: not stored in memory`, turnProducedAnswer(f) === false);
  }
  check("1.5 an answered turn IS remembered", turnProducedAnswer(ANSWER) === true);

  console.log("\n2. a refusal before any model call carries no model label");
  check("2.1 auth_required ran no model", turnRanModel(AUTH) === false);
  check("2.2 an answer, the wall and an upstream failure keep the label", turnRanModel(ANSWER) && turnRanModel(WALL) && turnRanModel(UPSTREAM));

  console.log("\n3. an unread balance stays unread");
  check("3.1 absent → undefined, not 0", readNoticeBalance(undefined) === undefined);
  check("3.2 null / NaN / a string → undefined",
    readNoticeBalance(null) === undefined && readNoticeBalance(NaN) === undefined && readNoticeBalance("15") === undefined);
  check("3.3 a real 0 is kept (the wallet really is empty)", readNoticeBalance(0) === 0);
  check("3.4 a real balance is kept", readNoticeBalance(15) === 15);

  console.log("\n3b. send() is single-flight");
  {
    const flag = { current: false };
    let posts = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    // The first call is parked where send() awaits ensureSession.
    const first = singleFlight(flag, async () => { await gate; posts++; return "sent"; });
    // The second Enter, while the signature prompt is open.
    const second = await singleFlight(flag, async () => { posts++; return "sent"; });
    check("3b.1 a call during the first one's await is dropped", second === undefined);
    release();
    check("3b.2 the first call completes", (await first) === "sent");
    check("3b.3 exactly one POST", posts === 1, `posts=${posts}`);
    check("3b.4 the flag is released afterwards", flag.current === false);
    const after = await singleFlight(flag, async () => { posts++; return "sent"; });
    check("3b.5 the next message goes through", after === "sent" && posts === 2);
    await singleFlight(flag, async () => { throw new Error("refused signature"); }).catch(() => null);
    check("3b.6 a throw releases the flag too", flag.current === false);
  }

  console.log("\n4. ChatContext / ChatMessages route through the helpers");
  {
    const dir = path.join(__dirname, "..", "src", "app", "chat");
    const ctx = fs.readFileSync(path.join(dir, "ChatContext.tsx"), "utf8");
    const msgs = fs.readFileSync(path.join(dir, "components", "ChatMessages.tsx"), "utf8");
    const types = fs.readFileSync(path.join(dir, "types.ts"), "utf8");
    check("4.1 the auth_required branch sets authBlocked",
      /parsed\.type === "auth_required"\)\s*\{[\s\S]{0,600}authBlocked = true/.test(ctx));
    check("4.2 the chip is stamped by turnCreditsUsed with all three flags",
      /const flags = \{ walletBlocked, upstreamFailed, authBlocked \}/.test(ctx) &&
      /creditsUsed: turnCreditsUsed\(flags, cost, isUnlimited\)/.test(ctx));
    check("4.3 memory is written only when turnProducedAnswer",
      /if \(turnProducedAnswer\(flags\)[^)]*\)[^{]*\{\s*updateMemoryAfterChat/.test(ctx));
    check("4.4 the exported send goes through singleFlight",
      /const send = useCallback\(async \(text: string\) => \{\s*await singleFlight\(sendingRef, \(\) => sendOnce\(text\)\)/.test(ctx));
    check("4.5 no stand-in 0 for the notice balance",
      !/balance:\s*p\.balance \?\? 0/.test(ctx) && /readNoticeBalance\(p\.balance\)/.test(ctx));
    check("4.6 the notice type allows an absent balance", /balance\?:\s*number/.test(types));
    check("4.7 the notice renders an absent balance as —",
      /insufficientCredits\.balance \?\? "—"/.test(msgs));
  }

  console.log(`\nchat-turn-outcome-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
