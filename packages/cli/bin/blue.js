#!/usr/bin/env node

import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";

const args = process.argv.slice(2);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load BANKR_API_KEY from ~/.blue-agent/config.toml if not already set
function loadApiKey() {
  if (process.env.BANKR_API_KEY?.trim()) return;
  const configFile = resolve(homedir(), ".blue-agent", "config.toml");
  if (!existsSync(configFile)) return;
  const raw = readFileSync(configFile, "utf8");
  const match = raw.match(/^\s*bankr_api_key\s*=\s*"([^"]+)"/m);
  if (match) process.env.BANKR_API_KEY = match[1].trim();
}

loadApiKey();

if (args.length > 0) {
  // Forward to @blueagent/builder CLI
  const require = createRequire(import.meta.url);
  const builderPkg = require.resolve("@blueagent/builder/package.json");
  const builderBin = resolve(dirname(builderPkg), "bin/blue.js");

  const child = spawn(process.execPath, [builderBin, ...args], {
    stdio: "inherit",
    env: { ...process.env }, // includes BANKR_API_KEY loaded above
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Launch TUI
  await import(resolve(__dirname, "../dist/index.js"));
}
