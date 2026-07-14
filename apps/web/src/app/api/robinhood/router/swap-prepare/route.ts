import { NextRequest, NextResponse } from "next/server";
import {
  buildSwapExactInputSingleETHData,
  buildSwapExactInputSingleForETHData,
  buildErc20ApproveData,
  buildTokenToTokenSwapCalldata,
} from "@/lib/robinhood/swap";

// Prepares calldata for a swap against the deployed RobinhoodSwapRouter.
//
// Three modes, chosen by request shape:
//
//   1) direction="buy"  + token   → ETH → token   (single tx, no approve)
//   2) direction="sell" + token   → token → ETH   (approve + single swap)
//   3) tokenIn + token(=tokenOut) → token → token (direct pool if it exists,
//      else 2 sequential single-hop swaps via WETH; if neither route exists
//      the response is a 200 with ok:false + code NO_ROUTE, so the UI can
//      render a clear "no route" state instead of a raw 5xx.)
//
// Backwards-compat: (1) and (2) accept the SAME body shape they always did —
// the only new field is the optional `tokenIn`. When absent (or set to a
// native ETH sentinel), the request routes to the original ETH↔token paths.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      router?: string;
      direction?: "buy" | "sell";
      /** Existing field: for buy = tokenOut, for sell = tokenIn, for token↔token = tokenOut. */
      token?: string;
      /** New optional field. When set (and not the native ETH sentinel), triggers token→token mode. */
      tokenIn?: string;
      fee?: number;
      amountIn?: string;
      amountOutMinimum?: string;
      recipient?: string;
      deadlineSeconds?: number;
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
    if (!amountIn) return NextResponse.json({ error: "amountIn (base units) required" }, { status: 400 });

    // Native-ETH sentinels: absent, empty, all-zeros, or Uniswap's ETH marker.
    // Anything else is treated as an ERC20 tokenIn and switches to token↔token mode.
    const NATIVE_ETH_SENTINELS = new Set<string>([
      "",
      "0x0000000000000000000000000000000000000000",
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    ]);
    const rawTokenIn = (body.tokenIn ?? "").trim().toLowerCase();
    const isTokenToToken = !!rawTokenIn && !NATIVE_ETH_SENTINELS.has(rawTokenIn);

    const amountInBig = BigInt(amountIn);
    const amountOutMinBig = BigInt(amountOutMinimum);

    // ── Mode 3: token → token ────────────────────────────────────────────────
    if (isTokenToToken) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(body.tokenIn as string)) {
        return NextResponse.json({ error: "valid tokenIn address required" }, { status: 400 });
      }
      const result = await buildTokenToTokenSwapCalldata({
        router: router as `0x${string}`,
        tokenIn: body.tokenIn as `0x${string}`,
        tokenOut: token as `0x${string}`,
        amountIn: amountInBig,
        amountOutMinimum: amountOutMinBig,
        recipient: recipient as `0x${string}`,
        deadline,
      });

      if (result.route === null) {
        // Explicitly 200 with ok:false so the UI can distinguish "no route"
        // (a valid answer) from "server broke" (throw → 500).
        return NextResponse.json(
          {
            ok: false,
            error: { code: "NO_ROUTE", message: result.reason ?? "no route available" },
            meta: { route: "none", tokenIn: body.tokenIn, tokenOut: token },
          },
          { status: 200 },
        );
      }
      // Multi-hop leg-2 amountIn is a placeholder (uint256 max) in the current
      // build — the exact WETH output of leg 1 isn't known at prepare time and
      // leg 2 would revert on-chain when the router tried to pull uint256-max
      // WETH from the user's wallet. Until leg 2 is dynamically re-encoded on
      // the client after leg 1 mines (follow-up task), treat multi-hop the
      // same as no-route so the UI shows an honest "no direct route" state
      // instead of a signed tx that will fail. Direct-route continues to work.
      if (result.route === "multi-hop") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "NO_ROUTE",
              message: "No direct Uniswap V3 pool between these tokens on Robinhood Chain. Multi-hop routing via WETH is coming soon — for now, swap tokenIn → ETH, then ETH → tokenOut manually.",
            },
            meta: { route: "none", tokenIn: body.tokenIn, tokenOut: token },
          },
          { status: 200 },
        );
      }

      // Backwards-compat shape: the first approve + first swap are exposed at
      // the top level so existing single-hop clients "just work" if they only
      // read prep.approve/prep.swap. The full `calls` array is under `meta`
      // for the new multi-hop-aware UI.
      const approveCall = result.calls?.find((c) => c.kind === "approve");
      const swapCall = result.calls?.find((c) => c.kind === "swap");
      return NextResponse.json({
        ok: true,
        direction: "token-to-token",
        approve: approveCall
          ? { to: approveCall.to, data: approveCall.data, value: approveCall.value }
          : null,
        swap: swapCall
          ? { to: swapCall.to, data: swapCall.data, value: swapCall.value }
          : null,
        meta: {
          route: result.route,
          tokenIn: body.tokenIn,
          tokenOut: token,
          calls: result.calls,
        },
      });
    }

    // ── Modes 1 & 2: original ETH↔token paths (backwards-compat) ────────────
    if (fee == null) return NextResponse.json({ error: "fee tier required (e.g. 100, 500, 3000, 10000)" }, { status: 400 });

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
        meta: { route: "direct" },
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
      meta: { route: "direct" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
