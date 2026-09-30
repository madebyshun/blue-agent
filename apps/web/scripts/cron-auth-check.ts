/**
 * No route may treat the PRESENCE of an `x-vercel-cron` header as authorization.
 *
 * Found 2026-09-29 (inventory §5, re-verified 2026-09-30): `api/cron/dca-executor`
 * and `api/cron/b20hub-distribute` accepted `req.headers.has("x-vercel-cron")` as
 * sufficient auth. Any caller can send that header, and both routes sign
 * transactions with server-held keeper keys — one moves user USDC. Neither was
 * even scheduled in vercel.json, so the header path was reachable ONLY by
 * someone other than Vercel. Vercel Cron authenticates itself with
 * `Authorization: Bearer $CRON_SECRET` when that env is set; a Bearer check is
 * the whole of the auth a cron route needs.
 *
 * This asserts a property, not a list of files: any source file under
 * `src/app/api` that reads the header with `.has(...)` or `.get(...)` fails.
 * There is deliberately no exemption list — being listed would read as having
 * been reviewed (see catalog-compute-check.ts for why that went wrong once).
 *
 * Hermetic — reads files off disk, no network. Discovered automatically by
 * run-tests.ts (every `scripts/*-check.ts` runs in CI).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Not `import.meta.dirname`: tsx loads this file as CJS, where it is undefined.
const SCRIPTS_DIR = path.dirname(path.resolve(process.argv[1]));
const API_DIR = path.resolve(SCRIPTS_DIR, "..", "src", "app", "api");

/** `headers.has("x-vercel-cron")` / `headers.get('x-vercel-cron')`, any quote style. */
const HEADER_AS_AUTH = /headers\s*\.\s*(has|get)\s*\(\s*["'`]x-vercel-cron["'`]\s*\)/i;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(API_DIR, []);
const failures: string[] = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (HEADER_AS_AUTH.test(line)) {
      failures.push(`${path.relative(path.resolve(SCRIPTS_DIR, ".."), file)}:${i + 1} — ${line.trim()}`);
    }
  });
}

console.log(`cron-auth-check — scanned ${files.length} files under src/app/api`);

if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(
    "\nAn `x-vercel-cron` header is not a credential — any caller can send it.\n" +
      "Authorize cron routes with `Authorization: Bearer ${CRON_SECRET}` only, fail-closed\n" +
      "when CRON_SECRET is unset (see api/cron/dca-executor/route.ts).",
  );
  process.exit(1);
}

console.log("ALL CHECKS PASSED");
