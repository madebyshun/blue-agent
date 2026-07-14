import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, http, isAddress, getAddress, parseUnits,
} from "viem";
import { base } from "viem/chains";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { MAINNET_RELAY_API } from "@reservoir0x/relay-sdk";

// Non-custodial GENERIC bridge between Base (8453) and Robinhood Chain (4663),
// backed by the Relay Protocol HTTP API. Same shape as swap-prepare / send-prepare:
//   POST { fromChain, toChain, fromAddress, recipient?, token, amount }
//   → { ok, tx: { to, data, value, chainId }, approve?, meta }
//
// Why HTTP instead of the SDK's execute(): the SDK's execute() insists on a
// WalletClient / AdaptedWallet to sign the steps end-to-end. Our pattern is the
// opposite — the server builds calldata, the user signs in their own wallet
// (RobinhoodSendCard / RobinhoodSwapCard). Relay's `/quote` endpoint returns
// { steps: [{ items: [{ data: { to, data, value, chainId } }] }] } which slots
// directly into wagmi's useSendTransaction. We import MAINNET_RELAY_API from
// the SDK so the base URL stays in one place.
//
// Native ETH is represented on the wire as the zero address (Relay convention).
// Callers may pass "ETH" or "NATIVE" and we normalise before the request.

export const runtime = "nodejs";
export const maxDuration = 15;

// Small allow-list. Relay supports many chains, but the chat tool only speaks
// Base ↔ RH — anything else is a caller mistake. Extend here if we ever wire a
// third chain into the chat surface.
const SUPPORTED = {
  base:      { id: base.id,             rpc: base.rpcUrls.default.http[0], explorer: "https://basescan.org" },
  robinhood: { id: robinhoodMainnet.id, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
} as const;
type ChainKey = keyof typeof SUPPORTED;

const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000";
const RELAY_TRACKER_BASE = "https://relay.link/transactions";

// Minimal ERC-20 ABI for decimals + symbol + allowance. Kept local so this file
// has no cross-chain coupling to Base's yield-execution helper.
const ERC20_ABI = [
  { name: "decimals",  type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

// Decimals/symbol never change; a short in-module cache spares the source-chain
// RPC on repeat bridges of the same token. Same pattern as send-prepare.
type CacheEntry = { decimals: number; symbol: string; at: number };
const TTL_MS = 5 * 60 * 1000;
const metaCache = new Map<string, CacheEntry>();

function clientFor(chain: ChainKey) {
  return createPublicClient({
    chain: chain === "base" ? base : robinhoodMainnet,
    transport: http(SUPPORTED[chain].rpc),
  });
}

async function readTokenMeta(chain: ChainKey, token: `0x${string}`): Promise<{ decimals: number; symbol: string }> {
  const key = `${chain}:${token.toLowerCase()}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { decimals: hit.decimals, symbol: hit.symbol };
  const c = clientFor(chain);
  const [decimals, symbol] = await Promise.all([
    c.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
    c.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }).catch(() => ""),
  ]);
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 30) {
    throw new Error(`Invalid decimals returned by token: ${decimals}`);
  }
  const s = typeof symbol === "string" ? symbol : "";
  metaCache.set(key, { decimals: d, symbol: s, at: Date.now() });
  return { decimals: d, symbol: s };
}

function isNativeToken(t: string): boolean {
  const u = t.trim().toUpperCase();
  return u === "ETH" || u === "NATIVE" || t.trim().toLowerCase() === NATIVE_SENTINEL;
}

// Extract the primary tx (deposit / send) and any prior approve tx from a Relay
// quote response. Relay's step ids follow a fixed vocabulary — we look them up
// by id rather than by array position so a future step re-ordering (e.g. a new
// EIP-7702 "authorize" leg) doesn't silently break us.
type RelayTx = { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
type RelayStepItem = { data?: { to?: string; data?: string; value?: string; chainId?: number } };
type RelayStep = { id: string; kind?: string; items?: RelayStepItem[]; requestId?: string };
type RelayQuoteResponse = {
  steps?: RelayStep[];
  fees?: {
    relayer?:        { amountUsd?: string; amountFormatted?: string; currency?: { symbol?: string } };
    relayerService?: { amountUsd?: string; amountFormatted?: string; currency?: { symbol?: string } };
    relayerGas?:     { amountUsd?: string; amountFormatted?: string; currency?: { symbol?: string } };
    app?:            { amountUsd?: string; amountFormatted?: string };
  };
  details?: {
    operation?:    string;
    timeEstimate?: number;
    currencyIn?:   { amount?: string; amountFormatted?: string; currency?: { symbol?: string; decimals?: number } };
    currencyOut?:  { amount?: string; amountFormatted?: string; currency?: { symbol?: string; decimals?: number } };
    totalImpact?:  { usd?: string; percent?: string };
    rate?:         string;
  };
  errors?: { message?: string }[];
  message?: string;
};

function pickStepTx(steps: RelayStep[] | undefined, ids: string[]): RelayTx | null {
  if (!steps) return null;
  for (const id of ids) {
    const s = steps.find((x) => x.id === id);
    const d = s?.items?.[0]?.data;
    if (d?.to && d?.data && typeof d.value === "string" && d.chainId) {
      return {
        to:      d.to as `0x${string}`,
        data:    d.data as `0x${string}`,
        value:   d.value,
        chainId: d.chainId,
      };
    }
  }
  return null;
}

// Estimate the relayer fee in bps of the input amount. Not part of Relay's
// response — computed here so the UI can display "≈ N bps" without inventing
// its own math. Only used when both amounts + fee are present.
function computeFeeBps(amountInBase: string, feeUsdStr?: string, inUsdPer?: number): number {
  if (!feeUsdStr || !inUsdPer || !amountInBase) return 0;
  const feeUsd = Number(feeUsdStr);
  const inAmt  = Number(amountInBase);
  if (!Number.isFinite(feeUsd) || !Number.isFinite(inAmt) || inAmt <= 0) return 0;
  const inUsd = inAmt * inUsdPer;
  if (inUsd <= 0) return 0;
  return Math.round((feeUsd / inUsd) * 10000);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fromChain?:   string;
      toChain?:     string;
      fromAddress?: string;
      recipient?:   string;
      token?:       string;
      amount?:      string | number;
    };

    const fromChain = String(body.fromChain ?? "").trim().toLowerCase();
    const toChain   = String(body.toChain   ?? "").trim().toLowerCase();

    if (fromChain !== "base" && fromChain !== "robinhood") {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "fromChain must be 'base' or 'robinhood'" } },
        { status: 400 },
      );
    }
    if (toChain !== "base" && toChain !== "robinhood") {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "toChain must be 'base' or 'robinhood'" } },
        { status: 400 },
      );
    }
    if (fromChain === toChain) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "fromChain and toChain must differ" } },
        { status: 400 },
      );
    }

    const fromKey: ChainKey = fromChain as ChainKey;
    const toKey:   ChainKey = toChain   as ChainKey;
    const fromCfg = SUPPORTED[fromKey];
    const toCfg   = SUPPORTED[toKey];

    const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
    if (!isAddress(fromAddress)) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "fromAddress must be a valid 0x… address" } },
        { status: 400 },
      );
    }
    const from = getAddress(fromAddress);

    // Recipient defaults to sender — matches the Relay default and lets a user
    // bridge to their own wallet on the other chain without extra typing.
    const rawRecipient = typeof body.recipient === "string" ? body.recipient.trim() : "";
    if (rawRecipient && !isAddress(rawRecipient)) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "recipient must be a valid 0x… address" } },
        { status: 400 },
      );
    }
    const recipient = rawRecipient ? getAddress(rawRecipient) : from;

    const rawToken  = typeof body.token === "string" ? body.token.trim() : "";
    const amountStr = body.amount != null ? String(body.amount).trim() : "";
    if (!rawToken) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "token required (0x… or 'ETH'/'NATIVE')" } },
        { status: 400 },
      );
    }
    if (!amountStr || !/^\d+(\.\d+)?$/.test(amountStr) || Number(amountStr) <= 0) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "amount must be a positive decimal string" } },
        { status: 400 },
      );
    }

    // Resolve currency address + decimals on the ORIGIN chain. Relay treats
    // native ETH as the zero address; ERC-20 = the contract address on origin.
    let originCurrency: `0x${string}`;
    let decimals = 18;
    let symbol   = "ETH";
    if (isNativeToken(rawToken)) {
      originCurrency = NATIVE_SENTINEL as `0x${string}`;
    } else {
      if (!isAddress(rawToken)) {
        return NextResponse.json(
          { ok: false, error: { code: "BAD_INPUT", message: "token must be a 0x… address or 'ETH'/'NATIVE'" } },
          { status: 400 },
        );
      }
      originCurrency = getAddress(rawToken);
      try {
        ({ decimals, symbol } = await readTokenMeta(fromKey, originCurrency));
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: { code: "BAD_INPUT", message: `token contract read failed on ${fromChain}: ${(e as Error).message}` } },
          { status: 200 },
        );
      }
    }

    let amountBase: bigint;
    try {
      amountBase = parseUnits(amountStr, decimals);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: `invalid amount for ${decimals}-decimal token: ${(e as Error).message}` } },
        { status: 400 },
      );
    }

    // Ask Relay for a quote. We request the SAME currency address on the
    // destination chain — Relay maps it to the canonical equivalent (or fails
    // with NO_ROUTE if the pair is unsupported, which we surface cleanly).
    // tradeType EXACT_INPUT locks the input amount; the user knows how much
    // they're paying, and any output-side swap slippage is absorbed by Relay.
    const quoteBody = {
      user:                 from,
      recipient,
      originChainId:        fromCfg.id,
      destinationChainId:   toCfg.id,
      originCurrency,
      destinationCurrency:  originCurrency,           // "same token, other chain"
      amount:               amountBase.toString(),
      tradeType:            "EXACT_INPUT" as const,
      referrer:             "blueagent.dev",
    };

    let quoteJson: RelayQuoteResponse;
    try {
      const qr = await fetch(`${MAINNET_RELAY_API}/quote`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(quoteBody),
        cache:   "no-store",
      });
      const text = await qr.text();
      try { quoteJson = JSON.parse(text) as RelayQuoteResponse; }
      catch { quoteJson = { message: text.slice(0, 200) }; }
      if (!qr.ok) {
        // Relay 4xx with a body usually means "no route" or "unsupported pair"
        // — surface it as 200 + ok:false so the card can render honestly.
        const msg = quoteJson?.errors?.[0]?.message || quoteJson?.message || `Relay ${qr.status}`;
        return NextResponse.json(
          {
            ok:    false,
            error: { code: "NO_ROUTE", message: msg },
            meta:  { fromChain, toChain, token: originCurrency, amountIn: amountBase.toString() },
          },
          { status: 200 },
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "NO_ROUTE", message: `Relay request failed: ${(e as Error).message}` },
          meta:  { fromChain, toChain, token: originCurrency, amountIn: amountBase.toString() },
        },
        { status: 200 },
      );
    }

    // Primary tx = the deposit step. On some legs Relay uses "swap" or "send"
    // as the id (e.g. when there's a same-chain leg first) — walk the fallback
    // list so we always pick SOMETHING to sign. If nothing usable is returned
    // we treat it as NO_ROUTE rather than a 500.
    const primary = pickStepTx(quoteJson.steps, ["deposit", "swap", "send"]);
    if (!primary) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "NO_ROUTE", message: quoteJson?.errors?.[0]?.message || "Relay returned no executable step" },
          meta:  { fromChain, toChain, token: originCurrency, amountIn: amountBase.toString() },
        },
        { status: 200 },
      );
    }

    // Optional prior approve — present when Relay wants ERC-20 allowance on the
    // origin chain. We surface it separately so the card can walk approve → send
    // like the swap card already does. The approve target is the token contract
    // itself; we only forward it as the SDK returned it.
    const approve = pickStepTx(quoteJson.steps, ["approve"]);

    const details = quoteJson.details ?? {};
    const amountIn  = details.currencyIn?.amount  ?? amountBase.toString();
    const amountOut = details.currencyOut?.amount ?? "0";

    // Fee bps display — Relay only gives absolute USD/amount figures. We derive
    // bps from the USD strings when both sides are priced; if not, fall back to
    // 0 so the UI can suppress the line rather than lie.
    const inUsdPerUnit = details.currencyIn?.amountFormatted && details.currencyIn?.amount
      ? Number(details.currencyIn.amountFormatted) > 0
        ? Number(details.totalImpact?.usd ?? "0") / Number(details.currencyIn.amountFormatted || "1")
        : 0
      : 0;
    void inUsdPerUnit; // not currently displayed — kept for future extension
    const feeBps = (() => {
      const relayerUsd = quoteJson.fees?.relayer?.amountUsd || quoteJson.fees?.relayerService?.amountUsd;
      const inUsdStr   = details.totalImpact?.usd; // negative-ish; not a direct USD in
      const inAmtStr   = details.currencyIn?.amountFormatted;
      if (!relayerUsd || !inAmtStr) return 0;
      const feeUsdN  = Number(relayerUsd);
      const inAmtN   = Number(inAmtStr);
      const inUsdN   = inUsdStr ? Math.abs(Number(inUsdStr)) : 0;
      // If we have a totalImpact USD figure, use `feeUsd / (feeUsd + inUsd)` as
      // a proxy — otherwise, when inAmt is USD-stable (USDC 6dp), assume 1:1.
      const inUsdSafe = inUsdN > 0 ? inUsdN + Math.abs(feeUsdN) : inAmtN;
      if (!Number.isFinite(feeUsdN) || !Number.isFinite(inUsdSafe) || inUsdSafe <= 0) return 0;
      return Math.max(0, Math.round((feeUsdN / inUsdSafe) * 10000));
    })();

    const estFillSeconds = typeof details.timeEstimate === "number" ? details.timeEstimate : 30;

    // Relay's tracker URL is keyed off the requestId (same one it uses for its
    // /intents/status polling endpoint). Fall back to the top-level explorer if
    // we don't have a requestId (shouldn't happen, but be honest if it does).
    const requestId =
      quoteJson.steps?.find((s) => s.requestId)?.requestId ??
      quoteJson.steps?.[0]?.requestId ??
      "";
    const trackerUrl = requestId ? `${RELAY_TRACKER_BASE}/${requestId}` : fromCfg.explorer;

    return NextResponse.json({
      ok:  true,
      tx:  primary,
      ...(approve ? { approve } : {}),
      meta: {
        fromChain, toChain,
        token: {
          address:  originCurrency,
          symbol:   details.currencyIn?.currency?.symbol || symbol || (isNativeToken(rawToken) ? "ETH" : ""),
          decimals: details.currencyIn?.currency?.decimals ?? decimals,
        },
        amountIn,
        amountOut,
        feeBps,
        estFillSeconds,
        trackerUrl,
        requestId,
        recipient,
        // Passthrough diagnostics the card can render if it wants — cheap USD
        // labels for the fee + time fields, not load-bearing for the tx itself.
        relayerFeeUsd:     quoteJson.fees?.relayer?.amountUsd ?? "",
        relayerFeeFormatted: quoteJson.fees?.relayer?.amountFormatted ?? "",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: (e as Error).message } },
      { status: 500 },
    );
  }
}
