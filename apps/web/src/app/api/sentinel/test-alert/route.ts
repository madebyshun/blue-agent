/**
 * Blue Sentinel — Test Alert
 * GET /api/sentinel/test-alert
 * Sends a mock finding alert to Telegram to verify delivery pipeline.
 * DEV ONLY — remove or protect in production.
 */

import { NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID ?? "";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" },
      { status: 500 }
    );
  }

  const mockFinding = {
    id:         "test-" + Date.now(),
    threatName: "ERC-20 Honeypot Token",
    category:   "honeypot",
    severity:   "critical" as const,
    target:     "0xDEADBEEF00000000000000000000000000000001",
    targetType: "token",
    summary:    "Token contract blocks all sell transactions. Owner retains blacklist + fee manipulation capability. Liquidity unlocked.",
    detectedAt: new Date().toISOString(),
    alerted:    false,
  };

  const msg = [
    `🚨 <b>Blue Sentinel — CRITICAL Alert</b>`,
    ``,
    `<b>Threat:</b> ${esc(mockFinding.threatName)}`,
    `<b>Target:</b> <code>${esc(mockFinding.target)}</code>`,
    `<b>Type:</b> ${esc(mockFinding.targetType)} · ${esc(mockFinding.category)}`,
    ``,
    `<b>Summary:</b>`,
    esc(mockFinding.summary),
    ``,
    `<i>Detected at ${esc(mockFinding.detectedAt)}</i>`,
    `<i>⚠️ This is a test alert — Blue Sentinel is operational</i>`,
    `—`,
    `<a href="https://blueagent.dev/hub/sentinel">blueagent.dev/hub/sentinel</a>`,
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:    TELEGRAM_CHAT_ID,
        text:       msg,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  const data = await res.json() as { ok: boolean; description?: string };

  if (!data.ok) {
    return NextResponse.json({ error: data.description }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Test alert sent to Telegram ✓", finding: mockFinding });
}
