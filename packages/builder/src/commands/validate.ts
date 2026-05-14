import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface CheckResult {
  ok: boolean;
  warn?: boolean;   // warning (not fatal) — shown with ⚠️
  label: string;
  detail?: string;  // extra context or fix hint
}

function checkNodeVersion(): CheckResult {
  const version = process.version; // e.g. "v22.1.0"
  const major = parseInt(version.slice(1).split(".")[0], 10);
  const ok = major >= 18;
  return {
    ok,
    label: `Node.js ${version} (required: v18+)`,
    detail: ok ? undefined : "Upgrade: https://nodejs.org",
  };
}

function checkPackageJson(dir: string): CheckResult {
  const p = path.join(dir, "package.json");
  if (!fs.existsSync(p)) {
    return { ok: false, label: "package.json missing", detail: "run: npm init -y" };
  }
  try {
    JSON.parse(fs.readFileSync(p, "utf8"));
    return { ok: true, label: "package.json found and valid" };
  } catch {
    return { ok: false, label: "package.json exists but invalid JSON", detail: "fix the JSON syntax errors" };
  }
}

function checkTsConfig(dir: string): CheckResult {
  const p = path.join(dir, "tsconfig.json");
  if (!fs.existsSync(p)) {
    return { ok: false, label: "tsconfig.json missing", detail: "run: npx tsc --init" };
  }
  try {
    JSON.parse(fs.readFileSync(p, "utf8").replace(/\/\/.*/g, "").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
    return { ok: true, label: "tsconfig.json found" };
  } catch {
    return { ok: true, label: "tsconfig.json found (non-standard JSON — skipping parse check)" };
  }
}

function checkEnv(dir: string): CheckResult {
  // Check env var first (most common in CI / already-configured setups)
  if (process.env.BANKR_API_KEY) {
    return { ok: true, label: "BANKR_API_KEY set (environment variable)" };
  }

  // Then check .env files in cwd
  const envFiles = [".env", ".env.local", ".env.development"];
  for (const f of envFiles) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      if (content.includes("BANKR_API_KEY")) {
        return { ok: true, label: `BANKR_API_KEY found in ${f}` };
      }
    }
  }

  return {
    ok: false,
    label: "BANKR_API_KEY not set",
    detail: "Add to .env: BANKR_API_KEY=<your-key>  or  export BANKR_API_KEY=<key>",
  };
}

function checkSrcFolder(dir: string): CheckResult {
  const srcPath = path.join(dir, "src");
  if (!fs.existsSync(srcPath)) {
    return { ok: false, label: "src/ folder missing", detail: "create: mkdir src" };
  }
  const files = fs.readdirSync(srcPath);
  if (files.length === 0) {
    return { ok: false, label: "src/ folder is empty", detail: "add your entry point (e.g. src/index.ts)" };
  }
  return { ok: true, label: `src/ folder found (${files.length} item${files.length !== 1 ? "s" : ""})` };
}

function checkGit(dir: string): CheckResult {
  const gitDir = path.join(dir, ".git");
  if (fs.existsSync(gitDir)) {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf8" }).trim();
      return { ok: true, label: `git repo initialized (branch: ${branch})` };
    } catch {
      return { ok: true, label: "git repo initialized" };
    }
  }
  return {
    ok: true,
    warn: true,
    label: "git not initialized",
    detail: "run: git init && git add . && git commit -m 'init'",
  };
}

function checkNodeModules(dir: string): CheckResult {
  const nmPath = path.join(dir, "node_modules");
  if (!fs.existsSync(nmPath)) {
    return { ok: false, label: "node_modules missing", detail: "run: npm install" };
  }
  return { ok: true, label: "node_modules present" };
}

export async function runValidate(targetDir?: string) {
  const dir = targetDir ? path.resolve(targetDir) : process.cwd();
  const line = "─".repeat(52);

  process.stdout.write(`\n${line}\n  🔍 blue validate — Project Health Check\n`);
  process.stdout.write(`  Path: ${dir}\n${line}\n\n`);

  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkPackageJson(dir),
    checkTsConfig(dir),
    checkEnv(dir),
    checkSrcFolder(dir),
    checkNodeModules(dir),
    checkGit(dir),
  ];

  const failures: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  for (const c of checks) {
    if (c.ok && !c.warn) {
      process.stdout.write(`  ✅ ${c.label}\n`);
    } else if (c.warn) {
      process.stdout.write(`  ⚠️  ${c.label}\n`);
      warnings.push(c);
    } else {
      process.stdout.write(`  ❌ ${c.label}\n`);
      failures.push(c);
    }
  }

  // Next steps
  const actionable = [...failures, ...warnings].filter((c) => c.detail);
  if (actionable.length > 0) {
    process.stdout.write(`\n  Next steps:\n`);
    for (let i = 0; i < actionable.length; i++) {
      process.stdout.write(`    ${i + 1}. ${actionable[i].detail}\n`);
    }
  }

  process.stdout.write(`\n${line}\n`);

  if (failures.length === 0 && warnings.length === 0) {
    process.stdout.write(`  ✅ All checks passed — project looks healthy.\n\n`);
  } else if (failures.length === 0) {
    process.stdout.write(`  ⚠️  ${warnings.length} warning${warnings.length !== 1 ? "s" : ""} — not blocking but worth fixing.\n\n`);
  } else {
    process.stdout.write(`  ❌ ${failures.length} issue${failures.length !== 1 ? "s" : ""} found`);
    if (warnings.length > 0) process.stdout.write(`, ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
    process.stdout.write(`.\n\n`);
    process.exit(1);
  }
}
