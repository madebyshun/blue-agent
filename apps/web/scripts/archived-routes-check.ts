/**
 * Archived surfaces must stay unreachable — and near-misses must stay reachable.
 *
 * Blue Bank, its public /pay payment surface, and Blue Feed are archived: their
 * pages are still in the tree, but `archivedRedirect()` 301s every one of their
 * paths to /chat as the FIRST statement of `middleware()`. That ordering is
 * load-bearing, and as of 2026-09-05 it is the ONLY thing keeping them closed.
 *
 * Until then there was a second, inert line of defence — `bankGate`, a preview-
 * token gate that had been unreachable ever since archivedRedirect was added.
 * It was deleted precisely because it read like a working control while doing
 * nothing, which is the more dangerous of the two states. Deleting it means the
 * remaining control has to be asserted rather than assumed, so this file exists.
 *
 * Why this matters more than a normal dead route: BlueBank never shipped GA, and
 * `src/app/app/bank/BankClient.tsx` is NOT dead code — it is the live body of
 * /app/wallet (#291). So the directory cannot simply be deleted, and if a future
 * edit reorders middleware() so archivedRedirect no longer runs first, a parked
 * never-GA'd surface would quietly go live with no gate in front of it. That is
 * the exact "stopped maintaining ≠ stopped exposing" gap CLAUDE.md is about.
 *
 * The near-miss half is the other failure mode: `startsWith("/pay")` instead of
 * `=== "/pay" || startsWith("/pay/")` would silently swallow /payments, and
 * /feed would swallow /feedback. Those pass today; this pins them.
 *
 * THE THIRD HALF, ADDED BY #254 (2026-09-16)
 * ------------------------------------------
 * The two checks above only ever asked "does the door stay shut". Nobody was
 * asking the other question: DOES THE APP STILL WALK INTO IT.
 *
 * It did, for months. `/app/wallet` shipped a "🔗 Share pay link" button that
 * built `${origin}/pay/${acct}?asset=…&network=…` and handed it to
 * navigator.share, and `OrdersPanel` had a "copy pay link" doing the same with
 * `payLink(id)`. Measured in prod on both hostnames:
 *
 *     GET /pay/0x0295…9205?asset=USDC&network=base&amount=5
 *       → 301 → app.blueagent.dev/chat?asset=USDC&network=base&amount=5
 *
 * Note what survives the redirect and what does not: the QUERY STRING is carried
 * through and the ADDRESS SEGMENT is dropped. The payer lands in Blue Chat
 * holding an amount with no payee. Every request a user published was like that.
 *
 * This file passed the whole time, and correctly — the redirect worked exactly
 * as specified. The bug lived in the JOIN between two files that have no
 * compiler link: middleware says a prefix is archived, and the app decides what
 * URLs to emit. Nothing fails when they disagree. `archivedRedirect`'s own
 * comment shows how the drift happened — it reasoned about "/pay/<address> QR
 * codes generated earlier", i.e. HISTORICAL links a 301 handles gracefully. That
 * was true when written. It stopped being true when the wallet was rebuilt at
 * /app/wallet with the share button still on it, MINTING NEW dead links, and no
 * mechanism noticed. Exactly the "stopped maintaining ≠ stopped exposing" gap.
 *
 * So the invariant is CONDITIONAL, in both directions, and that is deliberate:
 *
 *   ARCHIVED  → no source file may build a `/pay/…` URL, and the DEPOSIT card
 *               must still render its EIP-681 QR (the share path that never
 *               broke). Without that second clause this section would go green
 *               if someone deleted the Receive card outright — the classic way
 *               an absence assertion passes by destroying the thing it guards.
 *
 *   UN-ARCHIVED → the emitter ban lifts BY ITSELF (no line to delete by hand, so
 *               no stale guard quietly protecting nothing), and a different
 *               assertion switches on: `pay/[address]/page.tsx` must no longer
 *               narrow its network to the Base family. That page types its
 *               network as `YieldNetwork = "base" | "baseSepolia"` and silently
 *               folds anything else to "base", while the wallet's picker offers
 *               `robinhood`, whose dollar is USDG and not USDC. Un-archiving as
 *               it stands would upgrade a dead link into a live money page
 *               asserting the WRONG CHAIN — #219/#230's family, on a public
 *               payment surface. A dead link fails safe; that does not.
 *
 * ShunTr chose to remove the buttons and keep the archive (2026-09-16).
 * Restoring /pay is a product decision about a public payment surface, and the
 * condition above is what makes the restoring commit prove it did the chain work
 * first instead of just deleting a branch in middleware.
 *
 * Hermetic: no network, no KV, no secrets — middleware imports only next/server,
 * and the source scan reads the repo we are about to ship.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const APP_HOST = "app.blueagent.dev";
const HOSTS = ["blueagent.dev", APP_HOST];

/** Every path that must 301 to /chat, on either host. */
const ARCHIVED = [
  // Blue Bank — parked, never GA. BankClient.tsx is live under /app/wallet.
  "/bank",
  "/bank/",
  "/bank/access",
  "/bank/anything/deeper",
  "/app/bank",
  "/app/bank/access",
  // /pay — BlueBank's public payment surface. This redirect is what keeps links
  // already in the wild from 404ing. It does NOT make them work: the address
  // segment is dropped and the payer lands in /chat with no payee (#254). The
  // app is no longer allowed to mint new ones — see the source scan below.
  "/pay",
  "/pay/0x02950ad38ada1d599375bd447e080cd404809205",
  // Blue Feed — retired 2026-09-02; it published share links to X before it was.
  "/feed",
  "/feed/some-id",
  "/app/feed",
];

/**
 * Paths that merely LOOK archived and must be left alone. Each one is a real
 * regression a plausible "simplification" of archivedRedirect would introduce.
 */
const NEAR_MISSES = ["/payments", "/banking", "/feedback", "/paymaster"];

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail: string) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        ${detail}`}`);
}

function run(host: string, path: string) {
  return middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }));
}

console.log("Archived surfaces must 301 to /chat\n");
for (const host of HOSTS) {
  for (const path of ARCHIVED) {
    const res = run(host, path);
    const loc = res.headers.get("location") ?? "";
    check(
      `${host}${path}`,
      res.status === 301 && loc === `https://${APP_HOST}/chat`,
      `expected 301 → https://${APP_HOST}/chat, got ${res.status} ${loc || "(no redirect)"}`,
    );
  }
}

console.log("\nNear-miss paths must NOT be swallowed by the archive matcher\n");
for (const host of HOSTS) {
  for (const path of NEAR_MISSES) {
    const res = run(host, path);
    const loc = res.headers.get("location") ?? "";
    check(
      `${host}${path}`,
      loc !== `https://${APP_HOST}/chat`,
      `archivedRedirect is over-matching — ${path} was sent to /chat`,
    );
  }
}

const WEB = path.resolve(path.dirname(process.argv[1]), "..");
const SRC = path.join(WEB, "src");
const PAY_PAGE = path.join(SRC, "app/pay/[address]/page.tsx");

console.log("\nThe archived surfaces are still in the tree (so this guard is not vacuous)\n");
{
  // If these ever go away the redirect becomes belt-and-braces rather than the
  // only control, which is fine — this is a note, not a requirement, so it is
  // asserted as "either present and gated, or absent". It fails only if a file
  // is present AND reachable, which the block above already covers.
  for (const f of ["src/app/app/bank/page.tsx", "src/app/app/bank/BankClient.tsx", "src/app/pay"]) {
    console.log(`  ${existsSync(path.join(WEB, f)) ? "present" : "absent "}  ${f}`);
  }
}

// ── #254: the archive and the app must agree about /pay ─────────────────────

/** Every .ts/.tsx under src/, so the scan is a derivation and not a list. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Drop comments, keep string and template bodies.
 *
 * Both halves matter. Keeping strings is the point — `${origin}/pay/${acct}` is
 * the bug, and it lives inside a template literal. Dropping comments is what
 * makes the rule survivable: the fix for #254 replaced those call sites with
 * long notes that necessarily quote the dead URL, and a guard that trips on its
 * own post-mortem is a guard someone deletes.
 *
 * Not a parser. A regex literal containing `//` (e.g. /\/\//) would be misread
 * as a comment — no such literal exists in src/ today, and the failure direction
 * is a LOUD false positive rather than a silent miss, so it gets fixed rather
 * than ignored.
 */
function stripComments(s: string): string {
  let out = "", i = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "sq"; else if (c === '"') mode = "dq"; else if (c === "`") mode = "tpl";
      out += c; i++; continue;
    }
    if (mode === "line")  { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else { if (c === "\n") out += c; i++; } continue; }
    if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }   // escape inside a string
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i++;
  }
  return out;
}

// A URL PATH SEGMENT, not the letters. The first draft of this was `/\/pay\b/`
// and it failed on its own first run, which is the useful part — all three hits
// were real text we ship and must keep:
//
//   api/chat/route.ts:807    "send/transfer/pay on robinhood" — prose in a tool
//                            description. `\b` matched the following SPACE.
//   bank/BankClient.tsx:556  "https://pay.coinbase.com/buy/…"  the live Coinbase
//   bank/BankClient.tsx:572  "https://pay.coinbase.com/…/sell" fiat rails. `\b`
//                            matched the following DOT — and `pay` there is a
//                            HOSTNAME, not a path segment.
//
// So: the next character
// must be one that can follow a path segment, and a preceding `/` disqualifies
// the match outright because `//pay…` is a HOSTNAME, not a path. The lookahead
// is also what keeps /payments and /paymaster out — the same near-miss family
// the matcher above is pinned against.
const EMITS_PAY_URL = /(?<!\/)\/pay(?=[/?#"'`]|$)/;

// middleware is where the archive is DECLARED, and the page is allowed to talk
// about itself. Everything else is an emitter if it names the path.
const SCAN_SKIP = [path.join(SRC, "middleware.ts"), path.join(SRC, "app/pay")];

const payIsArchived = (() => {
  const mw = readFileSync(path.join(SRC, "middleware.ts"), "utf8");
  const hasIsPayBranch = /const\s+isPay\s*=/.test(mw);
  const inAppPublic = /APP_PUBLIC\s*=\s*new Set\(\[[^\]]*["']pay["']/.test(mw);
  return hasIsPayBranch && !inAppPublic;
})();

console.log(`\n/pay is currently ${payIsArchived ? "ARCHIVED" : "LIVE"} — checking the matching invariant\n`);

if (payIsArchived) {
  const offenders = walk(SRC)
    .filter((f) => !SCAN_SKIP.some((s) => f === s || f.startsWith(s + path.sep)))
    .flatMap((f) =>
      stripComments(readFileSync(f, "utf8"))
        .split("\n")
        .map((line, n) => ({ f, n: n + 1, line: line.trim() }))
        .filter((r) => EMITS_PAY_URL.test(r.line)),
    );

  check(
    "no source file builds a /pay/… URL while the prefix is archived",
    offenders.length === 0,
    offenders.map((o) => `${path.relative(WEB, o.f)}:${o.n}  ${o.line.slice(0, 110)}`).join("\n        "),
  );

  // The pairing. Without this the rule above is satisfiable by deleting the
  // Receive card, which would remove the one share path that WORKS: an EIP-681
  // URI built from `receiveChain`, correct on Robinhood (USDG) as well as Base.
  const bank = readFileSync(path.join(SRC, "app/app/bank/BankClient.tsx"), "utf8");
  check(
    "the DEPOSIT card still renders a payment QR (buildPaymentUri)",
    /buildPaymentUri\(/.test(bank),
    "the /pay emitter ban must not be satisfied by deleting scan-to-pay itself",
  );
} else if (!existsSync(PAY_PAGE)) {
  // Un-archived with no page behind it. Reading the file would throw ENOENT and
  // the reader would get a stack trace instead of the sentence they need.
  check(
    "pay/[address] exists to serve the un-archived prefix",
    false,
    "middleware no longer archives /pay, but src/app/pay/[address]/page.tsx is\n" +
      "        gone — the prefix now resolves to a 404 instead of a redirect",
  );
} else {
  // /pay has been un-archived. The emitter ban lifted on its own; what has to be
  // true instead is that the page can express every chain the wallet can share.
  const page = readFileSync(PAY_PAGE, "utf8");
  check(
    "pay/[address] no longer folds an unknown ?network= into base",
    !/===\s*["']baseSepolia["']\s*\?\s*["']baseSepolia["']\s*:\s*["']base["']/.test(page),
    "un-archiving /pay requires teaching the page the third chain first — that\n" +
      "        narrowing turns ?network=robinhood into a Base page (USDC, not USDG)",
  );
  check(
    "pay/[address] knows about robinhood",
    /robinhood/i.test(stripComments(page)),
    "the wallet's NetworkPicker offers robinhood; a public pay page that has\n" +
      "        never heard of it cannot render a request made on it",
  );
}

console.log("");
if (failures > 0) {
  console.log(`${failures} of ${checks} CHECK(S) FAILED`);
  process.exit(1);
}
console.log(`ALL ${checks} CHECKS PASSED`);
