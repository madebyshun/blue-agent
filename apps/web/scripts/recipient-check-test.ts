/**
 * recipient-check-test — the recipient half of a send (lib/recipient-check.ts,
 * plan 2026-10-06 task 1.1). Hermetic: every RPC, GoPlus and Blockscout
 * request is answered by a stub.
 *
 *   1. BLOCK only on evidence: not an address, zero address, the token's own
 *      contract, a feed-flagged address
 *   2. address poisoning: a look-alike of a past payee WARNs and names the real
 *      one; a zero-value transfer from the recipient WARNs; a real past payee
 *      is INFO, never a warning
 *   3. what is at the address: contract → WARN, EIP-7702 account → INFO
 *   4. unread sources are INFO, never a pass and never a block
 *   5. preTradeCheck merges the two halves for kind=send only
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];

import { recipientReasons, isLookalike, __setRecipientFetch } from "../src/lib/recipient-check";
import { preTradeCheck } from "../src/lib/pre-trade-check";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const SENDER   = "0x1111111111111111111111111111111111111111";
const FRIEND   = "0xabcd000000000000000000000000000000001234";
const TWIN     = "0xabcdffffffffffffffffffffffffffffffff1234"; // same first/last 4 as FRIEND
const STRANGER = "0x2222222222222222222222222222222222222222";
const THIEF    = "0x3333333333333333333333333333333333333333";
const MIXERISH = "0x4444444444444444444444444444444444444444";
const CONTRACT = "0x5555555555555555555555555555555555555555";
const DELEGATE = "0x6666666666666666666666666666666666666666";
const ACCT7702 = "0x7777777777777777777777777777777777777777";
const TOKEN    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

let goplusUp = true, historyUp = true;

const gp = (flags: Record<string, string>) => ({ code: 1, message: "ok", result: {
  cybercrime: "0", money_laundering: "0", phishing_activities: "0", stealing_attack: "0", sanctioned: "0",
  blacklist_doubt: "0", mixer: "0", contract_address: "0", data_source: "", ...flags,
} });

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  // JSON-RPC (viem): eth_getCode only.
  let req: { id?: number; method?: string; params?: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  if (req?.method === "eth_getCode") {
    const at = String((req.params as string[])[0]).toLowerCase();
    const code = at === CONTRACT ? "0x6080604052" : at === ACCT7702 ? "0xef0100" + DELEGATE.slice(2) : at === TOKEN.toLowerCase() ? "0x6080" : "0x";
    return Response.json({ jsonrpc: "2.0", id: req.id ?? 1, result: code });
  }
  if (req?.method) return Response.json({ jsonrpc: "2.0", id: req.id ?? 1, result: null });

  if (url.startsWith("https://api.gopluslabs.io/")) {
    if (!goplusUp) return new Response("down", { status: 503 });
    const addr = url.split("/address_security/")[1].split("?")[0].toLowerCase();
    if (addr === THIEF) return Response.json(gp({ stealing_attack: "1", sanctioned: "1", data_source: "SlowMist" }));
    if (addr === MIXERISH) return Response.json(gp({ mixer: "1" }));
    if (addr === CONTRACT) return Response.json(gp({ contract_address: "1" }));
    return Response.json(gp({}));
  }
  if (url.includes("blockscout.com/api/v2/addresses/")) {
    if (!historyUp) return new Response("<!DOCTYPE html>Just a moment", { status: 403 });
    if (url.includes("/token-transfers?filter=from")) {
      return Response.json({ items: [
        { from: { hash: SENDER }, to: { hash: FRIEND }, total: { value: "5000000" } },
        { from: { hash: SENDER }, to: { hash: FRIEND }, total: { value: "7000000" } },
      ], next_page_params: null });
    }
    if (url.includes("/token-transfers?filter=to")) {
      // The poisoning move: TWIN sends the sender a zero-value transfer.
      return Response.json({ items: [{ from: { hash: TWIN }, to: { hash: SENDER }, total: { value: "0" } }], next_page_params: null });
    }
    if (url.includes("/transactions?filter=from")) return Response.json({ items: [], next_page_params: null });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;
globalThis.fetch = stub;
__setRecipientFetch(stub);

const codes = (rs: { code: string }[]) => rs.map((r) => r.code);
const lvl = (rs: { code: string; level: string }[], c: string) => rs.find((r) => r.code === c)?.level;

(async () => {
  console.log("1. BLOCK only on evidence");
  let r = await recipientReasons({ chain: "base", recipient: "alice.base" });
  ok("a name that is not an address is refused", lvl(r, "RECIPIENT_NOT_ADDRESS") === "BLOCK");
  r = await recipientReasons({ chain: "base", recipient: "0x0000000000000000000000000000000000000000", sender: SENDER });
  ok("the zero address is refused", lvl(r, "RECIPIENT_ZERO") === "BLOCK");
  r = await recipientReasons({ chain: "base", recipient: TOKEN.toLowerCase(), sender: SENDER, token: TOKEN });
  ok("the token's own contract is refused", lvl(r, "RECIPIENT_IS_TOKEN") === "BLOCK");
  r = await recipientReasons({ chain: "base", recipient: THIEF, sender: SENDER });
  const flagged = r.find((x) => x.code === "RECIPIENT_FLAGGED");
  ok("a feed-flagged address is refused, naming the flags and the source",
    flagged?.level === "BLOCK" && /stealing attack/.test(flagged.text) && /sanctioned/.test(flagged.text) && /SlowMist/.test(flagged.text), flagged?.text);
  r = await recipientReasons({ chain: "base", recipient: MIXERISH, sender: SENDER });
  ok("a soft flag (mixer) is a WARN, not a block", lvl(r, "RECIPIENT_FLAG_DOUBT") === "WARN" && !r.some((x) => x.level === "BLOCK"));

  console.log("2. address poisoning");
  ok("isLookalike: same head and tail, different middle", isLookalike(FRIEND, TWIN) && !isLookalike(FRIEND, FRIEND) && !isLookalike(FRIEND, STRANGER));
  r = await recipientReasons({ chain: "base", recipient: TWIN, sender: SENDER });
  const look = r.find((x) => x.code === "RECIPIENT_LOOKALIKE");
  ok("a look-alike of a past payee WARNs and names the real one", look?.level === "WARN" && look.text.includes(FRIEND), look?.text);
  ok("…and the zero-value transfer it sent is called out", lvl(r, "RECIPIENT_POISON_DUST") === "WARN");
  r = await recipientReasons({ chain: "base", recipient: FRIEND, sender: SENDER });
  ok("a real past payee is INFO with a count, never a warning",
    lvl(r, "RECIPIENT_KNOWN") === "INFO" && /2 times/.test(r.find((x) => x.code === "RECIPIENT_KNOWN")!.text) && !r.some((x) => x.level !== "INFO"), JSON.stringify(codes(r)));
  r = await recipientReasons({ chain: "base", recipient: STRANGER, sender: SENDER });
  ok("a first payment is INFO, not a warning", lvl(r, "RECIPIENT_NEW") === "INFO" && !r.some((x) => x.level !== "INFO"));
  r = await recipientReasons({ chain: "robinhood", recipient: TWIN, sender: SENDER });
  ok("the same history check runs on Robinhood Chain", lvl(r, "RECIPIENT_LOOKALIKE") === "WARN");

  console.log("3. what is at the address");
  r = await recipientReasons({ chain: "base", recipient: CONTRACT, sender: SENDER });
  ok("a contract recipient WARNs", lvl(r, "RECIPIENT_CONTRACT") === "WARN");
  r = await recipientReasons({ chain: "base", recipient: ACCT7702, sender: SENDER });
  const d = r.find((x) => x.code === "RECIPIENT_7702");
  ok("an EIP-7702 account is INFO naming its delegate, not a contract warning",
    d?.level === "INFO" && d.text.includes(DELEGATE.slice(0, 6)) && !r.some((x) => x.code === "RECIPIENT_CONTRACT"), d?.text);

  console.log("4. unread sources");
  goplusUp = false; historyUp = false;
  r = await recipientReasons({ chain: "base", recipient: TWIN, sender: SENDER });
  ok("feed down → INFO that says so", lvl(r, "RECIPIENT_FLAGS_UNREAD") === "INFO");
  ok("history down → INFO that says so, and no look-alike claimed from nothing",
    lvl(r, "RECIPIENT_HISTORY_UNREAD") === "INFO" && !r.some((x) => x.code === "RECIPIENT_LOOKALIKE" || x.code === "RECIPIENT_NEW"));
  ok("…and nothing unread raises the level", !r.some((x) => x.level !== "INFO"));
  r = await recipientReasons({ chain: "base", recipient: STRANGER });
  ok("no sender → no history claim at all", !r.some((x) => /RECIPIENT_(KNOWN|NEW|LOOKALIKE|HISTORY_UNREAD)/.test(x.code)));
  goplusUp = true; historyUp = true;

  console.log("5. preTradeCheck merges the halves for sends only");
  let c = await preTradeCheck({ chain: "base", kind: "send", token: "ETH", recipient: THIEF, sender: SENDER });
  ok("ETH to a flagged address → BLOCK", c.verdict === "BLOCK" && c.reasons.some((x) => x.code === "RECIPIENT_FLAGGED"));
  c = await preTradeCheck({ chain: "base", kind: "send", token: "ETH", recipient: TWIN, sender: SENDER });
  ok("ETH to a look-alike → WARN", c.verdict === "WARN" && c.reasons.some((x) => x.code === "RECIPIENT_LOOKALIKE"));
  c = await preTradeCheck({ chain: "base", kind: "send", token: "ETH", recipient: FRIEND, sender: SENDER });
  ok("ETH to a known payee → PASS", c.verdict === "PASS", JSON.stringify(c.reasons.map((x) => x.code)));
  c = await preTradeCheck({ chain: "base", kind: "swap", token: "ETH", recipient: THIEF });
  ok("a swap ignores `recipient`", c.verdict === "PASS" && !c.reasons.some((x) => x.code.startsWith("RECIPIENT_")));
  c = await preTradeCheck({ chain: "base", kind: "send", token: "ETH" });
  ok("a send with no recipient is the token check alone", !c.reasons.some((x) => x.code.startsWith("RECIPIENT_")));

  console.log(failures === 0 ? "\nrecipient-check-test: PASS" : `\nrecipient-check-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
