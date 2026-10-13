/**
 * brief-guard-test — poisoning radar (lib/brief/poison.ts findPoison) and the
 * held-token screen (lib/brief/held-risk.ts). Pure.
 */
import { findPoison } from "../src/lib/brief/poison";
import { classifyGoPlus, pickForCheck } from "../src/lib/brief/held-risk";
import type { HoldRow } from "../src/lib/brief/types";

let failures = 0;
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }

const W = "0x1111111111111111111111111111111111111111";
const REAL = "0xabcd000000000000000000000000000000001234";
const FAKE = "0xabcd999999999999999999999999999999991234";
const OTHER = "0x5555555555555555555555555555555555555555";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const x = (o: Partial<{ from: string; to: string; value: string; at: number; tx: string; symbol: string | null; token: string }>) => ({ from: W, to: REAL, value: "100", at: 1000, tx: "0xt", symbol: "USDC", token: USDC, ...o });

const outgoing = [x({ tx: "0xpay" }), x({ to: FAKE, value: "0", at: 2000, tx: "0xzero" })];
const incoming = [x({ from: FAKE, to: W, value: "1", at: 3000, tx: "0xin" }), x({ from: OTHER, to: W, value: "0", at: 3000, tx: "0xother" }), x({ from: REAL, to: W, at: 3000, tx: "0xreal" })];
const ev = findPoison("base", W, incoming, outgoing, [], 0);
ok("catches the look-alike transfer in", ev.some((e) => e.kind === "lookalike_in" && e.attacker === FAKE && e.twin === REAL));
ok("catches the zero-value 'sent by you' trick", ev.some((e) => e.kind === "lookalike_out_zero" && e.tx === "0xzero"));
ok("an unrelated zero transfer and the real payee are not flagged", ev.length === 2);
ok("the window excludes older events", findPoison("base", W, incoming, outgoing, [], 2500).length === 1);
ok("no payees → nothing to imitate", findPoison("base", W, incoming, [], [], 0).length === 0);
// zero_out_unsigned — measured 2026-10-13: a busy victim's real payee falls outside the pages read.
{
  const PLANTED = "0x7777000000000000000000000000000000009999";
  const out = [x({ to: PLANTED, value: "0", at: 2000, tx: "0xUNSIGNED" }), x({ to: OTHER, value: "0", at: 2000, tx: "0xSELF" })];
  const senders = new Map([["0xunsigned", "0x9659000000000000000000000000000000002249"], ["0xself", W]]);
  const ev2 = findPoison("base", W, [], out, [], 0, senders);
  ok("a zero transfer out that the wallet did not send is flagged with no twin", ev2.length === 1 && ev2[0].kind === "zero_out_unsigned" && ev2[0].twin === null && ev2[0].attacker === PLANTED);
  ok("the wallet's own zero transfer is not flagged", !ev2.some((e) => e.tx === "0xSELF"));
  ok("an unknown sender claims nothing", findPoison("base", W, [], out, [], 0).length === 0);
}
// Fake-token "sent" lines must not make a look-alike a payee (victim 0x6a7e…, 13 Oct).
{
  const FAKE_USDC = "0xdafaf3ff5406c7ac17786868be2cc9ed6c4a8835";
  const out = [x({ tx: "0xpay" }), x({ to: FAKE, value: "1000000", symbol: "U឵S឵Dꓚ", token: FAKE_USDC, tx: "0xfake" }), x({ to: FAKE, value: "0", at: 2000, tx: "0xzero2" })];
  const ev3 = findPoison("base", W, [], out, [], 0);
  ok("a fake-token 'payment' does not make the look-alike a payee", ev3.some((e) => e.kind === "lookalike_out_zero" && e.attacker === FAKE && e.twin === REAL));
}

ok("honeypot → BLOCK", classifyGoPlus({ is_honeypot: "1" }).level === "BLOCK");
ok("sell tax 15% → WARN", classifyGoPlus({ sell_tax: "0.15" }).level === "WARN");
ok("sell tax 60% → BLOCK", classifyGoPlus({ sell_tax: "0.6" }).level === "BLOCK");
ok("empty fields are not flags", classifyGoPlus({ sell_tax: "", is_honeypot: undefined }).level === "OK");

const h = (o: Partial<HoldRow>): HoldRow => ({ chain: "base", token: "0xaa", symbol: "A", amount: "1", usd: 5, trust: "unverified", ...o });
const picked = pickForCheck([h({}), h({ token: "native" }), h({ token: "0xbb", trust: "verified" }), h({ token: "0xcc", usd: 0.5 }), h({ token: "0xdd" , usd: 50 }), h({ token: "0xee", chain: "robinhood" }), h({ token: "0xff" })], (t) => t === "0xff");
ok("picks unvouched Base tokens ≥ $1, biggest first, no stocks", picked.map((p) => p.token).join(",") === "0xdd,0xaa");

console.log(failures === 0 ? "\nbrief-guard-test: PASS" : `\nbrief-guard-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
