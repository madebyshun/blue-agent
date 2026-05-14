import fs from "fs";
import path from "path";
import os from "os";
import * as readline from "readline";
import { printError } from "../print";

interface AlertConfig {
  id: string;
  target: string;
  condition: string;
  channel: "telegram" | "webhook" | "log";
  destination?: string;
  created_at: string;
  active: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".blue-agent");
const ALERT_FILE = path.join(CONFIG_DIR, "alerts.json");

function loadAlerts(): AlertConfig[] {
  try {
    return JSON.parse(fs.readFileSync(ALERT_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveAlerts(alerts: AlertConfig[]) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(ALERT_FILE, JSON.stringify(alerts, null, 2));
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

export async function runAlert(subcommand: string | undefined) {
  const line = "─".repeat(52);

  // blue alert --list  or  blue alert list
  if (!subcommand || subcommand === "list") {
    const alerts = loadAlerts();
    process.stdout.write(`\n${line}\n  🔔 blue alert — configured alerts\n${line}\n`);
    if (alerts.length === 0) {
      process.stdout.write(`\n  No alerts configured.\n  Set one up: blue alert add\n\n`);
    } else {
      process.stdout.write("\n");
      for (const a of alerts) {
        const status = a.active ? "● active" : "○ paused";
        process.stdout.write(`  [${a.id}]  ${status}  ${a.target}\n`);
        process.stdout.write(`    Condition: ${a.condition}\n`);
        process.stdout.write(`    Channel:   ${a.channel}${a.destination ? ` → ${a.destination}` : ""}\n\n`);
      }
    }
    process.stdout.write(`${line}\n`);
    process.stdout.write(`  Add: blue alert add  |  Remove: blue alert remove <id>\n\n`);
    return;
  }

  if (subcommand === "add") {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write(`\n${line}\n  🔔 blue alert add\n${line}\n\n`);

      const target      = await ask(rl, "  Watch target (address/handle/token): ");
      const condition   = await ask(rl, "  Alert condition (e.g. transfer >1000 USDC): ");
      const channelRaw  = await ask(rl, "  Channel (telegram/webhook/log) [log]: ");
      const channel     = (["telegram", "webhook", "log"].includes(channelRaw) ? channelRaw : "log") as AlertConfig["channel"];

      let destination: string | undefined;
      if (channel === "telegram") {
        destination = await ask(rl, "  Telegram bot token or @channel: ");
      } else if (channel === "webhook") {
        destination = await ask(rl, "  Webhook URL (https://...): ");
      }

      const id = `alert_${Date.now().toString(36)}`;
      const alert: AlertConfig = {
        id, target, condition, channel, destination,
        created_at: new Date().toISOString(),
        active: true,
      };

      const alerts = loadAlerts();
      alerts.push(alert);
      saveAlerts(alerts);

      process.stdout.write(`\n  ✓ Alert saved  [${id}]\n`);
      process.stdout.write(`    Target:    ${target}\n`);
      process.stdout.write(`    Condition: ${condition}\n`);
      process.stdout.write(`    Channel:   ${channel}${destination ? ` → ${destination}` : ""}\n`);
      process.stdout.write(`\n  Config: ~/.blue-agent/alerts.json\n`);
      process.stdout.write(`\n  Note: Connect to a live listener to activate real-time delivery.\n`);
      process.stdout.write(`        Bankr: bankr agent prompt "Monitor ${target} for ${condition}"\n\n`);
    } finally {
      rl.close();
    }
    return;
  }

  if (subcommand === "remove") {
    printError("Usage: blue alert remove <alertId>\n  List IDs: blue alert list");
    return;
  }

  // blue alert remove <id> — handled via 2-arg form in cli.ts
  printError(`Unknown subcommand: ${subcommand}\n\n  Usage:\n    blue alert          — list alerts\n    blue alert add      — interactive setup\n    blue alert remove <id>`);
}

export async function runAlertRemove(id: string) {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx === -1) {
    printError(`Alert not found: ${id}\n  List IDs: blue alert`);
    return;
  }
  alerts.splice(idx, 1);
  saveAlerts(alerts);
  process.stdout.write(`\n  ✓ Alert removed: ${id}\n\n`);
}
