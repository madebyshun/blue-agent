/**
 * Link liveness — every URL we publish must resolve to something we ship.
 *
 * WHY THIS EXISTS
 * ---------------
 * Surfaces get retired. The links that advertised them do not, because the
 * link lives in an email template, an OG tag or a cron digest that nobody
 * opens in dev. Blue Feed was retired and its published links had to be 301'd
 * afterwards, once they were already in the wild.
 *
 * The live example that motivated this file: `blueagent.dev/market` returned
 * 404 in production while TWO senders kept mailing it out — the subscribe
 * welcome email and the daily research-loop digest. Every subscriber got a
 * welcome email whose only call to action was dead. Nothing caught it because
 * nothing renders those emails in CI.
 *
 * WHAT IT CHECKS
 * --------------
 * Every absolute `https://[app.]blueagent.dev/...` URL written anywhere in
 * src/ must resolve against what this app actually serves:
 *
 *   - App Router pages       (a directory with page.tsx)
 *   - App Router endpoints   (a directory with route.ts)
 *   - Static files in public/
 *   - next.config.ts redirects  (a 307 is not a 404)
 *   - middleware archived redirects (`pathname === "/x"` → 301)
 *
 * SCOPE: absolute outbound links only, deliberately. Internal <Link href>
 * navigation is exercised the moment anyone opens the site, so it fails fast
 * on its own. An absolute URL baked into an email is the opposite — it is only
 * ever read by the recipient, months later, and it is the one that damages
 * trust. Both incidents above were outbound links.
 *
 * A link ending in `/` or followed by a template hole (`${`) is a PREFIX, not
 * a path: `https://blueagent.dev/api/x402/${id}` only asserts that a dynamic
 * segment exists at that position. Those are checked as prefixes so the check
 * neither fabricates a concrete id nor waves the whole family through.
 *
 * Run: npx tsx scripts/link-liveness-check.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(__dirname, "..");
const APP = join(WEB, "src", "app");
const PUBLIC = join(WEB, "public");

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

function walk(dir: string, onDir: (abs: string) => void) {
  onDir(dir);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), onDir);
  }
}

// ── what this app serves ──────────────────────────────────────────────────
/** Route patterns as segment arrays, e.g. ["hub","tool","[slug]"]. */
const routes: string[][] = [];
walk(APP, (abs) => {
  const files = readdirSync(abs);
  // route.tsx is as real as route.ts — the OG image routes use it.
  const serves = files.some((f) => /^(page|route)\.tsx?$/.test(f));
  if (!serves) return;
  const rel = relative(APP, abs);
  routes.push(rel === "" ? [] : rel.split("/"));
});

/** public/ ships every file verbatim at its own path. */
const staticFiles = new Set<string>();
walk(PUBLIC, (abs) => {
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.isFile()) staticFiles.add("/" + relative(PUBLIC, join(abs, e.name)));
  }
});

const NEXT_CONFIG = readFileSync(join(WEB, "next.config.ts"), "utf8");
const MIDDLEWARE = readFileSync(join(WEB, "src", "middleware.ts"), "utf8");

/** A redirect is not a 404. Both sources are string literals; read them. */
const redirected = new Set<string>();
for (const m of NEXT_CONFIG.matchAll(/source:\s*"([^"]+)"/g)) redirected.add(m[1]);
for (const m of MIDDLEWARE.matchAll(/pathname === "(\/[^"]*)"/g)) redirected.add(m[1]);

/** The app host serves `/chat` from `src/app/app/chat`. Middleware keys that
 *  rewrite off APP_SEGMENTS, so read that set rather than guessing which
 *  top-level paths have an /app twin — the two cannot drift if we share it. */
const APP_SEGMENTS = new Set(
  [...(MIDDLEWARE.match(/APP_SEGMENTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
    (m) => m[1],
  ),
);

/** Metadata files generate a route from a filename, not a directory. */
for (const conv of ["sitemap.ts", "robots.ts", "opengraph-image.tsx", "icon.tsx"]) {
  try {
    statSync(join(APP, conv));
    redirected.add("/" + conv.replace(/\.tsx?$/, "").replace("sitemap", "sitemap.xml").replace("robots", "robots.txt"));
  } catch {
    /* not present */
  }
}

// ── resolving a path against them ─────────────────────────────────────────
const isDynamic = (seg: string) => seg.startsWith("[");
const isCatchAll = (seg: string) => seg.startsWith("[...");

/** Exact match: every segment consumed, dynamic segments accept anything. */
function resolves(segs: string[]): boolean {
  return routes.some((r) => {
    for (let i = 0; i < r.length; i++) {
      if (isCatchAll(r[i])) return segs.length > i;
      if (i >= segs.length) return false;
      if (!isDynamic(r[i]) && r[i] !== segs[i]) return false;
    }
    return r.length === segs.length;
  });
}

/** Prefix match: the path is built by concatenation, so the NEXT segment must
 *  be dynamic — that is exactly what `/api/x402/${id}` is asserting exists. */
function resolvesAsPrefix(segs: string[]): boolean {
  return routes.some((r) => {
    if (r.length <= segs.length) return false;
    for (let i = 0; i < segs.length; i++) {
      if (isCatchAll(r[i])) return true;
      if (!isDynamic(r[i]) && r[i] !== segs[i]) return false;
    }
    return isDynamic(r[segs.length]);
  });
}

function live(path: string, prefix: boolean): boolean {
  if (staticFiles.has(path) || redirected.has(path)) return true;
  const segs = path.split("/").filter(Boolean);
  // An exact link whose only children are dynamic is a BASE URL, not a page:
  // `const X402_BASE = ".../api/x402"` is concatenated with a tool id before
  // anyone fetches it. /market has no dynamic child, so this does not excuse it.
  const hit = (s: string[]) => (prefix ? resolvesAsPrefix(s) : resolves(s) || resolvesAsPrefix(s));
  if (hit(segs)) return true;
  return APP_SEGMENTS.has(segs[0]) && hit(["app", ...segs]);
}

// ── the links we publish ──────────────────────────────────────────────────
const SRC = join(WEB, "src");
const LINK_RE = /https:\/\/(?:app\.)?blueagent\.dev(\/[a-zA-Z0-9/._-]*)(\$\{)?/g;

const found = new Map<string, Set<string>>(); // "path\0prefix" → source files
function scanFile(abs: string) {
  const text = readFileSync(abs, "utf8");
  for (const m of text.matchAll(LINK_RE)) {
    // Trailing punctuation belongs to the prose, not the URL: "…/hub." and
    // "(…/hub)" are both the path /hub.
    let path = m[1].replace(/[.,)]+$/, "");
    // A trailing slash or an immediately-following `${` means the real path
    // continues past what is written here.
    const prefix = m[2] !== undefined || path.endsWith("/");
    path = path.replace(/\/$/, "");
    if (path === "") continue; // bare origin, always live
    const key = `${path}\0${prefix ? "prefix" : "exact"}`;
    if (!found.has(key)) found.set(key, new Set());
    found.get(key)!.add(relative(WEB, abs));
  }
}
walk(SRC, (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && /\.(ts|tsx|md|json|txt)$/.test(e.name)) scanFile(join(dir, e.name));
  }
});

/**
 * The agent-facing manifests in public/ — scanned as link SOURCES, not just
 * served as targets.
 *
 * These are the strongest possible case for this file and were the one gap in
 * it. The motivating incident was an email nobody renders in CI; a manifest is
 * worse on every axis. It is fetched by software, on a schedule, and the reader
 * cannot look at a 404 and decide to go find the real page — it just fails, or
 * worse, treats the failure as our service being down.
 *
 * MEASURED 2026-09-18, with this script reporting all checks passed:
 * `.well-known/agent.json` advertised `endpoints.console` → /console and
 * `endpoints.simulate` → /api/simulate. Neither route has ever existed in this
 * app. They sat in the published discovery manifest because the manifest lives
 * in public/ and public/ was only ever the thing links pointed AT.
 *
 * Deliberately narrow: only the manifests, not all of public/. A URL inside a
 * downloadable asset is not something this app promises to serve.
 */
for (const manifest of [
  ".well-known/agent.json",
  ".well-known/farcaster.json",
  "plugin.md",
  "llms.txt",
]) {
  scanFile(join(PUBLIC, manifest));
}

console.log(`\n1. every published blueagent.dev link resolves (${found.size} distinct)`);
const dead: string[] = [];
for (const [key, sources] of [...found].sort()) {
  const [path, kind] = key.split("\0");
  if (!live(path, kind === "prefix")) {
    dead.push(`${path}${kind === "prefix" ? "/*" : ""} ← ${[...sources].join(", ")}`);
  }
}
check(
  "no published link 404s",
  dead.length === 0,
  dead.length ? `\n        ${dead.join("\n        ")}` : `${found.size} links, all resolve`,
);

/**
 * ── 2. the other direction: routes that fetch THIS app ────────────────────
 *
 * Section 1 reads absolute `blueagent.dev` literals and deliberately treats a
 * `${` as a prefix. That is right for a link a human follows, and blind to the
 * inbound case: a route calling itself writes the base as a variable and the
 * path as a static tail — `fetch(`${SELF_BASE}/api/launch-simulator`)` — so
 * section 1 never sees a path at all, only an unmatched template hole.
 *
 * MEASURED 2026-09-27. /api/simulator did exactly that, against a route
 * deleted 2026-05-29 by 80b95ccd. Every layer degraded instead of failing:
 * a 404 is still a successful fetch, so the surrounding try/catch never fired;
 * `res.json()` threw on the 404's HTML and the `.catch(() => ...)` swapped in
 * `{ error: "Invalid response from tool" }`; the route then SETTLED the USDC
 * and returned that object with HTTP 200. It billed $0.10–$0.50 for a string
 * for 121 days. Nothing was loud enough to notice, and it had no caller in
 * this repo, so no page ever looked wrong.
 *
 * The lesson this encodes: an outbound dead link disappoints a reader, an
 * inbound one charges them. This half is the cheaper one to get right.
 */
/*
 * Only names that denote OUR origin. Lowercase `base` is excluded on purpose
 * and is not an oversight: the single occurrence in the repo is
 * `_handlers/agent-readiness.ts`, where it is derived from the user-supplied
 * URL under analysis. Including it made this check demand that WE serve
 * `/.well-known/mcp` — which we do not and should not; that handler is probing
 * somebody else's endpoint for it. A self-fetch guard that cannot tell our
 * origin from an argument would push us to build routes to satisfy a test.
 */
const SELF_FETCH_RE =
  /\$\{(?:SELF_BASE|BASE_URL|SELF|BASE|ORIGIN|origin)\}(\/[a-zA-Z0-9/._-]*)(\$\{)?/g;
const selfFetches = new Map<string, Set<string>>();
walk(SRC, (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
    const abs = join(dir, e.name);
    for (const m of readFileSync(abs, "utf8").matchAll(SELF_FETCH_RE)) {
      let path = m[1];
      const prefix = m[2] !== undefined || path.endsWith("/");
      path = path.replace(/\/$/, "");
      if (path === "") continue;
      const key = `${path}\0${prefix ? "prefix" : "exact"}`;
      if (!selfFetches.has(key)) selfFetches.set(key, new Set());
      selfFetches.get(key)!.add(relative(WEB, abs));
    }
  }
});

console.log(`\n2. every runtime self-fetch hits a route we serve (${selfFetches.size} distinct)`);
const danglingSelf: string[] = [];
for (const [key, sources] of [...selfFetches].sort()) {
  const [path, kind] = key.split("\0");
  if (!live(path, kind === "prefix")) {
    danglingSelf.push(`${path}${kind === "prefix" ? "/*" : ""} ← ${[...sources].join(", ")}`);
  }
}
check(
  "no self-fetch targets a deleted route",
  danglingSelf.length === 0,
  danglingSelf.length
    ? `\n        ${danglingSelf.join("\n        ")}`
    : `${selfFetches.size} targets, all resolve`,
);
// Vacuity floor for the scan above. Anchored on a target that is load-bearing
// rather than on a count alone: /api/credits/spend is how the chat route debits
// a user, so if the scanner stops finding it the scan has stopped working.
check(
  "the self-fetch scan is not vacuous",
  selfFetches.size >= 5 && [...selfFetches.keys()].some(k => k.startsWith("/api/credits/spend\0")),
  `${selfFetches.size} distinct self-fetch targets`,
);

// A resolver that stops matching would pass this file vacuously.
console.log("\n3. the resolver is actually resolving");
check("routes were discovered", routes.length > 50, `${routes.length} route patterns`);
check("public files were discovered", staticFiles.size > 5, `${staticFiles.size} static files`);
check("links were discovered", found.size > 20, `${found.size} distinct published links`);
check(
  "a known-good path resolves",
  live("/hub", false) && live("/api/x402/blue-idea", false),
  "/hub and /api/x402/blue-idea",
);
check(
  "a known-bad path does not",
  !live("/definitely-not-a-route", false),
  "a resolver that says yes to everything is not a check",
);

console.log(
  failures === 0 ? `\nALL ${checks} CHECKS PASSED\n` : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
