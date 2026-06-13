// POST /api/paymaster?network=base|baseSepolia
//
// EIP-7677 paymaster proxy for BlueBank gasless transactions. The client (a
// Coinbase Smart Wallet via EIP-5792 useSendCalls) calls this with the standard
// pm_getPaymasterStubData / pm_getPaymasterData JSON-RPC methods; we forward them
// to the CDP Paymaster & Bundler endpoint server-side so the endpoint token is
// never exposed to the browser. Only paymaster methods are allowlisted.
//
// Setup: create a Paymaster endpoint per network in the CDP portal
// (portal.cdp.coinbase.com → Paymaster), allowlist the contracts BlueBank calls
// (USDC transfer, Aave Pool, Morpho vault) + your domain, then set:
//   CDP_PAYMASTER_URL_BASE          = https://api.developer.coinbase.com/rpc/v1/base/<token>
//   CDP_PAYMASTER_URL_BASE_SEPOLIA  = https://api.developer.coinbase.com/rpc/v1/base-sepolia/<token>
// Without these the route degrades to { needsPaymaster: true } and the client
// falls back to normal (user-paid-gas) signing.

import { NextResponse } from "next/server";

const ALLOWED = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_supportedEntryPoints",
]);

function upstreamFor(network: string): string | undefined {
  return network === "base"
    ? process.env.CDP_PAYMASTER_URL_BASE
    : process.env.CDP_PAYMASTER_URL_BASE_SEPOLIA;
}

export async function POST(req: Request) {
  const network = new URL(req.url).searchParams.get("network") ?? "base";
  const upstream = upstreamFor(network);
  if (!upstream) return NextResponse.json({ needsPaymaster: true }, { status: 200 });

  let body: { method?: string; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON-RPC body" }, { status: 400 });
  }

  // Only forward paymaster methods — never a generic RPC passthrough.
  if (!body?.method || !ALLOWED.has(body.method)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32601, message: "method not allowed" } },
      { status: 200 },
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
    return NextResponse.json(
      { jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32000, message: (e as Error).message } },
      { status: 200 },
    );
  }
}
