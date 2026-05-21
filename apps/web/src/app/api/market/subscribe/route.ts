/**
 * Blue Market — Subscribe endpoint
 *
 * POST /api/market/subscribe
 * Body: { email: string, tier: "daily" | "weekly" }
 *
 * daily → free, adds email to list, sends welcome email
 * weekly → x402 USDC payment ($5.00) required, sends premium welcome
 */

import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY   = process.env.RESEND_API_KEY!;
const BRIEF_FROM_EMAIL = process.env.BRIEF_FROM_EMAIL ?? "Blue Market <market@blueagent.dev>";

// Weekly report price: $5.00 USDC (6 decimals)
const WEEKLY_PRICE_USDC = "5000000";
const USDC_BASE         = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendWelcomeEmail(to: string, tier: "daily" | "weekly"): Promise<void> {
  const isWeekly = tier === "weekly";

  const subject = isWeekly
    ? "🔵 Blue Market — Weekly Deep Report confirmed"
    : "🔵 Blue Market — You're subscribed to the Daily Brief";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#050508;color:#e2e8f0;padding:32px 24px;max-width:600px;margin:0 auto;font-family:monospace">

  <div style="margin-bottom:32px">
    <p style="font-size:18px;font-weight:bold;color:#fff;margin:0">
      🔵 BLUE<span style="color:#4FC3F7">MARKET</span>
    </p>
    <p style="font-size:11px;color:#475569;margin:4px 0 0">
      ${isWeekly ? "Weekly Deep Report" : "Daily Builder Brief"}
    </p>
  </div>

  <div style="background:${isWeekly ? "#A78BFA15" : "#4FC3F715"};border:1px solid ${isWeekly ? "#A78BFA30" : "#4FC3F730"};border-radius:8px;padding:20px;margin-bottom:28px">
    <p style="font-size:14px;color:#fff;margin:0 0 8px">
      ${isWeekly ? "⚡ Your Weekly Deep Report subscription is confirmed." : "⚡ You're on the Daily Brief list."}
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:0">
      ${isWeekly
        ? "Every week you'll receive deep intelligence: token picks, onchain flows, builder radar, and market edge — all curated for Base founders."
        : "Every morning at 8am UTC you'll receive Base ecosystem moves, Coinbase updates, market signals, and onchain intelligence."}
    </p>
  </div>

  ${isWeekly ? `
  <div style="margin-bottom:24px">
    <p style="font-size:11px;color:#A78BFA;letter-spacing:2px;margin:0 0 8px">WHAT YOU GET</p>
    <p style="font-size:13px;color:#cbd5e1;line-height:1.8;margin:0">
      · Deep token analysis — high-conviction setups on Base<br>
      · Onchain flows — whale moves, TVL shifts, smart wallet activity<br>
      · Builder radar — who's shipping, what's gaining traction<br>
      · Market edge — narratives, positioning, contrarian takes<br>
      · Signal — the 1 move a Base founder should make this week
    </p>
  </div>` : `
  <div style="margin-bottom:24px">
    <p style="font-size:11px;color:#4FC3F7;letter-spacing:2px;margin:0 0 8px">WHAT YOU GET</p>
    <p style="font-size:13px;color:#cbd5e1;line-height:1.8;margin:0">
      · Base ecosystem moves<br>
      · Coinbase & Base announcements<br>
      · Market signals & narrative shifts<br>
      · Onchain intelligence<br>
      · Daily signal — 1 action for Base founders
    </p>
  </div>`}

  <div style="border-top:1px solid #1A1A2E;padding-top:20px;margin-top:8px">
    <p style="font-size:10px;color:#334155;margin:0">
      Blue Agent × Aeon × MiroShark ·
      <a href="https://blueagent.dev/market" style="color:#4FC3F7;text-decoration:none">blueagent.dev/market</a>
    </p>
  </div>

</body>
</html>`;

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

export async function POST(req: NextRequest) {
  let body: { email?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, tier = "daily" } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (tier !== "daily" && tier !== "weekly") {
    return NextResponse.json({ error: "tier must be 'daily' or 'weekly'" }, { status: 400 });
  }

  // ── Weekly requires x402 USDC payment ───────────────────────────────────────
  if (tier === "weekly") {
    const paymentHeader = req.headers.get("X-PAYMENT");

    if (!paymentHeader) {
      // Return 402 with payment requirements
      return NextResponse.json(
        {
          error: "Payment required",
          x402: {
            accepts: [
              {
                scheme:  "exact",
                network: "base",
                token:   USDC_BASE,
                amount:  WEEKLY_PRICE_USDC,
                payTo:   process.env.PAYMENT_RECIPIENT ?? "0x0000000000000000000000000000000000000000",
              },
            ],
          },
        },
        {
          status: 402,
          headers: {
            "X-Payment-Required": "true",
            "X-Payment-Amount":   WEEKLY_PRICE_USDC,
            "X-Payment-Token":    USDC_BASE,
            "X-Payment-Network":  "base",
          },
        }
      );
    }

    // Payment header present — in production verify onchain here
    // For now: trust header, send welcome
    console.log(`Weekly subscribe payment received for ${email}:`, paymentHeader.slice(0, 40) + "…");
  }

  // ── Send welcome email ───────────────────────────────────────────────────────
  try {
    await sendWelcomeEmail(email, tier as "daily" | "weekly");
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok:    true,
    tier,
    email,
    message: tier === "daily"
      ? "Subscribed! Daily brief arrives every morning at 8am UTC."
      : "Subscribed! First weekly deep report lands next Monday.",
  });
}
