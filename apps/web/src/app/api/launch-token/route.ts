import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BANKR_DEPLOY = "https://api.bankr.bot/token-launches/deploy";

/**
 * POST /api/launch-token — deploy a token on Base via Bankr's launchpad.
 *
 * Custody model: Blue deploys with its Bankr **partner key**, but the launch's
 * 57% creator-fee share is routed to the *user's* connected wallet via
 * `feeRecipient`. So the user owns the upside without needing a Bankr account
 * or signing anything. The deploy itself is irreversible + public — the UI
 * must take an explicit user confirmation before calling this.
 *
 * Env:
 *   BANKR_PARTNER_KEY  partner key (bk_ptr_…) — REQUIRED. Routing the creator
 *                      fee to an arbitrary feeRecipient (the user's wallet) is
 *                      a partner-deployment capability, so only a partner key
 *                      does this correctly.
 *
 * We deliberately do NOT fall back to BANKR_API_KEY: that key powers the LLM
 * gateway and is tied to a funded Bankr wallet. Per Bankr's skill-install docs
 * ("your API key is tied to a wallet and all its funds"), using it for deploys
 * would (a) expose that wallet and (b) make *it* the creator instead of the
 * user. A dedicated partner key is the only correct credential here.
 */
export async function POST(req: NextRequest) {
  // Tight rate limit — this is a real, irreversible onchain deploy.
  const { success } = await rateLimit(getIdentifier(req), "console");
  if (!success) {
    return NextResponse.json({ error: "Too many launches. Slow down." }, { status: 429 });
  }

  // Partner key only — never the LLM/personal BANKR_API_KEY (see header note).
  const partnerKey = process.env.BANKR_PARTNER_KEY;
  if (!partnerKey) {
    return NextResponse.json(
      { error: "Token launch not configured — set BANKR_PARTNER_KEY (a dedicated Bankr partner key, bk_ptr_…) to enable." },
      { status: 500 },
    );
  }

  let body: {
    tokenName?: string; tokenSymbol?: string;
    feeRecipient?: string; image?: string; website?: string; tweet?: string;
  } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const tokenName   = body.tokenName?.trim();
  const tokenSymbol = body.tokenSymbol?.trim().replace(/^\$/, "");
  const feeRecipient = body.feeRecipient?.trim();

  if (!tokenName || !tokenSymbol) {
    return NextResponse.json({ error: "tokenName and tokenSymbol are required." }, { status: 400 });
  }
  if (tokenSymbol.length > 10) {
    return NextResponse.json({ error: "tokenSymbol too long (max 10 chars)." }, { status: 400 });
  }
  // feeRecipient must be the user's wallet so the 57% creator share is theirs.
  if (!feeRecipient || !/^0x[a-fA-F0-9]{40}$/.test(feeRecipient)) {
    return NextResponse.json(
      { error: "A valid feeRecipient wallet (0x…) is required so creator fees go to you." },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    tokenName,
    tokenSymbol,
    feeRecipient: { type: "wallet", value: feeRecipient },
  };
  if (body.image)   payload.image   = body.image;
  if (body.website) payload.website = body.website;
  if (body.tweet)   payload.tweet   = body.tweet;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Partner-Key": partnerKey,
  };

  let upstream: Response;
  try {
    upstream = await fetch(BANKR_DEPLOY, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError"
      ? "Bankr did not respond within 50s — the launch may still be processing. Check /token-launches before retrying."
      : `Bankr launchpad unreachable: ${(e as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null) as Record<string, unknown> | null;
  if (!upstream.ok) {
    const detail = typeof data?.error === "string" ? data.error : `status ${upstream.status}`;
    return NextResponse.json({ error: `Bankr launch failed: ${detail}` }, { status: 502 });
  }

  // Surface the launch result. Bankr returns the token address + V4 pool; we
  // pass through whatever it gives plus a couple of convenience links.
  const tokenAddress =
    (data?.tokenAddress as string) ?? (data?.address as string) ?? null;
  return NextResponse.json({
    ok: true,
    tokenName,
    tokenSymbol,
    tokenAddress,
    feeRecipient,
    raw: data,
    basescan: tokenAddress ? `https://basescan.org/token/${tokenAddress}` : null,
    uniswap:  tokenAddress
      ? `https://app.uniswap.org/swap?outputCurrency=${tokenAddress}&chain=base`
      : null,
  });
}
