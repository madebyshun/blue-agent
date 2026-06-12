// GET /api/onramp/session?address=0x…
//
// Creates a Coinbase Onramp session token (server-side, secure) so the user can
// buy USDC on Base with card / Apple Pay / bank. Auth is a JWT signed with the
// CDP API key. The bought USDC is delivered straight to the user's own wallet —
// non-custodial. Mainnet only. Degrades to { needsKey:true } without a CDP key.

import { NextResponse } from "next/server";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const HOST = "api.developer.coinbase.com";
const PATH = "/onramp/v1/token";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  const keyId = process.env.CDP_API_KEY_ID;
  const keySecret = process.env.CDP_API_KEY_SECRET;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: "invalid address" }, { status: 200 });
  if (!keyId || !keySecret) return NextResponse.json({ needsKey: true }, { status: 200 });

  // .env can't hold a multi-line PEM, so the secret is stored single-line with
  // literal "\n" escapes — restore real newlines for EC PEM keys. Base64
  // Ed25519 keys have no newlines and pass through unchanged.
  const secret = keySecret.includes("\\n") ? keySecret.replace(/\\n/g, "\n") : keySecret;

  try {
    const jwt = await generateJwt({
      apiKeyId: keyId,
      apiKeySecret: secret,
      requestMethod: "POST",
      requestHost: HOST,
      requestPath: PATH,
      expiresIn: 120,
    });

    const res = await fetch(`https://${HOST}${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        addresses: [{ address, blockchains: ["base"] }],
        assets: ["USDC"],
      }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
      return NextResponse.json({ error: data?.message || `onramp ${res.status}` }, { status: 200 });
    }
    return NextResponse.json({ sessionToken: data.token });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
