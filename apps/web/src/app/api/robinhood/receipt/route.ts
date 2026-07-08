import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { recordLaunch } from "@/lib/launches";
import { robinhoodMainnet, robinhoodTestnet } from "@/lib/robinhood/chains";

const NETWORKS = {
  testnet: { chain: robinhoodTestnet, rpc: "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com" },
  mainnet: { chain: robinhoodMainnet, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
} as const;

export async function POST(req: NextRequest) {
  try {
    const {
      tx_hash,
      network = "mainnet",
      // Optional metadata to persist into the /launches registry once confirmed.
      tokenName,
      tokenSymbol,
      image,
      website,
      description,
      owner,
    } = await req.json() as {
      tx_hash?: string; network?: string;
      tokenName?: string; tokenSymbol?: string;
      image?: string; website?: string; description?: string; owner?: string;
    };

    if (!tx_hash) {
      return NextResponse.json({ error: "tx_hash required" }, { status: 400 });
    }

    const net = NETWORKS[(network as keyof typeof NETWORKS)] ?? NETWORKS.mainnet;
    const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: tx_hash as `0x${string}` });
    } catch {
      // tx not yet mined
      return NextResponse.json({ ok: true, status: "pending" });
    }

    // Plain ERC-20 contract-creation tx — the deployed address is a standard
    // receipt field, no event-log parsing needed (unlike B20's factory).
    const tokenAddress = receipt.contractAddress ?? null;

    if (receipt.status === "success" && tokenAddress && tokenName && tokenSymbol && owner) {
      await recordLaunch({
        tokenAddress,
        tokenName,
        tokenSymbol,
        image: image || null,
        website: website || null,
        description: description || null,
        feeRecipient: { type: "wallet", value: owner },
        txHash: tx_hash,
        launchedAt: Date.now(),
        chain: "robinhood",
        chainId: net.chain.id,
      });
    }

    return NextResponse.json({
      ok:          true,
      status:      receipt.status,
      tokenAddress,
      blockNumber: Number(receipt.blockNumber),
      gasUsed:     receipt.gasUsed.toString(),
      txUrl:       `${net.explorer}/tx/${tx_hash}`,
      tokenUrl:    tokenAddress ? `${net.explorer}/address/${tokenAddress}` : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
