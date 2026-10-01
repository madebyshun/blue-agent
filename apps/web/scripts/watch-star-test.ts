/**
 * watch-star-test — the Hood watch star never shows an UNREAD watchlist as
 * "not watching" (src/app/app/hood/watch-star.ts).
 *
 * Pinned to the 2026-10-01 pre-production review. Since the SIWE gate
 * (2026-09-30) the watchlist is read only for a signed-in wallet, so a
 * connected wallet without a session has a null list. isWatching(null) is
 * false and the cap counted 0, so every row read ☆ "watch for alerts" — to a
 * user whose Telegram DMs were still arriving — and a refused signature on ★
 * was dropped without a word.
 *
 * Hermetic — no React, no wagmi. Group 3 pins the wiring.
 */
import fs from "node:fs";
import path from "node:path";
import { watchStarState, watchStarTitle } from "../src/app/app/hood/watch-star";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const CAP = 3;
const base = { connected: true, known: true, watching: false, count: 0, cap: CAP };

console.log("\n1. state");
check("1.1 disconnected wins over everything", watchStarState({ ...base, connected: false, known: false }) === "disconnected");
check("1.2 a connected wallet with an unread list is UNKNOWN, not watchable",
  watchStarState({ ...base, known: false }) === "unknown");
check("1.3 unknown even when the (empty) count would say at-cap or watchable",
  watchStarState({ ...base, known: false, count: 0, cap: 0 }) === "unknown");
check("1.4 a read list that holds the ticker → watching", watchStarState({ ...base, watching: true }) === "watching");
check("1.5 a read list at the cap → at-cap", watchStarState({ ...base, count: CAP }) === "at-cap");
check("1.6 a watched ticker at the cap is still removable", watchStarState({ ...base, watching: true, count: CAP }) === "watching");
check("1.7 a read list below the cap → watchable", watchStarState({ ...base, count: 1 }) === "watchable");

console.log("\n2. tooltip");
const t = (s: Parameters<typeof watchStarTitle>[0], needsSignIn = false, loading = false) =>
  watchStarTitle(s, { needsSignIn, loading, cap: CAP });
check("2.1 unknown never says 'watch for alerts'",
  [t("unknown", true), t("unknown", false, true), t("unknown")].every((x) => x !== "watch for alerts"));
check("2.2 unknown without a session asks to sign in", t("unknown", true) === "sign in to see your watchlist");
check("2.3 unknown after a failed read offers a retry", /retry/.test(t("unknown")));
check("2.4 watchable keeps its copy", t("watchable") === "watch for alerts");
check("2.5 at-cap names the cap", t("at-cap").includes(String(CAP)));

console.log("\n3. WatchToggle / WatchlistProvider wiring");
{
  const dir = path.join(__dirname, "..", "src", "app", "app", "hood");
  const client = fs.readFileSync(path.join(dir, "HoodClient.tsx"), "utf8");
  const provider = fs.readFileSync(path.join(dir, "WatchlistProvider.tsx"), "utf8");
  const toggle = client.slice(client.indexOf("function WatchToggle("), client.indexOf("function ChainTag("));
  check("3.1 WatchToggle found", toggle.length > 0);
  check("3.2 the star is decided by watchStarState with known = list !== null",
    /watchStarState\(\{[\s\S]{0,200}known:\s*watchlist !== null/.test(toggle));
  check("3.3 a click on an unknown star signs in and reads — never add()",
    /state === "unknown"\s*\?\s*await signIn\(\)/.test(toggle));
  check("3.4 a failed add/remove/sign-in is shown, not dropped",
    /if \(!r\.ok\) setErr\(r\.error\)/.test(toggle) && /role="alert"/.test(toggle));
  check("3.5 the provider exposes signIn and needsSignIn",
    /signIn:\s*\(\)\s*=>\s*Promise<WatchlistMutation>/.test(provider) && /needsSignIn:\s*boolean/.test(provider));
  check("3.6 the provider re-reads after a sign-in elsewhere on the page",
    /useSessionEpoch\(\)/.test(provider) && /\[refresh, epoch\]/.test(provider));
}

console.log(`\nwatch-star-test: ${passes}/${passes + failures} passed`);
if (failures > 0) process.exit(1);
