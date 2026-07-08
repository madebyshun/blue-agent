import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";

const client = createPublicClient({
  chain: robinhoodMainnet,
  transport: http("https://rpc.mainnet.chain.robinhood.com"),
});

export async function POST(req: NextRequest) {
  try {
    const { tx_hash } = (await req.json()) as { tx_hash?: string };
    if (!tx_hash) return NextResponse.json({ error: "tx_hash required" }, { status: 400 });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: tx_hash as `0x${string}` });
    } catch {
      return NextResponse.json({ ok: true, status: "pending" });
    }

    const routerAddress = receipt.contractAddress ?? null;
    return NextResponse.json({
      ok: true,
      status: receipt.status,
      routerAddress,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      txUrl: `https://robinhoodchain.blockscout.com/tx/${tx_hash}`,
      routerUrl: routerAddress ? `https://robinhoodchain.blockscout.com/address/${routerAddress}` : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
