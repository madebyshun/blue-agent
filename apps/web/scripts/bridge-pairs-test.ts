/**
 * CI guard on which token lands on the other chain — `src/lib/wallet/bridge-pairs.ts`.
 *
 * Run: `npx tsx scripts/bridge-pairs-test.ts` from `apps/web/`.
 * Hermetic: pure functions + a frozen fixture + reading two source files.
 * No env, no network. The fixture was CAPTURED from Relay, not invented — see
 * the note on RELAY_CHAINS_20260911 below.
 *
 * WHAT THIS PROTECTS, in one line: the bridge may refuse, but it may never
 * quietly sell what you asked it to move.
 *
 * ── The three failures this file exists for ───────────────────────────────────
 *
 *  1. RELAY IS A ROUTER, NOT A BRIDGE. Asked to move cbBTC to a chain with no
 *     cbBTC, it does not refuse — it SELLS the cbBTC and delivers USDG.
 *     MEASURED 2026-09-11: 0.001 cbBTC → 76.884393 USDG, HTTP 200, no warning
 *     field anywhere in the response. Nothing upstream will stop this; the only
 *     thing between a user and a liquidated position is the auto-resolver
 *     refusing. So the central assertion here is a NEGATIVE one, restated over
 *     every non-stable in the fixture rather than pinned to cbBTC: auto-resolve
 *     never returns a token of a different KIND.
 *
 *  2. A CONTRACT ADDRESS IS CHAIN-LOCAL. The bug that started this: the route
 *     sent `destinationCurrency: originCurrency` — "same token, other chain" —
 *     which is true only for native ETH, where the zero address means "the gas
 *     token" on every chain. Base USDC's address does not exist on Robinhood
 *     Chain, so every ERC-20 bridge in either direction was refused.
 *
 *  3. SYMBOLS ARE NOT IDENTITY. Matching by ticker is safe HERE and nowhere
 *     else, because the candidates are Relay's curated `/chains` allow-list —
 *     8 entries on Base, 2 on Robinhood, nothing in it without Relay putting it
 *     there. The open list (`/currencies/v2`) returns ~50 entries on chain 4663
 *     including three different tokens called "FINN" and memecoins named "AMD",
 *     "GME" and "COST". (CLAUDE.md: "name-matching a ticker is exactly how an
 *     impostor gets in.") A test that let the allow-list widen into the open
 *     list would be guarding nothing, so the ambiguity cases below are load-
 *     bearing: a duplicate symbol must REFUSE, never pick.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type BridgeCurrency, type ChainCurrencies,
  NATIVE_ADDRESS, bridgeableOf, isNativeAddress, isStableSymbol,
  parseChainCurrencies, resolveBridgePair,
} from "../src/lib/wallet/bridge-pairs";

let failures = 0;
let checks = 0;

function ok(label: string, pass: boolean, detail = "") {
  checks++;
  if (pass) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
  }
}

// ── The fixture ─────────────────────────────────────────────────────────────
//
// Captured verbatim from `GET https://api.relay.link/chains` on 2026-09-11,
// then frozen. Frozen on purpose: a test that fetched this live would go red
// the day Relay adds a token, which trains everyone to ignore it, and would go
// GREEN on a day Relay is down and returns nothing — the failure that matters
// most, passing loudest. Every address here is Relay's own lowercase string.
//
// The shape is the point, not the contents: Base bridges TWO stablecoins
// (so USDG → Base is ambiguous), Robinhood bridges exactly ONE (so USDC → RH is
// not), and Base DEGEN is listed with `supportsBridging: false` (so "listed" and
// "bridgeable" are different questions).
const c = (address: string, symbol: string, decimals: number, supportsBridging = true): BridgeCurrency =>
  ({ address: address as `0x${string}`, symbol, decimals, supportsBridging });

const NATIVE_ETH = c(NATIVE_ADDRESS, "ETH", 18);

const BASE: ChainCurrencies = {
  chainId: 8453,
  label:   "Base",
  native:  NATIVE_ETH,
  erc20: [
    c("0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "cbBTC", 8),
    c("0x4200000000000000000000000000000000000006", "WETH",  18),
    c("0x11dc28d01984079b7efe7763b533e6ed9e3722b9", "SYND",  18),
    c("0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", "USDT",  6),
    c("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "USDC",  6),
    c("0x311935cd80b76769bf2ecc9d8ab7635b2139cf82", "SOL",   9),
    // Listed by Relay, and Relay says no. The distinction the route used to
    // spend an RPC round-trip failing to discover.
    c("0x4ed4e862860bed51a9570b96d89af5e1b0efefed", "DEGEN", 18, false),
  ],
};

const RH: ChainCurrencies = {
  chainId: 4663,
  label:   "Robinhood Chain",
  native:  NATIVE_ETH,
  erc20: [c("0x5fc5360d0400a0fd4f2af552add042d716f1d168", "USDG", 6)],
};

const BASE_USDC  = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const BASE_USDT  = "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2";
const BASE_CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const BASE_DEGEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const RH_USDG    = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

// ── 1. The allow-list is the allow-list ─────────────────────────────────────
console.log("\nbridgeableOf — listed is not the same as bridgeable");

const baseBridgeable = bridgeableOf(BASE);
ok("a listed-but-refused token is not bridgeable",
   !baseBridgeable.some((x) => x.symbol === "DEGEN"),
   baseBridgeable.map((x) => x.symbol).join(", "));
ok("native is included when it bridges", baseBridgeable.some((x) => x.address === NATIVE_ADDRESS));
ok("CONTROL the fixture still has things in it", baseBridgeable.length === 7 && bridgeableOf(RH).length === 2,
   `${baseBridgeable.length} / ${bridgeableOf(RH).length}`);
ok("a chain whose native cannot bridge drops it too",
   bridgeableOf({ ...RH, native: c(NATIVE_ADDRESS, "ETH", 18, false) }).every((x) => x.symbol !== "ETH"));

// ── 2. THE RULE — auto-resolve never changes what KIND of thing you hold ────
//
// Stated as a property over the whole fixture, not as one cbBTC case. A test
// written as `expect(cbBTC).toRefuse()` passes forever while someone adds WETH
// to the stable set; this one goes red.
console.log("\nauto-resolve — a bridge that liquidates is worse than one that doesn't work");

const NON_STABLES = bridgeableOf(BASE).filter((x) => !isStableSymbol(x.symbol) && !isNativeAddress(x.address));
ok("CONTROL there are non-stables in the fixture to test", NON_STABLES.length >= 3,
   NON_STABLES.map((x) => x.symbol).join(", "));

let liquidations = 0;
for (const src of NON_STABLES) {
  // The destination has no cbBTC / WETH / SYND / SOL at all — exactly the
  // situation in which Relay fills the order by SELLING.
  const r = resolveBridgePair(BASE, RH, src.address, { preferredStable: RH_USDG });
  if (r.ok) {
    liquidations++;
    console.log(`  FAIL  ${src.symbol} auto-resolved to ${r.to.symbol} — that is a sale, not a bridge`);
  }
}
ok("INVARIANT no non-stable is ever auto-resolved into a different asset", liquidations === 0,
   `${liquidations} would have been sold`);

// Said once more the other way: whatever comes back from an auto-resolve is
// either the same symbol, or a dollar standing in for a dollar. Nothing else.
let kindChanges = 0;
for (const src of bridgeableOf(BASE)) {
  const r = resolveBridgePair(BASE, RH, src.address, { preferredStable: RH_USDG });
  if (!r.ok) continue;
  const same = r.to.symbol.toUpperCase() === r.from.symbol.toUpperCase();
  const dollarForDollar = isStableSymbol(r.from.symbol) && isStableSymbol(r.to.symbol);
  if (!same && !dollarForDollar) { kindChanges++; console.log(`  FAIL  ${r.from.symbol} → ${r.to.symbol}`); }
}
ok("INVARIANT an auto-resolved pair is same-symbol or dollar-for-dollar, never anything else",
   kindChanges === 0);

// And the refusal has to be USEFUL, or the user just retries it forever.
const cb = resolveBridgePair(BASE, RH, BASE_CBBTC, { preferredStable: RH_USDG });
ok("cbBTC → RH refuses", !cb.ok && cb.code === "NO_EQUIVALENT", cb.ok ? "resolved!" : cb.code);
if (!cb.ok) {
  ok("…and says it would have been a sale", /sell/i.test(cb.message), cb.message);
  ok("…and names what the chain does take", /USDG/.test(cb.message) && /ETH/.test(cb.message), cb.message);
}

// ── 3. The three permitted moves ────────────────────────────────────────────
console.log("\nthe moves that are allowed");

const nat = resolveBridgePair(BASE, RH, NATIVE_ADDRESS);
ok("native → native resolves", nat.ok);
if (nat.ok) {
  // The single case where the ORIGINAL bug's premise was accidentally true.
  ok("…to the zero address, the one address that means the same thing on both chains",
     nat.to.address === NATIVE_ADDRESS);
  ok("…and nothing changed", nat.assetChanged === false && nat.note === "");
}
const natBlocked = resolveBridgePair(BASE, { ...RH, native: c(NATIVE_ADDRESS, "ETH", 18, false) }, NATIVE_ADDRESS);
ok("native → a chain that won't take it refuses", !natBlocked.ok && natBlocked.code === "NO_EQUIVALENT");

// Same symbol on the far side. Build a Robinhood that DOES list USDC.
const RH_WITH_USDC: ChainCurrencies = {
  ...RH, erc20: [...RH.erc20, c("0x1111111111111111111111111111111111111111", "USDC", 6)],
};
const same = resolveBridgePair(BASE, RH_WITH_USDC, BASE_USDC);
ok("same symbol on the far side is preferred over a stablecoin substitution",
   same.ok && same.to.symbol === "USDC" && same.assetChanged === false,
   same.ok ? same.to.symbol : same.code);
ok("…and it is the DESTINATION's address, never the origin's",
   same.ok && same.to.address !== BASE_USDC, same.ok ? same.to.address : "");

// Duplicate symbol inside the curated list means Relay changed shape under us.
// Refuse; do not pick. This is the assertion that keeps "match by symbol" from
// becoming the impostor hole it is everywhere else in this repo.
const RH_TWO_USDC: ChainCurrencies = {
  ...RH,
  erc20: [
    ...RH.erc20,
    c("0x1111111111111111111111111111111111111111", "USDC", 6),
    c("0x2222222222222222222222222222222222222222", "USDC", 6),
  ],
};
const dupe = resolveBridgePair(BASE, RH_TWO_USDC, BASE_USDC);
ok("two tokens with the same symbol refuse rather than pick one",
   !dupe.ok && dupe.code === "NO_EQUIVALENT", dupe.ok ? `picked ${dupe.to.address}` : dupe.code);

// Dollar for a different dollar — the only cross-asset move that survives what
// the user was holding.
const dollar = resolveBridgePair(BASE, RH, BASE_USDC);
ok("USDC → RH delivers USDG", dollar.ok && dollar.to.symbol === "USDG", dollar.ok ? dollar.to.symbol : dollar.code);
if (dollar.ok) {
  ok("…flagged as a changed asset", dollar.assetChanged === true);
  ok("…with a sentence the card can render", dollar.note.length > 0 && /USDG/.test(dollar.note), dollar.note);
}

// ── 4. The tie-break ────────────────────────────────────────────────────────
//
// Base bridges both USDC and USDT, so USDG → Base has two answers. Refusing
// outright broke the commonest return trip in the app; picking arbitrarily
// would be choosing which stablecoin someone holds. The resolution is the
// wallet's own canonical dollar for that chain — a choice already made and
// already shown to the user.
console.log("\nthe tie-break — two dollars on the far side");

const noPref = resolveBridgePair(RH, BASE, RH_USDG);
ok("with no preference, ambiguity refuses", !noPref.ok && noPref.code === "NO_EQUIVALENT",
   noPref.ok ? noPref.to.symbol : noPref.code);
if (!noPref.ok) ok("…and lists the candidates so the user can name one",
                   /USDT/.test(noPref.message) && /USDC/.test(noPref.message), noPref.message);

const pref = resolveBridgePair(RH, BASE, RH_USDG, { preferredStable: BASE_USDC });
ok("with the chain's canonical dollar, it resolves to that dollar",
   pref.ok && pref.to.address === BASE_USDC, pref.ok ? pref.to.symbol : pref.code);
ok("…and still says the asset changed",
   pref.ok && pref.assetChanged === true && pref.note.length > 0);
// The note must not betray HOW we got here. "Only candidate" and "our preferred
// candidate" are the same fact to the user: a different token is arriving.
const prefUsdt = resolveBridgePair(RH, BASE, RH_USDG, { preferredStable: BASE_USDT });
ok("the preference is honoured, not hardcoded to USDC",
   prefUsdt.ok && prefUsdt.to.symbol === "USDT", prefUsdt.ok ? prefUsdt.to.symbol : prefUsdt.code);

// FAIL CLOSED. Every one of these is a preference that cannot be honoured, and
// the only acceptable outcome is the refusal we'd have given with no preference
// at all. A stale constant must never be able to aim a delivery.
const BAD_PREFS: [string, string][] = [
  ["an address on the WRONG chain",     RH_USDG],
  ["a token that is not a stablecoin",  BASE_CBBTC],
  ["a token Relay will not bridge",     BASE_DEGEN],
  ["an address in no list at all",      "0x9999999999999999999999999999999999999999"],
  ["an empty string",                   ""],
  ["whitespace",                        "   "],
];
let honoured = 0;
for (const [why, addr] of BAD_PREFS) {
  const r = resolveBridgePair(RH, BASE, RH_USDG, { preferredStable: addr });
  if (r.ok) { honoured++; console.log(`  FAIL  ${why} → delivered ${r.to.symbol}`); }
}
ok("INVARIANT an unhonourable preference refuses, never falls back to a guess", honoured === 0);

// ── 5. Explicit destinations — validated, never invented ────────────────────
console.log("\nan explicitly named destination");

const ex = resolveBridgePair(BASE, RH, BASE_CBBTC, { explicitTo: RH_USDG });
ok("the cross-asset move auto-resolve refuses IS available on request",
   ex.ok && ex.to.address === RH_USDG, ex.ok ? "ok" : ex.code);
ok("…and is still flagged as a changed asset", ex.ok && ex.assetChanged === true);
const exBad = resolveBridgePair(BASE, RH, BASE_USDC, { explicitTo: "0x9999999999999999999999999999999999999999" });
ok("an unknown destination is refused, not passed through",
   !exBad.ok && exBad.code === "TOKEN_NOT_BRIDGEABLE", exBad.ok ? exBad.to.address : exBad.code);
const exDegen = resolveBridgePair(RH, BASE, RH_USDG, { explicitTo: BASE_DEGEN });
ok("a destination Relay won't bridge is refused even when named explicitly",
   !exDegen.ok, exDegen.ok ? exDegen.to.symbol : exDegen.code);
ok("case and whitespace don't change the answer",
   resolveBridgePair(BASE, RH, `  ${BASE_USDC.toUpperCase().replace("0X", "0x")}  `).ok);

// ── 6. Origin side ──────────────────────────────────────────────────────────
console.log("\nthe token being sent");

const degen = resolveBridgePair(BASE, RH, BASE_DEGEN);
ok("a listed-but-unbridgeable origin is TOKEN_NOT_BRIDGEABLE",
   !degen.ok && degen.code === "TOKEN_NOT_BRIDGEABLE", degen.ok ? "resolved!" : degen.code);
if (!degen.ok) ok("…and names what Relay does move from here", /USDC/.test(degen.message), degen.message);
const unknown = resolveBridgePair(BASE, RH, "0x9999999999999999999999999999999999999999");
ok("an unknown origin is refused", !unknown.ok && unknown.code === "TOKEN_NOT_BRIDGEABLE");

// ── 7. Invariants that survive a rewrite ────────────────────────────────────
//
// The cases above say what the function returns today. These say what it may
// never return, however it is written tomorrow. Run over every ordered pair of
// (origin token, direction, preference) the fixture can produce.
console.log("\ninvariants over every pair the fixture can make");

type Case = { from: ChainCurrencies; to: ChainCurrencies; addr: string; pref?: string };
const ALL: Case[] = [];
for (const [f, t, pref] of [[BASE, RH, RH_USDG], [RH, BASE, BASE_USDC]] as const) {
  for (const src of [f.native, ...f.erc20]) {
    ALL.push({ from: f, to: t, addr: src.address });
    ALL.push({ from: f, to: t, addr: src.address, pref });
  }
}
ok("CONTROL the sweep covers something", ALL.length >= 18, String(ALL.length));

const resolved = ALL.map((k) => ({ k, r: resolveBridgePair(k.from, k.to, k.addr, { preferredStable: k.pref }) }));
ok("CONTROL the sweep produces both outcomes",
   resolved.some((x) => x.r.ok) && resolved.some((x) => !x.r.ok));

ok("INVARIANT every delivered token is on the DESTINATION's bridgeable list — never fabricated, never the origin's",
   resolved.every(({ k, r }) => !r.ok || bridgeableOf(k.to).some((x) => x.address === r.to.address)));
ok("INVARIANT every source token is on the ORIGIN's bridgeable list",
   resolved.every(({ k, r }) => !r.ok || bridgeableOf(k.from).some((x) => x.address === r.from.address)));
ok("INVARIANT assetChanged is exactly 'the symbols differ' — never a stale flag",
   resolved.every(({ r }) => !r.ok || r.assetChanged === (r.from.symbol.toUpperCase() !== r.to.symbol.toUpperCase())));
ok("INVARIANT a changed asset always carries a note, an unchanged one never does",
   resolved.every(({ r }) => !r.ok || (r.assetChanged ? r.note.length > 0 : r.note === "")));
ok("INVARIANT a refusal always says something",
   resolved.every(({ r }) => r.ok || r.message.trim().length > 10));
// "NO_ROUTE" is Relay's routing verdict and belongs to Relay alone. This module
// answering with it is how "we asked for an address that doesn't exist" got
// reported to users as "your token pair isn't supported".
ok("INVARIANT this module never says NO_ROUTE — that word is Relay's",
   resolved.every(({ r }) => r.ok || !/NO_ROUTE/.test(`${r.code}${r.message}`)));

// ── 8. parseChainCurrencies fails closed ────────────────────────────────────
//
// A dropped token is a token we refuse to bridge. A token admitted on a
// malformed record is a token we bridge blindly — so every rejection below is
// the safe direction and the one test that must not be "relaxed" later.
console.log("\nparsing Relay's /chains — unparseable means refused, not assumed");

ok("a well-formed chain parses", (() => {
  const p = parseChainCurrencies({
    id: 4663, displayName: "Robinhood Chain",
    currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 18 },
    erc20Currencies: [{ address: RH_USDG, symbol: "USDG", decimals: 6, supportsBridging: true }],
  });
  return !!p && p.chainId === 4663 && p.label === "Robinhood Chain" && p.erc20.length === 1;
})());

ok("a native entry with no supportsBridging flag still bridges — a chain that is listed moves its own gas token",
   parseChainCurrencies({ id: 1, currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 18 } })
     ?.native.supportsBridging === true);
ok("an ERC-20 with no flag does NOT — it has to say so",
   parseChainCurrencies({
     id: 1, currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 18 },
     erc20Currencies: [{ address: RH_USDG, symbol: "USDG", decimals: 6 }],
   })?.erc20[0]?.supportsBridging === false);

const MALFORMED: [string, unknown][] = [
  ["no id",              { currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 18 } }],
  ["no native currency", { id: 1 }],
  ["undefined",          undefined],
  ["a native with a short address", { id: 1, currency: { address: "0xdead", symbol: "ETH", decimals: 18 } }],
  ["a native with no symbol",       { id: 1, currency: { address: NATIVE_ADDRESS, decimals: 18 } }],
  ["a native with absurd decimals", { id: 1, currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 99 } }],
  ["a native with decimals as a word", { id: 1, currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: "six" } }],
];
let admitted = 0;
for (const [why, raw] of MALFORMED) {
  if (parseChainCurrencies(raw as never) !== null) { admitted++; console.log(`  FAIL  admitted ${why}`); }
}
ok("INVARIANT a chain we cannot parse is dropped, not half-built", admitted === 0);

// A bad ERC-20 must take itself out without taking the chain with it: losing
// one token means one token we won't bridge, losing the chain means none.
const partial = parseChainCurrencies({
  id: 8453, name: "Base",
  currency: { address: NATIVE_ADDRESS, symbol: "ETH", decimals: 18 },
  erc20Currencies: [
    { address: BASE_USDC, symbol: "USDC", decimals: 6, supportsBridging: true },
    { address: "0xnot-an-address", symbol: "EVIL", decimals: 6, supportsBridging: true },
    { address: BASE_USDT, symbol: "",     decimals: 6, supportsBridging: true },
  ],
});
ok("one malformed token drops itself, not the whole chain",
   !!partial && partial.erc20.length === 1 && partial.erc20[0]!.symbol === "USDC",
   partial ? partial.erc20.map((x) => x.symbol).join(",") : "null");

// ── 9. The stable set ───────────────────────────────────────────────────────
//
// This set is the ONLY thing standing between "a dollar for a dollar" and the
// cbBTC hole. Adding a non-stable to it re-opens the sale.
console.log("\nwhat counts as a dollar");
ok("the obvious dollars are dollars", ["USDC", "USDT", "USDG", "DAI", "usdc", " USDG "].every(isStableSymbol));
ok("nothing volatile is a dollar",
   !["ETH", "WETH", "cbBTC", "SOL", "DEGEN", "SYND", "WBTC", "USD", "", "US"].some(isStableSymbol),
   ["ETH", "WETH", "cbBTC", "SOL", "DEGEN", "SYND", "WBTC", "USD", "", "US"].filter(isStableSymbol).join(", "));
ok("the zero address is native, and nothing else is",
   isNativeAddress(NATIVE_ADDRESS) && isNativeAddress(` ${NATIVE_ADDRESS.toUpperCase()} `)
   && !isNativeAddress(BASE_USDC) && !isNativeAddress("0x0"));

// ── 10. THE CALL SITE ───────────────────────────────────────────────────────
//
// Limits, stated so nobody trusts this further than it goes: matching source
// text catches the mistakes written the way this file is written, and misses one
// written differently. The units above are the real guard on the logic; this
// guards the one route that consumes them, and one field that killed it.
console.log("\nthe route consumes the module");

const SRC = path.resolve(path.dirname(path.resolve(process.argv[1])), "../src");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const route = stripComments(readFileSync(path.join(SRC, "app/api/robinhood/router/bridge-prepare/route.ts"), "utf8"));
const card  = stripComments(readFileSync(path.join(SRC, "app/chat/components/RobinhoodBridgeCard.tsx"), "utf8"));

ok("the route resolves the pair through this module", /resolveBridgePair\(/.test(route));
// THE original bug, as one line of source. It typechecks, it builds, and it is
// correct for exactly one token.
const sameTokenOtherChain = /destinationCurrency:\s*originCurrency/.exec(route);
ok("the route never asks for the ORIGIN address on the DESTINATION chain",
   sameTokenOtherChain === null, sameTokenOtherChain?.[0]);
ok("the destination comes from the resolved pair", /destinationCurrency:\s*pair\.to\.address/.test(route));

// MEASURED 2026-09-11, 5 runs × 2 variants, native ETH Base→Robinhood:
// no referrer → 200 every run; referrer:"blueagent.dev" → 401 UNAUTHORIZED_QUOTE
// every run. One field, and the bridge was dead for every token in every
// direction — native ETH included. It is a plausible-looking line to re-add.
const referrer = /referrer\s*:/.exec(route);
ok("the quote body sends no `referrer` — it needs a Relay API key and 401s without one",
   referrer === null, referrer?.[0]);

// Relay's echo of what LANDS must be checked, or the card renders our intent
// rather than Relay's answer.
ok("the route verifies Relay's destination echo", /DESTINATION_MISMATCH/.test(route));
ok("the route reports the delivered token separately from the sent one", /tokenOut\s*:/.test(route));
ok("the route reports whether the asset changed", /assetChanged\s*:\s*pair\.assetChanged/.test(route));

// The card's destination side must read tokenOut. `token` is the INPUT, and the
// two genuinely differ on the commonest pair in the app.
ok("the card scales the received amount by the OUTPUT token's decimals",
   /fmtAmount\(prep\.meta\.amountOut,\s*outDecimals\)/.test(card));
const inputSymbolOnOutput = /bottom:\s*`\$\{symbol\}\s+on\s+\$\{toCfg\.label\}`/.exec(card);
ok("the card never labels the received amount with the SENT token's symbol",
   inputSymbolOnOutput === null, inputSymbolOnOutput?.[0]);
ok("the card says so when a different token is arriving", /assetNote/.test(card) && /assetChanged/.test(card));
// `feeBps` derived fee-over-COST instead of fee-over-INPUT and read 3649 bps for
// a trip that cost 14 bps. It was never rendered — which is the only reason it
// was not a live lie — so the guard is that it does not come back.
//
// CASE-INSENSITIVE, and that is not defensive styling. This assertion passed
// while `function computeFeeBps(...)` — the derivation itself, docstring and
// all — was still sitting in the route with its call site removed. `/feeBps/`
// does not match `computeFeeBps`, so one capital letter hid the exact thing the
// check is named after, and the suite reported it "gone from both sides". A
// guard that can be defeated by the ordinary act of naming a helper is not a
// guard. Comments are stripped from both files above, so the wording of this
// very note cannot satisfy it.
const feeBps = /feebps/i.exec(`${route}${card}`);
ok("the broken feeBps derivation is gone from both sides — including any helper that spells it differently",
   feeBps === null, feeBps?.[0]);
ok("the card shows the whole cost, not just the relayer leg", /totalCostUsd/.test(card));
ok("the card shows the guaranteed floor, not only the estimate", /amountOutMin/.test(card));

// ── the wallet's Bridge panel ────────────────────────────────────────────────
//
// The wallet reaches this bridge through an EDITOR (bank/BridgeCard) that
// freezes an intent and hands it to the SAME confirm-only card chat uses. These
// checks are about that seam, because it is where a second, quieter signing
// surface would grow — and a second one means the balance gate, the
// asset-changed banner and the cost line have two places to drift apart.
console.log("\nthe wallet panel is an editor, not a second signing surface");

const panel  = stripComments(readFileSync(path.join(SRC, "app/app/bank/BridgeCard.tsx"), "utf8"));
const client = stripComments(readFileSync(path.join(SRC, "app/app/bank/BankClient.tsx"), "utf8"));

ok("CONTROL the panel file has something in it", panel.length > 500, `${panel.length} chars`);

ok("the wallet renders the SAME confirm card as chat", /<RobinhoodBridgeCard\b/.test(panel));
// The editor must own NO signing primitive. If it grows one, everything the
// confirm card does before the button — the fail-closed balance gate above all
// — becomes skippable from the wallet while still being enforced in chat.
const signer = /\b(useSendTransaction|useWriteContract|sendTransactionAsync|writeContractAsync|signTypedData|eth_sendTransaction)\b/.exec(panel);
ok("the editor holds no signing primitive of its own", signer === null, signer?.[0]);

// No hardcoded token list, in the strongest form available: the picker's source
// must contain ZERO contract addresses. Relay's real set is small and
// surprising (Base DEGEN is LISTED and flagged unbridgeable; Robinhood takes ETH
// and USDG and nothing else), so a hand-written list would look right and be
// wrong in exactly the way nobody checks until after an approve is signed.
const hardcoded = /0x[0-9a-fA-F]{40}/.exec(panel);
ok("the picker hardcodes no token address — every one comes from the route",
   hardcoded === null, hardcoded?.[0]);

// …and the route serves that list from the SAME fetch the POST validates
// against. Two sources would let the picker offer what the validator refuses.
ok("the route serves the picker's list (GET)", /export\s+async\s+function\s+GET\s*\(/.test(route));
ok("…from the same loadRelayChains the POST uses", (route.match(/loadRelayChains\(/g) ?? []).length >= 2);

// The picker shows what Relay MOVES, not what Relay LISTS. Base DEGEN is the
// live counter-example: present in `/chains`, flagged `supportsBridging: false`.
ok("the picker filters with bridgeableOf, so listed-but-refused is never offered",
   /bridgeableOf\(/.test(panel));

// ── the one that matters most ───────────────────────────────────────────────
//
// The pre-quote outlook must be the SERVER'S verdict, not a client-side
// paraphrase of the server's rules. The first draft of this panel re-implemented
// `STABLE_SYMBOLS` as an inline regex and hand-wrote the three refusal
// sentences. It typechecked, it read correctly, and it was a second copy of a
// fund-touching rule: adding one stablecoin to the module would have left the
// picker confidently refusing, in red, pairs the server resolves fine.
ok("the outlook runs the real resolver", /resolveBridgePair\(/.test(panel));
ok("…with the SAME preferredStable the POST passes",
   /preferredStable:\s*WALLET_CHAINS\[/.test(panel) && /preferredStable:\s*WALLET_CHAINS\[/.test(route));
ok("…and renders the resolver's own sentences, not its own",
   /pair\.message/.test(panel) && /pair\.note/.test(panel));
// USDBC appears in exactly one place in this repo: the module's STABLE_SYMBOLS.
// If it turns up in the panel, the set has been copied there again.
const copiedStables = /USDBC/i.exec(panel);
ok("…with no copy of the stablecoin set", copiedStables === null, copiedStables?.[0]);

// The editor reads no balance, so it must not decide how much to move. "max" is
// passed through as a WORD and resolved by the confirm card against the real
// on-chain balance, with a gas reserve on native ETH.
const balanceRead = /\b(useBalance|useReadContract|balanceOf)\b/.exec(panel);
ok("the editor reads no balance — 'max' is resolved by the card that can",
   balanceRead === null, balanceRead?.[0]);

// #143/#166/#196: a button that opens nothing, or a panel with no door. Both
// halves are asserted because either one alone passes trivially.
ok("the wallet has a Bridge entrance", /label="Bridge"/.test(client) && /openAction\("bridge"\)/.test(client));
ok("…and it reaches a real panel", /panel\s*===\s*"bridge"\s*&&\s*<BridgeCard/.test(client));
ok("…mounted from the wallet's own editor, not the chat card directly",
   /import\s+BridgeCard\s+from\s+"\.\/BridgeCard"/.test(client) && !/RobinhoodBridgeCard/.test(client));

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
