import fs from "fs";
import path from "path";
import os from "os";

const SKILL_FILES = [
  "base-security.md",
  "base-addresses.md",
  "base-standards.md",
  "bankr-tools.md",
  "blue-agent-identity.md",
  "design-system.md",
  "base-ecosystem.md",
  "x402-patterns.md",
  "agent-wallet-security.md",
];

const SKILLS_DIR  = path.join(os.homedir(), ".blue-agent", "skills");
const CONFIG_FILE = path.join(os.homedir(), ".blue-agent", "config.toml");

const HR = "─".repeat(44);

function ok(msg: string)   { process.stdout.write(`  \x1b[32m✓\x1b[0m ${msg}\n`); }
function fail(msg: string) { process.stdout.write(`  \x1b[31m✗\x1b[0m ${msg}\n`); }
function dim(msg: string)  { process.stdout.write(`    \x1b[2m${msg}\x1b[0m\n`); }

export async function runDoctor(): Promise<void> {
  process.stdout.write(`\n${HR}\n`);
  process.stdout.write(` \x1b[34m🔵\x1b[0m blue doctor — system check\n`);
  process.stdout.write(`${HR}\n\n`);

  let allGood = true;

  // 1. Node.js version
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.replace("v", "").split(".")[0], 10);
  if (nodeMajor >= 18) {
    ok(`node ${nodeVer}`);
  } else {
    fail(`node ${nodeVer} — requires >= 18 (install via https://nvm.sh)`);
    allGood = false;
  }

  // 2. @blueagent/builder version
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string };
    ok(`@blueagent/builder v${pkg.version}`);
  } catch {
    fail("@blueagent/builder version unknown");
    allGood = false;
  }

  // 3. Skills
  const installedSkills = SKILL_FILES.filter((f) =>
    fs.existsSync(path.join(SKILLS_DIR, f))
  );
  const count = installedSkills.length;
  const total = SKILL_FILES.length;

  if (count === total) {
    ok(`skills (${count}/${total} installed)`);
  } else {
    fail(`skills (${count}/${total} installed) — run: blue init`);
    allGood = false;
  }

  for (const f of SKILL_FILES) {
    const installed = fs.existsSync(path.join(SKILLS_DIR, f));
    dim(`${installed ? "✓" : "✗"} ${f}`);
  }

  // 4. BANKR_API_KEY
  if (process.env.BANKR_API_KEY && process.env.BANKR_API_KEY.trim() !== "") {
    ok("BANKR_API_KEY set");
  } else {
    fail("BANKR_API_KEY not set — add to ~/.blue-agent/config.toml or env");
    allGood = false;
  }

  // 5. Config file
  if (fs.existsSync(CONFIG_FILE)) {
    ok(`config found at ${CONFIG_FILE}`);
  } else {
    fail(`config not found — run: blue init`);
    allGood = false;
  }

  process.stdout.write(`\n${HR}\n`);
  if (allGood) {
    process.stdout.write(`  ready. try: \x1b[36mblue audit "your project"\x1b[0m\n`);
  } else {
    process.stdout.write(`  some checks failed. see above for fixes.\n`);
  }
  process.stdout.write(`${HR}\n\n`);

  if (!allGood) process.exit(1);
}
