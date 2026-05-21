/**
 * Blue Market — Daily Builder Brief
 *
 * Cron: every day at 8:00 AM UTC
 * Vercel config: vercel.json → crons
 *
 * Delivers to:
 *   - Telegram channel/group (TELEGRAM_CHAT_ID)
 *   - Email list (BRIEF_EMAIL_LIST comma-separated)
 *
 * Report covers:
 *   - Base ecosystem moves (new launches, protocols, builders)
 *   - Coinbase news & announcements
 *   - Market signals (narratives, token picks)
 *   - Onchain intelligence (smart builder activity)
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Config ──────────────────────────────────────────────────────────────────

const BANKR_API_KEY     = process.env.BANKR_API_KEY!;
const BANKR_LLM         = "https://llm.bankr.bot/v1/messages";
const BASESCAN_API_KEY  = process.env.BASESCAN_API_KEY ?? "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID!;
const RESEND_API_KEY     = process.env.RESEND_API_KEY!;
const BRIEF_FROM_EMAIL   = process.env.BRIEF_FROM_EMAIL ?? "Blue Market <market@blueagent.dev>";
const BRIEF_EMAIL_LIST   = (process.env.BRIEF_EMAIL_LIST ?? "").split(",").map(e => e.trim()).filter(Boolean);
const CRON_SECRET        = process.env.CRON_SECRET ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BasescanTx {
  from: string;
  to: string;
  contractAddress: string;
  timeStamp: string;
  input: string;
}

interface ReportSection {
  ecosystem:  string;
  coinbase:   string;
  market:     string;
  onchain:    string;
  signal:     string;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

/** Recent contract deployments on Base — proxy for builder activity */
async function fetchBaseDeployments(): Promise<string> {
  if (!BASESCAN_API_KEY) return "Basescan API key not configured.";
  try {
    const url = `https://api.basescan.org/api?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&startblock=0&endblock=99999999&page=1&offset=10&sort=desc&apikey=${BASESCAN_API_KEY}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as { result?: BasescanTx[] };
    if (!data.result?.length) return "No recent deployment data.";
    const count = data.result.filter(tx => tx.contractAddress).length;
    return `${count} new contracts deployed in the last block sample on Base.`;
  } catch {
    return "Could not fetch Basescan data.";
  }
}

/** Call Bankr LLM to generate the report */
async function generateReport(onchainContext: string): Promise<ReportSection> {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are Blue Agent — AI intelligence layer for Base builders and founders.

Generate the Daily Base Builder Brief for ${today}.

Context:
- Onchain activity: ${onchainContext}

LANGUAGE: English only. No other languages.

Write a concise daily intelligence brief covering what Base builders and founders need to know today.
Each section: 2-4 bullet points max. Be specific and actionable. No fluff. No generic statements.
Use "·" as bullet prefix. Each bullet on its own line.

Focus areas:
- ecosystem: new protocol launches, notable builder activity, funding rounds, Base network updates
- coinbase: Coinbase product news, Base L2 announcements, regulatory/policy moves, partnerships
- market: narratives gaining or losing momentum on CT, token sector rotation, sentiment shifts relevant to builders
- onchain: notable contract deployments, TVL shifts, smart wallet activity, DeFi flows on Base
- signal: the single most important thing a Base founder should act on today — 1 punchy sentence

Return ONLY a valid JSON object with these exact keys:
{
  "ecosystem": "...",
  "coinbase": "...",
  "market": "...",
  "onchain": "...",
  "signal": "..."
}

No markdown. No code block. No explanation. Raw JSON only.`;

  const res = await fetch(BANKR_LLM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BANKR_API_KEY,
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Bankr LLM error: ${res.status}`);
  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? "{}";

  try {
    return JSON.parse(text) as ReportSection;
  } catch {
    // fallback if JSON parse fails
    return {
      ecosystem: text,
      coinbase:  "",
      market:    "",
      onchain:   "",
      signal:    "",
    };
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTelegram(report: ReportSection, date: string): string {
  const lines: string[] = [];
  lines.push(`🔵 *Blue Market — Daily Builder Brief*`);
  lines.push(`📅 ${date}`);
  lines.push(``);

  if (report.signal) {
    lines.push(`⚡ *Signal*`);
    lines.push(`_${report.signal}_`);
    lines.push(``);
  }
  if (report.ecosystem) {
    lines.push(`🏗 *Base Ecosystem*`);
    lines.push(report.ecosystem);
    lines.push(``);
  }
  if (report.coinbase) {
    lines.push(`🔷 *Coinbase & Base*`);
    lines.push(report.coinbase);
    lines.push(``);
  }
  if (report.market) {
    lines.push(`📊 *Market Signals*`);
    lines.push(report.market);
    lines.push(``);
  }
  if (report.onchain) {
    lines.push(`⛓ *Onchain Intelligence*`);
    lines.push(report.onchain);
    lines.push(``);
  }

  lines.push(`—`);
  lines.push(`[blueagent.dev](https://blueagent.dev) · Blue Agent × Aeon × MiroShark`);

  return lines.join("\n");
}

function formatEmail(report: ReportSection, date: string): string {
  const section = (emoji: string, title: string, content: string) =>
    content ? `
      <div style="margin-bottom:24px">
        <p style="font-family:monospace;font-size:11px;color:#4FC3F7;letter-spacing:2px;margin:0 0 8px">${emoji} ${title.toUpperCase()}</p>
        <p style="font-family:monospace;font-size:13px;color:#cbd5e1;line-height:1.7;margin:0;white-space:pre-line">${content}</p>
      </div>` : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#050508;color:#e2e8f0;padding:32px 24px;max-width:600px;margin:0 auto">

  <div style="margin-bottom:32px">
    <p style="font-family:monospace;font-size:18px;font-weight:bold;color:#fff;margin:0">
      🔵 BLUE<span style="color:#4FC3F7">MARKET</span>
    </p>
    <p style="font-family:monospace;font-size:11px;color:#475569;margin:4px 0 0">Daily Builder Brief · ${date}</p>
  </div>

  ${report.signal ? `
  <div style="background:#4FC3F715;border:1px solid #4FC3F730;border-radius:8px;padding:16px;margin-bottom:28px">
    <p style="font-family:monospace;font-size:10px;color:#4FC3F7;letter-spacing:2px;margin:0 0 6px">⚡ TODAY'S SIGNAL</p>
    <p style="font-family:monospace;font-size:14px;color:#fff;margin:0;font-style:italic">${report.signal}</p>
  </div>` : ""}

  ${section("🏗", "Base Ecosystem", report.ecosystem)}
  ${section("🔷", "Coinbase & Base", report.coinbase)}
  ${section("📊", "Market Signals", report.market)}
  ${section("⛓", "Onchain Intelligence", report.onchain)}

  <div style="border-top:1px solid #1A1A2E;padding-top:20px;margin-top:8px">
    <p style="font-family:monospace;font-size:10px;color:#334155;margin:0">
      Blue Agent × Aeon × MiroShark · <a href="https://blueagent.dev" style="color:#4FC3F7;text-decoration:none">blueagent.dev</a>
    </p>
  </div>

</body>
</html>`;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    TELEGRAM_CHAT_ID,
      text:       message,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram error: ${res.status} — ${err}`);
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: BRIEF_FROM_EMAIL, to, subject, html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${res.status} — ${err}`);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sends Authorization header, or use secret param for manual trigger
  const authHeader = req.headers.get("authorization");
  const secretParam = new URL(req.url).searchParams.get("secret");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

  const results: Record<string, unknown> = { date, steps: [] };

  try {
    // 1. Fetch onchain context
    const onchainContext = await fetchBaseDeployments();
    (results.steps as string[]).push("✓ onchain data fetched");

    // 2. Generate report
    const report = await generateReport(onchainContext);
    (results.steps as string[]).push("✓ report generated");

    // 3. Send Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const tgMessage = formatTelegram(report, date);
      await sendTelegram(tgMessage);
      (results.steps as string[]).push("✓ telegram delivered");
    } else {
      (results.steps as string[]).push("⚠ telegram skipped (missing env vars)");
    }

    // 4. Send emails
    if (RESEND_API_KEY && BRIEF_EMAIL_LIST.length > 0) {
      const html    = formatEmail(report, date);
      const subject = `🔵 Blue Market — ${date}`;
      const emailResults = await Promise.allSettled(
        BRIEF_EMAIL_LIST.map(email => sendEmail(email, subject, html))
      );
      const sent   = emailResults.filter(r => r.status === "fulfilled").length;
      const failed = emailResults.filter(r => r.status === "rejected").length;
      (results.steps as string[]).push(`✓ emails: ${sent} sent, ${failed} failed`);
    } else {
      (results.steps as string[]).push("⚠ email skipped (missing RESEND_API_KEY or BRIEF_EMAIL_LIST)");
    }

    results.report = report;
    return NextResponse.json({ ok: true, ...results });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, ...results },
      { status: 500 }
    );
  }
}
