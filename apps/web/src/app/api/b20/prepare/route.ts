import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { buildB20Calldata } from "@/lib/b20/encode";

const NETWORKS = {
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", id: 84532 },
  mainnet: { chain: base,        rpc: "https://mainnet.base.org",  id: 8453  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      symbol,
      variant       = "asset",
      decimals      = 18,
      supply_cap,
      currency_code,
      admin,
      network       = "sepolia",
    } = body as {
      name?: string; symbol?: string; variant?: string; decimals?: number;
      supply_cap?: string; currency_code?: string; admin?: string; network?: string;
    };

    if (!name || !symbol || !admin) {
      return NextResponse.json({ error: "name, symbol, admin required" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(admin)) {
      return NextResponse.json({ error: "invalid admin address" }, { status: 400 });
    }

    const net    = NETWORKS[(network as keyof typeof NETWORKS)] ?? NETWORKS.sepolia;
    const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });

    // Build calldata via shared helper
    const { data, factory, decimals: dec } = buildB20Calldata({
      name, symbol,
      variant:       (variant === "stablecoin" ? "stablecoin" : "asset"),
      decimals,
      supply_cap,
      currency_code,
      admin,
    });

    // Verify Beryl activated — check factory has code
    const code     = await client.getCode({ address: factory });
    const berylLive = !!code && code !== "0x";

    return NextResponse.json({
      ok: true,
      berylLive,
      config: {
        name, symbol,
        variant:       variant === "stablecoin" ? "stablecoin" : "asset",
        decimals:      dec,
        supply_cap:    supply_cap || null,
        currency_code: variant === "stablecoin" ? (currency_code || "USD") : null,
      },
      factory,
      network,
      chainId: net.id,
      tx: { to: factory, data, value: "0x0", chainId: net.id },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
