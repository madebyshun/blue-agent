import { NextRequest, NextResponse } from "next/server";
import { buildRobinhoodDeployData } from "@/lib/robinhood/encode";

// Robinhood Chain — EVM chainId 4663 (mainnet) / 46630 (testnet), Arbitrum
// Orbit L2, permissionless deploy. Source: docs.robinhood.com/chain/connecting/
const NETWORKS = {
  testnet: { id: 46630, label: "Robinhood Chain Testnet", explorer: "https://explorer.testnet.chain.robinhood.com" },
  mainnet: { id: 4663,  label: "Robinhood Chain",         explorer: "https://robinhoodchain.blockscout.com" },
} as const;

// Robinhood Chain has no factory precompile (unlike Base's B20) — this is a
// raw contract-creation transaction. `to` is intentionally omitted; the
// user's own connected wallet signs and broadcasts it, chainId 4663.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      symbol,
      decimals = 18,
      initial_supply,
      owner,
      network = "mainnet",
    } = body as {
      name?: string; symbol?: string; decimals?: number;
      initial_supply?: string; owner?: string; network?: string;
    };

    if (!name || !symbol || !owner) {
      return NextResponse.json({ error: "name, symbol, owner required" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return NextResponse.json({ error: "invalid owner address" }, { status: 400 });
    }

    const chain = NETWORKS[(network as keyof typeof NETWORKS)] ?? NETWORKS.mainnet;

    const { data, decimals: dec, initialSupply } = buildRobinhoodDeployData({
      name,
      symbol,
      decimals,
      initialSupply: initial_supply,
      owner: owner as `0x${string}`,
    });

    return NextResponse.json({
      ok: true,
      config: { name, symbol, decimals: dec, initial_supply: initialSupply, owner },
      network,
      chainId: chain.id,
      chainLabel: chain.label,
      explorer: chain.explorer,
      // No `to` — this is a contract-creation tx (deploys to a new address).
      tx: { data, value: "0x0", chainId: chain.id },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
