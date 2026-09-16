/**
 * CI guard on the Send asset picker — `src/lib/wallet/useSendableAssets.ts`,
 * the card that spends through it (`src/app/app/bank/WalletSendCard.tsx`), and
 * the dropdown they share (`src/components/wallet/Picker.tsx`).
 *
 * Run: `npx tsx scripts/send-picker-test.ts` from `apps/web/`.
 * Hermetic: pure functions + reading three source files. No env, no network.
 *
 * WHY THIS EXISTS: Send is the one wallet surface that MOVES money, and on
 * 2026-09-11 its token control went from two hardcoded buttons (the chain's cash
 * and its gas token) to "everything the address actually holds, plus anything
 * you can paste". That was the right fix — the portfolio table listed cbBTC and
 * B20 shares that Send could not reach, which is a holding with no exit — but it
 * multiplied the number of ways the WRONG token can end up armed, and every one
 * of them ends at a signature.
 *
 * `read-state-test.ts` guards "how complete is this read?" and
 * `display-rules-test.ts` guards "what do we show of what we read?". This is the
 * third question, and the only one with funds on the other side of it: **is the
 * thing about to be signed the thing the user picked?**
 *
 * Four claims are worth executing rather than grepping:
 *
 *   1. A PIN IS NOT A DUPLICATE. `mergeAssets` folds a holdings row into the
 *      pinned row at the same address instead of appending beside it. Get that
 *      wrong and the panel shows two USDC rows that send the identical token
 *      while looking like a choice between two things. The rule has enough
 *      branches — null-native vs address, case-folding, which side's `trust`
 *      wins — that a regex cannot answer whether it holds.
 *
 *   2. AN IMPOSTOR CANNOT BUY ITS WAY TO THE TOP. Rows sort by USD value, and a
 *      counterfeit's USD value is a number IT chose. A fake USDC claiming
 *      $9,999,999 must still sort last, or the scam token is the first thing
 *      under the user's thumb.
 *
 *   3. THE SCALE A SIGNATURE USES IS READ ON-CHAIN. `decimals` and `amount` on
 *      a `SendableAsset` come from a holdings payload — a report about the past.
 *      They are DISPLAY ONLY. The exponent that multiplies the transfer comes
 *      from `useSpendableBalance`, read from the token itself at send time. This
 *      is the measured USDG-at-18 bug, and the reason the picker was safe to
 *      widen to arbitrary tokens at all. Asserted against source with comments
 *      stripped first, because the card documents the rule in a comment that
 *      names the very identifier the rule forbids.
 *
 *   4. THE LIST HAS EXACTLY ONE ORIGIN. The picker reads the same two endpoints
 *      the portfolio tables read — so it cannot offer a token the portfolio does
 *      not show, and cannot miss one it does. A third fetch, or a hardcoded
 *      majors list, silently makes Send and the table two different opinions
 *      about what this wallet holds.
 *
 * Limits, stated so nobody trusts this further than it goes: the source-text
 * assertions catch the mistakes written the way these files are written, and
 * miss one written differently. The behavioural tables above them are the real
 * guard on the logic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  pinnedAssets, mergeAssets, type SendableAsset, type SendChain,
} from "../src/lib/wallet/useSendableAssets";
import { classifyToken, NATIVE_SENTINEL } from "../src/lib/wallet/token-trust";
import { WALLET_CHAINS } from "../src/lib/wallet/chains";

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

const SEND_CHAINS: SendChain[] = ["base", "robinhood"];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ── 1. pinnedAssets — the two rows that survive a dead endpoint ─────────────
//
// These are listed at a zero balance and when the holdings read fails outright,
// because a picker whose contents depend on a read that can fail would go empty
// exactly when it is least helpful.
console.log("\npinnedAssets — the pair that is listed even when nothing is read");

for (const chain of SEND_CHAINS) {
  const cfg = WALLET_CHAINS[chain];
  const pins = pinnedAssets(chain);
  ok(`${chain}: exactly two pins`, pins.length === 2, `got ${pins.length}`);

  const native = pins[0]!;
  const cash = pins[1]!;

  // Native is spelled `null`. NOT the zero address and NOT the 0xeee… sentinel:
  // both of those are 20-byte values that `writeContract` would accept as a
  // contract address without complaint, and an ERC-20 `transfer` aimed at
  // 0x000…0 is a burn. The nullable is the one spelling that cannot be
  // mistaken for a token.
  ok(`${chain}: native is spelled null`, native.address === null, String(native.address));
  ok(`${chain}: native is not the zero address`, (native.address as string | null) !== ZERO_ADDR);
  ok(`${chain}: native is not the 0xeee sentinel`,
     (native.address as string | null)?.toLowerCase() !== NATIVE_SENTINEL.toLowerCase());
  ok(`${chain}: native is pinned`, native.pinned === true);

  ok(`${chain}: cash is the chain's OWN stable`, cash.address === cfg.stable,
     `${cash.address} vs config ${cfg.stable}`);
  ok(`${chain}: cash symbol comes from config`, cash.symbol === cfg.stableSymbol);
  ok(`${chain}: cash decimals come from config`, cash.decimals === cfg.stableDecimals);
  ok(`${chain}: cash is pinned`, cash.pinned === true);
}

// The single copy-paste this catches: Base USDC's address pinned on Robinhood.
// There is no code at that address on 4663, so the balance read, the decimals
// read and the transfer would all point at nothing — and `baseSepolia`'s USDC
// is the same hazard wearing the same ticker, one character of config away.
console.log("\nno chain pins another chain's cash");
for (const chain of SEND_CHAINS) {
  const mine = pinnedAssets(chain)[1]!.address!.toLowerCase();
  for (const other of ["base", "baseSepolia", "robinhood"] as const) {
    if (other === chain) continue;
    ok(`${chain} does not pin ${other}'s stable`,
       mine !== WALLET_CHAINS[other].stable.toLowerCase(), mine);
  }
}

// The pin's verdict is CLASSIFIED, not asserted. The value of that is precisely
// here: if `chains.ts` ever names an address that `token-trust.ts` does not
// pin, the pinned row stops saying "verified" — loudly, in this test — instead
// of a hand-written literal that would keep claiming it.
console.log("\nthe pinned verdict is computed, so a config drift becomes visible");
for (const chain of SEND_CHAINS) {
  const cfg = WALLET_CHAINS[chain];
  const trust = pinnedAssets(chain)[1]!.trust;
  ok(`${chain}: the pinned ${cfg.stableSymbol} classifies as verified`, trust === "verified",
     `got "${trust}" — chains.ts and token-trust.ts disagree about which address is ${cfg.stableSymbol} on ${chain}`);
  // CONTROL: the classifier is not simply answering "verified" to everything.
  // Same ticker, an address nothing pins — it must not come back verified, or
  // the assertion above is measuring nothing at all.
  const decoy = ("0x" + "1".repeat(40)) as `0x${string}`;
  ok(`${chain}: CONTROL a decoy wearing ${cfg.stableSymbol} is not verified`,
     classifyToken({ symbol: cfg.stableSymbol, address: decoy }, chain) !== "verified");
}

// ── 2. mergeAssets — enrich the pin, never duplicate it ─────────────────────
console.log("\nmergeAssets — a real read enriches a pinned row");

const BASE_USDC = WALLET_CHAINS.base.stable;
const basePins = pinnedAssets("base");
const at = (list: SendableAsset[], a: `0x${string}`) =>
  list.find(x => x.address !== null && x.address.toLowerCase() === a.toLowerCase());

/** A holdings row, spelled out field by field so a behaviour change shows up as
 *  a visible line in the diff rather than as a generator's shared assumption. */
const row = (p: Partial<SendableAsset> & { address: `0x${string}` | null }): SendableAsset =>
  ({ symbol: "", trust: "unverified", ...p });

{
  const merged = mergeAssets(basePins, [
    row({ address: BASE_USDC, symbol: "USDC", name: "USD Coin", amount: "12.5", usdValue: 12.5, trust: "verified" }),
  ]);
  ok("a read at the pinned address adds no row", merged.length === 2, `got ${merged.length}`);
  const usdc = at(merged, BASE_USDC)!;
  ok("the enriched row is still a pin", usdc.pinned === true);
  ok("the enriched row takes the read's amount", usdc.amount === "12.5");
  ok("the enriched row takes the read's name", usdc.name === "USD Coin");
  ok("the enriched row keeps the config's decimals",
     usdc.decimals === WALLET_CHAINS.base.stableDecimals, String(usdc.decimals));
}

{
  // Chain data arrives in whatever casing the indexer chose. Matching that is
  // an address comparison, so it folds case — the alternative is a second USDC
  // row whose only difference from the first is capitalisation.
  const UPPER = ("0x" + BASE_USDC.slice(2).toUpperCase()) as `0x${string}`;
  const merged = mergeAssets(basePins, [row({ address: UPPER, symbol: "USDC", amount: "3" })]);
  ok("address matching folds case", merged.length === 2, `got ${merged.length}`);
  ok("the case-folded read still enriches the pin", at(merged, BASE_USDC)?.amount === "3");
}

{
  // The whole point of token-trust.ts, in list form: a ticker does not identify
  // a token. A counterfeit wearing "USDC" is its OWN row, never folded into the
  // real one — folding it would hide the impostor behind a verified badge.
  const fake = ("0x" + "a".repeat(40)) as `0x${string}`;
  const merged = mergeAssets(basePins, [row({ address: fake, symbol: "USDC", trust: "impostor" })]);
  ok("a different address wearing USDC is a separate row", merged.length === 3, `got ${merged.length}`);
  ok("the real USDC keeps its pin", at(merged, BASE_USDC)?.pinned === true);
  ok("the counterfeit keeps its verdict", at(merged, fake)?.trust === "impostor");
}

{
  // Native merges by the NULL flag, not by the string "ETH".
  const merged = mergeAssets(basePins, [
    row({ address: null, symbol: "Ether", amount: "0.4", usdValue: 1600, trust: "verified" }),
  ]);
  ok("a native read enriches the native pin", merged.length === 2, `got ${merged.length}`);
  ok("the native pin keeps its own symbol", merged[0]!.symbol === "ETH", merged[0]!.symbol);
  ok("the native pin takes the read's amount", merged[0]!.amount === "0.4");
}

{
  // …and the mirror of it: an ERC-20 that CALLS itself ETH is a contract, and
  // must not be folded into the gas row. If it were, picking "ETH" would arm a
  // token address and the send path's `isNative` check would read false for the
  // row the user believes is gas.
  const fakeEth = ("0x" + "b".repeat(40)) as `0x${string}`;
  const merged = mergeAssets(basePins, [
    row({ address: fakeEth, symbol: "ETH", amount: "999", trust: "impostor" }),
  ]);
  ok("an ERC-20 wearing the gas ticker is not folded into the native row",
     merged.length === 3, `got ${merged.length}`);
  ok("the native row is untouched by it",
     merged[0]!.address === null && merged[0]!.amount === undefined);
}

{
  // Sort order, and the claim that matters most in it.
  const a = ("0x" + "c".repeat(40)) as `0x${string}`;
  const b = ("0x" + "d".repeat(40)) as `0x${string}`;
  const scam = ("0x" + "e".repeat(40)) as `0x${string}`;
  const merged = mergeAssets(basePins, [
    row({ address: a, symbol: "AAA", usdValue: 5 }),
    row({ address: b, symbol: "BBB", usdValue: 500 }),
    row({ address: scam, symbol: "USDC", trust: "impostor", usdValue: 9_999_999 }),
  ]);
  ok("pins lead: native, then cash",
     merged[0]!.address === null && merged[1]!.address === BASE_USDC);
  ok("held rows sort by value, descending",
     merged[2]!.symbol === "BBB" && merged[3]!.symbol === "AAA",
     merged.map(x => x.symbol).join(","));
  // The important one. `usdValue` on a counterfeit is a number the counterfeit
  // chose; if it could sort, the scam would be the first row under the thumb.
  ok("an impostor sorts last however large it claims to be",
     merged[4]!.address === scam && merged[4]!.trust === "impostor",
     merged.map(x => `${x.symbol}:${x.trust}`).join(" "));
}

{
  // A server warning is never overwritten by the pin's optimism. `trust` is
  // computed server-side against the same chain by the same function, and it
  // knows about `isB20`, which a pin does not — so the row's verdict wins, in
  // the direction that can only ever add a warning.
  const merged = mergeAssets(basePins, [row({ address: BASE_USDC, symbol: "USDC", trust: "impostor" })]);
  ok("a server verdict on a pinned row is not suppressed by the pin",
     at(merged, BASE_USDC)?.trust === "impostor");
}

{
  ok("an empty read leaves both pins standing", mergeAssets(basePins, []).length === 2);
  // Shallow-copying the array is not enough on its own — `out[i].amount = …`
  // would reach through and mutate the caller's pin objects, so the next chain
  // switch would seed the card from a row carrying the last chain's balance.
  const fresh = pinnedAssets("base");
  mergeAssets(fresh, [row({ address: BASE_USDC, symbol: "USDC", amount: "9" })]);
  ok("mergeAssets does not mutate the pins it was handed", fresh[1]!.amount === undefined,
     String(fresh[1]!.amount));
}

// ── 3. THE SOURCE OBEYS THE RULES IT DOCUMENTS ──────────────────────────────
//
// Comments are stripped FIRST and that is not a detail: the card explains the
// decimals rule in a comment that spells out `asset.decimals`, the exact
// identifier the rule forbids. Asserting against raw text would fail on the
// documentation and pass on the violation.
console.log("\nthe source obeys the rules it documents");

const WEB = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const read = (rel: string) => stripComments(readFileSync(path.join(WEB, rel), "utf8"));

const card = read("src/app/app/bank/WalletSendCard.tsx");
const hook = read("src/lib/wallet/useSendableAssets.ts");
const picker = read("src/components/wallet/Picker.tsx");
ok("CONTROL all three sources were read and stripped to something",
   card.length > 2000 && hook.length > 1000 && picker.length > 500,
   `${card.length}/${hook.length}/${picker.length}`);

// 3a. The exponent that multiplies a signature is read ON-CHAIN.
const parseCalls = [...card.matchAll(/parseUnits\(([^)]*)\)/g)].map(m => m[1]!);
ok("CONTROL the card still scales amounts with parseUnits", parseCalls.length >= 3,
   `found ${parseCalls.length}`);
for (const args of parseCalls) {
  const scale = args.split(",").pop()!.trim();
  ok(`parseUnits scale is read on-chain (${scale})`,
     scale === "dec" || scale === "bal.decimals", args);
}
ok("no holdings-payload decimals reach executable code",
   !/\basset\.decimals\b/.test(card) && !/\ba\.decimals\b/.test(card));
ok("every .decimals in the card is bal.decimals",
   (card.match(/\.decimals\b/g) ?? []).length === (card.match(/\bbal\.decimals\b/g) ?? []).length,
   `${(card.match(/\.decimals\b/g) ?? []).length} total vs ${(card.match(/\bbal\.decimals\b/g) ?? []).length} on bal`);

// 3b. The fail-closed gate and the transfer both point at the ARMED asset.
// Reading the balance of the chain's cash while sending cbBTC is a gate that
// passes on the wrong number — fail-closed against the wrong token is open.
ok("the balance gate reads the armed asset, not the chain's cash",
   /token:\s*asset\.address\s*\?\?\s*undefined/.test(card));

// The card builds its Base call in ONE place — `buildBaseCall` — which both the
// 5792 batch and the legacy single-tx fallback encode from. These assertions
// used to anchor on `writeContractAsync({`, which stopped existing when that
// builder was extracted; anchoring on a TRANSPORT was the weaker choice anyway,
// because it watched one of two routes to a signature and never saw the memo
// branch at all. Anchor on the builder and both branches are in view.
const bcAt = card.indexOf("function buildBaseCall");
ok("CONTROL the card still has one builder for the Base call", bcAt !== -1);
// To the function's closing brace — at two-space indent, so the first `\n  }`
// after the signature is the end of it and nothing nested can end it early.
const transfer = card.slice(bcAt, card.indexOf("\n  }", bcAt));
ok("the transfer names transfer", /functionName:\s*"transfer"/.test(transfer));
// For an ERC-20 the call goes TO THE TOKEN; the recipient rides in args[0].
// Addressing it at the recipient instead would move nothing and burn the gas.
ok("the ERC-20 call targets the armed asset's contract",
   /const token = asset\.address\b/.test(transfer) && /to: token\b/.test(transfer));
// BOTH encode branches, not just the plain one. A memo transfer scaled by a
// holdings-payload `decimals` would be the measured USDG-at-18 bug wearing a
// different hat, and it reaches a signature by exactly the same click.
// `[^)]+` rather than `\w+` on purpose: the exponent this rule forbids is
// spelled `asset.decimals`, and a word-character class does not match the dot,
// so the wrong scale would have slipped the matcher and been caught only
// indirectly by the count below. Match anything in the slot, then insist it
// is `dec` — the failure then names the offending exponent instead of a total.
const scales = transfer.match(/parseUnits\(amount,\s*[^)]+\)/g) ?? [];
ok("every signed quantity is scaled by the on-chain exponent",
   scales.length >= 2 && scales.every(s => /parseUnits\(amount,\s*dec\)/.test(s)),
   scales.join(" | "));
ok("the memo branch scales by that same on-chain exponent",
   /encodeTransferWithMemo\(\{[^}]*\bdecimals:\s*dec\b/.test(transfer));
ok("the RH prepare body names the armed asset",
   /token:\s*isNative \? "ETH" : asset\.address/.test(card));

// 3c. One origin for the list.
const apiPaths = [...new Set([...hook.matchAll(/\/api\/[a-z0-9/-]+/g)].map(m => m[0]))].sort();
ok("the picker reads exactly the two holdings endpoints and nothing else",
   apiPaths.length === 2
     && apiPaths.includes("/api/wallet/holdings")
     && apiPaths.includes("/api/wallet/rh-holdings"),
   apiPaths.join(" "));
ok("no hardcoded majors list — Send cannot offer what the portfolio does not show",
   !/MAJORS/.test(hook));
ok("trust is not re-derived per row client-side — classifyToken has ONE call site",
   (hook.match(/classifyToken\(/g) ?? []).length === 1,
   String((hook.match(/classifyToken\(/g) ?? []).length));

// 3d. A read that did not land is never an empty list. This is #211/#212/#213
// in the picker: an empty array from a dead endpoint is not "you hold nothing".
ok("the picker never assigns an empty asset list", !/setAssets\(\s*\[\s*\]\s*\)/.test(hook));
const catchAt = hook.indexOf(".catch(");
ok("CONTROL the picker has a catch arm", catchAt !== -1);
const catchArm = hook.slice(catchAt, catchAt + 140);
ok("a thrown fetch sets failed, and sets no list",
   /setFailed\(true\)/.test(catchArm) && !/setAssets/.test(catchArm));
ok("the hook re-pins synchronously on a chain change", /setAssets\(pins\);/.test(hook));
for (const state of ["loading", "failed", "partial"] as const) {
  ok(`the panel says so when the list is ${state}`, card.includes(`list.${state}`));
}

// …and the fourth case, which is not a read state at all. With no address the
// hook never fetches, so loading/failed/partial are all false and the default
// branch would print "Your Base tokens" over two rows that are this file's
// own defaults — a completeness claim about a wallet nobody looked at. The
// `!account` arm must come FIRST, or the three flags answer for it.
const footAt = card.indexOf("border-t border-[#13131f] font-mono text-[9px]");
ok("CONTROL the completeness footer is still there", footAt !== -1);
const footer = card.slice(footAt, footAt + 1400);
const noAccountAt = footer.indexOf("!account");
const loadingAt = footer.indexOf("list.loading");
ok("the disconnected case is answered before any read state",
   noAccountAt !== -1 && loadingAt !== -1 && noAccountAt < loadingAt,
   `!account@${noAccountAt} list.loading@${loadingAt}`);
ok("…and it says the list is NOT the user's holdings", /not your holdings/.test(footer));

// 3e. Reset paths. A figure left over from the previous token reads as one the
// user chose for this one — and 12 of a 6-decimal dollar is not 12 of an
// 8-decimal BTC.
const pnAt = card.indexOf("function pickNetwork");
const paAt = card.indexOf("function pickAsset");
ok("CONTROL both pick handlers exist", pnAt !== -1 && paAt !== -1 && paAt > pnAt);
const pickNetwork = card.slice(pnAt, paAt);
// To the closing brace, NOT to the first newline. Slicing a line gave the
// signature and none of the body, so this check could only ever have passed by
// someone writing `setAmount("")` on the same line as `function pickAsset(` —
// i.e. it was asserting nothing, in the one file where a stale amount is 12 of
// a 6-decimal dollar signed as 12 of an 8-decimal BTC.
const pickAsset = card.slice(paAt, card.indexOf("\n  }", paAt));
ok("a chain change re-pins from the NEW chain",
   /setAsset\(pinnedAssets\(n\)\[1\]\)/.test(pickNetwork));
ok("a chain change clears the amount", /setAmount\(""\)/.test(pickNetwork));
ok("an asset change clears the amount", /setAmount\(""\)/.test(pickAsset), pickAsset);

// 3f. The filter resets from exactly one place. It used to survive an Escape,
// so reopening showed a list narrowed by a search already abandoned — a wallet
// appearing to have lost tokens it is holding.
ok("the asset filter is cleared in exactly ONE place",
   (card.match(/setQuery\(""\)/g) ?? []).length === 1,
   String((card.match(/setQuery\(""\)/g) ?? []).length));
ok("…and that place is the Picker's onClose", /onClose=\{\(\) => setQuery\(""\)\}/.test(card));
ok("CONTROL the Picker closes from several paths",
   (picker.match(/setOpen\(false\)/g) ?? []).length >= 3,
   String((picker.match(/setOpen\(false\)/g) ?? []).length));
ok("onClose fires from ONE place, so a new dismissal path cannot skip it",
   (picker.match(/onClose\?\.\(\)/g) ?? []).length === 1);

// 3g. A pasted address is classified, never assumed — and no verdict in this
// card is hand-written. A literal would keep saying "verified" after the thing
// it vouched for changed.
const pasteAt = card.indexOf("const pasteAsset");
ok("CONTROL the card builds an asset from a pasted address", pasteAt !== -1);
const pasteAsset = card.slice(pasteAt, pasteAt + 220);
ok("a pasted token's symbol is left empty for the chain to fill",
   /symbol:\s*""/.test(pasteAsset));
ok("a pasted token's trust is classified, never assumed", /classifyToken\(/.test(pasteAsset));
ok("the card never hand-writes a trust verdict",
   !/trust:\s*"(verified|unverified|impostor)"/.test(card));
ok("an unread ticker falls through to the address, not a placeholder",
   /asset\.symbol \|\| truncAddr\(/.test(card));
ok("an impostor is called out above the confirm button",
   /asset\.trust === "impostor"/.test(card));

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
