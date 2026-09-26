/**
 * Receipts — every number we publish, next to the thing it was counted from.
 *
 * Run: `npm run hub:receipts` (from apps/web). Prints a table. Publishes nothing.
 *
 * WHY THIS EXISTS
 * ---------------
 * Read the header of `scripts/docs-truth-check.ts`: this repo once told the world
 * it had 30+, 34, 69, 74 and 112 tools AT THE SAME TIME, because every surface
 * froze whatever the total happened to be the day someone touched it. That check
 * now pins the published sentences. What it does NOT do — deliberately, and it
 * says so — is sweep for every count in the repo, because the MCP surface, the
 * skill bundle and the on-chain registry are genuinely different numbers and
 * syncing them all to TOOL_COUNT would replace stale numbers with wrong ones.
 *
 * So there is no single place a human can look and see all of them at once, each
 * beside its source. That is this report.
 *
 * ── RECEIPT TIER IS THE POINT, NOT THE NUMBER ───────────────────────────────
 * A page that says "110 tools" proves nothing. What makes it a receipt is HOW it
 * was obtained, because that determines how it FAILS:
 *
 *   import  a real symbol. If the module moves, this file stops compiling.
 *           Loud. Cannot drift.
 *   parse   text or JSON read out of a file. If the shape moves, it can yield a
 *           confident WRONG number and nothing complains. Quiet.
 *   fetch   the network. Can simply fail, so it must render as its own third
 *           state — never as a zero.
 *
 * That ranking is not theoretical. MEASURED and written up in docs-truth-check:
 * `MCP_COUNT` was a REGEX over the mcp route until the manifest moved to
 * `lib/mcp-tools.ts`; the regex then matched nothing, the count silently became
 * 0, and four pins started demanding "MCP serves 0 tools". The checker committed
 * the exact fault it exists to catch. Importing the array cannot fail that way.
 * Hence: prefer `import`, label `parse` as the weaker evidence it is, and never
 * let `fetch` degrade into a number.
 *
 * ── WHY THE FILENAME DOES NOT END IN -test / -check ─────────────────────────
 * `scripts/run-tests.ts` discovers `*-test.ts` and `*-check.ts` by OPT-OUT, so
 * either suffix would wire this into `npm test`. It must not be: it reads
 * production and the npm registry, so it would redden the mandatory gate on any
 * network blip. Same split as `hub-liveness-report.ts` — the gating lives in
 * hermetic checks, reality is reported on demand.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT READ ────────────────────────────────────
 * `packages/*`. Not once, not even though `packages/skill` is right there and the
 * tool count is sitting in its source. MEASURED 2026-09-26: Vercel's install is
 * scoped to the repo root + apps/web and NEVER installs `packages/*` — six
 * consecutive production deploys went red learning that, and the rule written out
 * of it is that nothing in the site build may depend on `packages/*`. This report
 * exists partly to feed a future page, so it is held to the page's constraint
 * from the start. The published package is therefore counted where a USER would
 * count it: the npm registry. That is also the more honest receipt — what npm
 * serves is what `npm i` installs, which a local checkout can contradict.
 *
 * Exit code is 0 even when a fetch fails — an unreachable source is a reported
 * finding. It is 1 only when the REPORT itself cannot be produced.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOLS, TOOL_COUNT } from "../src/lib/agent-tools";
import { MCP_TOOLS, MCP_TOOL_COUNT } from "../src/lib/mcp-tools";
import { HANDLERS } from "../src/app/api/x402/_handlers";
// The parsing lives in its own pure module so `hub-receipts-check.ts` can drive
// it with fixture strings — including the failure fixtures, which is the only way
// to prove the refusal path runs rather than merely reads well. This file cannot
// be imported by a guard: it fetches production on import-time module eval.
import { hiddenMcpEndpoints } from "./hub-receipts-parse";

const BASE = process.env.HUB_BASE_URL ?? "https://blueagent.dev";
const ROOT = process.cwd();

type Tier = "import" | "parse" | "fetch";
type Row = {
  label: string;
  /** null = could not be measured. NEVER 0 as a stand-in — see the header. */
  value: string | null;
  tier: Tier;
  source: string;
  note?: string;
};

const rows: Row[] = [];
const add = (r: Row) => rows.push(r);

// ── import tier: the working tree, via symbols ───────────────────────────────
// These are the same symbols docs-truth-check.ts and dead-tool-check.ts import.
// Reading them here rather than re-deriving is the whole point: a second way of
// counting the same thing is a second number that can disagree.

const handlerCount = Object.keys(HANDLERS).length;
const payable = AGENT_TOOLS.filter((t) => t.x402Url && HANDLERS[t.id]).length;

add({ label: "Hub catalog", value: String(TOOL_COUNT), tier: "import",
      source: "TOOL_COUNT = AGENT_TOOLS.length — src/lib/agent-tools.ts" });
add({ label: "x402 handlers", value: String(handlerCount), tier: "import",
      source: "Object.keys(HANDLERS) — api/x402/_handlers/index.ts" });
add({ label: "catalog == handlers", value: TOOL_COUNT === handlerCount ? "yes" : "NO", tier: "import",
      source: "the repo's own invariant; a mismatch means an orphan either way",
      note: TOOL_COUNT === handlerCount ? undefined : `catalog ${TOOL_COUNT} vs handlers ${handlerCount}` });
add({ label: "live payable x402", value: String(payable), tier: "import",
      source: "AGENT_TOOLS.filter(x402Url && HANDLERS[id]) — same filter /api/catalog serves" });
add({ label: "MCP advertised", value: String(MCP_TOOL_COUNT), tier: "import",
      source: "MCP_TOOL_COUNT = MCP_TOOLS.length — src/lib/mcp-tools.ts",
      note: "a curated subset, NOT the catalog; cut 85 → 18 on 2026-09-26 for context budget" });

// ── parse tier: read out of files, so a shape change can lie quietly ─────────

try {
  const vercelRaw = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  // `?? []` would render a renamed key as "0 crons scheduled", which is a
  // measurement we would not have made. Absent stays absent.
  const crons = Array.isArray(vercelRaw.crons) ? vercelRaw.crons.length : null;
  add({ label: "scheduled crons", value: crons === null ? null : String(crons), tier: "parse",
        source: "crons[] in apps/web/vercel.json",
        note: crons === null ? "no `crons` array — key renamed, or none scheduled" : "paid whether or not a tool is called" });
} catch (e) {
  add({ label: "scheduled crons", value: null, tier: "parse",
        source: "apps/web/vercel.json", note: `unreadable — ${(e as Error).message}` });
}

// The number worth printing is NOT how many entries the maps hold — it is how
// many names are `tools/call`-able while absent from the advertised manifest.
// Each of those is an endpoint no client can discover and any client can invoke.
// MEASURED before the 2026-09-26 trim: 67 of them. This row is that count, and
// it should read 0 forever.
try {
  const mcpSrc = readFileSync(join(ROOT, "src/app/api/mcp/route.ts"), "utf8");
  const r = hiddenMcpEndpoints(mcpSrc, MCP_TOOLS.map((t) => t.name));

  if (!r.ok) {
    // A renamed map yields an EMPTY difference, which would print as "0 hidden"
    // — the most reassuring wrong answer available. Refuse instead.
    add({ label: "MCP hidden endpoints", value: null, tier: "parse",
          source: "HUB_MAP / CONSOLE_MAP / B20_ENCODE_TOOLS in api/mcp/route.ts",
          note: `not found: ${r.missing.join(", ")} — renamed or moved. Refusing to report 0, which is exactly what a broken parse looks like` });
  } else {
    add({ label: "MCP hidden endpoints", value: String(r.hidden.length), tier: "parse",
          source: "keys of HUB_MAP+CONSOLE_MAP+B20_ENCODE_TOOLS minus the advertised MCP_TOOLS names",
          note: r.hidden.length === 0
            ? `0 of ${r.callable.length} mapped names are unadvertised. Advertised set == callable set, which is the invariant; 67 were hidden before the 2026-09-26 trim`
            : `⚠ ${r.hidden.join(", ")} — callable via tools/call, absent from the manifest, so undiscoverable and still invocable` });
  }
} catch (e) {
  add({ label: "MCP hidden endpoints", value: null, tier: "parse",
        source: "api/mcp/route.ts", note: `unreadable — ${(e as Error).message}` });
}

// ── fetch tier: production and npm. Each must be allowed to say "unknown". ───

async function getJson(url: string, ms = 15_000): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const [catalog, external, health, npmMeta] = await Promise.all([
    getJson(`${BASE}/api/catalog`),
    getJson(`${BASE}/api/hub/tools`),
    getJson(`${BASE}/api/hub/tools/health`),
    getJson("https://registry.npmjs.org/@blueagent/skill"),
  ]);

  const prodCount = (catalog as { count?: number } | null)?.count;
  add({ label: "catalog, in production", value: typeof prodCount === "number" ? String(prodCount) : null,
        tier: "fetch", source: `GET ${BASE}/api/catalog`,
        note: typeof prodCount !== "number"
          ? "unreachable — this is NOT evidence the catalog is empty"
          : prodCount === TOOL_COUNT
            ? "agrees with the working tree"
            : `⚠ DIVERGES from the tree (${TOOL_COUNT}) — deployed code is not this checkout` });

  const ext = external as { tools?: unknown[]; coverage?: string; unreadableIds?: string[] } | null;
  add({ label: "external registry", value: ext?.tools ? String(ext.tools.length) : null,
        tier: "fetch", source: `GET ${BASE}/api/hub/tools`,
        note: !ext ? "unreachable"
          : ext.coverage === "complete"
            ? "coverage complete — the list is whole"
            : `⚠ coverage=${ext.coverage ?? "unknown"} — this count is a FLOOR, not a total${ext.unreadableIds?.length ? ` (unreadable: ${ext.unreadableIds.join(", ")})` : ""}` });

  const h = health as { health?: Record<string, { ok?: boolean } | null>; coverage?: string } | null;
  if (h?.health) {
    const vals = Object.values(h.health);
    const up = vals.filter((v) => v?.ok === true).length;
    const unknown = vals.filter((v) => v === null).length;
    add({ label: "external endpoints up", value: `${up}/${vals.length}`, tier: "fetch",
          source: `GET ${BASE}/api/hub/tools/health`,
          note: `${unknown} not checked. Every registered tool advertises status "live" regardless — that claim is written once at submit and never re-checked` });
  } else {
    add({ label: "external endpoints up", value: null, tier: "fetch",
          source: `GET ${BASE}/api/hub/tools/health`, note: "unreachable" });
  }

  const meta = npmMeta as { "dist-tags"?: Record<string, string>; versions?: Record<string, { description?: string }> } | null;
  const latest = meta?.["dist-tags"]?.latest;
  const desc = latest ? meta?.versions?.[latest]?.description : undefined;
  const advertised = desc?.match(/(\d+)\s+tools/)?.[1];
  add({ label: "@blueagent/skill", value: advertised ?? null, tier: "fetch",
        source: "registry.npmjs.org — the count npm advertises for dist-tags.latest",
        note: !meta ? "registry unreachable"
          : `latest ${latest ?? "?"}; a THIRD set, overlapping /api/mcp by only 6 names. packages/* is deliberately not read — Vercel never installs it` });

  // ── print ────────────────────────────────────────────────────────────────
  const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(`\nReceipts — counted ${new Date().toISOString()}   tree: ${ROOT}\n`);
  console.log(`${w("what", 24)} ${w("value", 9)} ${w("tier", 7)} source`);
  console.log("-".repeat(110));
  for (const r of rows) {
    console.log(`${w(r.label, 24)} ${w(r.value ?? "unknown", 9)} ${w(r.tier, 7)} ${r.source}`);
    if (r.note) console.log(`${" ".repeat(42)}↳ ${r.note}`);
  }

  const unmeasured = rows.filter((r) => r.value === null);
  console.log(
    `\n${rows.length - unmeasured.length}/${rows.length} measured.` +
      (unmeasured.length ? `  ${unmeasured.length} could not be: ${unmeasured.map(r => r.label).join(", ")}` : ""),
  );
  console.log(
    `\nTiers: import = a symbol, breaks loudly if it moves. parse = read from a file,\n` +
      `can go quietly wrong. fetch = network, allowed to say unknown, never to say 0.\n` +
      `"unknown" is a third state everywhere here: it means we did not find out, and it\n` +
      `is never rendered as a measurement.\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`hub-receipts: the report itself failed — ${(e as Error).message}`);
  process.exit(1);
});
