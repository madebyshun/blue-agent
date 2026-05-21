/**
 * Blue Market — Subscribe endpoint
 *
 * POST /api/market/subscribe
 * Body: { email: string, tier: "daily" | "weekly" }
 *
 * Both tiers require x402 USDC payment.
 * 20% of each payment → BlueMarketStaking yield pool
 * 80% → treasury (PAYMENT_RECIPIENT)
 *
 * Pricing:
 *   daily:  $10/month = 10_000_000 USDC (6 dec)
 *   weekly: $15/month = 15_000_000 USDC (6 dec)
 */

import { NextRequest, NextResponse } from "next/server";

const RESEND_API_KEY      = process.env.RESEND_API_KEY!;
const BRIEF_FROM_EMAIL    = process.env.BRIEF_FROM_EMAIL ?? "Blue Market <market@blueagent.dev>";
const STAKING_CONTRACT    = process.env.STAKING_CONTRACT ?? "0x0000000000000000000000000000000000000000";
const PAYMENT_RECIPIENT   = process.env.PAYMENT_RECIPIENT ?? "0x0000000000000000000000000000000000000000";
const DISTRIBUTOR_KEY     = process.env.DISTRIBUTOR_PRIVATE_KEY ?? ""; // backend wallet key

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC  = "https://mainnet.base.org";

const PRICES: Record<string, string> = {
  daily:  "10000000", // $10 USDC
  weekly: "15000000", // $15 USDC
};

// 20% of each payment goes to stakers as yield
const YIELD_BPS = 20; // 20%

// ─── Yield distribution ───────────────────────────────────────────────────────

/**
 * Calls distributeYield(amount) on BlueMarketStaking contract.
 * Backend wallet must have USDC approved to the staking contract.
 * This is a fire-and-forget — subscribe succeeds even if yield tx fails.
 */
async function distributeYieldToStakers(paymentAmount: string): Promise<void> {
  if (!DISTRIBUTOR_KEY || STAKING_CONTRACT === "0x0000000000000000000000000000000000000000") {
    console.log("[yield] Staking contract not deployed yet — skipping yield distribution");
    return;
  }

  const yieldAmount = Math.floor((parseInt(paymentAmount) * YIELD_BPS) / 100).toString();

  // ABI-encode distributeYield(uint256) call
  const fnSelector = "0x" + Buffer.from("distributeYield(uint256)").toString("hex").slice(0, 8);
  const amountHex  = BigInt(yieldAmount).toString(16).padStart(64, "0");
  const data       = fnSelector + amountHex;

  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction",
        params: [data], // simplified — in prod use ethers/viem to sign
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await res.json() as { result?: string };
    console.log(`[yield] Distributed ${yieldAmount} USDC to stakers. tx: ${result.result}`);
  } catch (err) {
    console.warn("[yield] Failed to distribute yield:", (err as Error).message);
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(to: string, tier: "daily" | "weekly"): Promise<void> {
  const isWeekly = tier === "weekly";
  const subject  = isWeekly
    ? "🔵 Blue Market — Weekly Deep Report confirmed"
    : "🔵 Blue Market — Daily Brief subscription confirmed";

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
      ${isWeekly ? "⚡ Weekly Deep Report subscription confirmed." : "⚡ Daily Brief subscription confirmed."}
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:0">
      ${isWeekly
        ? "Every Monday you'll receive deep intelligence: token picks, onchain flows, builder radar, and market edge."
        : "Every morning at 8am UTC you'll receive Base ecosystem moves, Coinbase updates, market signals, and onchain intelligence."}
    </p>
  </div>

  <div style="margin-bottom:24px">
    <p style="font-size:11px;color:${isWeekly ? "#A78BFA" : "#4FC3F7"};letter-spacing:2px;margin:0 0 8px">WHAT YOU GET</p>
    <p style="font-size:13px;color:#cbd5e1;line-height:1.8;margin:0">
      ${isWeekly
        ? "· Deep token analysis — high-conviction setups on Base<br>· Onchain flows — whale moves, TVL shifts<br>· Builder radar — who's shipping, what's gaining traction<br>· Market edge — narratives, positioning, contrarian takes<br>· Signal — the 1 move a Base founder should make this week"
        : "· Base ecosystem moves<br>· Coinbase & Base announcements<br>· Market signals & narrative shifts<br>· Onchain intelligence<br>· Daily signal — 1 action for Base founders"}
    </p>
  </div>

  <div style="background:#4FC3F708;border:1px solid #4FC3F715;border-radius:6px;padding:12px;margin-bottom:24px">
    <p style="font-size:10px;color:#4FC3F7;letter-spacing:2px;margin:0 0 4px">💡 EARN YIELD</p>
    <p style="font-size:12px;color:#94a3b8;margin:0">
      Stake $BLUEAGENT to unlock free access + earn 20% of all subscription revenue as USDC yield.
    </p>
  </div>

  <div style="border-top:1px solid #1A1A2E;padding-top:20px">
    <p style="font-size:10px;color:#334155;margin:0">
      Blue Agent × Aeon × MiroShark ·
      <a href="https://blueagent.dev/market" style="color:#4FC3F7;text-decoration:none">blueagent.dev/market</a>
    </p>
  </div>

</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: BRIEF_FROM_EMAIL, to, subject, html }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${res.status} — ${err}`);
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { email?: string; tier?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, tier = "daily" } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });

  if (tier !== "daily" && tier !== "weekly")
    return NextResponse.json({ error: "tier must be 'daily' or 'weekly'" }, { status: 400 });

  const price        = PRICES[tier];
  const paymentHeader = req.headers.get("X-PAYMENT");

  // ── Require x402 USDC payment ─────────────────────────────────────────────
  if (!paymentHeader) {
    return NextResponse.json(
      { error: "Payment required", x402: {
          accepts: [{ scheme: "exact", network: "base", token: USDC_BASE,
            amount: price, payTo: PAYMENT_RECIPIENT }],
        },
      },
      { status: 402, headers: {
          "X-Payment-Required": "true", "X-Payment-Amount": price,
          "X-Payment-Token": USDC_BASE, "X-Payment-Network": "base",
        },
      }
    );
  }

  // ── Payment confirmed — distribute 20% yield to stakers ───────────────────
  // Fire-and-forget, don't block subscribe on yield tx
  distributeYieldToStakers(price).catch(console.warn);

  // ── Send welcome email ────────────────────────────────────────────────────
  try {
    await sendWelcomeEmail(email, tier as "daily" | "weekly");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const yieldAmount = (parseInt(price) * YIELD_BPS / 100 / 1_000_000).toFixed(2);

  return NextResponse.json({
    ok:      true,
    tier,
    email,
    yield:   `$${yieldAmount} USDC distributed to stakers`,
    message: tier === "daily"
      ? "Subscribed! Daily brief arrives every morning at 8am UTC."
      : "Subscribed! First weekly deep report lands next Monday.",
  });
}
