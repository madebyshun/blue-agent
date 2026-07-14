import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, encodeFunctionData, http, parseUnits, isAddress, getAddress } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";

// Prepares calldata for a NON-CUSTODIAL ERC-20 (or native ETH) transfer on
// Robinhood Chain (chainId 4663). The server only builds the tx — the user's
// own wallet signs and broadcasts. We hold no keys, move no funds.
//
// Shape mirrors /api/robinhood/router/swap-prepare so the client's send flow
// looks and feels identical: POST with { fromAddress, toAddress, token, amount },
// receive { ok, tx: { to, data, value, chainId }, meta }.

// Robinhood mainnet is the only chain we currently expose in chat.
const RH_CHAIN_ID = robinhoodMainnet.id;
const RH_RPC = "https://rpc.mainnet.chain.robinhood.com";

const client = createPublicClient({ chain: robinhoodMainnet, transport: http(RH_RPC) });

// Minimal ERC-20 ABI for decimals + transfer + balanceOf. Kept local to avoid
// pulling in Base-only helpers — nothing here has to match Base's ERC20_ABI.
const ERC20_ABI = [
  { name: "decimals", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// Token decimals never change — a short in-module cache spares us an RPC round
// trip on repeat sends of the same token and helps if the chain's public RPC
// starts to rate-limit us. Cache is per-process, TTL 5 minutes.
type CacheEntry = { decimals: number; symbol: string; at: number };
const TTL_MS = 5 * 60 * 1000;
const decimalsCache = new Map<string, CacheEntry>();

async function readTokenMeta(token: `0x${string}`): Promise<{ decimals: number; symbol: string }> {
  const key = token.toLowerCase();
  const hit = decimalsCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { decimals: hit.decimals, symbol: hit.symbol };
  // Read decimals + symbol together. symbol() is optional per ERC-20; if it
  // reverts we fall back to "" so the client can render the address.
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }).catch(() => ""),
  ]);
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 30) {
    throw new Error(`Invalid decimals returned by token: ${decimals}`);
  }
  const s = typeof symbol === "string" ? symbol : "";
  decimalsCache.set(key, { decimals: d, symbol: s, at: Date.now() });
  return { decimals: d, symbol: s };
}

function isNativeToken(t: string): boolean {
  const u = t.trim().toUpperCase();
  return u === "ETH" || u === "NATIVE";
}

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
    // Reject anything that isn't a positive decimal — no scientific notation,
    // no negative, no NaN. parseUnits would throw further down anyway, but a
    // clean 400 tells the caller the shape is wrong, not that the chain broke.
    if (!/^\d+(\.\d+)?$/.test(amountStr) || Number(amountStr) <= 0) {
      return NextResponse.json({ error: "amount must be a positive decimal string" }, { status: 400 });
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
        tx: {
          to,
          data:    "0x",
          value:   value.toString(),
          chainId: RH_CHAIN_ID,
        },
        meta: {
          kind:        "native" as const,
          from,
          symbol:      "ETH",
          decimals:    18,
          amount:      amountStr,
          amountWei:   value.toString(),
          chainId:     RH_CHAIN_ID,
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
      ({ decimals, symbol } = await readTokenMeta(token));
    } catch (e) {
      // decimals() reverted, chain is unreachable, or returned garbage. 502 =
      // upstream (chain / token contract) failed, not our request shape.
      return NextResponse.json(
        { error: `token contract read failed: ${(e as Error).message}` },
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
        chainId: RH_CHAIN_ID,
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
        chainId:   RH_CHAIN_ID,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const runtime = "nodejs";
