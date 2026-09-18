/**
 * Every publishable package must carry the metadata that makes its npm page usable:
 * `license`, `repository` (with `directory`, so npm deep-links into the monorepo
 * rather than at its root), `homepage`, `bugs`. And the root `LICENSE` file the
 * README's MIT badge points at must actually exist.
 *
 * This replaces a one-shot patcher. The patcher added the fields to 10 packages
 * once and then would have rotted in `scripts/` — the next package added to
 * `packages/` would have repeated the omission with nothing to catch it, which is
 * exactly how the gap opened the first time. A derivation keeps being true; a
 * migration that ran once only keeps being true until someone adds a directory.
 *
 * Found 2026-09-18: 8 of 10 public packages had no `repository` at all, so their
 * npm pages had no link back to this repo, and `LICENSE` did not exist while the
 * README had been rendering a badge that linked to it (a 404 on the repo's own
 * license). Two package.json files already declared `"license": "MIT"`, so the
 * claim was live in the metadata before the file backing it existed.
 *
 * PRIVATE packages (`private: true`) are deliberately exempt: they are never
 * published, so there is no npm page for the fields to appear on, and requiring
 * them would mean maintaining metadata no reader ever sees.
 *
 * Hermetic — reads package.json files off disk, no network. Discovered
 * automatically by run-tests.ts (every `scripts/*-check.ts` runs in CI).
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

// Not `import.meta.dirname`: tsx loads this file as CJS, where it is undefined.
const SCRIPTS_DIR = path.dirname(path.resolve(process.argv[1]));
const ROOT = path.resolve(SCRIPTS_DIR, "..", "..", "..");
const PACKAGES = path.join(ROOT, "packages");

const REPO_URL = "https://github.com/madebyshun/blue-agent";

const failures: string[] = [];
const checked: string[] = [];
const exempt: string[] = [];

/** The README renders an MIT badge linking here; a missing file makes that a 404. */
const licenseFile = path.join(ROOT, "LICENSE");
if (!existsSync(licenseFile)) {
  failures.push("LICENSE — missing at repo root, but README.md renders a badge linking to it");
} else if (readFileSync(licenseFile, "utf8").trim().length === 0) {
  failures.push("LICENSE — present but empty");
} else if (!readFileSync(licenseFile, "utf8").startsWith("MIT License")) {
  // GitHub's license detector keys off the file starting with the standard text.
  // A preamble above it makes the repo read as "license: other".
  failures.push("LICENSE — does not start with `MIT License`; GitHub will not detect it");
}

for (const dir of readdirSync(PACKAGES).sort()) {
  const pkgDir = path.join(PACKAGES, dir);
  if (!statSync(pkgDir).isDirectory()) continue;

  const file = path.join(pkgDir, "package.json");
  // No package.json = not an npm workspace (e.g. `langchain/` is Python,
  // `claude-plugin/` is a Claude Code manifest). Nothing to publish, nothing to check.
  if (!existsSync(file)) continue;

  const rel = `packages/${dir}`;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    failures.push(`${rel}/package.json — unparseable: ${(err as Error).message}`);
    continue;
  }

  if (pkg.private === true) {
    exempt.push(`${rel} (private)`);
    continue;
  }

  checked.push(rel);
  const miss = (field: string, detail: string) => failures.push(`${rel} — ${field}: ${detail}`);

  if (!pkg.license) miss("license", "missing");

  const repo = pkg.repository as { url?: string; directory?: string } | undefined;
  if (!repo) {
    miss("repository", "missing — the npm page will have no link back to this repo");
  } else {
    if (!repo.url?.includes("madebyshun/blue-agent")) {
      miss("repository.url", `points at ${repo.url ?? "nothing"}, expected ${REPO_URL}`);
    }
    // A wrong `directory` is worse than an absent one: npm renders a confident
    // "source" link that lands on the wrong folder. Easy to get wrong by copy-paste.
    if (repo.directory !== rel) {
      miss("repository.directory", `is "${repo.directory ?? "absent"}", must be "${rel}"`);
    }
  }

  if (!pkg.homepage) miss("homepage", "missing");
  if (!(pkg.bugs as { url?: string } | undefined)?.url) miss("bugs.url", "missing");
}

console.log(`package-metadata-check — ${checked.length} publishable packages, ${exempt.length} exempt`);
for (const e of exempt) console.log(`  SKIP  ${e}`);

if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(
    "\nEvery published package needs license + repository(+directory) + homepage + bugs.\n" +
      "Copy the shape from packages/x402-client/package.json.",
  );
  process.exit(1);
}

console.log("ALL CHECKS PASSED");
