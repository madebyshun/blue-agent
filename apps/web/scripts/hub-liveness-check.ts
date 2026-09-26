/**
 * Guard: the endpoint-liveness badge must never turn "we didn't ask" into a verdict.
 *
 * Run: `npx tsx scripts/hub-liveness-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — pure formatters plus source inspection. No network, no KV.
 *
 * WHY IT EXISTS
 * -------------
 * The bug this whole feature answers is a SILENT one: `RegisteredTool.status`
 * is written once by the submit probe and never re-checked, so on 2026-09-26
 * five of six registered endpoints were dead expired dev tunnels while all six
 * advertised `status: "live"`. Nothing crashed and nothing logged — the Hub was
 * simply confident about something it had not looked at in weeks.
 *
 * 🔴 THE FIX HAS THE SAME FAILURE MODE AS THE BUG. A liveness badge is only
 * worth anything if the "we could not find out" case renders as its own third
 * state. The tempting shapes are both wrong and both look fine in review:
 *   `h?.ok ? "up" : "unreachable"`   → every unchecked tool accused of being down
 *   `h?.ok === false ? "down" : "up"` → rebuilds the original bug exactly
 * Neither throws, neither logs, and both pass a type-checker.
 *
 * ── the live probe is NOT here, on purpose ───────────────────────────────────
 * These endpoints are third-party dev tunnels; they are SUPPOSED to expire. A
 * suite that goes red when a builder closes their laptop is worse than no suite
 * — it trains everyone to push past a red gate. The live probe is
 * `npm run hub:liveness`, a report that never gates.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  livenessLabel,
  livenessTitle,
  ageLabel,
  LIVENESS_META,
  type ToolHealth,
} from "../src/lib/hub-liveness-format";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/**
 * Collapse comment leaders and newlines so a phrase can be asserted regardless
 * of where the formatter chose to wrap it. Without this, a prose assertion
 * silently starts passing/failing on a line-length change, which is the least
 * useful reason for a guard to move.
 */
const flat = (s: string) => s.replace(/\n\s*\*?/g, " ").replace(/\s+/g, " ");
const formatSrc = read("src/lib/hub-liveness-format.ts");
const livenessSrc = read("src/lib/hub-liveness.ts");
const routeSrc = read("src/app/api/hub/tools/health/route.ts");
const hubHomeSrc = read("src/app/hub/_components/HubHome.tsx");

const UP: ToolHealth = { ok: true, status: 402, checkedAt: 1_000_000, durationMs: 120, lastOkAt: 1_000_000 };
const DOWN: ToolHealth = {
  ok: false, status: 0, checkedAt: 1_000_000, durationMs: 8_000,
  hint: "Could not reach endpoint: fetch failed", lastOkAt: 500_000,
};
const NEVER_UP: ToolHealth = { ...DOWN, lastOkAt: null };

// ── Group 1: "not checked" is a THIRD state ──────────────────────────────────
// The entire point. Both collapses are a bug and only one of them is obvious.

check("1.1 absent health is unknown", livenessLabel(undefined) === "unknown");
check("1.2 explicit null is unknown", livenessLabel(null) === "unknown");
check("1.3 unknown is NOT 'up' — that is the original bug", livenessLabel(null) !== "up");
check("1.4 unknown is NOT 'unreachable' — that accuses a live builder", livenessLabel(null) !== "unreachable");
check("1.5 a passing probe is up", livenessLabel(UP) === "up");
check("1.6 a failing probe is unreachable", livenessLabel(DOWN) === "unreachable");

// ── Group 2: the words shown to a builder ────────────────────────────────────
// A submission is someone's work and an expired tunnel is a normal thing to
// happen to it. The copy reports an observation; it never grades the person.

{
  const states = ["up", "unreachable", "unknown"] as const;
  for (const s of states) {
    check(`2.1 ${s} has a label`, !!LIVENESS_META[s]?.label);
    check(`2.2 ${s} has a colour`, /^#[0-9a-f]{6}$/i.test(LIVENESS_META[s]?.color ?? ""));
  }
  // The BADGE text only. The tooltip is allowed — required, even — to use the
  // word "down", because the sentence it needs to say is "this is NOT a claim
  // that the endpoint is down". 2.4 pins that negation separately, so testing
  // both strings together here would have forced the tooltip to go vague.
  check(
    "2.3 the unknown BADGE never says down/dead/offline/broken",
    !/\b(down|dead|offline|broken|failed)\b/.test(LIVENESS_META.unknown.label.toLowerCase()),
  );
  check(
    "2.4 the unknown tooltip says outright it is not a claim about the endpoint",
    /not a claim/i.test(LIVENESS_META.unknown.title),
  );
  check(
    "2.5 the unreachable tooltip offers the likely benign cause",
    /tunnel/i.test(LIVENESS_META.unreachable.title),
  );
  check(
    "2.6 three distinct labels — two states sharing a word is two states nobody can tell apart",
    new Set(states.map((s) => LIVENESS_META[s].label)).size === 3,
  );
}

// ── Group 3: ages, including the ones that produce NaN ───────────────────────

{
  const now = 1_000_000_000;
  check("3.1 null age is null, not '0s'", ageLabel(null, now) === null);
  check("3.2 undefined age is null", ageLabel(undefined, now) === null);
  check("3.3 NaN age is null, never 'NaNs'", ageLabel(Number.NaN, now) === null);
  check("3.4 seconds", ageLabel(now - 30_000, now) === "30s");
  check("3.5 minutes", ageLabel(now - 300_000, now) === "5m");
  check("3.6 hours", ageLabel(now - 7_200_000, now) === "2h");
  check("3.7 days", ageLabel(now - 172_800_000, now) === "2d");
  // Clock skew between a Vercel function and a browser is real and small; it
  // must not render as "checked -3s ago", which reads like a bug in the badge.
  check("3.8 a future timestamp clamps to 0s, never negative", ageLabel(now + 5_000, now) === "0s");
}

// ── Group 4: the tooltip carries the fact a builder needs ────────────────────
// "It is down" is not actionable. "It last worked 2d ago, here is the error" is.

{
  const now = 1_000_000;
  const down = livenessTitle({ ...DOWN, checkedAt: now, lastOkAt: now - 172_800_000 }, now);
  check("4.1 a down tool reports when it last worked", /last seen up 2d ago/i.test(down));
  check("4.2 a down tool carries the probe's own error text", /fetch failed/.test(down));
  const never = livenessTitle({ ...NEVER_UP, checkedAt: now }, now);
  check("4.3 never-observed-up says so rather than printing a bogus age", /not yet seen up/i.test(never));
  check("4.4 never-observed-up never prints NaN or Invalid Date", !/NaN|Invalid/i.test(never));
  // An UP tool has nothing to apologise for — no error text, no "last seen".
  const up = livenessTitle({ ...UP, checkedAt: now }, now);
  check("4.5 an up tool shows no failure text", !/last seen|fetch failed/i.test(up));
  check("4.6 unknown falls back to the neutral tooltip", livenessTitle(null) === LIVENESS_META.unknown.title);
}

// ── Group 5: this feature REPORTS, it does not moderate ──────────────────────
// ⚠ A submission is the builder's, and tunnel expiry is expected. Re-probing
// that quietly grew the power to delist would be a policy change wearing a
// bugfix's clothes — and ShunTr's call, not a refactor's.

{
  check(
    "5.1 the health route never writes a tool record",
    !/putTool|removeTool|kvSet\(\s*K\.item|kvDel/.test(routeSrc),
  );
  check(
    "5.2 the health route never writes `status`",
    !/status:\s*"live"/.test(routeSrc),
  );
  check(
    "5.3 the liveness module never writes a tool record either",
    !/putTool|removeTool/.test(livenessSrc),
  );
  check(
    "5.4 nothing here touches the registry index",
    !/hub:tools:index/.test(livenessSrc) && !/hub:tools:index/.test(routeSrc),
  );
  check(
    "5.5 the rule is written down where the next reader will hit it",
    /delisting is ShunTr's call/i.test(flat(livenessSrc)),
  );
}

// ── Group 6: the server/client boundary ──────────────────────────────────────
// 🔴 `tsc --noEmit` CANNOT SEE THIS ONE. The formatters exist as a separate
// module solely so the Hub grid — a "use client" component — can import the
// wording without dragging the KV client into the browser bundle. Collapsing
// the two files back together type-checks perfectly and fails `next build`.

{
  check(
    "6.1 the format module imports nothing server-side",
    !/from\s+"@\/lib\/kv"/.test(formatSrc) &&
      !/hub-registry/.test(formatSrc) &&
      !/from\s+"node:/.test(formatSrc),
  );
  check("6.2 the format module makes no network call", !/\bfetch\s*\(/.test(formatSrc));
  check(
    "6.3 the probing module is the one that owns KV",
    /from\s+"@\/lib\/kv"/.test(livenessSrc),
  );
  check(
    "6.4 the client grid imports the formatters, NOT the prober",
    /from\s+"@\/lib\/hub-liveness-format"/.test(hubHomeSrc) &&
      !/from\s+"@\/lib\/hub-liveness"/.test(hubHomeSrc),
  );
  check("6.5 the grid really is a client component", /^"use client"/m.test(hubHomeSrc));
}

// ── Group 7: the badge is wired to the third state at the render site ────────
// Groups 1–4 prove the FUNCTION is right. A render site that calls
// `tool.health?.ok ? … : …` would ignore it entirely and still compile.

{
  check("7.1 the grid renders through livenessLabel", /livenessLabel\(/.test(hubHomeSrc));
  check(
    "7.2 the grid does not hand-branch on `.ok`",
    !/health\?\.\s*ok\s*\?/.test(hubHomeSrc) && !/health\.ok\s*\?/.test(hubHomeSrc),
  );
  check(
    "7.3 the badge is scoped to external tools, whose endpoints we do not run",
    /source\s*!==\s*"external"/.test(hubHomeSrc),
  );
}

console.log(`\nhub-liveness guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
