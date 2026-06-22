import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

const NETWORKS = {
  sepolia: {
    chain:    baseSepolia,
    rpc:      "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
  mainnet: {
    chain:    base,
    rpc:      "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const { tx_hash, network = "sepolia" } = await req.json() as {
      tx_hash?: string; network?: string;
    };

    if (!tx_hash) {
      return NextResponse.json({ error: "tx_hash required" }, { status: 400 });
    }

    const net    = NETWORKS[(network as keyof typeof NETWORKS)] ?? NETWORKS.sepolia;
    const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: tx_hash as `0x${string}` });
    } catch {
      // tx not yet mined
      return NextResponse.json({ ok: true, status: "pending" });
    }

    // B20 token address — addresses start with 0xB20
    let tokenAddress: string | null = null;
    for (const log of receipt.logs) {
      if (log.address?.toLowerCase().startsWith("0xb20")) {
        tokenAddress = log.address;
        break;
      }
    }
    // Fallback: first log emitter
    if (!tokenAddress && receipt.logs[0]) {
      tokenAddress = receipt.logs[0].address;
    }

    return NextResponse.json({
      ok:          true,
      status:      receipt.status,
      tokenAddress,
      blockNumber: Number(receipt.blockNumber),
      gasUsed:     receipt.gasUsed.toString(),
      txUrl:       `${net.explorer}/tx/${tx_hash}`,
      tokenUrl:    tokenAddress ? `${net.explorer}/token/${tokenAddress}` : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
