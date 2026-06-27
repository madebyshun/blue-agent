import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * POST /api/claim-fees — build the unsigned tx(s) to claim a token's creator
 * fees. Thin proxy over Bankr's PUBLIC, UNAUTHENTICATED claim builder
 * (verified live 2026-06-27):
 *   POST https://api.bankr.bot/public/doppler/build-claim
 *   body: { beneficiaryAddress, tokenAddresses[] }
 *   → { transactions: [{ to, data, chainId: 8453, gasEstimate, … }], errors[] }
 *
 * The claim is an ONCHAIN transaction — Bankr returns calldata, the USER signs
 * it from their own connected wallet (wagmi sendTransaction on the client). No
 * auth here: "the signing wallet's private key is the authorization." We proxy
 * only to avoid browser CORS and to normalise the response.
 */

const BANKR_BUILD_CLAIM = "https://api.bankr.bot/public/doppler/build-claim";

export interface ClaimTx {
  to: string;
  data: string;
  chainId: number;
  gasEstimate?: string;
  description?: string;
}

export interface ClaimResponse {
  ok: boolean;
  transactions: ClaimTx[];
  errors?: unknown[];
  error?: string;
}

export async function POST(req: NextRequest) {
  let body: { beneficiaryAddress?: string; tokenAddress?: string; tokenAddresses?: string[] } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json<ClaimResponse>({ ok: false, transactions: [], error: "Invalid JSON body." }, { status: 400 }); }

  const beneficiaryAddress = (body.beneficiaryAddress ?? "").trim();
  // Accept a single tokenAddress or an array.
  const tokenAddresses = (body.tokenAddresses ?? (body.tokenAddress ? [body.tokenAddress] : []))
    .map((t) => (t ?? "").trim())
    .filter((t) => /^0x[a-fA-F0-9]{40}$/.test(t));

  if (!/^0x[a-fA-F0-9]{40}$/.test(beneficiaryAddress)) {
    return NextResponse.json<ClaimResponse>({ ok: false, transactions: [], error: "Invalid beneficiary address." }, { status: 400 });
  }
  if (tokenAddresses.length === 0) {
    return NextResponse.json<ClaimResponse>({ ok: false, transactions: [], error: "No valid token address supplied." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(BANKR_BUILD_CLAIM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ beneficiaryAddress, tokenAddresses }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError"
      ? "Bankr did not respond in time. Try again."
      : `Bankr claim builder unreachable: ${(e as Error).message}`;
    return NextResponse.json<ClaimResponse>({ ok: false, transactions: [], error: msg }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => null)) as
    | { transactions?: Array<Record<string, unknown>>; errors?: unknown[] }
    | null;

  if (!upstream.ok || !data) {
    return NextResponse.json<ClaimResponse>(
      { ok: false, transactions: [], error: `Bankr returned status ${upstream.status}.` },
      { status: 502 },
    );
  }

  const transactions: ClaimTx[] = (Array.isArray(data.transactions) ? data.transactions : [])
    .map((t) => ({
      to: String(t.to ?? ""),
      data: String(t.data ?? ""),
      chainId: typeof t.chainId === "number" ? t.chainId : 8453,
      gasEstimate: t.gasEstimate ? String(t.gasEstimate) : undefined,
      description: t.description ? String(t.description) : undefined,
    }))
    .filter((t) => /^0x[a-fA-F0-9]{40}$/.test(t.to) && t.data.startsWith("0x"));

  if (transactions.length === 0) {
    return NextResponse.json<ClaimResponse>(
      { ok: false, transactions: [], errors: data.errors, error: "Nothing to claim — no unclaimed fees for this token." },
      { status: 200 },
    );
  }

  return NextResponse.json<ClaimResponse>({ ok: true, transactions, errors: data.errors });
}
