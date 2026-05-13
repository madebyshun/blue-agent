import fs from "fs";
import path from "path";
import os from "os";
import { callBankr, extractJson } from "../bankr";
import { printError } from "../print";

interface WatchConfig {
  target: string;
  type: "address" | "handle" | "token";
  signals: string[];
  suggested_threshold?: string;
  bankr_command?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".blue-agent");
const WATCH_FILE = path.join(CONFIG_DIR, "watches.json");

function loadWatches(): WatchConfig[] {
  try {
    return JSON.parse(fs.readFileSync(WATCH_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveWatches(watches: WatchConfig[]) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(WATCH_FILE, JSON.stringify(watches, null, 2));
}

const SYSTEM = `You are Blue Agent's watch configuration engine for Base.

Given a target (wallet address, X handle, or token), generate a watch configuration:
- What signals to monitor (transfers, swaps, new followers, posts, price moves)
- Suggested alerting threshold
- The Bankr agent command to set up real-time monitoring

Return ONLY valid JSON:
{
  "target": "<the target>",
  "type": "address" | "handle" | "token",
  "signals": ["<signal1>", "<signal2>", ...],
  "suggested_threshold": "<e.g. >$1000 transfer, >5% price move>",
  "bankr_command": "<bankr agent prompt to set up monitoring>"
}`;

export async function runWatch(target: string | undefined, opts: { list?: boolean } = {}) {
  if (opts.list) {
    const watches = loadWatches();
    const line = "─".repeat(52);
    process.stdout.write(`\n${line}\n  👁  blue watch — active watches\n${line}\n`);
    if (watches.length === 0) {
      process.stdout.write(`\n  No watches configured. Add one: blue watch <address|@handle|token>\n\n`);
    } else {
      process.stdout.write("\n");
      for (const w of watches) {
        process.stdout.write(`  ${w.target}  (${w.type})\n`);
        for (const s of w.signals) process.stdout.write(`    · ${s}\n`);
        process.stdout.write("\n");
      }
    }
    process.stdout.write(`${line}\n\n`);
    return;
  }

  if (!target?.trim()) {
    printError(
      "Usage: blue watch <address|@handle|token>\n" +
      "       blue watch 0xabc...  |  blue watch @builder  |  blue watch USDC\n" +
      "       blue watch --list"
    );
    return;
  }

  const line = "─".repeat(52);
  process.stdout.write(`\n${line}\n  👁  blue watch — ${target}\n${line}\n`);

  try {
    const raw = await callBankr(SYSTEM, `Configure watch for: ${target}`);

    let config: WatchConfig;
    try {
      config = extractJson(raw) as WatchConfig;
    } catch {
      process.stdout.write("\n" + raw + "\n\n");
      return;
    }

    process.stdout.write(`\n  Target: ${config.target}  (${config.type})\n\n`);
    process.stdout.write(`  Signals to monitor:\n`);
    for (const s of config.signals) process.stdout.write(`    · ${s}\n`);

    if (config.suggested_threshold) {
      process.stdout.write(`\n  Threshold: ${config.suggested_threshold}\n`);
    }
    if (config.bankr_command) {
      process.stdout.write(`\n  To activate real-time monitoring:\n`);
      process.stdout.write(`    ${config.bankr_command}\n`);
    }

    // Save to local watches list
    const watches = loadWatches();
    const exists = watches.find((w) => w.target === config.target);
    if (!exists) {
      watches.push(config);
      saveWatches(watches);
      process.stdout.write(`\n  ✓ Saved to ~/.blue-agent/watches.json\n`);
    }

    process.stdout.write(`\n${line}\n`);
    process.stdout.write(`  List all: blue watch --list\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
