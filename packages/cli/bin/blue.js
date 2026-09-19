#!/usr/bin/env node

import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const args = process.argv.slice(2);
const __dirname = dirname(fileURLToPath(import.meta.url));

// This file used to parse `bankr_api_key` out of ~/.blue-agent/config.toml into
// BANKR_API_KEY before spawning the child. Removed 2026-09-18: Bankr 403-bans this
// project, and nothing downstream reads that variable any more.
//
// No key loading replaces it, on purpose. `@blueagent/core` calls its own
// `loadApiKey()` at import time — reading `virtuals_api_key` from the *same*
// config.toml into VIRTUALS_API_KEY — and core is loaded by the child, so the child
// resolves the key itself. Re-implementing that parse here would be a second copy of
// the same rule, free to drift from the one that actually runs.

if (args.length > 0) {
  // Forward to @blueagent/builder CLI
  const require = createRequire(import.meta.url);
  const builderPkg = require.resolve("@blueagent/builder/package.json");
  const builderBin = resolve(dirname(builderPkg), "bin/blue.js");

  const child = spawn(process.execPath, [builderBin, ...args], {
    stdio: "inherit",
    env: { ...process.env }, // an exported VIRTUALS_API_KEY passes through here
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Launch TUI
  await import(resolve(__dirname, "../dist/index.js"));
}
