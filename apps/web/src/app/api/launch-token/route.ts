import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { recordLaunch } from "@/lib/launches";

export const runtime = "nodejs";
export const maxDuration = 60;

const BANKR_DEPLOY = "https://api.bankr.bot/token-launches/deploy";

/**
 * POST /api/launch-token — deploy a token on Base via Bankr's launchpad.
 *
 * Custody model: Blue deploys via Bankr, and the launch's 57% creator-fee
 * share is routed to the *user's* connected wallet via `feeRecipient`. So the
 * user owns the upside without needing a Bankr account or signing anything.
 * Gas is sponsored by Bankr within daily caps.
 * The deploy is irreversible + public — the UI takes an explicit user
 * confirmation before calling this.
 *
 * Auth: BANKR_API_KEY (bk_usr_…) is sufficient for token deployment — the
 * LLM/chat key has deploy scope. BANKR_PARTNER_KEY (bk_ptr_…) is optional;
 * if set it takes priority (partner keys have higher deploy limits).
 */
export async function POST(req: NextRequest) {
  // Tight rate limit — this is a real, irreversible onchain deploy.
  const { success } = await rateLimit(getIdentifier(req), "console");
  if (!success) {
    return NextResponse.json({ error: "Too many launches. Slow down." }, { status: 429 });
  }

  const partnerKey = process.env.BANKR_PARTNER_KEY;
  const apiKey     = process.env.BANKR_API_KEY;
  if (!partnerKey && !apiKey) {
    return NextResponse.json(
      { error: "Token launch not configured — set BANKR_API_KEY or BANKR_PARTNER_KEY in Vercel env vars." },
      { status: 500 },
    );
  }

  let body: {
    tokenName?: string; tokenSymbol?: string;
    description?: string;
    feeRecipient?: string;          // legacy: raw wallet (treated as type "wallet")
    feeRecipientType?: string;      // "wallet" | "x" | "farcaster" | "ens"
    feeRecipientValue?: string;     // address or handle, per type
    image?: string;
    websiteUrl?: string; website?: string;   // website (back-compat: website)
    tweetUrl?: string;   tweet?: string;      // tweetUrl (back-compat: tweet)
    simulateOnly?: boolean;
  } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const tokenName   = body.tokenName?.trim();
  // tokenSymbol is OPTIONAL per Bankr (defaults to first 4 chars of name).
  const tokenSymbol = body.tokenSymbol?.trim().replace(/^\$/, "") || "";
  const description = body.description?.trim();
  const websiteUrl  = (body.websiteUrl ?? body.website)?.trim();
  const tweetUrl    = (body.tweetUrl   ?? body.tweet)?.trim();

  // Fee recipient — who receives the 57% creator share. Bankr resolves four
  // identity types to a payout wallet:
  //   wallet    → raw EVM address (0x…)
  //   x         → Twitter/X username → the user's Bankr wallet
  //   farcaster → Farcaster username → verified EVM address
  //   ens       → ENS name → underlying address
  const feeType  = (body.feeRecipientType ?? "wallet").toLowerCase();
  const rawValue = (body.feeRecipientValue ?? body.feeRecipient ?? "").trim();
  const ALLOWED_FEE_TYPES = ["wallet", "x", "farcaster", "ens"];

  if (!tokenName || tokenName.length > 100) {
    return NextResponse.json({ error: "tokenName is required (1–100 chars)." }, { status: 400 });
  }
  if (tokenSymbol.length > 10) {
    return NextResponse.json({ error: "tokenSymbol too long (max 10 chars)." }, { status: 400 });
  }
  if (description && description.length > 500) {
    return NextResponse.json({ error: "description too long (max 500 chars)." }, { status: 400 });
  }
  if (!ALLOWED_FEE_TYPES.includes(feeType)) {
    return NextResponse.json({ error: `feeRecipientType must be one of: ${ALLOWED_FEE_TYPES.join(", ")}.` }, { status: 400 });
  }
  // Normalise + validate the value per type.
  let feeValue = rawValue;
  if (feeType === "wallet") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(feeValue)) {
      return NextResponse.json({ error: "feeRecipientType 'wallet' needs a valid 0x… address." }, { status: 400 });
    }
  } else {
    feeValue = feeValue.replace(/^@/, ""); // strip a leading @ from handles
    if (!feeValue) {
      return NextResponse.json({ error: `feeRecipientType '${feeType}' needs a ${feeType === "ens" ? "name" : "username"}.` }, { status: 400 });
    }
  }
  // For the success card + list fallback we still want a wallet to match on
  // when the type IS wallet; non-wallet types resolve server-side at Bankr.
  const feeWallet = feeType === "wallet" ? feeValue : null;

  // Field names per Bankr's deploy schema: tokenSymbol (optional → omit to let
  // Bankr default to the first 4 chars of the name), description, image,
  // websiteUrl, tweetUrl.
  const payload: Record<string, unknown> = { tokenName };

  // feeRecipient is REQUIRED by Bankr's deploy schema — always send it.
  // The UI defaults to type:"x", value:"blueagent_" when user leaves blank,
  // but @blueagent_ may not be a registered Bankr user → resolve fails → 500.
  // Fallback chain: if it's our X default and no connected wallet was provided,
  // we still send it — the UI should always pass the connected wallet address
  // via feeRecipientType:"wallet", feeRecipientValue:"0x…" instead.
  payload.feeRecipient = { type: feeType, value: feeValue };
  if (tokenSymbol)       payload.tokenSymbol  = tokenSymbol;
  if (description)       payload.description  = description;
  if (body.image)        payload.image        = body.image;
  if (websiteUrl)        payload.websiteUrl    = websiteUrl;
  if (tweetUrl)          payload.tweetUrl      = tweetUrl;
  // simulateOnly → Bankr predicts the token address + fee split WITHOUT
  // broadcasting (200, not 201). Lets the UI preview safely before the real,
  // irreversible deploy.
  if (body.simulateOnly) payload.simulateOnly = true;

  // Prefer partner key (higher limits); fall back to LLM/API key.
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
    // Log the full Bankr response for debugging — the error field alone is often
    // too generic ("Internal server error") to diagnose the root cause.
    console.error("[launch-token] Bankr error", upstream.status, JSON.stringify(data));
    const detail = typeof data?.error === "string" ? data.error
      : typeof data?.message === "string" ? data.message
      : `status ${upstream.status}`;
    return NextResponse.json({
      error: `Bankr launch failed: ${detail}`,
      // Debug fields — help diagnose root cause without exposing the key value.
      _debug: {
        bankrStatus: upstream.status,
        bankrBody:   data,
        authUsed:    partnerKey ? "X-Partner-Key" : "X-API-Key",
        sentPayload: payload,
      },
    }, { status: 502 });
  }

  // Surface the result. 201 = deployed (tokenAddress, txHash, pool, fee split);
  // 200 = simulateOnly preview (predicted tokenAddress, no broadcast).
  let tokenAddress =
    (data?.tokenAddress as string) ?? (data?.address as string) ?? null;
  const txHash = (data?.txHash as string) ?? null;

  // Fallback for a real deploy whose response shape doesn't surface the address
  // where we expect: the public GET /token-launches feed lists the 50 most
  // recent launches with the canonical tokenAddress + status. Match ours by
  // feeRecipient + symbol to confirm and recover the address.
  if (!tokenAddress && !body.simulateOnly) {
    try {
      const listRes = await fetch("https://api.bankr.bot/token-launches", {
        signal: AbortSignal.timeout(10_000),
      });
      const list = await listRes.json().catch(() => null) as
        { launches?: Array<{ tokenAddress?: string; tokenSymbol?: string; feeRecipient?: { walletAddress?: string } }> } | null;
      // Match by symbol; additionally pin to our wallet when the fee type is
      // "wallet" (non-wallet types resolve to an address we don't know here).
      const match = list?.launches?.find(l => {
        const symOk = (l?.tokenSymbol ?? "").toLowerCase() === tokenSymbol.toLowerCase();
        if (!symOk) return false;
        if (!feeWallet) return true; // x/farcaster/ens — symbol match is enough
        return l?.feeRecipient?.walletAddress?.toLowerCase() === feeWallet.toLowerCase();
      });
      if (match?.tokenAddress) tokenAddress = match.tokenAddress;
    } catch { /* best-effort — fall through with whatever we have */ }
  }

  const resolvedSymbol = (data?.tokenSymbol as string) || tokenSymbol;

  // Record real deploys (not simulateOnly previews) into the launch registry so
  // the public /app/launches showcase has a durable list. Best-effort — never
  // let bookkeeping block or fail the deploy response.
  if (!body.simulateOnly && tokenAddress) {
    await recordLaunch({
      tokenAddress,
      tokenName,
      tokenSymbol: resolvedSymbol,
      image: body.image ?? null,
      website: websiteUrl ?? null,
      description: description ?? null,
      feeRecipient: { type: feeType, value: feeValue },
      txHash,
      launchedAt: Date.now(),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    simulated: !!body.simulateOnly,
    tokenName,
    // Prefer the symbol Bankr actually used (it may have auto-defaulted it).
    tokenSymbol: resolvedSymbol,
    tokenAddress,
    txHash,
    feeRecipient: { type: feeType, value: feeValue },
    raw: data,
    basescan: tokenAddress ? `https://basescan.org/token/${tokenAddress}` : null,
    uniswap:  tokenAddress
      ? `https://app.uniswap.org/swap?outputCurrency=${tokenAddress}&chain=base`
      : null,
    bankr:    tokenAddress ? `https://bankr.bot/launches/${tokenAddress}` : null,
  });
}

/**
 * GET /api/launch-token — diagnostic: simulateOnly ping to Bankr.
 * Sends a fake token name with simulateOnly: true so Bankr predicts the
 * address without broadcasting. No rate-limit check (diagnostic only).
 * Returns the full Bankr response + which auth header was used.
 */
export async function GET() {
  const partnerKey = process.env.BANKR_PARTNER_KEY;
  const apiKey     = process.env.BANKR_API_KEY;

  if (!partnerKey && !apiKey) {
    return NextResponse.json({ error: "No Bankr key configured." }, { status: 500 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (partnerKey) headers["X-Partner-Key"] = partnerKey;
  else            headers["X-API-Key"]     = apiKey!;

  const testPayload = { tokenName: "DiagnosticTest", simulateOnly: true };

  let upstream: Response;
  try {
    upstream = await fetch(BANKR_DEPLOY, {
      method: "POST",
      headers,
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return NextResponse.json({ error: `Bankr unreachable: ${(e as Error).message}` }, { status: 502 });
  }

  const data = await upstream.json().catch(() => null);
  return NextResponse.json({
    authUsed:    partnerKey ? "X-Partner-Key" : "X-API-Key",
    keyPresent:  partnerKey ? "BANKR_PARTNER_KEY" : "BANKR_API_KEY",
    bankrStatus: upstream.status,
    bankrBody:   data,
    testPayload,
  });
}
