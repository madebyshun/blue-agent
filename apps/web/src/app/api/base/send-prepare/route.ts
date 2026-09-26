/**
 * Prepares calldata for a NON-CUSTODIAL ERC-20 (or native ETH) transfer on
 * Base (chainId 8453). The server only builds the tx — the user's own wallet
 * signs and broadcasts. We hold no keys, move no funds.
 *
 * WHY THIS ROUTE DID NOT EXIST UNTIL NOW, WHICH IS THE INTERESTING PART
 * --------------------------------------------------------------------
 * Robinhood Chain 4663 has had `api/robinhood/router/send-prepare` since the RH
 * desk shipped. Base — the PRIMARY chain, the one every piece of product copy
 * leads with — had nothing. The chat tool `prepare_send` reads
 * `args.network === "robinhood" ? "robinhood" : "base"` and emits a card
 * MARKER; on the RH branch a real calldata route stands behind that marker, and
 * on the Base branch nothing did. The asymmetry was invisible because the
 * marker looks identical either way.
 *
 * So: the chain we talk about most was the chain we could not build a transfer
 * for. That is the shape of gap a count of routes never shows you — both
 * branches exist, only one of them arrives somewhere.
 *
 * Shape MIRRORS `api/robinhood/router/send-prepare` exactly, deliberately:
 *   POST { fromAddress, toAddress, token, amount }
 *      → { ok, tx: { to, data, value, chainId }, meta }
 * Two routes that answer the same question in the same shape can be wrapped by
 * one caller that only switches a URL (see `blue_send_tx` in api/mcp/route.ts).
 * If you change a field name here, change it there in the same commit.
 *
 * `amount` is a DECIMAL STRING IN WHOLE UNITS ("25.5"), never base units — see
 * the header of lib/tx-chains.ts for why that is a correctness rule and not a
 * convenience.
 */
import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData, parseUnits, isAddress, getAddress } from "viem";
import { ERC20_ABI, TX_CHAINS, isNativeToken, isPositiveDecimal, readTokenMeta } from "@/lib/tx-chains";

export const runtime = "nodejs";
export const maxDuration = 15;

const CHAIN_ID = TX_CHAINS.base.chainId;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fromAddress?: string; toAddress?: string; token?: string; amount?: string | number;
    };
    const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
    const toAddress   = typeof body.toAddress   === "string" ? body.toAddress.trim()   : "";
    const rawToken    = typeof body.token       === "string" ? body.token.trim()       : "";
    const amountStr   = body.amount != null ? String(body.amount).trim() : "";

    if (!isAddress(fromAddress)) {
      return NextResponse.json({ error: "valid fromAddress required (0x…)" }, { status: 400 });
    }
    if (!isAddress(toAddress)) {
      return NextResponse.json({ error: "valid toAddress required (0x…)" }, { status: 400 });
    }
    if (!rawToken) {
      return NextResponse.json({ error: "token required (0x… address, or 'ETH'/'NATIVE')" }, { status: 400 });
    }
    if (!amountStr) {
      return NextResponse.json({ error: "amount required (decimal string in whole units, e.g. '25.5')" }, { status: 400 });
    }
    if (!isPositiveDecimal(amountStr)) {
      return NextResponse.json({ error: "amount must be a positive decimal string in whole units, e.g. '25.5'" }, { status: 400 });
    }

    const from = getAddress(fromAddress);
    const to   = getAddress(toAddress);

    // ── Native ETH transfer ──────────────────────────────────────────────
    if (isNativeToken(rawToken)) {
      let value: bigint;
      try {
        value = parseUnits(amountStr, 18);
      } catch (e) {
        return NextResponse.json({ error: `invalid amount: ${(e as Error).message}` }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        tx: { to, data: "0x", value: value.toString(), chainId: CHAIN_ID },
        meta: {
          kind:      "native" as const,
          from,
          recipient: to,
          symbol:    "ETH",
          decimals:  18,
          amount:    amountStr,
          amountWei: value.toString(),
          chainId:   CHAIN_ID,
          chain:     "base" as const,
          explorer:  `${TX_CHAINS.base.explorer}/address/${to}`,
        },
      });
    }

    // ── ERC-20 transfer ──────────────────────────────────────────────────
    if (!isAddress(rawToken)) {
      return NextResponse.json({ error: "token must be a 0x… address or 'ETH'/'NATIVE'" }, { status: 400 });
    }
    const token = getAddress(rawToken);

    let decimals: number;
    let symbol: string;
    try {
      ({ decimals, symbol } = await readTokenMeta("base", token));
    } catch (e) {
      // decimals() reverted, the RPC is unreachable, or the contract returned
      // garbage. 502 = upstream (chain / token contract) failed, NOT a bad
      // request shape — an agent must retry the chain, not rewrite its args.
      return NextResponse.json(
        { error: `token contract read failed on Base 8453: ${(e as Error).message}` },
        { status: 502 },
      );
    }

    let amountWei: bigint;
    try {
      amountWei = parseUnits(amountStr, decimals);
    } catch (e) {
      return NextResponse.json({ error: `invalid amount for ${decimals}-decimal token: ${(e as Error).message}` }, { status: 400 });
    }

    const data = encodeFunctionData({
      abi:          ERC20_ABI,
      functionName: "transfer",
      args:         [to, amountWei],
    });

    return NextResponse.json({
      ok: true,
      tx: {
        to:      token, // ERC-20 call goes to the token contract, not the recipient
        data,
        value:   "0",
        chainId: CHAIN_ID,
      },
      meta: {
        kind:      "erc20" as const,
        from,
        recipient: to,
        token,
        symbol,
        decimals,
        amount:    amountStr,
        amountWei: amountWei.toString(),
        chainId:   CHAIN_ID,
        chain:     "base" as const,
        explorer:  `${TX_CHAINS.base.explorer}/token/${token}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
