/**
 * Venice Crypto RPC proxy
 *
 * Proxies JSON-RPC calls to Venice's onchain data layer.
 * Venice supports 21 EVM-compatible networks.
 *
 * Usage: POST /api/crypto-rpc
 *   { network: "base", method: "eth_getBalance", params: ["0x...", "latest"] }
 *
 * Venice docs: https://docs.venice.ai/api-reference/crypto-rpc
 */

import { NextRequest, NextResponse } from "next/server";

const VENICE_RPC = "https://api.venice.ai/api/v1/crypto/rpc";

// Supported Venice networks (venice network ID → display name)
const VENICE_NETWORKS: Record<string, string> = {
  base:             "Base",
  ethereum:         "Ethereum",
  arbitrum:         "Arbitrum One",
  optimism:         "Optimism",
  polygon:          "Polygon",
  avalanche:        "Avalanche",
  bsc:              "BNB Smart Chain",
  fantom:           "Fantom",
  gnosis:           "Gnosis",
  zksync:           "zkSync Era",
  linea:            "Linea",
  scroll:           "Scroll",
  mantle:           "Mantle",
  blast:            "Blast",
  mode:             "Mode",
  zora:             "Zora",
  celo:             "Celo",
  moonbeam:         "Moonbeam",
  cronos:           "Cronos",
  kava:             "Kava",
  metis:            "Metis",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Venice Crypto RPC not configured." },
      { status: 503 }
    );
  }

  let body: { network?: string; method?: string; params?: unknown[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { network = "base", method, params = [] } = body;

  if (!method) {
    return NextResponse.json({ error: "method is required." }, { status: 400 });
  }

  if (!VENICE_NETWORKS[network]) {
    return NextResponse.json(
      { error: `Unsupported network: ${network}. Supported: ${Object.keys(VENICE_NETWORKS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${VENICE_RPC}/${network}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id:      1,
        method,
        params,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Venice RPC error ${res.status}`, detail: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: `RPC request failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
