/**
 * CI guard on the Robinhood Chain Sell gate — `src/lib/wallet/rh-sellable.ts`
 * and its two call sites, `app/app/bank/RhTokenTable.tsx` and `StockTable.tsx`.
 *
 * Run: `npx tsx scripts/rh-sell-gate-test.ts` from `apps/web/`.
 * Hermetic: pure functions + source text. No env, no network, no RPC, no render.
 *
 * WHAT THIS PROTECTS, in one line: a Sell control may be drawn on a Robinhood
 * row ONLY where a token/WETH pool was actually measured.
 *
 * ── Why the rule is exactly that, and not something weaker ───────────────────
 *
 * `/api/robinhood/router/swap-prepare` in `sell` mode builds ONE
 * `swapExactInputSingleForETH` against ONE fee tier. There is no multi-hop on
 * that path. So a live token/WETH V3 pool is not a good SIGN that the row can be
 * sold — it IS the route. No pool, no fill, and a Sell button on such a row
 * opens a card that answers NO_ROUTE after the user has already decided to sell.
 *
 * Most RWA tokens on 4663 have no pool at all, so "draw it everywhere" is not a
 * small over-promise, it is the common case.
 *
 * ── The asymmetry this file exists to keep ───────────────────────────────────
 *
 * Three states, and the third is NOT a synonym for the second:
 *
 *   "pool"        measured, fillable        → control
 *   "none"        measured, nothing to fill → dash, and we may say why
 *   "unreadable"  NOT measured              → dash, and we must say THAT instead
 *
 * The BUTTON collapses the last two (fail closed — no affordance we cannot
 * back). The LABEL must not: "no pool on this chain" is a claim about the user's
 * own asset, and an RPC that timed out cannot support it. That is the
 * #211/#212/#213 shape — an absence produced by a broken reader, rendered as a
 * fact — applied to the trade path, which is the most expensive place to make
 * it.
 *
 * `undefined` is a FOURTH input (an address never asked about) and must read the
 * same as `unreadable` everywhere.
 *
 * The invariants below are stated over the INPUT SPACE, not over the current
 * implementation, so they survive a rewrite of either function — including the
 * addition of a fifth state nobody has thought of yet.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canSellRow, sellDashTitle, type SellState } from "../src/lib/wallet/rh-sellable";

let failed = 0;
function ok(what: string, cond: boolean, detail = ""): void {
  if (cond) { console.log(`  ✓ ${what}`); return; }
  failed++;
  console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`);
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── 1. canSellRow over the WHOLE input space ────────────────────────────────
//
// Enumerated rather than spot-checked: the point of a gate is that everything
// which is not an explicit yes is a no. `extra` carries inputs that are not
// members of SellState at all — a future state, a typo, a value from an older
// cached response — because those are exactly the ones a `!== "none"` style
// implementation would wave through.
console.log("canSellRow — only a measured pool opens the control");
{
  const yes: SellState[] = ["pool"];
  const no: (SellState | undefined)[] = ["none", "unreadable", undefined];
  const extra = ["", "POOL", "Pool", "ok", "true", "yes", "liquid", "unknown", null, 0, 1, {}, []];

  for (const s of yes) ok(`"${s}" → true`, canSellRow(s) === true);
  for (const s of no) ok(`${JSON.stringify(s)} → false`, canSellRow(s) === false);
  for (const s of extra) {
    ok(
      `non-state ${JSON.stringify(s)} → false`,
      canSellRow(s as unknown as SellState) === false,
      "anything that is not a measured pool must fail closed",
    );
  }
}

// ── 2. sellDashTitle keeps the two absences apart ───────────────────────────
//
// The whole reason this is a separate function from `canSellRow`: they give the
// SAME answer for "none" and "unreadable" on the button and DIFFERENT answers
// on the label. Merging them back into one boolean is the regression this
// guards, and it would be invisible on screen until someone's RPC blipped.
console.log("\nsellDashTitle — a failed read never becomes a claim about the token");
{
  const noneText = sellDashTitle("none");
  const unreadText = sellDashTitle("unreadable");
  const undefText = sellDashTitle(undefined);

  ok("they are not the same sentence", noneText !== unreadText);
  ok("undefined reads as unmeasured, not as a measured 'none'", undefText === unreadText,
    `got ${JSON.stringify(undefText)}`);

  // A claim about the chain may only be made from a measurement of the chain.
  const claims = (s: string) => /no .{0,20}pool|nothing to sell/i.test(s);
  ok('"none" may say there is no pool', claims(noneText));
  ok('"unreadable" may NOT say there is no pool', !claims(unreadText),
    `got ${JSON.stringify(unreadText)}`);
  ok('undefined may NOT say there is no pool', !claims(undefText));

  // …and the unmeasured sentence has to admit the doubt, not merely omit the
  // claim. "No sell available" would pass the test above while still reading,
  // to a user, as a fact about their token.
  ok('"unreadable" admits WE could not check',
    /couldn.?t check|could not check/i.test(unreadText),
    `got ${JSON.stringify(unreadText)}`);
}

// ── 3. Neither table may draw a control outside the gate ────────────────────
//
// Source-text, because the thing being protected is a render decision and there
// is no cheap way to render two client tables here. Deliberately narrow: it
// asserts WHO decides, not how the markup looks, so ordinary UI edits do not
// trip it.
console.log("\nRhTokenTable / StockTable — one gate, and it is canSellRow");
{
  const files = [
    ["src/app/app/bank/RhTokenTable.tsx", "RhSellControl"],
    ["src/app/app/bank/StockTable.tsx", "StockSellControl"],
  ] as const;

  for (const [path, control] of files) {
    const src = read(path);
    const name = path.split("/").pop();

    ok(`${name} imports the shared gate`,
      /from\s+["']@\/lib\/wallet\/rh-sellable["']/.test(src));

    // Every render of the control must sit on the true branch of a canSellRow
    // ternary. Counting is the assertion: one gate, one control.
    const controlUses = (src.match(new RegExp(`<${control}\\b`, "g")) ?? []).length;
    const gateUses = (src.match(/canSellRow\(/g) ?? []).length;
    ok(`${name} renders <${control}> exactly once`, controlUses === 1,
      `found ${controlUses}`);
    ok(`${name} calls canSellRow exactly once`, gateUses === 1, `found ${gateUses}`);
    ok(`${name} renders the control on the canSellRow branch`,
      new RegExp(`canSellRow\\([^)]*\\)[\\s\\S]{0,120}?<${control}\\b`).test(src),
      "the control must be the TRUE arm of the gate, not a sibling of it");

    // The dash must carry the sentence, and the sentence must come from the
    // shared helper — an inline string here is how the two absences drift back
    // into one.
    ok(`${name} titles the dash from sellDashTitle`,
      /title=\{sellDashTitle\(/.test(src));

    // The column is reserved from PROPS, never from a probe result: sizing the
    // grid off the measurement makes every row jump sideways when the first
    // probe lands.
    ok(`${name} sizes its grid off the seller prop, not the probe`,
      /(showSell|sellCol)\s*=\s*!!onQuickSell/.test(src),
      "grid width must not depend on `sellable`");

    // `useRhSellable` is a HOOK, and `address` goes undefined → string the
    // moment a wallet connects. An early `return null` in between changes the
    // hook count across exactly that transition and React throws "Rendered more
    // hooks than during the previous render" — on the one screen this whole
    // file is about. Neither `tsc --noEmit` nor `next build` looks at hook
    // order, so all four of the usual gates pass while the page crashes; this
    // assertion is the only thing standing between a re-ordering edit and that
    // crash. Textual on purpose: the cheap check is "does the probe come first",
    // and it is exactly the property that was violated once already.
    // Scoped to the component that actually calls it — in StockTable the hook
    // lives in `Leg` and the `!address` guard lives in the outer table, two
    // different functions, so a whole-file index comparison would pass for the
    // wrong reason. Slice back to the enclosing `function` and look for a
    // `return` between it and the hook.
    const hookAt = src.indexOf("useRhSellable(");
    // Last top-level `function`/`export default function` declaration that
    // starts before the hook — i.e. the component the hook actually belongs to.
    let fnAt = -1;
    for (const m of src.matchAll(/^(?:export default |export )?function \w+/gm)) {
      if (m.index !== undefined && m.index < hookAt) fnAt = m.index; else break;
    }
    const preamble = hookAt >= 0 && fnAt >= 0 ? src.slice(fnAt, hookAt) : "";
    ok(`${name} probes before any early return (rules of hooks)`,
      hookAt >= 0 && fnAt >= 0 && !/\n\s{2}(?:if\s*\(.*?\)\s*)?return\b/.test(preamble),
      "no early return may sit between the component's opening brace and useRhSellable");
  }
}

// ── 4. The two gates RhTokenTable owes on top of the pool ───────────────────
//
// Native ETH is the OUT side of every sell on 4663, so a native row has nothing
// to sell INTO; and #145 already established that an impostor never gets a trade
// control, because being mistaken for another token is precisely what the
// impostor is trying to cash in on.
console.log("\nRhTokenTable — native and impostor rows never reach the gate");
{
  const src = read("src/app/app/bank/RhTokenTable.tsx");
  // The window is generous on purpose: what is asserted is the ORDER of the
  // three branches, not how much prose sits between them. Each dash carries its
  // own explanatory `title`, so the gap is mostly sentences.
  ok("native rows are handled before the pool gate",
    /h\.isNative[\s\S]{0,900}?canSellRow\(/.test(src));
  ok("impostor rows are handled before the pool gate (#145)",
    /!canQuickSell\(h\.trust\)[\s\S]{0,900}?canSellRow\(/.test(src));
  ok("native rows are excluded from the probe input",
    /filter\(h\s*=>\s*!h\.isNative\)/.test(src),
    "ETH has no token/WETH pool; probing it would be an RPC call for a known answer");
}

// ── 5. Neither cache may store an absence of knowledge ──────────────────────
//
// An `unreadable` pinned for the TTL turns one dropped request into a
// session-long "couldn't check" — the same law `rh-holdings-cache.ts` applies to
// a failed explorer read, and the route applies server-side.
console.log("\nCaches store measurements only");
{
  const client = read("src/lib/wallet/rh-sellable.ts");
  ok("client caches only pool/none",
    /state\s*===\s*"pool"\s*\|\|\s*\w+\??\.state\s*===\s*"none"/.test(client),
    "a cached `unreadable` outlives the blip that caused it");

  const route = read("src/app/api/robinhood/swap/sellable/route.ts");
  ok("route memo refuses unreadable",
    /if\s*\(probe\.state\s*===\s*"unreadable"\)\s*return;/.test(route));
  ok("over-cap addresses are dropped, never answered",
    /slice\(0,\s*MAX_TOKENS\)/.test(route),
    "inventing a `none` past the cap is the bug this whole file avoids");
}

// ── 6. The probe itself keeps 'no' apart from 'did not answer' ──────────────
//
// `findWethPools` in the same module catches every read error into a skipped
// tier and returns `[]`, so failure and emptiness are the same value there.
// That is fine for its five paid callers and fatal for a UI gate. `probeWethPool`
// must not be "simplified" back into it.
console.log("\nprobeWethPool — an unread fee tier is not a tier that said no");
{
  const src = read("src/lib/robinhood/pool.ts");
  ok("a failed getPool is not folded into the zero address",
    /catch\(\(\):\s*Tier\s*=>\s*\(\{\s*ok:\s*false\s*\}\)\)/.test(src));
  ok("no live pool + any unread tier → unreadable, not none",
    /reads\.some\(\(r\)\s*=>\s*"failed"\s+in\s+r\)[\s\S]{0,160}?state:\s*"unreadable"/.test(src),
    "if three tiers say no and the fourth times out, the fourth is where the pool would be");
  ok("findWethPools is left intact for its paid callers",
    /export async function findWethPools\(/.test(src));
}

console.log(
  failed === 0
    ? "\nPASS — rh sell gate"
    : `\nFAIL — ${failed} assertion(s)`,
);
process.exit(failed === 0 ? 0 : 1);
