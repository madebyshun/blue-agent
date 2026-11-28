/**
 * POST /api/chat/e2ee — Strict Blind Relay for Venice E2EE models.
 *
 * Security invariants:
 *   1. Refuses any request where a `user` or `system` message is NOT valid
 *      hex-encoded ciphertext (`isHexEncrypted`), so plaintext can never leak
 *      to this server even if a client is misconfigured.
 *   2. Requires all three `X-Venice-TEE-*` headers and a Venice TEE/E2EE model.
 *   3. Never logs prompt/response bodies and never writes conversation history.
 *   4. Honors the VVV/DIEM Holder Perk (0-credit Private TEE/E2EE for Base
 *      wallets holding >= 0.1 DIEM or >= 100 sVVV).
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { isVeniceTeeModelId } from "@/lib/venice-privacy";
import { isHexEncrypted, validateClientPubkey } from "@/lib/venice-e2ee";
import { normalizeWallet, resolveActingWallet } from "@/lib/acting-wallet";
import { evaluateVeniceHolderPerk, isPresetFreeForVeniceHolder, readVeniceOnchainBalances } from "@/lib/venice-vvv";

export const runtime = "nodejs";
export const maxDuration = 120;

const VENICE_CHAT_ENDPOINT = "https://api.venice.ai/api/v1/chat/completions";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

export async function POST(req: NextRequest) {
  const { success } = await rateLimit(getIdentifier(req), "chat");
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const clientPub = req.headers.get("x-venice-tee-client-pub-key") ?? "";
  const modelPub = req.headers.get("x-venice-tee-model-pub-key") ?? "";
  const signingAlgo = req.headers.get("x-venice-tee-signing-algo") ?? "";

  try {
    validateClientPubkey(clientPub);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!modelPub || !/^(?:04)?[0-9a-fA-F]{128}$/.test(modelPub.replace(/^0x/i, ""))) {
    return NextResponse.json({ error: "Missing or invalid X-Venice-TEE-Model-Pub-Key header." }, { status: 400 });
  }
  if (signingAlgo !== "ecdsa") {
    return NextResponse.json({ error: "X-Venice-TEE-Signing-Algo must be 'ecdsa'." }, { status: 400 });
  }

  let body: {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
    address?: string;
    max_tokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const model = (body.model ?? "").trim();
  if (!isVeniceTeeModelId(model)) {
    return NextResponse.json({ error: "Model must be a Venice TEE/E2EE model." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Encrypted messages array required." }, { status: 400 });
  }

  // Blind-relay guardrail: refuse plaintext in any message role.
  for (const m of body.messages) {
    if (!isHexEncrypted(m.content ?? "")) {
      return NextResponse.json(
        { error: "Blind relay rejected plaintext message: all messages must be E2EE hex ciphertext." },
        { status: 400 },
      );
    }
  }

  const apiKey = process.env.VENICE_API_KEY || process.env.VENICE_INFERENCE_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "Venice API key is not configured on the server." }, { status: 503 });
  }

  // Wallet auth & credit billing (honoring VVV/DIEM holder perk for `tee`).
  // FAIL CLOSED (review 2026-11-28): this route spends Blue's Venice key, so
  // every call needs a signed-in wallet and a successful credit spend (or the
  // holder perk). Before, a request with no `address`, a missing
  // INTERNAL_SERVICE_KEY, or a spend call that errored all ran free.
  const claimedWallet = normalizeWallet(body.address);
  const acting = await resolveActingWallet(req, claimedWallet);
  if (acting.status !== "ok") {
    return NextResponse.json({ error: "Sign in with your wallet to use Strict E2EE." }, { status: 401 });
  }
  const payer = acting.wallet;
  if (!INTERNAL_KEY) {
    return NextResponse.json({ error: "Credit metering is not configured; Strict E2EE is unavailable." }, { status: 503 });
  }

  {
    const vBal = await readVeniceOnchainBalances(payer).catch(() => null);
    const perk = evaluateVeniceHolderPerk(vBal);
    if (!isPresetFreeForVeniceHolder("tee", perk)) {
      const { fetchBlueBalance, getTierInfo } = await import("@/lib/credits");
      const { chatCreditCost } = await import("@/lib/credit-pricing");
      const cost = chatCreditCost("tee", getTierInfo(await fetchBlueBalance(payer)));
      if (cost > 0) {
        const ref = `chat:e2ee:${crypto.randomUUID()}`;
        const spendRes = await fetch(`${BASE_URL}/api/credits/spend`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Blue-Internal": INTERNAL_KEY },
          body: JSON.stringify({ address: payer, amount: cost, reason: "chat:tee-e2ee", ref }),
          signal: AbortSignal.timeout(8_000),
        }).catch(() => null);
        if (spendRes?.status === 402) {
          return NextResponse.json({ error: "Insufficient credits for Strict E2EE." }, { status: 402 });
        }
        if (!spendRes?.ok) {
          return NextResponse.json({ error: "Could not charge credits right now; nothing was sent." }, { status: 503 });
        }
      }
    }
  }

  try {
    const upstream = await fetch(VENICE_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Venice-TEE-Client-Pub-Key": clientPub,
        "X-Venice-TEE-Model-Pub-Key": modelPub,
        "X-Venice-TEE-Signing-Algo": "ecdsa",
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        stream: true,
        max_tokens: Math.min(Math.max(body.max_tokens ?? 2048, 256), 4096),
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Venice E2EE upstream HTTP ${upstream.status}${errText ? `: ${errText.slice(0, 140)}` : ""}` },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `E2EE relay error: ${(e as Error).message.slice(0, 120)}` }, { status: 502 });
  }
}
