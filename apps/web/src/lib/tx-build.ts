/**
 * Unsigned transaction builders shared by the MCP route (`blue_swap_tx`) and
 * the ACP seller (`swap_prepare`). Moved out of app/api/mcp/route.ts on
 * 2026-10-22 without a logic change: a Next route file may not export helpers,
 * and a second copy for ACP is exactly the drift this repo keeps measuring.
 *
 * Non-custodial throughout: these encode, the user's own wallet signs and
 * broadcasts. Nothing here can move funds, and nothing here should ever be
 * given the ability to.
 */
import { parseUnits } from "viem";
import {
  type TxChain,
  parseTxChain,
  TX_CHAINS,
  isNativeToken,
  toNativeSentinel,
  isPositiveDecimal,
  readTokenMeta,
} from "@/lib/tx-chains";
import { type ActionKind } from "@/lib/actions";
import { preTradeCheck, type PreTradeCheck } from "@/lib/pre-trade-check";
import { recordPreTradeBlock } from "@/lib/action-stats";
import { ROBINHOOD_SWAP_ROUTER_ADDRESS } from "@/lib/robinhood/swap";
import { buildBaseApprove, parseSlippageArg } from "@/lib/zerox-swap";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
export function reqAddr(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!ADDR_RE.test(s)) throw new Error(`${field} must be a 0x-prefixed 40-hex address`);
  return s;
}

// ─── Execution primitives — unsigned calldata, both chains ────────────────────
//
// Each wraps a prepare-route that already existed and returns
// { ok, tx: { to, data, value, chainId }, meta }. Non-custodial throughout: the
// server encodes, the user's wallet signs and broadcasts. Nothing here can move
// funds, and nothing here should ever be given the ability to.
//
// `chain` is REQUIRED with NO DEFAULT on all three. This is the ACP-registry trap
// avoided deliberately (see memory: a field sat in `required` while its own
// description said "Optional."): a schema that says required must BE required in
// the code, and a chain that defaults is a chain nobody chose. Base 8453 and
// Robinhood Chain 4663 share no state, so guessing loses funds rather than
// returning a wrong string.

export async function postPrepare(url: string, body: unknown, label: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const msg = (parsed as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(`${label} failed: ${msg}`);
  }
  return JSON.stringify(parsed, null, 2);
}

export function requireChain(args: Record<string, unknown>, field = "chain"): TxChain {
  const c = parseTxChain(args[field]);
  if (!c) {
    throw new Error(
      `${field} is required and must be exactly "base" (8453) or "robinhood" (4663). ` +
      `There is no default: the two chains share no state and the same ticker lists on both, ` +
      `so a transaction built for the wrong one is unroutable at best and lost at worst. ` +
      `If the user did not name a chain, ASK — do not pick one.`,
    );
  }
  return c;
}

export async function buildSwapTx(args: Record<string, unknown>): Promise<string> {
  const chain = requireChain(args);
  const fromAddress = reqAddr(args.fromAddress, "fromAddress");
  const tokenIn  = String(args.tokenIn  ?? "").trim();
  const tokenOut = String(args.tokenOut ?? "").trim();
  const amountIn = String(args.amountIn ?? "").trim();
  if (!tokenIn)  throw new Error("tokenIn is required (0x… address or \"ETH\")");
  if (!tokenOut) throw new Error("tokenOut is required (0x… address or \"ETH\")");
  if (!isPositiveDecimal(amountIn)) {
    throw new Error("amountIn must be a positive decimal string in WHOLE units, e.g. \"25.5\" — not base units");
  }
  // Validated, not coerced. `Number("abc")` is NaN, and the old code sent
  // `String(NaN)` upstream and echoed NaN back in `meta` — where JSON.stringify
  // renders it `null`, so a typo'd slippage silently became "no protection
  // stated" instead of an error. Refusing beats guessing on a field whose whole
  // job is bounding the caller's loss.
  const slippageBps = parseSlippageArg(args.slippageBps);

  // Resolve decimals on the token's OWN chain so the agent never does exponent
  // math. See lib/tx-chains.ts — a wrong exponent here is a wrong trade size.
  const inIsNative = isNativeToken(tokenIn);
  const decimals = inIsNative ? 18 : (await readTokenMeta(chain, reqAddr(tokenIn, "tokenIn") as `0x${string}`)).decimals;
  const amountInBase = parseUnits(amountIn, decimals).toString();

  if (chain === "base") {
    // 0x AllowanceHolder. GET, and it answers 200 with { error } rather than a
    // non-2xx for a bad pair, so the ok-check below reads the body not the status.
    //
    // ⚠️ `toNativeSentinel`, NOT the literal "ETH" (P1-4, measured 2026-09-26).
    // These two lines used to send the string "ETH", which 0x v2 rejects with
    // "The input is invalid" — so `tokenOut: "ETH"`, a value this tool's own
    // description tells agents to use, failed while WETH worked. The route also
    // normalises, so this is belt-and-braces; it is spelled out here because
    // this is the call site the failure was measured at.
    const qs = new URLSearchParams({
      sellToken:  toNativeSentinel(tokenIn),
      buyToken:   toNativeSentinel(tokenOut),
      sellAmount: amountInBase,
      taker:      fromAddress,
      slippageBps: String(slippageBps),
    });
    const res  = await fetch(`${BASE}/api/swap/quote?${qs}`, { signal: AbortSignal.timeout(30_000) });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.needsKey) throw new Error("Base swap routing is unavailable in this deployment (ZEROX_API_KEY unset).");
    if (data.error)    throw new Error(`Base 8453 swap quote failed: ${String(data.error)}`);
    if (data.liquidityAvailable === false) {
      return JSON.stringify({
        ok: false, chain: "base", chainId: TX_CHAINS.base.chainId,
        error: { code: "NO_ROUTE", message: "No route on Base 8453 for this pair at this size. Do NOT invent a price — tell the user there is no liquidity." },
      }, null, 2);
    }
    const tx = (data.transaction ?? {}) as Record<string, unknown>;
    return JSON.stringify({
      ok: true,
      chain: "base", chainId: TX_CHAINS.base.chainId,
      tx: { to: tx.to, data: tx.data, value: tx.value ?? "0", chainId: TX_CHAINS.base.chainId },
      approve: buildBaseApprove(data, tokenIn, amountInBase, inIsNative),
      meta: {
        venue: data.venue === "aerodrome" ? "Aerodrome Slipstream" : "0x AllowanceHolder", from: fromAddress,
        tokenIn, tokenOut, amountIn, amountInBase, decimals, slippageBps,
        buyAmount: data.buyAmount ?? null, minBuyAmount: data.minBuyAmount ?? null,
        explorer: TX_CHAINS.base.explorer,
      },
      note: "Unsigned. Sign in your own wallet on Base 8453. Blue Agent holds no keys.",
    }, null, 2);
  }

  // Robinhood Chain 4663 — Blue Agent's deployed RobinhoodSwapRouter over Uniswap V3.
  //
  // SLIPPAGE FLOOR, since 2026-09-30 (plan §1 fix 2). This path used to build
  // every RH swap with amountOutMinimum = 0 — an unbounded-output trade — and
  // refused an explicit slippageBps rather than pretend to honour it. Its
  // reason was that the only RH price is a GeckoTerminal estimate, "display
  // only". But both RH swap cards in the app already bound the signed trade
  // with exactly that estimate (RhSwapCard: estimate × (1 − 3%); the chat card:
  // the user's picked slippage), so the product had already decided that an
  // estimate-derived floor beats none — and it is strictly safer: a wrong
  // estimate makes the swap REVERT (gas lost), where a zero floor lets a
  // sandwich take the output. Same sources as those cards:
  //   ETH↔token   → /api/robinhood/swap/quote (pool + GeckoTerminal estimate)
  //   token↔token → GeckoTerminal USD prices of both legs
  // No estimate → no trade: refused rather than built unbounded.
  //
  // The ETH↔token quote is ALSO where the pool's fee tier comes from, and
  // swap-prepare's buy/sell modes 400 "fee tier required" without one. This
  // branch used to read the estimate and throw the fee away, so every ETH↔token
  // build died at prepare after the floor had been computed — only token↔token
  // (which resolves its own pool) ever worked. No fee → NO_ROUTE, same as no pool.
  if (!ROBINHOOD_SWAP_ROUTER_ADDRESS) {
    throw new Error("Robinhood Chain 4663 swap router is not configured in this deployment.");
  }
  const outIsNative = isNativeToken(tokenOut);
  if (inIsNative && outIsNative) throw new Error("tokenIn and tokenOut cannot both be native ETH");
  // 3% unless the caller says otherwise — the RhSwapCard default, because an
  // estimate is looser than 0x's firm quote (whose default here is 1%).
  const rhSlippageBps = args.slippageBps === undefined || args.slippageBps === null ? 300 : slippageBps;
  const est = await estimateRhOut(tokenIn, tokenOut, inIsNative, outIsNative, amountIn);
  if ((inIsNative || outIsNative) && est.fee === null) {
    return JSON.stringify({
      ok: false, chain: "robinhood", chainId: TX_CHAINS.robinhood.chainId,
      error: {
        code: "NO_ROUTE",
        message: "No Uniswap V3 WETH pool (fee tier) found for this token on Robinhood Chain 4663, so there is nothing to route an ETH swap through. Do NOT invent a price — tell the user there is no pool.",
      },
    }, null, 2);
  }
  const estimatedOut = est.amountOut;
  if (estimatedOut === null || !(estimatedOut > 0)) {
    return JSON.stringify({
      ok: false, chain: "robinhood", chainId: TX_CHAINS.robinhood.chainId,
      error: {
        code: "NO_QUOTE",
        message: "No price for this pair on Robinhood Chain 4663, so no slippage floor can be set — refusing to build an unbounded swap. Do NOT invent a price.",
      },
    }, null, 2);
  }
  const outDecimals = outIsNative ? 18 : (await readTokenMeta(chain, reqAddr(tokenOut, "tokenOut") as `0x${string}`)).decimals;
  const minOut = estimatedOut * (1 - rhSlippageBps / 10_000);
  const amountOutMinimum = parseUnits(minOut.toFixed(Math.min(outDecimals, 18)), outDecimals).toString();
  const body: Record<string, unknown> = {
    router:    ROBINHOOD_SWAP_ROUTER_ADDRESS,
    recipient: fromAddress,
    amountIn:  amountInBase,
    amountOutMinimum,
    // The route's own three modes: buy = ETH→token, sell = token→ETH, and
    // tokenIn present = token→token. `token` carries tokenOut except on sell.
    // The ETH↔token modes also carry the pool's fee tier (non-null, checked above).
    ...(inIsNative
      ? { direction: "buy",  token: tokenOut, fee: est.fee }
      : outIsNative
        ? { direction: "sell", token: tokenIn, fee: est.fee }
        : { tokenIn, token: tokenOut }),
  };
  return postPrepare(`${BASE}/api/robinhood/router/swap-prepare`, body, "Robinhood Chain 4663 swap-prepare");
}

/**
 * The output estimate RH swaps are floored from — the same two sources the
 * app's RH swap cards use (see the note in the RH branch above). `amountOut`
 * is in human units of the OUTPUT token, or null when no price is available.
 * `fee` is the deepest WETH pool's fee tier, read from the same quote, for the
 * ETH↔token modes only (token↔token resolves its own pool in swap-prepare, so
 * it is null there); it is also null whenever the quote found no pool.
 */
async function estimateRhOut(
  tokenIn: string, tokenOut: string, inIsNative: boolean, outIsNative: boolean, amountIn: string,
): Promise<{ amountOut: number | null; fee: number | null }> {
  try {
    if (inIsNative || outIsNative) {
      const token = inIsNative ? tokenOut : tokenIn;
      const qs = new URLSearchParams({ token, direction: inIsNative ? "buy" : "sell", amount: amountIn });
      const r = await fetch(`${BASE}/api/robinhood/swap/quote?${qs}`, { signal: AbortSignal.timeout(20_000) });
      const j = (await r.json().catch(() => ({}))) as {
        hasPool?: boolean; pool?: { fee?: unknown }; estimate?: { amountOut?: number | null };
      };
      const f = j?.pool?.fee;
      const fee = j?.hasPool && typeof f === "number" && Number.isInteger(f) && f > 0 ? f : null;
      const out = j?.estimate?.amountOut;
      return { amountOut: fee !== null && typeof out === "number" && Number.isFinite(out) ? out : null, fee };
    }
    const price = async (t: string) => {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${t}`, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as { data?: { attributes?: { price_usd?: string } } } | null;
      const p = j?.data?.attributes?.price_usd ? parseFloat(j.data.attributes.price_usd) : NaN;
      return Number.isFinite(p) && p > 0 ? p : null;
    };
    const [pIn, pOut] = await Promise.all([price(tokenIn), price(tokenOut)]);
    if (pIn === null || pOut === null) return { amountOut: null, fee: null };
    return { amountOut: (Number(amountIn) * pIn) / pOut, fee: null };
  } catch {
    return { amountOut: null, fee: null };
  }
}

/**
 * G2 (2026-09-30): the pre-trade check — the same lib/pre-trade-check.ts the
 * wallet cards show — on every build these tools return. A BLOCK (a measured
 * honeypot, an impostor of a registered token, a bridge costing over the
 * limit) is refused as [PRE_TRADE_BLOCK] and no calldata leaves; WARN and PASS
 * ride along as `check`, a WARN with the instruction to put its reasons to the
 * user before they sign. Swaps and sends are checked BEFORE the build, on the
 * token bought / moved. A bridge is checked AFTER its build, because its cost
 * only exists once Relay has quoted a route — the build has no side effect, and
 * a refused bridge returns none of it.
 */
function preTradeRefusal(check: PreTradeCheck): Error {
  const why = check.reasons.filter((r) => r.level === "BLOCK").map((r) => r.text).join(" ");
  const e = new Error(`Refused — ${check.label}: ${why} Nothing was built. Tell the user why; do not retry the same trade.`) as Error & { code?: string };
  e.code = "PRE_TRADE_BLOCK";
  return e;
}

export async function withPreTradeCheck(kind: ActionKind, args: Record<string, unknown>, build: () => Promise<string>): Promise<string> {
  const chain = parseTxChain(kind === "bridge" ? args.fromChain : args.chain);
  const token = String((kind === "swap" ? args.tokenOut : args.token) ?? "").trim();
  // Missing fields are the builder's to refuse, with its own message.
  if (!chain || !token) return build();
  let check: PreTradeCheck | null = null;
  if (kind !== "bridge") {
    check = await preTradeCheck({
      chain, kind, token,
      ...(kind === "send" ? { recipient: typeof args.toAddress === "string" ? args.toAddress : null, sender: typeof args.fromAddress === "string" ? args.fromAddress : null } : {}),
    });
    if (check.verdict === "BLOCK") {
      await recordPreTradeBlock(check, { chain, token });
      throw preTradeRefusal(check);
    }
  }
  const text = await build();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { return text; }
  if (parsed.ok === false) return text;
  if (kind === "bridge") {
    const cost = (parsed.meta as { totalCostPercent?: unknown } | undefined)?.totalCostPercent;
    check = await preTradeCheck({ chain, kind, token, bridgeCostPercent: typeof cost === "number" ? cost : null });
    if (check.verdict === "BLOCK") {
      await recordPreTradeBlock(check, { chain, token });
      throw preTradeRefusal(check);
    }
  }
  if (!check) return text;
  parsed.check = check.verdict === "WARN"
    ? { ...check, instruction: "Show these reasons to the user and get an explicit yes before they sign." }
    : check;
  return JSON.stringify(parsed, null, 2);
}
