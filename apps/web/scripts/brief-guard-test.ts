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
const x = (o: Partial<{ from: string; to: string; value: string; at: number; tx: string; symbol: string | null }>) => ({ from: W, to: REAL, value: "100", at: 1000, tx: "0xt", symbol: "USDC", ...o });

const outgoing = [x({ tx: "0xpay" }), x({ to: FAKE, value: "0", at: 2000, tx: "0xzero" })];
const incoming = [x({ from: FAKE, to: W, value: "1", at: 3000, tx: "0xin" }), x({ from: OTHER, to: W, value: "0", at: 3000, tx: "0xother" }), x({ from: REAL, to: W, at: 3000, tx: "0xreal" })];
const ev = findPoison("base", W, incoming, outgoing, [], 0);
ok("catches the look-alike transfer in", ev.some((e) => e.kind === "lookalike_in" && e.attacker === FAKE && e.twin === REAL));
ok("catches the zero-value 'sent by you' trick", ev.some((e) => e.kind === "lookalike_out_zero" && e.tx === "0xzero"));
ok("an unrelated zero transfer and the real payee are not flagged", ev.length === 2);
ok("the window excludes older events", findPoison("base", W, incoming, outgoing, [], 2500).length === 1);
ok("no payees → nothing to imitate", findPoison("base", W, incoming, [], [], 0).length === 0);

ok("honeypot → BLOCK", classifyGoPlus({ is_honeypot: "1" }).level === "BLOCK");
ok("sell tax 15% → WARN", classifyGoPlus({ sell_tax: "0.15" }).level === "WARN");
ok("sell tax 60% → BLOCK", classifyGoPlus({ sell_tax: "0.6" }).level === "BLOCK");
ok("empty fields are not flags", classifyGoPlus({ sell_tax: "", is_honeypot: undefined }).level === "OK");

const h = (o: Partial<HoldRow>): HoldRow => ({ chain: "base", token: "0xaa", symbol: "A", amount: "1", usd: 5, trust: "unverified", ...o });
const picked = pickForCheck([h({}), h({ token: "native" }), h({ token: "0xbb", trust: "verified" }), h({ token: "0xcc", usd: 0.5 }), h({ token: "0xdd" , usd: 50 }), h({ token: "0xee", chain: "robinhood" }), h({ token: "0xff" })], (t) => t === "0xff");
ok("picks unvouched Base tokens ≥ $1, biggest first, no stocks", picked.map((p) => p.token).join(",") === "0xdd,0xaa");

console.log(failures === 0 ? "\nbrief-guard-test: PASS" : `\nbrief-guard-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
