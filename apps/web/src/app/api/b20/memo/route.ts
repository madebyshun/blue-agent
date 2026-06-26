import { NextRequest, NextResponse } from "next/server";
import { checkMemo } from "@/lib/b20/check-memo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { tx_hash, txHash, network } = (await req.json()) as {
      tx_hash?: string;
      txHash?: string;
      network?: string;
    };
    const hash = (txHash ?? tx_hash ?? "").trim();
    if (!hash) {
      return NextResponse.json({ error: "tx_hash required" }, { status: 400 });
    }
    const result = await checkMemo(hash, network);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
