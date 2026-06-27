import { NextRequest, NextResponse } from "next/server";
import { buildB20Calldata } from "@/lib/b20/encode";

const NETWORKS = {
  sepolia: { id: 84532 },
  mainnet: { id: 8453  },
} as const;

// Timestamp-based Beryl activation — B20 factory is a Rust precompile,
// getCode always returns "0x" even when active.
const BERYL_ACTIVATION: Record<string, number> = {
  sepolia: 1781805600, // 2026-06-18 18:00 UTC
  mainnet: 1782410400, // 2026-06-25 18:00 UTC
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      symbol,
      variant        = "asset",
      decimals       = 18,
      supply_cap,
      initial_supply,
      currency_code,
      admin,
      network        = "sepolia",
    } = body as {
      name?: string; symbol?: string; variant?: string; decimals?: number;
      supply_cap?: string; initial_supply?: string; currency_code?: string;
      admin?: string; network?: string;
    };

    if (!name || !symbol || !admin) {
      return NextResponse.json({ error: "name, symbol, admin required" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(admin)) {
      return NextResponse.json({ error: "invalid admin address" }, { status: 400 });
    }

    const net = NETWORKS[(network as keyof typeof NETWORKS)] ?? NETWORKS.sepolia;

    // Build calldata via shared helper
    const { data, factory, decimals: dec } = buildB20Calldata({
      name, symbol,
      variant:       (variant === "stablecoin" ? "stablecoin" : "asset"),
      decimals,
      supply_cap,
      initial_supply,
      currency_code,
      admin,
    });

    // Timestamp-based activation check (precompile has no EVM bytecode → getCode = "0x")
    const now        = Math.floor(Date.now() / 1000);
    const activation = BERYL_ACTIVATION[network] ?? BERYL_ACTIVATION.sepolia;
    const berylLive  = now >= activation;

    return NextResponse.json({
      ok: true,
      berylLive,
      config: {
        name, symbol,
        variant:       variant === "stablecoin" ? "stablecoin" : "asset",
        decimals:      dec,
        supply_cap:    supply_cap || null,
        initial_supply: initial_supply || null,
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
