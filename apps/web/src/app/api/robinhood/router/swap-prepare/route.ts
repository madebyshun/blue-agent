import { NextRequest, NextResponse } from "next/server";
import { buildSwapExactInputSingleETHData, buildSwapExactInputSingleForETHData, buildErc20ApproveData } from "@/lib/robinhood/swap";

// Prepares calldata for a test (or real) swap against the deployed
// RobinhoodSwapRouter. Direction "buy" = ETH -> token (send `amountIn` as tx
// value); "sell" = token -> ETH (requires an approve tx first, this route
// also returns that approve calldata so the client can send it before the
// swap tx).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      router?: string; direction?: "buy" | "sell";
      token?: string; fee?: number;
      amountIn?: string; amountOutMinimum?: string;
      recipient?: string; deadlineSeconds?: number;
    };
    const { router, direction = "buy", token, fee, amountIn, recipient } = body;
    const amountOutMinimum = body.amountOutMinimum ?? "0";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (body.deadlineSeconds ?? 600));

    if (!router || !/^0x[a-fA-F0-9]{40}$/.test(router)) {
      return NextResponse.json({ error: "valid router address required" }, { status: 400 });
    }
    if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
      return NextResponse.json({ error: "valid token address required" }, { status: 400 });
    }
    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return NextResponse.json({ error: "valid recipient address required" }, { status: 400 });
    }
    if (fee == null) return NextResponse.json({ error: "fee tier required (e.g. 100, 500, 3000, 10000)" }, { status: 400 });
    if (!amountIn) return NextResponse.json({ error: "amountIn (base units) required" }, { status: 400 });

    const amountInBig = BigInt(amountIn);
    const amountOutMinBig = BigInt(amountOutMinimum);

    if (direction === "buy") {
      const data = buildSwapExactInputSingleETHData({
        tokenOut: token as `0x${string}`,
        fee,
        amountOutMinimum: amountOutMinBig,
        recipient: recipient as `0x${string}`,
        deadline,
      });
      return NextResponse.json({
        ok: true,
        direction,
        approve: null, // native ETH input — no approve needed
        swap: { to: router, data, value: `0x${amountInBig.toString(16)}` },
      });
    }

    // "sell": token -> ETH. Needs an approve(router, amountIn) first.
    const approveData = buildErc20ApproveData(router as `0x${string}`, amountInBig);
    const swapData = buildSwapExactInputSingleForETHData({
      tokenIn: token as `0x${string}`,
      fee,
      amountIn: amountInBig,
      amountOutMinimum: amountOutMinBig,
      recipient: recipient as `0x${string}`,
      deadline,
    });
    return NextResponse.json({
      ok: true,
      direction,
      approve: { to: token, data: approveData, value: "0x0" },
      swap: { to: router, data: swapData, value: "0x0" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
