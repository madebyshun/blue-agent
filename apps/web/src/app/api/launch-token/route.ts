import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BANKR_DEPLOY = "https://api.bankr.bot/token-launches/deploy";

/**
 * POST /api/launch-token — deploy a token on Base via Bankr's launchpad.
 *
 * Custody model: Blue deploys via Bankr, and the launch's 57% creator-fee
 * share is routed to the *user's* connected wallet via `feeRecipient`. So the
 * user owns the upside without needing a Bankr account or signing anything.
 * Gas is sponsored by Bankr within daily caps (50/day standard, 100 Bankr
 * Club). The deploy is irreversible + public — the UI takes an explicit user
 * confirmation before calling this.
 *
 * Auth (per Bankr docs, EITHER works for POST /token-launches/deploy):
 *   BANKR_PARTNER_KEY  partner key (bk_ptr_…) → X-Partner-Key. Org-level;
 *                      preferred for cleanest fee attribution.
 *   BANKR_API_KEY      wallet-level key (bk_…) → X-API-Key. Also deploys fine
 *                      — this is what a simple Bankr bot uses. Used when no
 *                      partner key is set.
 * At least one must be set. feeRecipient is always sent so creator fees go to
 * the user regardless of key type.
 */
export async function POST(req: NextRequest) {
  // Tight rate limit — this is a real, irreversible onchain deploy.
  const { success } = await rateLimit(getIdentifier(req), "console");
  if (!success) {
    return NextResponse.json({ error: "Too many launches. Slow down." }, { status: 429 });
  }

  // Prefer the partner key (org-level), else use the wallet-level Bankr key —
  // both are valid credentials for /token-launches/deploy.
  const partnerKey = process.env.BANKR_PARTNER_KEY;
  const apiKey     = process.env.BANKR_API_KEY;
  if (!partnerKey && !apiKey) {
    return NextResponse.json(
      { error: "Token launch not configured — set BANKR_PARTNER_KEY or BANKR_API_KEY to enable." },
      { status: 500 },
    );
  }

  let body: {
    tokenName?: string; tokenSymbol?: string;
    feeRecipient?: string; image?: string; website?: string; tweet?: string;
    simulateOnly?: boolean;
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
  if (body.image)        payload.image        = body.image;
  if (body.website)      payload.website      = body.website;
  if (body.tweet)        payload.tweet        = body.tweet;
  // simulateOnly → Bankr predicts the token address + fee split WITHOUT
  // broadcasting (200, not 201). Lets the UI preview safely before the real,
  // irreversible deploy.
  if (body.simulateOnly) payload.simulateOnly = true;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (partnerKey) headers["X-Partner-Key"] = partnerKey;
  else            headers["X-API-Key"]     = apiKey!;

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

  // 429 — Bankr's deploy rate limit. Partner keys are capped at 1/min, 20/day,
  // 1 concurrent *per fee recipient*; user keys at 50/day. Surface a clear,
  // non-alarming message with the retry hint instead of a generic failure.
  if (upstream.status === 429) {
    const retry = upstream.headers.get("retry-after");
    const wait  = retry ? `${retry}s` : "a minute";
    return NextResponse.json(
      {
        error: `Bankr rate limit reached — only 1 launch per minute per wallet (20/day). Wait ${wait} and try again.`,
        rateLimited: true,
        retryAfter: retry ? Number(retry) : null,
      },
      { status: 429 },
    );
  }
  if (!upstream.ok) {
    const detail = typeof data?.error === "string" ? data.error : `status ${upstream.status}`;
    return NextResponse.json({ error: `Bankr launch failed: ${detail}` }, { status: 502 });
  }

  // Surface the result. 201 = deployed (tokenAddress, txHash, pool, fee split);
  // 200 = simulateOnly preview (predicted tokenAddress, no broadcast).
  const tokenAddress =
    (data?.tokenAddress as string) ?? (data?.address as string) ?? null;
  const txHash = (data?.txHash as string) ?? null;
  return NextResponse.json({
    ok: true,
    simulated: !!body.simulateOnly,
    tokenName,
    tokenSymbol,
    tokenAddress,
    txHash,
    feeRecipient,
    raw: data,
    basescan: tokenAddress ? `https://basescan.org/token/${tokenAddress}` : null,
    uniswap:  tokenAddress
      ? `https://app.uniswap.org/swap?outputCurrency=${tokenAddress}&chain=base`
      : null,
  });
}
