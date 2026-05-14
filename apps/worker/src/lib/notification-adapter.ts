import fs from "fs";
import path from "path";
import os from "os";
import type { NotifyEvent, Notifier } from "./types.js";

const LOG_FILE = path.join(os.homedir(), ".blue-agent", "worker.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotate

function logLine(line: string): void {
  try {
    // Rotate if too large
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_BYTES) {
        fs.renameSync(LOG_FILE, LOG_FILE + ".bak");
      }
    }
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    // non-fatal
  }
}

function formatEvent(event: NotifyEvent): string {
  const ts = new Date().toISOString();
  const parts = [`[${ts}] [${event.type}]`, event.message];
  if (event.taskId) parts.push(`task=${event.taskId.slice(0, 8)}`);
  if (event.claimId) parts.push(`claim=${event.claimId.slice(0, 8)}`);
  if (event.handle) parts.push(`@${event.handle}`);
  if (event.amount != null) parts.push(`$${event.amount.toFixed(2)}`);
  return parts.join(" | ");
}

async function dispatchWebhook(event: NotifyEvent): Promise<void> {
  const webhookUrl = process.env.WORKER_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, ts: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // non-fatal
  }
}

async function dispatchTelegram(event: NotifyEvent): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const text = `🤖 *Blue Agent Worker*\n${event.message}`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // non-fatal
  }
}

export function createNotifier(silent = false): Notifier {
  return (event: NotifyEvent) => {
    const line = formatEvent(event);
    if (!silent) console.log(line);
    logLine(line);
    // Fire-and-forget external dispatches
    void dispatchWebhook(event);
    void dispatchTelegram(event);
  };
}

export const consoleNotifier: Notifier = createNotifier(false);
export const silentNotifier: Notifier = createNotifier(true);
