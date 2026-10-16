/**
 * chat-confirm-test — confirm-in-chat (lib/chat/confirm.ts, 2026-10-16).
 * Which words confirm, which pending action they reach, and what is refused.
 */
import { userDollarAmount } from "../src/lib/chat/trade-intent";
import { CONFIRM_WINDOW_MS, confirmLatest, confirmReply, forgetArmed, isConfirmWord, latestPending, registerPending, SILENT_MAX_USD, type ConfirmOutcome } from "../src/lib/chat/confirm";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }

for (const w of ["yes", "Yes", "YES!", " ok ", "ok.", "confirm", "Có", "đồng ý", "Đồng ý!"]) ok(`"${w}" confirms`, isConfirmWord(w));
for (const w of ["yes please swap 10", "okay", "yep", "no", "y", "ok but wait", "có không", "confirm?? no"]) ok(`"${w}" does not confirm`, !isConfirmWord(w));
ok("the silent limit is $100", SILENT_MAX_USD === 100);

const now = 1_800_000_000_000;
const p = (id: string, createdAt: number, out: ConfirmOutcome = { kind: "armed", what: id, silent: true }) => ({ id, createdAt, fire: () => out });
ok("the newest recent proposal wins", latestPending(now, [p("a", now - 60_000), p("b", now - 5_000)])?.id === "b");
ok("a proposal older than the window is never armed", latestPending(now, [p("old", now - CONFIRM_WINDOW_MS - 1)]) === null);
ok("a proposal with no creation time (reloaded, unknown) is never armed", latestPending(now, [p("x", 0)]) === null);

// The live registry: armed once, then gone.
const off = registerPending(p("live", Date.now() - 1_000));
const first = confirmLatest();
ok("confirmLatest fires the pending action", first?.kind === "armed");
const again = confirmLatest();
ok("…a second yes cannot sign it twice, and is answered locally (never reaches the model)",
  again?.kind === "already" && /already sent/.test(confirmReply(again)), again ? confirmReply(again) : "null");
forgetArmed();
ok("…any other message in between hands a later yes back to the model", confirmLatest() === null);
off();
const off2 = registerPending(p("blk", Date.now() - 1_000, { kind: "blocked", what: "Swap 5 USDC → FAKE on Base", why: "an impersonator." }));
const b = confirmLatest();
ok("a BLOCK is refused, not signed", b?.kind === "blocked" && /Not signing/.test(confirmReply(b)), b ? confirmReply(b) : "");
off2();
ok("nothing pending → null (the message goes to the model)", confirmLatest() === null);
ok("silent armed reply", confirmReply({ kind: "armed", what: "Swap 1 USDC → ETH on Base", silent: true }) === "Signing Swap 1 USDC → ETH on Base…");
ok("wallet-prompt armed reply says to confirm in the wallet", /Confirm in your wallet/.test(confirmReply({ kind: "armed", what: "x", silent: false })));
ok("a WARN asks for a manual look", /Review it above/.test(confirmReply({ kind: "warn", what: "x", why: "y" })));

// The user's "$N" wins over the bare number the model wrote (measured on prod:
// "swap $1 eth to usdc" armed 0.001 ETH once and 1 ETH once).
ok("'$1' + model '1' → $1", userDollarAmount("swap $1 eth to usdc", "1") === "1");
ok("'$1' + model nothing → $1", userDollarAmount("swap $1 eth to usdc", undefined) === "1");
ok("'5 dollars' + model 5 → 5", userDollarAmount("buy 5 dollars of ETH", 5) === "5");
ok("the model's own conversion (0.001, typed nowhere) is replaced by $1", userDollarAmount("swap $1 eth to usdc", "0.001") === "1");
ok("a token amount the user typed is kept", userDollarAmount("swap 0.001 eth, about $2", "0.001") === null);
ok("a quantity word is kept", userDollarAmount("swap half my eth, around $50", "half") === null);
ok("no dollar figure → null", userDollarAmount("swap 1 eth to usdc", "1") === null);
ok("two dollar figures are ambiguous → null", userDollarAmount("swap $1 eth, not $5", "1") === null);

console.log(failures === 0 ? "\nchat-confirm-test: PASS" : `\nchat-confirm-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
