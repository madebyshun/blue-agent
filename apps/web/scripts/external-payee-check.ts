/**
 * Guard: the Hub must never sign an EIP-3009 authorization it cannot justify.
 *
 * Run: `npx tsx scripts/external-payee-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — fixture objects plus source reads. No network, no wallet, no writes.
 *
 * WHY IT EXISTS
 * -------------
 * A community tool's 402 is written by the BUILDER. Anyone can register a tool.
 * So the JSON that says "sign 10000 units to 0x…" is untrusted input, and the
 * thing produced from it is a signature that moves the user's USDC. There is no
 * undo and no chargeback. Every refusal in `lib/x402-accepts.ts` is the only
 * thing standing between a malformed or hostile 402 and a signed transfer.
 *
 * 🔴 A refusal branch that has only been READ, never RUN, is not a guard — it is
 * a comment. That is not a hypothetical in this repo: `hub-receipts-report.ts`
 * shipped a `hidden === null` refusal that could never fire, because the parser
 * it guarded returned `[]` on failure and never `null`. It read perfectly and
 * was dead code. Every branch below is therefore EXECUTED against a fixture that
 * makes the wrong answer distinguishable from the right one.
 *
 * ── THE SECOND HALF IS THE CLAIMS, AND IT IS NOT DECORATION ─────────────────
 * The fix changed the external split from 95/5 to 100/0. The 95/5 was published
 * in eleven places, including the SIWE message a builder is asked to SIGN and a
 * dashboard panel offering to "claim" it. A number that describes someone else's
 * money has to match the code that moves it, so groups 6–9 pin the copy against
 * the constants rather than trusting a sweep to have been complete.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  selectBaseUsdcAccept,
  priceToUnits,
  extractAccepts,
  BASE_USDC,
  type RawAccept,
} from "../src/lib/x402-accepts";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Collapse comment leaders and wrapping so a prose assertion survives a reflow. */
const flat = (s: string) => s.replace(/\n\s*\*?/g, " ").replace(/\s+/g, " ");
/** Strip block + line comments so a claim is not "found" inside a warning about it. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
/**
 * The `{…}` that follows a match, balanced by brace depth.
 *
 * Deliberately not "the next N characters": the first draft of 11.2 used a
 * distance window and failed on correct code, because one Tailwind className in
 * this repo runs to ~155 characters. Depth is the only thing that answers "is
 * this statement inside that block" without a magic number that rots.
 */
const blockAfter = (src: string, re: RegExp): string => {
  const m = re.exec(src);
  if (!m) return "";
  const open = src.indexOf("{", m.index);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(open + 1, j);
  }
  return "";
};
/**
 * What directly follows each balanced `name(…)` call.
 *
 * Also brace counting, and for the same reason twice over: 13.2's first draft
 * asked for `setErr\([\s\S]*?\);\s*return;` and reported an orphan that was not
 * one, because a non-greedy gap will happily run a thousand characters to find
 * the `return` it was told to look for. "The very next statement" is structural;
 * any regex for it is really a distance measurement wearing a disguise.
 */
const afterCalls = (src: string, name: string): string[] => {
  const out: string[] = [];
  for (let i = src.indexOf(`${name}(`); i >= 0; i = src.indexOf(`${name}(`, i + 1)) {
    let depth = 0;
    for (let j = i + name.length; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) { out.push(src.slice(j + 1, j + 80)); break; }
    }
  }
  return out;
};

// ── Fixtures ────────────────────────────────────────────────────────────────
// Shaped after the ONE live registered endpoint, measured 2026-09-26. Its body
// carries three requirement lists, not one: `accepts` (Base USDC), `accepts_bsc`
// (BSC, 18 decimals, amount 10000000000000000) and `acceptsV1`.

const BUILDER = "0x2e882b5f4d97c2acceb7d68c97582e8c8dae6f22";
const TREASURY = "0x02950ad38ada1d599375bd447e080cd404809205";
const CENT = 10_000; // $0.01 in USDC's 6-decimal units

const baseEntry: RawAccept = {
  scheme: "exact",
  network: "eip155:8453",
  asset: BASE_USDC,
  payTo: BUILDER,
  maxAmountRequired: String(CENT),
};

/* ⚠ The BSC entry sits at INDEX 0 on purpose, and its amount is a 10^16 integer.
   `accepts[0]` is the natural way to read this array and it is the expensive
   one: read as Base USDC, 10000000000000000 units is ten billion dollars, and
   the asset is not even the token the user holds. A fixture whose first entry is
   already correct cannot tell a position-based reader from a network-based one,
   so it would pass on the broken implementation. */
const BSC_FIRST: RawAccept[] = [
  {
    scheme: "exact",
    network: "eip155:56",
    asset: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    payTo: BUILDER,
    maxAmountRequired: "10000000000000000",
  },
  baseEntry,
];

// ── Group 1: refusals — the entire safety story ──────────────────────────────
// Each case asserts BOTH that it refuses AND which code it refuses with. The
// code is what a log and a future branch dispatch on; "some refusal happened"
// would let two different faults collapse into one and hide a regression.

{
  const cases: [string, unknown, number | null, string][] = [
    ["1.1  no accepts array at all",            null,               CENT, "no_accepts"],
    ["1.2  an empty accepts array",             [],                 CENT, "no_accepts"],
    ["1.3  a non-array (object)",               { payTo: BUILDER }, CENT, "no_accepts"],
    ["1.4  BSC only — no Base USDC entry",      [BSC_FIRST[0]],     CENT, "no_base_usdc"],
    ["1.5  right network, wrong asset",
      [{ ...baseEntry, asset: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }], CENT, "no_base_usdc"],
    ["1.6  right asset, wrong network",
      [{ ...baseEntry, network: "eip155:137" }], CENT, "no_base_usdc"],
    ["1.7  unknown scheme",
      [{ ...baseEntry, scheme: "upto" }], CENT, "bad_scheme"],
    ["1.8  payee is not an address",
      [{ ...baseEntry, payTo: "not-an-address" }], CENT, "bad_payee"],
    ["1.9  payee missing entirely",
      [{ ...baseEntry, payTo: undefined }], CENT, "bad_payee"],
    ["1.10 payee is 39 hex chars, one short",
      [{ ...baseEntry, payTo: "0x2e882b5f4d97c2acceb7d68c97582e8c8dae6f2" }], CENT, "bad_payee"],
    ["1.11 no amount stated",
      [{ ...baseEntry, maxAmountRequired: undefined }], CENT, "bad_amount"],
    ["1.12 amount is zero",
      [{ ...baseEntry, maxAmountRequired: "0" }], CENT, "bad_amount"],
    ["1.13 amount above the advertised price",
      [{ ...baseEntry, maxAmountRequired: "500000000" }], CENT, "over_advertised"],
    ["1.14 the advertised price could not be read",
      [baseEntry], null, "over_advertised"],
  ];
  for (const [name, accepts, max, code] of cases) {
    const r = selectBaseUsdcAccept(accepts, max);
    check(`${name} → ${code}`, r.ok === false && r.code === code);
  }
}

// ── Group 2: the amount, which is the one field a hostile builder controls ───
// 🔴 `Number()` accepts every string below and returns a number that is not what
// the string looks like. "1e9" is a thousand dollars. "0x2710" is 10000 — the
// right number by accident, which is worse, because it teaches you the parse is
// fine. Digits-only is the only rule that cannot be argued with.

{
  const evil = [
    "1e9",          // exponent notation — 1,000 USDC
    "0x2710",       // hex that happens to equal 10000
    " 10000 ",      // padded, so a trim-then-compare reads it as in-range
    "10000.0",      // a decimal in a field defined as integer units
    "+10000",       // signed
    "1_0000",       // JS numeric separator, not valid JSON-number text
    "Infinity",
    "NaN",
    "-10000",
    "",
  ];
  for (const raw of evil) {
    const r = selectBaseUsdcAccept([{ ...baseEntry, maxAmountRequired: raw }], CENT);
    check(`2.x  amount ${JSON.stringify(raw)} is refused as unreadable`,
          r.ok === false && r.code === "bad_amount");
  }
  // And the control: a plain integer string still works. Without this the ten
  // assertions above would also pass on a function that refuses everything.
  const ok = selectBaseUsdcAccept([baseEntry], CENT);
  check("2.11 a plain integer amount is still accepted (the evil cases are not a blanket refusal)",
        ok.ok === true && ok.accept.amountUnits === "10000");
}

// ── Group 3: selection by network AND asset, never by position ───────────────

{
  const r = selectBaseUsdcAccept(BSC_FIRST, CENT);
  check("3.1 a BSC entry at index 0 does not become the selection",
        r.ok === true && r.accept.amountUnits === "10000");
  check("3.2 the selected asset is Base USDC",
        r.ok === true && r.accept.asset.toLowerCase() === BASE_USDC.toLowerCase());
  check("3.3 the selected network is normalised to eip155:8453",
        r.ok === true && r.accept.network === "eip155:8453");
  check("3.4 the payee is the builder, not the Blue treasury",
        r.ok === true && r.accept.payTo.toLowerCase() === BUILDER.toLowerCase());
  check("3.5 the payee is NOT the treasury — the bug this whole change fixes",
        r.ok === true && r.accept.payTo.toLowerCase() !== TREASURY.toLowerCase());

  // A checksum difference is not a different token. Refusing on case would
  // reject honest endpoints; matching on case would let a lowercase USDC through
  // as "unknown asset". Both directions are wrong, so both are pinned.
  const lower = selectBaseUsdcAccept(
    [{ ...baseEntry, asset: BASE_USDC.toLowerCase() }], CENT);
  check("3.6 a lowercase USDC address still matches", lower.ok === true);
  const spelled = ["base", "8453", "BASE", "eip155:8453"].map(n =>
    selectBaseUsdcAccept([{ ...baseEntry, network: n }], CENT).ok);
  check("3.7 every spelling of Base seen in the wild matches", spelled.every(Boolean));
  const notBase = selectBaseUsdcAccept([{ ...baseEntry, network: "84532" }], CENT);
  check("3.8 Base SEPOLIA does not match mainnet",
        notBase.ok === false && notBase.code === "no_base_usdc");
}

// ── Group 4: the ceiling — refuse, never clamp, never treat null as no-limit ─
// The Hub card says "$0.01" because that is what the builder typed into the
// registry. The 402 is generated live. If we sign what it asks, a builder can
// advertise $0.01 and charge $500, and the real figure appears only inside a
// typed-data blob most people approve without reading.

{
  const over = selectBaseUsdcAccept([{ ...baseEntry, maxAmountRequired: "50000000" }], CENT);
  check("4.1 $50 against a $0.01 listing is refused", over.ok === false);
  check("4.2 …and the refusal names both figures so the user can see the gap",
        over.ok === false && over.reason.includes("50") && over.reason.includes("0.01"));
  // 🔴 Clamping is the tempting alternative and it is strictly worse than
  // refusing: the endpoint would reject the reduced authorization, so the user
  // would have signed away a nonce and got nothing, with no explanation.
  check("4.3 an over-ask is not silently clamped to the listed price",
        over.ok === false);

  const exact = selectBaseUsdcAccept([baseEntry], CENT);
  check("4.4 exactly the listed price is allowed", exact.ok === true);
  const under = selectBaseUsdcAccept([{ ...baseEntry, maxAmountRequired: "5000" }], CENT);
  check("4.5 below the listed price is allowed (a discount is not an attack)",
        under.ok === true && under.accept.amountUnits === "5000");

  // An unreadable ceiling is not an absent ceiling. `?? 0` would refuse
  // everything (loud, survivable); `?? Infinity` would sign anything (silent,
  // unrecoverable). Neither is acceptable, so null refuses explicitly.
  const noMax = selectBaseUsdcAccept([baseEntry], null);
  check("4.6 a null ceiling refuses rather than meaning 'no limit'",
        noMax.ok === false && noMax.code === "over_advertised");

  check("4.7 priceToUnits reads a $ price", priceToUnits("$0.01") === CENT);
  check("4.8 priceToUnits reads a bare number", priceToUnits("0.25") === 250_000);
  for (const bad of [undefined, null, "", "free", "Free", "$", "-1", "$abc"]) {
    check(`4.9 priceToUnits(${JSON.stringify(bad)}) is null, not 0`,
          priceToUnits(bad as string | null | undefined) === null);
  }
  // 0 and null must not share a rendering: `priceToUnits("$0") === 0` is a real
  // free tool, and `0` as a ceiling correctly refuses every positive amount.
  check("4.10 a genuinely free listing reads as 0, distinct from unreadable",
        priceToUnits("$0") === 0);
}

// ── Group 5: extractAccepts — 'an array exists' is not 'the array we asked for'
{
  check("5.1 the x402 field is read", (extractAccepts({ accepts: [baseEntry] }) ?? []).length === 1);
  check("5.2 the SDK spelling is read",
        (extractAccepts({ paymentRequirements: [baseEntry] }) ?? []).length === 1);
  // 🔴 The measured body carries accepts_bsc and acceptsV1 alongside accepts. A
  // "first array in the object" heuristic would select an 18-decimal BSC asset.
  check("5.3 accepts_bsc alone yields null, NOT the BSC list",
        extractAccepts({ accepts_bsc: BSC_FIRST, acceptsV1: [baseEntry] }) === null);
  check("5.4 a null body yields null", extractAccepts(null) === null);
  check("5.5 a string body yields null", extractAccepts("402 Payment Required") === null);
  check("5.6 an empty accepts array yields [] — found and empty, not missing",
        Array.isArray(extractAccepts({ accepts: [] })));
  // The composition that actually runs in HubView: a missing `accepts` must
  // arrive at selectBaseUsdcAccept as null and refuse there, not throw.
  const composed = selectBaseUsdcAccept(extractAccepts({ accepts_bsc: BSC_FIRST }), CENT);
  check("5.7 extract-then-select refuses a BSC-only body end to end",
        composed.ok === false && composed.code === "no_accepts");
}

// ── Group 6: the signing site — where a perfect module still loses money ─────
// Every assertion above can hold while HubView signs PAY_TO_WALLET anyway. This
// group reads the actual call site.

{
  const hub = read("src/app/hub/HubView.tsx");
  const code = stripComments(hub);

  check("6.1 HubView gets its selection from the shared module",
        /from\s+"@\/lib\/x402-accepts"/.test(code));
  check("6.2 …and branches on source === \"external\"",
        /tool\.source\s*===\s*"external"/.test(code));
  check("6.3 the external branch probes for a 402 before signing",
        /probe\.status\s*!==\s*402/.test(code));
  check("6.4 a refusal sets an error and returns — it does not fall through to sign",
        /!sel\.ok[\s\S]{0,200}?setStep\("error"\)[\s\S]{0,40}?return;/.test(code));

  // 🔴 THE REGRESSION THAT MATTERS. `payTo` is assigned from the selection; if
  // anyone writes `?? PAY_TO_WALLET` or reinstates the constant in the message,
  // the original bug is back and nothing else here would notice.
  check("6.5 the signed `to` is the resolved payee, not the constant",
        /message:\s*\{[\s\S]{0,200}?to:\s*payTo,/.test(code));
  check("6.6 the signed value is the resolved amount",
        /value:\s*BigInt\(payUnits\)/.test(code));
  check("6.7 the X-PAYMENT header carries the SAME payee",
        /authorization:\s*\{[\s\S]{0,200}?to:\s*payTo,/.test(code));
  check("6.8 …and the SAME amount",
        /authorization:\s*\{[\s\S]{0,300}?value:\s*payUnits,/.test(code));
  check("6.9 no fallback from the resolved payee to the treasury constant",
        !/payTo[\s\S]{0,40}\?\?\s*PAY_TO_WALLET/.test(code) &&
          !/PAY_TO_WALLET[\s\S]{0,20}\?\?/.test(code));
  check("6.10 no fallback from the resolved amount to the card price",
        !/payUnits[\s\S]{0,40}\?\?\s*priceUnits/.test(code));
  check("6.11 tool.builderAddress is NOT used as the payee (a cached address goes stale)",
        !/payTo\s*=\s*[^;\n]*builderAddress/.test(code));

  // Native must keep working: the browser signs against PAY_TO_WALLET and the
  // server settles against PAY_TO, so a divergence breaks EVERY native payment.
  check("6.12 the native default payee is still the treasury constant",
        /let\s+payTo[^=]*=\s*PAY_TO_WALLET/.test(code));
  const serverPayTo = read("src/app/api/_lib/x402-cdp.ts");
  const clientAddr = code.match(/PAY_TO_WALLET\s*=\s*"(0x[0-9a-fA-F]{40})"/)?.[1] ?? "";
  check("6.13 client PAY_TO_WALLET and server PAY_TO are the same wallet",
        clientAddr.length === 42 &&
          new RegExp(clientAddr, "i").test(serverPayTo));

  // The user learns the payee from the wallet prompt, which shows a bare hex
  // address. This row is the only place it is named while they can still decline.
  check("6.14 the UI discloses that an external tool pays the builder",
        /Paid to/.test(code) && /builder/i.test(hub));
}

// ── Group 7: the published split must equal the split the code performs ──────

{
  const proxy = read("src/app/api/hub/tools/[id]/call/route.ts");
  const proxyCode = stripComments(proxy);
  check("7.1 the proxy credits the builder 100%",
        /BUILDER_SHARE_BPS\s*=\s*10_?000\b/.test(proxyCode));
  check("7.2 the proxy takes no treasury cut",
        /TREASURY_SHARE_BPS\s*=\s*0\b/.test(proxyCode));
  // The proxy is a pass-through by design. If it ever learns to verify or
  // settle, it is holding a third party's money and the split stops being a
  // consequence of EIP-3009 — that is a custody change, not a constant edit.
  check("7.3 the proxy still only forwards the payment header",
        /headers\["X-Payment"\]\s*=\s*xPayment/.test(proxyCode) &&
          !/cdpSettle|cdpVerify/.test(proxyCode));
  check("7.4 the reason the split is 100/0 is written down at the call site",
        /exactly ONE recipient/i.test(flat(proxy)));

  const dash = read("src/app/api/hub/builders/[address]/dashboard/route.ts");
  const dashCode = stripComments(dash);
  check("7.5 the builder dashboard publishes splitPct 100 for external",
        /source:\s*"external"[\s\S]{0,900}?splitPct:\s*100/.test(dashCode));
  check("7.6 hosted keeps its own 90 — the two sources are not merged",
        /source:\s*"hosted"[\s\S]{0,900}?splitPct:\s*90/.test(dashCode));
  check("7.7 external rows are marked paid-direct",
        /source:\s*"external"[\s\S]{0,900}?paidDirect:\s*true/.test(dashCode));
  check("7.8 hosted rows are marked NOT paid-direct (Blue holds that one)",
        /source:\s*"hosted"[\s\S]{0,900}?paidDirect:\s*false/.test(dashCode));
}

// ── Group 8: nothing offers to pay out money Blue never received ─────────────
// The dashboard said "<total> accrued · ready to claim" beside a Withdraw
// button, over a total that included external volume. Blue never held a cent of
// it. This is the one screen in the product that makes a claim about someone
// else's money, so the claim is pinned.

{
  const view = stripComments(read("src/app/hub/_components/DashboardView.tsx"));
  check("8.1 the claim headline no longer reads on the combined total",
        !/ready to claim/.test(view));
  check("8.2 the headline figure is the hosted (held-by-Blue) one",
        /hostedUnits[\s\S]{0,200}?held by Blue/.test(view));
  check("8.3 the external figure is labelled paid-direct, not accrued",
        /EXTERNAL[\s\S]{0,60}paid direct/.test(view));
  check("8.4 no surface still advertises a 95% external share",
        !/95\s*%/.test(view) && !/95\s*\/\s*5/.test(view));

  // 8.6–8.7: the OTHER direction of the same mistake. 8.2 stops the headline
  // over-claiming a total Blue never held; these stop it under-claiming. With
  // `hostedUnits === 0` — the common case, since every external builder
  // registered today is external-only — a headline of "$0.0000 held by Blue"
  // is a true sentence that summarises to "you earned nothing" for a builder
  // who did earn, and a Withdraw button beside it reads as a broken payout.
  // Both branches are asserted because either alone is satisfiable by deleting
  // the panel, and a deleted panel is the same misinformation with no UI.
  check("8.6 with nothing held, the headline shows the paid-direct figure instead",
        /hostedUnits\s*>\s*0[\s\S]{0,260}?externalUnits[\s\S]{0,120}?paid direct/.test(view));
  // Slice-based, not a `[\s\S]{0,N}` window: the first draft of this assertion
  // failed against correct code because one Tailwind className between the guard
  // and the label is ~155 characters, so the window was measuring class-attribute
  // length, not code structure. A distance regex across JSX silently becomes a
  // style-churn detector.
  const wIdx  = view.indexOf("Withdraw (soon)");
  const guard = wIdx < 0 ? "" : view.slice(Math.max(0, wIdx - 400), wIdx);
  check("8.7 the Withdraw button is conditional on Blue actually holding something",
        wIdx > 0 && /hostedUnits/.test(guard) && /(===\s*null|>\s*0)/.test(guard));

  // Sweep the user-visible copy as a whole: eleven places carried 95/5, and a
  // partial sweep is how a stale number survives to be quoted back at us.
  const copy = [
    "src/app/hub/HubView.tsx",
    "src/app/hub/_components/HubHome.tsx",
    "src/app/hub/_components/SubmitTool.tsx",
    "src/app/hub/_components/BuilderView.tsx",
    "src/app/docs/list-a-tool/page.tsx",
    "src/app/about/page.tsx",
  ];
  for (const f of copy) {
    const src = stripComments(read(f));
    check(`8.5 ${f} carries no stale 95/5 external split`,
          !/95\s*\/\s*5/.test(src) && !/\b95%/.test(src) && !/95 \/ 5/.test(src));
  }
}

// ── Group 9: the SIWE terms are BYTE-IDENTICAL in all three copies ───────────
// The client builds the string the wallet signs, the server rebuilds it to
// verify, and /docs/list-a-tool publishes it so an agent can sign without
// scraping the UI. One character of drift rejects every submission — and this
// change had to edit all three, because the old text asked a builder to consent
// to a 95/5 split that no code has ever performed.

{
  const TERMS = [
    "agree to the Blue Hub builder terms: callers pay this wallet",
    "directly, 100% of every call, USDC on Base. Blue Hub takes no cut.",
  ];
  const sites: [string, number][] = [
    ["src/lib/hub-registry.ts", 1],                    // server, verifies
    ["src/app/hub/_components/SubmitTool.tsx", 1],     // client, asks the wallet
    ["src/app/docs/list-a-tool/page.tsx", 2],          // docs: snippet + example
  ];
  for (const [f, want] of sites) {
    const src = read(f);
    for (const line of TERMS) {
      const n = src.split(line).length - 1;
      check(`9.x ${f} has ${want}× "${line.slice(0, 32)}…"`, n === want);
    }
  }
  // Absence assertion, paired with the presence assertions above — on its own,
  // "the old text is gone" would pass by deleting the message entirely.
  //
  // 🔴 Comments are stripped FIRST, and that is not a convenience. This assertion
  // failed on its first run against `hub-registry.ts`, whose docblock records in
  // so many words what the terms used to say — i.e. the guard flagged the history
  // note that exists precisely so nobody reintroduces the thing. Grepping raw
  // source for a forbidden phrase punishes documenting it, which pushes the next
  // author toward deleting the explanation to get green. The phrase is only
  // dangerous in CODE, so only code is searched. Same reasoning as 10.x, which
  // has to CALL the module because its header discusses the phrase it forbids.
  for (const [f] of sites) {
    check(`9.y ${f} no longer asks anyone to sign a 95/5 split`,
          !/95\/5 revenue split/.test(stripComments(read(f))));
  }
  // Hosted is a genuinely different agreement (Blue does hold that share) and
  // must not be swept along with external.
  check("9.z the hosted terms still say 90/10",
        /90\/10 revenue split/.test(read("src/lib/hub-hosted.ts")));
}

// ── Group 10: the module stays pure, which is what makes group 1 possible ────

{
  const src = read("src/lib/x402-accepts.ts");
  check("10.1 x402-accepts imports nothing", !/^\s*import\s/m.test(src));
  check("10.2 …and touches no network and no wallet",
        !/\bfetch\s*\(/.test(src) && !/signTypedData|useAccount|viem|wagmi/.test(src));
  check("10.3 …and has no top-level side effect",
        !/^main\(/m.test(src) && !/process\.exit/.test(src));
  // It is imported by a "use client" component. Anything server-only reaching it
  // type-checks under tsc --noEmit and fails only in `next build`.
  check("10.4 …so it is safe in the client bundle (no kv, no node builtins)",
        !/@\/lib\/kv|node:|@upstash/.test(src));

  // No reason string may contain the caller's suffix. Checked by CALLING the
  // function, not by grepping — the header discusses the phrase, and a grep
  // would match the very comment explaining the rule.
  const reasons = [
    selectBaseUsdcAccept(null, CENT),
    selectBaseUsdcAccept([BSC_FIRST[0]], CENT),
    selectBaseUsdcAccept([{ ...baseEntry, scheme: "upto" }], CENT),
    selectBaseUsdcAccept([{ ...baseEntry, payTo: "x" }], CENT),
    selectBaseUsdcAccept([{ ...baseEntry, maxAmountRequired: "0" }], CENT),
    selectBaseUsdcAccept([baseEntry], null),
    selectBaseUsdcAccept([{ ...baseEntry, maxAmountRequired: "9" + "0".repeat(9) }], CENT),
  ].filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
  check("10.5 every refusal branch was reachable by a fixture", reasons.length === 7);
  check("10.6 no reason string contains the suffix the caller appends",
        reasons.every(r => !/nothing was signed/i.test(r.reason)));
  check("10.7 every reason is a sentence a user can act on, not a code",
        reasons.every(r => r.reason.length > 20 && /[.!]$/.test(r.reason.trim())));
  check("10.8 the caller appends the reassurance exactly once",
        /\$\{sel\.reason\}\s*Nothing was signed\./.test(read("src/app/hub/HubView.tsx")));

  check("10.9 the three hazards are recorded in the module's own header",
        /accepts\[0\]/.test(flat(src)) && /CEILING/.test(flat(src)) &&
          /no fallback by construction/i.test(flat(src)));
}

// ── Group 11: the payee fix changed what gets MEASURED, and both ways it lied ─
// Resolving the payee from the builder's live 402 turned one Run click into two
// requests through the proxy. Neither number below moves money, but both are
// read by someone deciding something: `usage:<id>` orders Hub Featured, and the
// liveness report's own footer asks a human whether to delist. A count that is
// 2× too high and a live tool reported dead are the two errors that shipped.

{
  const proxy     = read("src/app/api/hub/tools/[id]/call/route.ts");
  const proxyCode = stripComments(proxy);
  const counted   = blockAfter(proxyCode, /if\s*\(\s*!isDiscovery\s*\)/);
  const COUNTERS  = [/kv\.incr\(`usage:/, /incrCallCount\(/, /recordCall\(/];

  // The condition is two clauses on purpose. The simpler `!xPayment` would also
  // silence a genuinely free ($0) external tool, which is called with no payment,
  // answers 2xx, and IS a use — so the loose version under-counts the honest case
  // while fixing the dishonest one.
  check("11.1 a discovery probe is an unpaid request that came back 402, nothing looser",
        /const\s+isDiscovery\s*=\s*!xPayment\s*&&\s*upstream\.status\s*===\s*402/.test(proxyCode));
  check("11.2 all three call counters sit inside that guard",
        counted.length > 0 && COUNTERS.every(r => r.test(counted)));
  // Paired with 11.2: a guarded copy plus an unguarded one counts twice and
  // still passes "the counters are inside the block".
  check("11.3 …and none of them is also invoked outside it",
        counted.length > 0 &&
          COUNTERS.every(r => r.test(proxyCode.replace(counted, " ")) === false));
  // The money assertion. 402 is not `ok`, so revenue was never wrong — this pins
  // that it stays that way if someone rewrites the block above.
  check("11.4 revenue is still credited only on a successful upstream response",
        /if\s*\(\s*upstream\.ok\s*&&\s*tool\.priceUSDC\s*>\s*0\s*\)[\s\S]{0,120}?addRevenue\(/
          .test(proxyCode));
  check("11.5 the ranking consequence is written down where the counters are",
        /usage:<id>[\s\S]{0,200}?Featured/.test(flat(proxy)));

  // ── the probe timeout, and the comments that quote it ──────────────────────
  const registry = read("src/lib/hub-registry.ts");
  const probe    = blockAfter(registry, /export async function probeEndpoint/);
  const ms       = Number((/AbortSignal\.timeout\((\d[\d_]*)\)/.exec(probe)?.[1] ?? "0")
                     .replace(/_/g, ""));
  check("11.6 probeEndpoint allows a cold start to finish",
        ms >= 15_000);
  check("11.7 the measurement that moved it is recorded, not just the number",
        /desk-x402-block/.test(flat(registry)) && /8003ms/.test(flat(registry)));

  // The anti-rot assertion, and the reason this group exists at all: widening the
  // timeout left THREE comments in two other files still saying "8s". Each read
  // as a fact about this function and each was wrong. A number that lives in one
  // file and is quoted in others cannot be kept honest by remembering to grep.
  const quoted = ["src/app/api/hub/tools/health/route.ts", "src/lib/hub-liveness.ts"]
    .flatMap(f => [...read(f).matchAll(/(\d+)s (?:timeout inside `probeEndpoint`|probe\b)/g)]
      .map(m => Number(m[1]) * 1000));
  check("11.8 every comment quoting that timeout quotes the current one",
        quoted.length >= 3 && quoted.every(q => q === ms));

  // Parallelism is what makes one budget cover N probes. If the probes are ever
  // serialised, 6 × 15s blows a 30s ceiling and the Hub loses health entirely.
  const budget = Number(/maxDuration\s*=\s*(\d+)/
    .exec(read("src/app/api/hub/tools/health/route.ts"))?.[1] ?? "0");
  check("11.9 the health route still budgets more wall-clock than one probe",
        budget * 1000 > ms);
  check("11.10 …and the probes it relies on still run in parallel",
        /Promise\.all\(/.test(read("src/lib/hub-liveness.ts")));
}

// ── Group 12: the payee was right and the payment still could not be read ────
// Fixing the payee made the Hub sign the correct authorization and changed
// nothing about the outcome, because the header it was wrapped in was not a
// valid x402 v2 PaymentPayload: `{x402Version, accepted, payload}` went out
// without `accepted`. NATIVE tools were immune for a reason that is easy to
// misread as "the client is fine" — our own server rebuilds the payload
// (`toV2PaymentPayload`, api/_lib/x402-cdp.ts) and injects the missing key
// before CDP ever sees it. The external proxy forwards byte-for-byte, so the
// builder's facilitator got a payload with no requirements in it.
//
// MEASURED 2026-09-26 against PayAI's public /verify with an all-zeros
// signature: without `accepted`, 400 `invalid_payload` — "accepted: expected
// object, received undefined", byte-identical to production. With it, the payer
// is recovered and the signature is actually checked. Two independent bugs, one
// symptom; fixing either alone still yields zero revenue, which is exactly why
// the first fix looked like it had failed.

{
  const cdp = read("src/app/api/_lib/x402-cdp.ts");
  const hub = read("src/app/hub/HubView.tsx");
  const hubCode = stripComments(hub);
  const accepts = read("src/lib/x402-accepts.ts");

  // ── the window, RUN against fixtures — not read ──
  const win = (v: unknown) =>
    selectBaseUsdcAccept([{ ...baseEntry, maxTimeoutSeconds: v }], CENT);
  const asked = win(300);
  check("12.1 a builder's stated settlement window is carried through unchanged",
        asked.ok && asked.accept.maxTimeoutSeconds === 300);

  // Not the amount's rule, and the difference is the point: this field decides
  // neither payee nor sum, so refusing over it would block honest tools for a
  // value that cannot misdirect a cent. It is bounded anyway — a day-long
  // window leaves a spendable signature with a stranger long after the user
  // closed the tab believing the attempt had failed.
  const absurd = win(86_400);
  check("12.2 an absurd window is bounded, so no signature outlives the user's attention",
        absurd.ok && absurd.accept.maxTimeoutSeconds > 0 && absurd.accept.maxTimeoutSeconds <= 600);

  // The three ways this could silently become a zero-length window, each of
  // which signs an authorization that can never settle.
  const absent = selectBaseUsdcAccept([baseEntry], CENT);
  check("12.3 an absent window defaults rather than becoming 0",
        absent.ok && absent.accept.maxTimeoutSeconds > 0);
  for (const [label, v] of [["a string", "300"], ["nonsense", "soon"], ["negative", -1]] as const) {
    const r = win(v);
    check(`12.4 ${label} window still yields a positive integer, never NaN`,
          r.ok && Number.isSafeInteger(r.accept.maxTimeoutSeconds) && r.accept.maxTimeoutSeconds > 0);
  }

  // ── the native default is a contract with the server, not a taste ──
  const nativeWindow = Number(/maxTimeoutSeconds:\s*(\d+)/.exec(
    blockAfter(cdp, /export function buildRequirements/))?.[1] ?? "0");
  const clientDefault = Number(/let\s+payTimeoutS\s*=\s*(\d+)/.exec(hubCode)?.[1] ?? "-1");
  const moduleDefault = Number(/SIGN_WINDOW_DEFAULT_S\s*=\s*(\d+)/.exec(accepts)?.[1] ?? "-2");
  check("12.5 native, client and module all advertise the same default window",
        nativeWindow > 0 && clientDefault === nativeWindow && moduleDefault === nativeWindow);

  // ── the header itself ──
  const payload  = blockAfter(hubCode, /const\s+xPayment\s*=\s*btoa\(/);
  const accepted = blockAfter(payload, /accepted\s*:/);
  check("12.6 the X-PAYMENT the browser builds carries an `accepted` object",
        accepted.length > 0);

  // Every field buildRequirements() sends, sent here too. Asserted against the
  // TYPE rather than a hand-copied list, so adding a required field to the
  // server's requirements cannot leave the client quietly one field short.
  const required = [...blockAfter(cdp, /export type PaymentRequirements/)
    .matchAll(/^\s*(\w+)\s*[?]?:/gm)].map(m => m[1]);
  check("12.7 …with every field the server's own requirements carry",
        required.length >= 6 &&
          required.every(f => new RegExp(`\\b${f}\\s*[:,]`).test(accepted)));

  // 🔴 The invariant that actually protects money: each value is the SAME
  // binding the signature was built from. A field re-derived here instead of
  // reused describes a different authorization than the one the wallet showed
  // the user, and a wallet prompt cannot warn about a mismatch it never sees.
  for (const [field, binding] of [
    ["network",           /network\s*:\s*payNetwork\b/],
    ["asset",             /asset\s*:\s*USDC\b/],
    ["amount",            /amount\s*:\s*payUnits\b/],
    ["payTo",             /\bpayTo\s*,/],
    ["maxTimeoutSeconds", /maxTimeoutSeconds\s*:\s*payTimeoutS\b/],
    ["extra.name",        /name\s*:\s*domainName\b/],
    ["extra.version",     /version\s*:\s*domainVersion\b/],
  ] as const) {
    check(`12.8 accepted.${field} reuses the signed value, it does not re-derive one`,
          binding.test(accepted));
  }

  // The two specific re-derivations that would reintroduce the original bug:
  // the treasury is the wrong payee for an external tool, and the card price is
  // what the builder TYPED at submit time, not what the live 402 asked for.
  check("12.9 …and neither the treasury nor the advertised price leaks back in",
        !/PAY_TO_WALLET/.test(accepted) && !/priceUnits/.test(accepted));

  // ── the signature has to outlive what it advertises ──
  const vb = /const\s+validBefore\s*=\s*BigInt\(([^;]*)\)/.exec(hubCode)?.[1] ?? "";
  const slack = Number(/payTimeoutS\s*\+\s*(\d+)/.exec(vb)?.[1] ?? "0");
  check("12.10 validBefore is derived from the advertised window, not a fixed guess",
        /payTimeoutS/.test(vb) && slack > 0);
  // Ordering, not just presence: computed above the external branch it would
  // read the native default and advertise a window the signature does not cover.
  // Both indices are required to EXIST first — `-1 < n` is true, so the naive
  // comparison passes hardest when neither line is there at all.
  const iRead = hubCode.search(/payTimeoutS\s*=\s*sel\.accept\.maxTimeoutSeconds/);
  const iSign = hubCode.search(/const\s+validBefore\s*=/);
  check("12.11 …and is computed after the builder's 402 has been read",
        iRead >= 0 && iSign >= 0 && iRead < iSign);

  // The evidence, not just the conclusion. A fix whose reason is unrecorded gets
  // "simplified" away by the next reader who sees a key the server also sets.
  check("12.12 the measurement that found this is written next to the fix",
        /invalid_payload/.test(flat(hub)) && /toV2PaymentPayload/.test(flat(hub)));
}

// ── Group 13: a refusal the user cannot read, and a lie about who cancelled ──
// Both of these are about what the payer is TOLD, which is not decoration when
// the subject is an irreversible signature. Two shipped bugs:
//
//   • the insufficient-balance refusal called `setErr` and returned without
//     `setStep("error")`. The error panel is gated on that step, so the message
//     never rendered — and for an external tool `step` was still "calling" from
//     the 402 probe, which keeps `loading` true, so the button sat on "Calling
//     agents…" forever with nothing to read. The one refusal in the whole
//     function that was invisible.
//
//   • the catch decided "Signature cancelled" by substring-matching "rejected"
//     against the error message. On the branch that matters that message is the
//     BUILDER's own text, forwarded verbatim. A tool answering
//     {"error":"payment rejected"} told a user who had just signed that they had
//     cancelled — about a payment that may well have settled.

{
  const hub = read("src/app/hub/HubView.tsx");
  const hubCode = stripComments(hub);

  // The general invariant, not just the one instance: the panel renders only on
  // `step === "error"`, so a `setErr` that returns without setting it is a
  // message with no reader.
  check("13.1 the error panel is still gated on the error step",
        /step\s*===\s*"error"\s*&&\s*err/.test(hubCode));
  const errCalls = afterCalls(hubCode, "setErr");
  check("13.2 no refusal returns without reaching that step",
        errCalls.length >= 8 && errCalls.every(a => !/^\s*;\s*return\b/.test(a)));
  check("13.3 …including the one that broke: insufficient balance",
        /Insufficient USDC[\s\S]*?setStep\("error"\)/.test(hubCode));

  // ── who cancelled ──
  const iDecl = hubCode.search(/let\s+signed\s*=\s*false/);
  const iSign = hubCode.search(/signTypedDataAsync\(/);
  const iSet  = hubCode.search(/\bsigned\s*=\s*true/);
  check("13.4 the signed flag is raised only after the wallet actually returns",
        iDecl >= 0 && iSign >= 0 && iSet >= 0 && iDecl < iSign && iSign < iSet);

  const cancelled = blockAfter(hubCode, /if\s*\(\s*!signed\s*\)/);
  check("13.5 'Signature cancelled' is reachable only before anything was signed",
        /Signature cancelled/.test(cancelled));
  check("13.6 …and is not also decided somewhere by reading the message",
        (hubCode.match(/Signature cancelled/g) ?? []).length === 1);

  // ── after the signature, for a tool we do not settle for ──
  // The asymmetry is the assertion: /api/x402/<id> settles only after a
  // successful run, so a native failure really does mean uncharged and must keep
  // saying so. The external proxy settles nothing, so the honest answer there is
  // that we do not know.
  const unknown = blockAfter(hubCode, /else\s+if\s*\(\s*tool\.source\s*===\s*"external"\s*\)/);
  check("13.7 a post-signature failure on an external tool admits we cannot tell",
        /cannot tell you whether the USDC moved/.test(unknown));
  check("13.8 …and never claims the caller was not charged",
        unknown.length > 0 && !/not charged/.test(unknown));
  check("13.9 the native path still states the fact it actually knows",
        /you were not charged/.test(hubCode));
  check("13.10 the warning survives rendering as its own paragraph",
        /whitespace-pre-line[\s\S]{0,40}\{err\}/.test(hubCode));
}

console.log(`\nexternal-payee guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
