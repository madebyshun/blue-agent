// POST /api/paymaster?network=base|baseSepolia&t=<sponsorship token>
//
// EIP-7677 paymaster proxy for BlueBank gasless transactions. The client (a
// Coinbase Smart Wallet via EIP-5792 useSendCalls) calls this with the standard
// pm_getPaymasterStubData / pm_getPaymasterData JSON-RPC methods; we forward them
// to the CDP Paymaster & Bundler endpoint server-side so the endpoint token is
// never exposed to the browser. Only paymaster methods are allowlisted.
//
// GATED since 2026-09-30 (plan §1 fix 3; ShunTr chose "gate" over "turn off").
// Until then this route had NO auth: anyone who found the URL could have the
// project sponsor gas for any smart account the CDP allowlist would take. Now
// every call must carry `t`, a token /api/paymaster/token mints for the SIWE
// wallet (lib/paymaster-token.ts — a token, because the WALLET calls this URL
// cross-origin and our session cookie never arrives here), and:
//   • the user operation's `sender` must be that wallet — a leaked URL sponsors
//     nobody else;
//   • its chainId must be the network the token was minted for;
//   • the wallet gets PAYMASTER calls per hour (lib/rate-limit.ts), counted per
//     wallet, not per IP, with an atomic INCR — parallel calls cannot all read
//     "under the limit" — and REFUSED, not waved through, when KV errors.
// A refusal is a JSON-RPC error, and it never strands a send. The page never
// hands the wallet this URL without a fresh token, and /api/paymaster/token
// mints none for a wallet that is not signed in or whose budget is spent, so
// those users send with user-paid gas from the start. A refusal that still
// lands mid-send (the budget ran out between mint and call, or the token
// expired while a wallet popup sat open) makes the wallet reject the batch, and
// the card retries it once WITHOUT the paymaster (sendWithSponsorFallback,
// hooks/useSponsoredGas.ts) — which is what "send without sponsorship" in the
// messages below refers to, and why every message here says "gas sponsorship":
// that phrase is part of how the card recognises a refusal.
//
// Setup: create a Paymaster endpoint per network in the CDP portal
// (portal.cdp.coinbase.com → Paymaster), allowlist the contracts BlueBank calls
// (USDC transfer, Aave Pool, Morpho vault) + your domain, then set:
//   CDP_PAYMASTER_URL_BASE          = https://api.developer.coinbase.com/rpc/v1/base/<token>
//   CDP_PAYMASTER_URL_BASE_SEPOLIA  = https://api.developer.coinbase.com/rpc/v1/base-sepolia/<token>
// Without these the route degrades to { needsPaymaster: true } and the client
// falls back to normal (user-paid-gas) signing.

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  paymasterUpstream,
  verifyPaymasterToken,
  PAYMASTER_CHAIN_ID,
  type PaymasterNetwork,
} from "@/lib/paymaster-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_supportedEntryPoints",
]);

/** The two methods that sponsor a specific user operation. */
const SPONSORS_A_USER_OP = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData"]);

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: 200 });
}

export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const network: PaymasterNetwork = params.get("network") === "baseSepolia" ? "baseSepolia" : "base";
  const upstream = paymasterUpstream(network);
  if (!upstream) return NextResponse.json({ needsPaymaster: true }, { status: 200 });

  let body: { method?: string; id?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON-RPC body" }, { status: 400 });
  }

  // Only forward paymaster methods — never a generic RPC passthrough.
  if (!body?.method || !ALLOWED.has(body.method)) {
    return rpcError(body?.id, -32601, "method not allowed");
  }

  const auth = verifyPaymasterToken(params.get("t"), network);
  if (!auth.ok) {
    return rpcError(
      body.id,
      -32001,
      `gas sponsorship refused (${auth.reason}) — sign in to BlueAgent with this wallet, or send without sponsorship`,
    );
  }

  if (SPONSORS_A_USER_OP.has(body.method)) {
    // EIP-7677: params = [userOp, entryPoint, chainId, context].
    const p = Array.isArray(body.params) ? body.params : [];
    const sender = (p[0] as { sender?: unknown } | undefined)?.sender;
    if (typeof sender !== "string" || sender.toLowerCase() !== auth.wallet) {
      return rpcError(body.id, -32002, "gas sponsorship refused — the operation's sender is not the signed-in wallet");
    }
    const chainId = typeof p[2] === "string" || typeof p[2] === "number" ? Number(p[2]) : NaN;
    if (chainId !== PAYMASTER_CHAIN_ID[network]) {
      return rpcError(body.id, -32003, `gas sponsorship refused — chainId ${String(p[2])} is not ${network}`);
    }
  }

  const rl = await rateLimit(auth.wallet, "paymaster");
  if (!rl.success) {
    return rpcError(
      body.id,
      -32005,
      rl.unavailable
        // KV threw: the budget is unknown, not spent — say which.
        ? "gas sponsorship unavailable right now (its budget could not be checked) — send without sponsorship"
        : "gas sponsorship limit reached for this wallet — try again later, or send without sponsorship",
    );
  }

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (e) {
    return rpcError(body?.id, -32000, (e as Error).message);
  }
}
