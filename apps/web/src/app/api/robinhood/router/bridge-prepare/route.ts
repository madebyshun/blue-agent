import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, http, isAddress, getAddress, parseUnits,
} from "viem";
import { base } from "viem/chains";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { MAINNET_RELAY_API } from "@reservoir0x/relay-sdk";
import {
  type ChainCurrencies, isNativeAddress, parseChainCurrencies,
  resolveBridgePair,
} from "@/lib/wallet/bridge-pairs";
import { WALLET_CHAINS } from "@/lib/wallet/chains";

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
// `BASE_RPC_URL` first, matching dca/create and dca/whoami. viem's bundled
// default for Base is the public mainnet.base.org endpoint, which rate-limits
// hard enough that a token read fails on a busy minute — measured here as a
// bogus "token contract read failed" on a perfectly normal ERC-20.
const SUPPORTED = {
  base:      { id: base.id,             rpc: process.env.BASE_RPC_URL ?? base.rpcUrls.default.http[0], explorer: "https://basescan.org" },
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

// ── Relay's bridgeable allow-list ───────────────────────────────────────────
//
// `/chains` is a CONFIG endpoint — it changes when Relay onboards a token, not
// per request — so it is cached. There is deliberately no hardcoded fallback:
// if we cannot read which tokens Relay will move, we do not know, and a stale
// local copy asserting "USDG is bridgeable" is the kind of confident-wrong that
// this route already shipped once.
const CHAINS_TTL_MS = 10 * 60 * 1000;
let chainsCache: { at: number; byId: Map<number, ChainCurrencies> } | null = null;

async function loadRelayChains(): Promise<Map<number, ChainCurrencies>> {
  if (chainsCache && Date.now() - chainsCache.at < CHAINS_TTL_MS) return chainsCache.byId;
  const r = await fetch(`${MAINNET_RELAY_API}/chains`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Relay /chains returned ${r.status}`);
  const j = (await r.json()) as { chains?: unknown[] };
  const byId = new Map<number, ChainCurrencies>();
  for (const raw of Array.isArray(j?.chains) ? j.chains : []) {
    const parsed = parseChainCurrencies(raw as Parameters<typeof parseChainCurrencies>[0]);
    if (parsed) byId.set(parsed.chainId, parsed);
  }
  if (byId.size === 0) throw new Error("Relay /chains returned no parseable chains");
  chainsCache = { at: Date.now(), byId };
  return byId;
}

/**
 * Who is at fault for an upstream failure.
 *
 * The old route answered "NO_ROUTE" to everything, so a 401 throttle and an
 * unsupported pair were the same sentence on screen — and the sentence blamed
 * the user's token for our request shape. That is what made the ERC-20 bug
 * survive: the error message pointed away from the cause. Classification here
 * is by HTTP STATUS, which we can actually read, rather than by guessing at
 * Relay's error-code vocabulary.
 *
 * `INVALID_INPUT_CURRENCY` is the one code named explicitly, because it is the
 * one we MEASURED and the one that must never be silent again: after the
 * pre-validation above it is unreachable, so seeing it means OUR mapping is
 * wrong — a bug report, not a routing answer.
 */
function classifyRelayFailure(status: number, errorCode?: string): { code: string; hint: string } {
  if (errorCode === "INVALID_INPUT_CURRENCY") {
    return {
      code: "BRIDGE_MAPPING_BUG",
      hint:  "Relay rejected a currency this route had already validated — please report this.",
    };
  }
  if (status === 401 || status === 403) {
    return { code: "UPSTREAM_AUTH",       hint: "Relay declined the request (auth). Not a problem with your token — try again." };
  }
  if (status === 429) {
    return { code: "UPSTREAM_RATE_LIMIT", hint: "Relay is rate-limiting us. Try again in a moment." };
  }
  if (status >= 500 || status === 0) {
    return { code: "UPSTREAM_ERROR",      hint: "Relay is unavailable right now. Try again shortly." };
  }
  // A 4xx Relay understood and refused: this really is a routing verdict.
  return { code: "NO_ROUTE", hint: "" };
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
    currencyIn?:   { amount?: string; amountFormatted?: string; amountUsd?: string; minimumAmount?: string; currency?: RelayCurrency };
    // `minimumAmount` is the FLOOR, not a detail: on a cross-asset trip Relay
    // quotes a 2% destination slippage tolerance, so the "≈" figure and the
    // worst case are two different numbers and only one of them is a promise.
    currencyOut?:  { amount?: string; amountFormatted?: string; amountUsd?: string; minimumAmount?: string; currency?: RelayCurrency };
    totalImpact?:  { usd?: string; percent?: string };
    rate?:         string;
  };
  errors?: { message?: string }[];
  message?: string;
  errorCode?: string;
};

// Relay echoes the full destination currency back in the quote — chainId,
// address, symbol, decimals. That echo is the authority for what LANDS, because
// it arrives in the SAME payload as `amountOut`: label and number can never
// disagree about which token they describe.
type RelayCurrency = { chainId?: number; address?: string; symbol?: string; decimals?: number };

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

// `computeFeeBps` stood here. Its docstring claimed "the relayer fee in bps of
// the input amount"; what it computed was the fee divided by
// `totalImpact.usd` — the fee over the COST, not over the INPUT. MEASURED
// against live quotes: it returned 4007 bps for a trip that really cost 8.38%,
// 3649 for one that cost 0.14%, and 3095 for one that cost 0.07% — so it was
// not merely wrong by a scale factor, it barely moved while the real number
// changed by two orders of magnitude.
//
// Deleting it rather than leaving it uncalled is the point. It survived the
// removal of its own call site because it was spelled `computeFeeBps` while the
// guard in bridge-pairs-test.ts matched `/feeBps/` — a capital letter was the
// whole of its camouflage. An uncalled fee derivation in a fund-touching route
// is one `{meta.feeBps}` away from being a live lie, and the next person to
// need a fee figure would have found this one sitting here looking official.
// Relay's own `totalImpact.usd` / `.percent` is the number, and it is already
// both-sides priced.

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fromChain?:   string;
      toChain?:     string;
      fromAddress?: string;
      recipient?:   string;
      token?:       string;
      /**
       * OPTIONAL destination token, as an address on `toChain`. Omit it and the
       * route auto-resolves — conservatively, refusing anything that would turn
       * one asset into another. Pass it to opt IN to a cross-asset move; that is
       * a choice only the user gets to make, never a default.
       */
      toToken?:     string;
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
    // Destination token, if the caller named one. Validated as an address here
    // and against Relay's allow-list below — an unvalidated passthrough would
    // let a caller aim the delivery at any contract at all.
    const toTokenRaw = typeof body.toToken === "string" ? body.toToken.trim() : "";
    if (toTokenRaw && !isNativeToken(toTokenRaw) && !isAddress(toTokenRaw)) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "toToken must be a 0x… address or 'ETH'/'NATIVE'" } },
        { status: 400 },
      );
    }
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

    // The token address on the ORIGIN chain. Relay treats native ETH as the
    // zero address; an ERC-20 is its contract address on origin.
    let originCurrency: `0x${string}`;
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
    }

    // ── Which token lands on the other side ──────────────────────────────────
    //
    // This used to be `destinationCurrency: originCurrency` — "same token,
    // other chain" — which is only true for native ETH, where the zero address
    // means "the gas token" everywhere. A contract address is chain-local, so
    // every ERC-20 bridge asked Relay for an address that does not exist on the
    // destination and was refused. See lib/wallet/bridge-pairs.ts.
    //
    // ORDER MATTERS: this runs BEFORE the on-chain token read below. The
    // allow-list check is a Map lookup against a cached list and the refusals it
    // produces ("Base DEGEN is listed but not bridgeable") do not depend on
    // anything the chain can tell us. Reading `decimals()` first meant paying an
    // RPC round-trip to describe a token we were about to refuse — and when the
    // public RPC was rate-limited, that read failed and answered a bridgeability
    // question with "token contract read failed", which is not an answer to it.
    let relayChains: Map<number, ChainCurrencies>;
    try {
      relayChains = await loadRelayChains();
    } catch (e) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "UPSTREAM_ERROR", message: `Can't read Relay's supported-token list: ${(e as Error).message}` },
          meta:  { fromChain, toChain },
        },
        { status: 200 },
      );
    }
    const fromCurrencies = relayChains.get(fromCfg.id);
    const toCurrencies   = relayChains.get(toCfg.id);
    if (!fromCurrencies || !toCurrencies) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "UPSTREAM_ERROR", message: `Relay does not currently list ${!fromCurrencies ? fromChain : toChain}.` },
          meta:  { fromChain, toChain },
        },
        { status: 200 },
      );
    }

    // "ETH"/"NATIVE" is the caller's word for the zero address on either chain.
    const explicitTo = toTokenRaw
      ? (isNativeToken(toTokenRaw) ? NATIVE_SENTINEL : toTokenRaw)
      : undefined;
    const pair = resolveBridgePair(fromCurrencies, toCurrencies, originCurrency, {
      explicitTo,
      // The destination chain's canonical dollar, per the wallet's own config —
      // the tie-break when the far side bridges more than one stablecoin and the
      // user named none. Base lists both USDC and USDT, so without this the
      // commonest return trip in the app (USDG → Base) refuses itself.
      preferredStable: WALLET_CHAINS[toKey].stable,
    });
    if (!pair.ok) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: pair.code, message: pair.message },
          meta:  { fromChain, toChain, token: originCurrency, amount: amountStr },
        },
        { status: 200 },
      );
    }

    // ── How big is one token ─────────────────────────────────────────────────
    //
    // Decimals size the transfer, so getting them wrong moves the decimal point
    // on someone's money. Two sources agree or we don't proceed:
    //
    //   · Relay's `/chains` entry — PRIMARY. It is the same record that supplied
    //     the address we're about to send to, and Relay is the party that will
    //     interpret our `amount`. Using their number for their field is the one
    //     choice that cannot desync from the counterparty.
    //   · The token contract — VETO ONLY. Read as an independent check, and it
    //     can refuse the bridge but never supply the figure. If the RPC is down
    //     or throttled we lose the check, not the trip; `decimalsChecked` says
    //     which of those happened rather than papering over it.
    //
    // A disagreement is not a rounding difference — it is 10^n on the amount —
    // so it stops here rather than being resolved by preferring either side.
    const decimals = pair.from.decimals;
    let symbol = pair.from.symbol;
    let decimalsChecked = false;
    if (!isNativeAddress(originCurrency)) {
      try {
        const onchain = await readTokenMeta(fromKey, originCurrency);
        if (onchain.decimals !== decimals) {
          return NextResponse.json(
            {
              ok:    false,
              error: {
                code:    "DECIMALS_MISMATCH",
                message: `Relay lists ${pair.from.symbol} at ${decimals} decimals but the contract on ${fromChain} reports ${onchain.decimals}. Not sizing a transfer against a disagreement.`,
              },
              meta: { fromChain, toChain, token: originCurrency, amount: amountStr },
            },
            { status: 200 },
          );
        }
        decimalsChecked = true;
        if (onchain.symbol) symbol = onchain.symbol;
      } catch {
        // Check unavailable. Relay's declared decimals still stand on their own
        // — the token is on a curated ≤7-entry bridging allow-list, not a symbol
        // we matched — so the bridge proceeds and the response says the
        // second opinion is missing.
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

    // Ask Relay for a quote. tradeType EXACT_INPUT locks the input amount; the
    // user knows how much they're paying, and any output-side slippage is
    // absorbed by Relay.
    //
    // ⚠️ DO NOT ADD `referrer` BACK WITHOUT A RELAY API KEY.
    // MEASURED 2026-09-11, 5 runs × 2 variants, native ETH Base→Robinhood:
    //   no referrer  → 200, every run
    //   referrer:"blueagent.dev" → 401 UNAUTHORIZED_QUOTE ("Please provide an
    //   api key"), every run
    // Relay treats `referrer` as an attribution claim and requires a registered
    // key to honour it, so sending one unauthenticated rejects the whole quote.
    // This single field is why the bridge returned nothing for EVERY token in
    // EVERY direction — native ETH included. It was never a token-support
    // problem, and the "NO_ROUTE" the card used to print blamed the user's
    // token for a header of our own making. If attribution is wanted later, get
    // a key first and send both, or neither.
    const quoteBody = {
      user:                 from,
      recipient,
      originChainId:        fromCfg.id,
      destinationChainId:   toCfg.id,
      originCurrency,
      destinationCurrency:  pair.to.address,
      amount:               amountBase.toString(),
      tradeType:            "EXACT_INPUT" as const,
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
        // Surfaced as 200 + ok:false so the card can render honestly — but the
        // CODE now distinguishes "Relay refused this route" from "Relay was
        // unreachable / rate-limited / rejected us". Both used to read as
        // NO_ROUTE, which told the user to go find a different token for a
        // problem their token had nothing to do with.
        const { code, hint } = classifyRelayFailure(qr.status, quoteJson?.errorCode);
        const upstream = quoteJson?.errors?.[0]?.message || quoteJson?.message || `Relay ${qr.status}`;
        return NextResponse.json(
          {
            ok:    false,
            error: { code, message: hint || upstream, upstream, upstreamCode: quoteJson?.errorCode ?? "", status: qr.status },
            meta:  { fromChain, toChain, token: originCurrency, toToken: pair.to.address, amountIn: amountBase.toString() },
          },
          { status: 200 },
        );
      }
    } catch (e) {
      // Never reached Relay at all — a network fault, not a routing verdict.
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "UPSTREAM_ERROR", message: `Couldn't reach Relay: ${(e as Error).message}` },
          meta:  { fromChain, toChain, token: originCurrency, toToken: pair.to.address, amountIn: amountBase.toString() },
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

    // ── Did Relay quote the token we asked for? ─────────────────────────────
    //
    // We picked the destination from Relay's own allow-list, so a mismatch here
    // means the request was re-routed somewhere we did not choose. Refuse it.
    // The whole point of the fix is that the user is told what arrives; a quote
    // for an unexpected asset is the original bug wearing a better disguise.
    const echoed = details.currencyOut?.currency;
    const echoedAddr = typeof echoed?.address === "string" ? echoed.address.toLowerCase() : "";
    if (echoed && echoedAddr && echoedAddr !== pair.to.address) {
      return NextResponse.json(
        {
          ok:    false,
          error: {
            code:    "DESTINATION_MISMATCH",
            message: `Relay quoted ${echoed.symbol || "a different token"} on ${toChain}, not the ${pair.to.symbol} this bridge asked for. Not signing that.`,
          },
          meta: { fromChain, toChain, token: originCurrency, toToken: pair.to.address, quotedToken: echoedAddr },
        },
        { status: 200 },
      );
    }
    if (echoed && typeof echoed.chainId === "number" && echoed.chainId !== toCfg.id) {
      return NextResponse.json(
        {
          ok:    false,
          error: { code: "DESTINATION_MISMATCH", message: `Relay quoted delivery on chain ${echoed.chainId}, not ${toChain} (${toCfg.id}).` },
          meta:  { fromChain, toChain, token: originCurrency, toToken: pair.to.address },
        },
        { status: 200 },
      );
    }

    // Decimals for the OUTPUT amount come from the output token — not the input.
    // USDC and USDG are both 6 so the old shared-decimals shortcut looked fine
    // on the only pair anyone tested; ETH (18) → USDG (6) would have rendered
    // the received amount a trillion times too large.
    const outDecimals = Number.isInteger(echoed?.decimals) ? (echoed!.decimals as number) : pair.to.decimals;
    const outSymbol   = (echoed?.symbol || pair.to.symbol || "").trim();

    // ── What the trip actually costs ─────────────────────────────────────────
    //
    // Relay prices BOTH sides in USD in this same payload and states the
    // round-trip cost itself as `totalImpact`. Take its figure rather than
    // computing one: it is produced by the party holding the prices, it covers
    // the swap leg as well as the relayer fee, and it is quoted against the very
    // numbers that produced `amountOut`.
    //
    // What was here divided the relayer fee by `totalImpact.usd` — fee over
    // COST instead of fee over INPUT. MEASURED 2026-09-11, Base USDC → RH USDG:
    //     $1 → 4007 bps claimed / 8.38% real
    //   $100 → 3649 bps claimed / 0.14% real
    //  $1000 → 3095 bps claimed / 0.07% real
    // i.e. it read ~36% for a trip that cost 0.14%, and moved the WRONG WAY as
    // the real cost fell. It was never rendered — the card's own comment says
    // "we never derive a bps" — so this was a loaded gun in the payload rather
    // than a live lie. A field named `feeBps` sitting in a fund-touching
    // response is one `{meta.feeBps}` away from being one.
    //
    // Absolute values: Relay signs these negative (a cost to the user). The sign
    // is carried by the label on screen, not by the number.
    const impactUsd = Math.abs(Number(details.totalImpact?.usd ?? ""));
    const impactPct = Math.abs(Number(details.totalImpact?.percent ?? ""));
    const totalCostUsd     = Number.isFinite(impactUsd) ? impactUsd : null;
    const totalCostPercent = Number.isFinite(impactPct) ? impactPct : null;

    // The guaranteed floor, in base units of the OUTPUT token. `amountOut` is an
    // estimate with ~2% of destination slippage tolerance behind it; this is the
    // number the user is actually promised. Null when Relay omits it — an
    // unknown floor is not a floor of zero, and it is not `amountOut` either.
    const amountOutMin = typeof details.currencyOut?.minimumAmount === "string"
      ? details.currencyOut.minimumAmount
      : null;

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
        // Did the contract get to second-guess Relay's decimals, or was the RPC
        // unavailable? The amount is correct either way — but "we checked" and
        // "we couldn't check" are different facts and only one of them is worth
        // reporting as a check.
        decimalsChecked,
        // What actually LANDS. A separate field, not a reuse of `token`, because
        // they are genuinely different on the pair people will use most: send
        // USDC from Base, receive USDG on Robinhood. The card must render this
        // one on the destination side — labelling the output with the input's
        // symbol is a false statement about what the user is about to receive.
        tokenOut: {
          address:  pair.to.address,
          symbol:   outSymbol,
          decimals: outDecimals,
        },
        assetChanged: pair.assetChanged,
        assetNote:    pair.note,
        amountIn,
        amountOut,
        // The floor and the cost, both from Relay's own both-sides-USD figures.
        // `amountOut` is an estimate; `amountOutMin` is the promise.
        amountOutMin,
        totalCostUsd,
        totalCostPercent,
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

/**
 * What can this wallet actually bridge? — the token picker's only source.
 *
 * It lives in THIS file, beside the POST, on purpose. The picker and the
 * validator must read the same list or the UI can offer something the server
 * then refuses: exactly the shape of #143/#166/#196, where a surface advertised
 * a capability the app could not run. Sharing `loadRelayChains()` makes that
 * divergence impossible rather than unlikely — one fetch, one cache.
 *
 * ── Why the RAW `ChainCurrencies`, and not a tidy flat token list ────────────
 * An earlier draft returned `tokens: bridgeableOf(parsed).map(…)` — already
 * filtered, already flattened. It was smaller and it was wrong in a way that
 * only shows up later: the client could then no longer run `resolveBridgePair`,
 * so it had to re-implement the rules (what counts as a dollar, when a
 * substitution is allowed, when to refuse) to say anything useful before the
 * quote. Two copies of a fund-touching rule is the bug, and it drifts silently —
 * add a stablecoin to `STABLE_SYMBOLS` and the picker starts refusing pairs the
 * server would have happily resolved, in a red banner, with total confidence.
 *
 * Handing back the parsed shape verbatim lets the picker call the SAME resolver
 * with the SAME `preferredStable` and render the SAME sentence the POST would
 * have returned. `supportsBridging: false` entries (Base DEGEN today) are
 * included deliberately — `bridgeableOf` is what drops them, on both sides.
 *
 * There is NO fallback list, and that is the design. If Relay's `/chains` can't
 * be read we do not know what is bridgeable, and a stale hardcoded copy that
 * still says "DEGEN moves" is worse than an empty picker: the user picks it,
 * signs an approve, and finds out at the quote. `ok: false` here makes the
 * picker say "couldn't load the list" — an outage the user can see and retry,
 * not a wrong answer they can act on.
 *
 * `null` per chain means Relay does not list that chain at all, which is a
 * different fact from "listed, but nothing is movable" and must not collapse
 * into it.
 */
export async function GET() {
  try {
    const byId = await loadRelayChains();
    const chains: Record<string, ChainCurrencies | null> = {};
    for (const key of Object.keys(SUPPORTED) as ChainKey[]) {
      chains[key] = byId.get(SUPPORTED[key].id) ?? null;
    }
    return NextResponse.json({ ok: true, chains });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "UPSTREAM_ERROR", message: (e as Error).message } },
      { status: 200 },
    );
  }
}
