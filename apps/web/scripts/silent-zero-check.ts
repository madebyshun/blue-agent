/**
 * Regression guard: a failed chain read may never be published as a NUMBER.
 *
 * WHY THIS EXISTS
 * ---------------
 * #259. `lib/wallet/balance.ts` mapped a failed `balanceOf` to `0n` and rendered
 * it as a balance. MEASURED on 0xb026BA5501c9fcDB5b4B746c37e349cd61B81B22:
 * 158,707,811 USDC vanished from the wallet total, with no partial banner and
 * no "≥" lower bound. The screen did not look broken. It looked FINISHED.
 *
 * That is strictly worse than the outage it was written to survive. When the
 * indexer is down the wallet shows dashes and an honest lower bound — the user
 * knows not to trust the total. A silent zero replaces "I don't know" with a
 * confident, complete-looking, WRONG number, which is the one failure mode a
 * wallet is not allowed to have.
 *
 * WHY THE COMPILER CANNOT SEE IT
 * ------------------------------
 * viem's `multicall({ allowFailure: true })` does not throw on a per-call
 * failure — it returns a `{ status: "failure" }` ENTRY. There is no exception
 * to notice and no nullable to unwrap, so `? result : 0n` type-checks perfectly
 * and reads like defensive programming. Same for `.catch(() => 0n)`: the
 * failure branch is a valid `bigint` and tsc has no opinion about whether a
 * number is the RIGHT answer to "the RPC refused".
 *
 * THE RULE
 * --------
 * An unread chain value is not a number. The failure branch of a chain read may
 * be `null`, a `continue`, a `return`, or a throw — never a numeric literal.
 *
 * TWO SHAPES, BOTH MEASURED IN THIS REPO
 * --------------------------------------
 *   (a) ZERO QUANTITY   — `0` / `0n` for a balance, supply, or token id.
 *       Publishes "you hold nothing" / "supply is zero" about a thing that
 *       isn't. `0n` for an NFT token id is its own trap: id 0 is a VALID id,
 *       so a failed read rendered "#0" with a live explorer link to a position
 *       the pool does not own.
 *   (b) GUESSED EXPONENT — a `decimals` default of 6 / 8 / 18.
 *       Strictly worse than (a), because the exponent SCALES everything derived
 *       from it. Found live in `/api/b20hub/pool/[address]` on 2026-09-17:
 *       every token that route serves is a B20 share token, and B20s are
 *       8-decimal, so a rate-limited `decimals()` read published a price
 *       10^(18-8) = 10 BILLION times too high.
 *
 *       It survived because `dec` CANCELS in the market-cap derivation —
 *         mcap = (TS/10^dec) × (10^dec/P/1e18 × ethUsd) = TS/P/1e18 × ethUsd
 *       — so the headline number stayed correct while the price printed beside
 *       it was off by ten orders of magnitude. Nobody checks the field that is
 *       right. Same family as #223 (39.5×) and #231 (333×), three orders worse.
 *
 * WHY THE NUMERIC SET IS RESTRICTED, NOT "ANY NUMBER"
 * ---------------------------------------------------
 * Matching any numeric failure branch is the obvious design and it is wrong.
 * MEASURED against this tree, it flags `state.data?.status === "success" ? false
 * : 1500` at `WalletSendCard.tsx:454` and `ToolCards.tsx:2028` — a wagmi
 * `refetchInterval`. That 1500 is a POLL INTERVAL, not a quantity; "retry in
 * 1.5s while the read is pending" is the correct behaviour, and a guard that
 * calls it a bug teaches the next reader to silence the guard.
 *
 * So the set is exactly the two shapes above: {0, 0n} for quantities and
 * {6, 8, 9, 18} for decimal exponents. Restricting it is principled rather than
 * convenient — a number outside that set is not one of the two failure shapes
 * this bug family is made of.
 *
 * WHY COMMENTS ARE STRIPPED FIRST
 * -------------------------------
 * Found while writing this: the guard's first run FAILED on the #259 fix's own
 * explanatory comment, which quotes `.catch(() => 0n)` to say why it is gone.
 * A check that cannot tell code from prose punishes documenting the bug, so it
 * would be "fixed" by deleting the explanation. The stripper has its own
 * controls below for the same reason the detector does.
 *
 * Source-reading, not network: these are properties of the text we ship.
 *
 * Run: npx tsx scripts/silent-zero-check.ts
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const WEB = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");

let failures = 0;
/** Counted, never hardcoded — a hand-maintained total goes stale the first time
 *  someone adds a check and forgets to bump it. */
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── The comment stripper ─────────────────────────────────────────────────────
/**
 * Blanks out `//` and block comments while preserving offsets, so a match's
 * line number still points at the real line. String and template bodies are
 * preserved: a URL's `//` must not start a comment, and a detector anchor
 * inside a string literal is still worth seeing.
 */
function stripComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
    } else if (c === "/" && d === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      out[i] = " "; out[i + 1] = " "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++;
    } else i++;
  }
  return out.join("");
}

// ── The detector ─────────────────────────────────────────────────────────────
/** {0, 0n} = a quantity; {6, 8, 9, 18} = a decimals exponent. See header. */
const NUM = String.raw`(0n|18|0|6|8|9)(?![\d\w.])`;
/** Shape (a)/(b) via an `allowFailure` multicall or a settled promise. */
const VIA_STATUS = new RegExp(
  String.raw`\.status\s*===\s*["'](?:success|fulfilled)["'][^?\n]*\?[^:\n]*:\s*` + NUM, "g");
/** Shape (a)/(b) via a rejected promise. */
const VIA_CATCH = new RegExp(String.raw`\.catch\s*\(\s*\(\s*\)\s*=>\s*` + NUM, "g");

interface Hit { file: string; line: number; text: string; }

function findSilentZeros(src: string, file = "<sample>"): Hit[] {
  const code = stripComments(src);
  const lines = src.split("\n");
  const hits: Hit[] = [];
  for (const re of [VIA_STATUS, VIA_CATCH]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split("\n").length;
      hits.push({ file, line, text: (lines[line - 1] ?? "").trim().slice(0, 120) });
    }
  }
  return hits;
}

// ── 1. CONTROLS: the detector fires on the real pre-fix code ─────────────────
// A test that only exercises the fix cannot tell you whether the fix was needed.
// Every sample below is the ACTUAL text that shipped, before its #259 fix.
console.log("\n1. controls — fires on the code that actually shipped the bug");

const KNOWN_BAD: [string, string][] = [
  ["balance.ts — a failed balanceOf became a balance (158.7M USDC vanished)",
   `const bal = r.status === "success" ? (r.result as bigint) : 0n;`],
  ["onchain.ts — a failed decimals() became 18 (10^12 off vs a 6-dec stablecoin)",
   `const decimals = dec?.status === "success" ? Number(dec.result) : 18;`],
  ["dca/whoami — allowance defaulted to zero, gating a spend on a number it never read",
   `const allowance = await read().catch(() => 0n);`],
  ["b20hub pool — totalSupply, so market cap printed exactly $0",
   `publicClient.readContract({ functionName: "totalSupply" }).catch(() => 0n),`],
  ["b20hub pool — decimals, the 10^10 price error that hid behind a correct mcap",
   `publicClient.readContract({ functionName: "decimals" }).catch(() => 18),`],
  ["settled promise — the Promise.allSettled spelling of the same mistake",
   `const v = res.status === "fulfilled" ? res.value : 0;`],
];
for (const [name, sample] of KNOWN_BAD) {
  check(name, findSilentZeros(sample).length === 1, `${findSilentZeros(sample).length} hit(s)`);
}

// ── 2. CONTROLS: the detector is silent on shapes that are CORRECT ───────────
// Each of these was hand-verified as legitimate while sweeping #259. A guard
// that flags them would be turned off, which is the same as not having one.
console.log("\n2. controls — silent on legitimate numeric zeros");

const KNOWN_GOOD: [string, string][] = [
  ["a wagmi refetchInterval — 1500 is a poll delay, not a quantity (WalletSendCard:454, ToolCards:2028)",
   `refetchInterval: (state) => (state.data?.status === "success" ? false : 1500),`],
  ["an arithmetic floor — clamping a subtraction at zero is real math, not a failed read",
   `const spendable = v > reserve ? v - reserve : 0n;`],
  ["value: 0n on a tx object — a token transfer genuinely sends no native ETH",
   `const tx = { to: token, data, value: 0n };`],
  ["a parse fallback on USER INPUT — an empty form field is not a failed chain read",
   `const amt = Number(input) || 0;`],
  ["the fixed shape — failure reported as null is the whole point of this guard",
   `const supply = await read().catch(() => null);`],
  ["a non-quantity catch default — an empty string for an unreadable symbol is honest",
   `const symbol = await read().catch(() => "?");`],
];
for (const [name, sample] of KNOWN_GOOD) {
  const hits = findSilentZeros(sample);
  check(name, hits.length === 0, hits.length ? `flagged: ${hits[0].text}` : "");
}

// ── 3. CONTROLS: the stripper blanks prose without blinding the detector ─────
console.log("\n3. controls — comment stripping");

check("a quoted bad pattern in a comment does NOT fire",
  findSilentZeros(`// These used to be \`.catch(() => 0n)\` and \`.catch(() => 18)\`.\nconst x = 1;`).length === 0);
check("a bad pattern on the SAME line as a trailing comment still fires",
  findSilentZeros(`const bal = r.status === "success" ? r.result : 0n; // fine\n`).length === 1);
check("a block comment does not blind the code after it",
  findSilentZeros(`/* note: .catch(() => 0n) */\nconst v = await read().catch(() => 0n);`).length === 1);
check("a URL's double slash does not start a comment",
  stripComments(`const u = "https://base.org"; const v = 1;`).includes("const v = 1;"));
check("line numbers survive stripping (offsets preserved)",
  findSilentZeros(`// pad\n// pad\nconst v = await read().catch(() => 0n);`)[0]?.line === 3);

// ── 4. THE LIVE ASSERTION: no silent zeros anywhere in src/ ──────────────────
console.log("\n4. live scan — src/ carries no silent-zero chain reads");

/**
 * Sites that match the detector but are verified correct. An entry needs a
 * REASON, not just a path — an unexplained line here is how this guard gets
 * defeated one "temporary" exception at a time. Empty is the healthy state.
 */
const ALLOWLIST: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk(path.join(WEB, "src"));
const live: Hit[] = [];
for (const f of files) {
  const rel = path.relative(WEB, f);
  for (const h of findSilentZeros(readFileSync(f, "utf8"), rel)) {
    if (`${h.file}:${h.line}` in ALLOWLIST) continue;
    live.push(h);
  }
}

check(`scanned ${files.length} source files`, files.length > 500, `${files.length} files`);
check("no failed chain read is published as a number",
  live.length === 0,
  live.length ? `\n${live.map(h => `        ${h.file}:${h.line}  ${h.text}`).join("\n")}` : "");

// ── 5. The dead island stays dead ────────────────────────────────────────────
// `getHoldings` returned `[]` on a multicall throw and `holdingsToPrompt` then
// told the LLM, as fact, "none readable — empty wallet or unpriced tokens"
// about a wallet it had merely failed to read. Deleted 2026-09-17 with zero
// importers. This is the empty-list spelling of the same bug, so it belongs to
// the same guard: an empty set is not evidence of an empty wallet.
console.log("\n5. the empty-list spelling of the bug stays deleted");

const ONCHAIN = readFileSync(path.join(WEB, "src/lib/onchain.ts"), "utf8");
check("getHoldings is gone", !/export\s+async\s+function\s+getHoldings/.test(ONCHAIN));
check("holdingsToPrompt is gone", !/export\s+function\s+holdingsToPrompt/.test(ONCHAIN));
// Paired with a PRESENCE assertion: an absence-only test passes by deleting the
// file, so assert the live holdings path this one was NOT.
check("the live holdings path still exists",
  existsSyncSafe("src/app/api/x402/_handlers/wallet-holdings.ts"),
  "_handlers/wallet-holdings.ts");

function existsSyncSafe(rel: string): boolean {
  try { return statSync(path.join(WEB, rel)).isFile(); } catch { return false; }
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log(`\n${failures ? "FAIL" : "PASS"} — ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
