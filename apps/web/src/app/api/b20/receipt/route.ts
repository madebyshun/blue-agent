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

    // B20 token address — parse from B20Created event emitted by the factory.
    // The token address is in topic[1] (last 20 bytes), NOT log.address (= factory).
    const B20_FACTORY     = "0xb20f000000000000000000000000000000000000";
    const B20_CREATED_SIG = "0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d";

    let tokenAddress: string | null = null;

    // Primary: B20Created event from factory — topic[1] holds the token address
    for (const log of receipt.logs) {
      if (
        log.address?.toLowerCase() === B20_FACTORY &&
        log.topics[0]?.toLowerCase() === B20_CREATED_SIG &&
        log.topics[1]
      ) {
        tokenAddress = "0x" + log.topics[1].slice(-40);
        break;
      }
    }

    // Fallback: any log emitted by an address starting 0xb20 that is NOT the factory
    if (!tokenAddress) {
      for (const log of receipt.logs) {
        const addr = log.address?.toLowerCase();
        if (addr && addr.startsWith("0xb20") && addr !== B20_FACTORY) {
          tokenAddress = log.address;
          break;
        }
      }
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
