/**
 * Blue Agent — MCP HTTP Server
 *
 * Remote MCP endpoint — agents and IDEs can connect without installing anything.
 *
 * Config (claude_desktop_config.json / .claude.json):
 *   {
 *     "mcpServers": {
 *       "blue-agent": { "url": "https://blueagent.dev/api/mcp" }
 *     }
 *   }
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Tools: 18 — 7 blue_* + 10 hub_* + 1 b20_*
 *        CUT FROM 85 ON 2026-09-26. The reasoning, the measurements, and the rule
 *        for adding a 19th all live in the header of lib/mcp-tools.ts — read that
 *        before touching this number. One-line version: 85 always-loaded tools cost
 *        ~8,040 tokens of every agent's context and measurably degrade tool
 *        SELECTION, so the catalog moved behind discovery (`blue_registry`) plus
 *        execution (`blue_call`) and only the tools an agent must reach for
 *        UNPROMPTED kept a permanent slot.
 *
 *        This line is pinned by apps/web/scripts/docs-truth-check.ts and fails CI if
 *        it drifts. Do not hand-edit it — change the manifest, then update both.
 *
 *        This is NOT the catalog total. `AGENT_TOOLS` holds 110; all 110 stay live at
 *        /api/x402/<id> and are now reached through blue_registry → blue_call rather
 *        than by preloading. The hub_* names listed here each map to a real catalog
 *        id (also checked by docs-truth-check.ts, because an MCP tool pointing at a
 *        toolId that does not exist is a 404 an agent cannot diagnose).
 *        This number said 111 until 2026-09-26. The line ABOVE was pinned after
 *        drifting by one; this one sat two lines below it, unpinned, and drifted by
 *        one in the same way. Both are pinned now. A pin covers the string it names
 *        and nothing else, including its own neighbours.
 *
 * CHAIN SCOPE: **BOTH chains, and every tool says which.** This was Base 8453 only
 *        until 2026-09-26 — and worse, 36 of the 85 descriptions named no chain at
 *        all while taking a bare token address, which is Hard Rule #1 violated in the
 *        one file an agent reads before anything else. Base 8453 and Robinhood Chain
 *        4663 share no state and NVDA / META / GOOGL list on BOTH, so an address
 *        without a chain is an under-specified question that returns a confidently
 *        wrong answer.
 *        The three execution tools (blue_swap_tx / blue_send_tx / blue_bridge_tx) now
 *        take `chain` as a REQUIRED enum with NO DEFAULT, and hub_hood_arrow takes it
 *        as an explicit optional that means "either desk" when omitted — never
 *        "Robinhood". Read-only hub_* tools state Base 8453 in their own description.
 *        ⚠️ Do NOT add a tool here whose description omits its chain, and do NOT give
 *        `chain` a default value to make a schema tidier. A default is how a Base
 *        read silently answers an RH question.
 *
 * PAYMENT: MCP calls to the 15 preloaded hub_/blue_ tools skip x402 settlement via
 *        INTERNAL_KEY below — they are free on this surface. `blue_call` is the
 *        deliberate exception and the ONLY one: it omits the bypass headers so the
 *        x402 route answers 402 with real payment requirements, which the calling
 *        agent settles from its own wallet. That asymmetry is the point — a curated
 *        free set to make the agent useful, and a paid door to the other 95.
 * Docs: https://blueagent.dev/.well-known/openapi.json
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { kv } from "@/lib/kv";
import { recordCall } from "@/lib/usage-daily";
import { internalX402Headers, hasInternalKey } from "@/lib/x402-internal";
import { encodeTransferWithMemo, isValidMemo } from "@/lib/b20/encode";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { parseUnits } from "viem";
import {
  type TxChain,
  parseTxChain,
  TX_CHAINS,
  isNativeToken,
  isPositiveDecimal,
  readTokenMeta,
} from "@/lib/tx-chains";
import { ROBINHOOD_SWAP_ROUTER_ADDRESS } from "@/lib/robinhood/swap";

export const runtime = "nodejs";
// Console commands (blue_idea/build/audit/ship/raise) wait on the LLM, which can
// take 30-50s. Without explicit maxDuration, Vercel's default cuts the function
// before inference replies → 504 to Claude Desktop. 120s leaves headroom for the
// longest case (blue_audit on a complex contract).
// (Said "Bankr LLM" until 2026-09-18. Bankr has not been in the inference path
// since 2026-07-20; the gateway is Virtuals via api/_lib/llm.ts → callLLM.)
export const maxDuration = 120;

// Free-tier internal bypass — MCP calls don't require x402 payment.
// Set INTERNAL_SERVICE_KEY in Vercel; the /api/x402/[tool] route accepts it
// via X-Blue-Internal and skips the USDC settlement step.
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

// ─── Tool definitions ─────────────────────────────────────────────────────────
// The manifest lives in @/lib/mcp-tools so /docs/mcp renders the SAME array this
// route serves. It was a local const with a hand-copied twin in app/docs/_data.ts,
// and the twin drifted to 63 entries — 7 of them tools nothing served. See the
// header of lib/mcp-tools.ts for the measurement.
const TOOLS = MCP_TOOLS;

// ─── Tool → hub ID map ────────────────────────────────────────────────────────
//
// ⚠️ TRIMMED 2026-09-26, from ~75 entries to the 10 hub_* + 1 blue_* the cut
// manifest actually serves. The deleted entries were not harmless: a name in
// this map is CALLABLE via tools/call even when it is absent from `TOOLS`, so
// leaving them would have produced 67 tools that no client can discover and any
// client can still invoke — the hidden-surface shape the retiring law in
// CLAUDE.md exists to stop. Advertised set and callable set are now the same set.
//
// Every catalog id below is asserted real by scripts/docs-truth-check.ts group 7,
// which regexes THIS BLOCK. Keep the `hub_x: "catalog-id",` formatting — the
// scanner is line-anchored and a reflowed entry silently stops being checked.

const HUB_MAP: Record<string, string> = {
  // Safety — the five an agent must reach for unprompted, before money moves.
  hub_risk_gate:        "risk-gate",
  hub_honeypot:         "honeypot-check",
  hub_contract_trust:   "contract-trust",
  hub_wallet_risk:      "wallet-risk",
  hub_liquidity_depth:  "liquidity-depth",
  // Live chain reads — Base 8453. Quoting any of these from model memory is
  // wrong by construction, which is why they are preloaded rather than found.
  hub_token_price:      "token-price",
  hub_wallet_holdings:  "wallet-holdings",
  hub_pool_scan:        "pool-scan",
  hub_gas_tracker:      "gas-tracker",
  // The door. `blue_call` reaches the other ~95 catalog tools over x402 and is
  // deliberately NOT in this map — it must not take the internal bypass.
  blue_registry:        "blue-registry",
};

// Only the two console commands that survived the cut. blue_idea / blue_ship /
// blue_raise ship as Claude Skills in packages/claude-plugin instead: a skill is
// progressively disclosed (name + description only until invoked), so those three
// cost no context here while staying fully available to any plugin user.
// `/api/console` still serves all five — this map governs MCP exposure, nothing else.
const CONSOLE_MAP: Record<string, string> = {
  blue_build: "build",
  blue_audit: "audit",
};

// ─── Internal API callers ─────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

// Some MCP tool schemas use agent-friendly field names that differ from the
// handler's expected body fields. Map them here, keyed by handler id, so the MCP
// path doesn't 400. The Hub-UI path already sends the correct fields, so this
// only touches MCP calls.
//
// Trimmed 2026-09-26 alongside HUB_MAP: 21 of the 22 entries keyed handlers no
// longer reachable from this surface. They now belong to `blue_call`, which is
// deliberately NOT remapped — it forwards `input` to the catalog handler
// untouched, because the shape it must match is the one `blue_registry` just
// published to the agent. A silent rewrite between "what the registry promised"
// and "what the handler received" is a bug an agent cannot see or debug.
const ARG_REMAP: Record<string, (a: Record<string, unknown>) => Record<string, unknown>> = {
  "pool-scan": (a) => ({ ...a, limit: a.limit !== undefined ? Number(a.limit) : 10 }),
};

/**
 * Typed error thrown from callHubTool → caught by tools/call → surfaced with
 * `isError: true`. Existed as a plain text stub before; a naive MCP client
 * would hand the stub back to the LLM as if it were tool output, so the LLM
 * "answered" with instructions to set env vars. isError kills that path.
 *
 * `code` categories:
 *   WALLET_REQUIRED       — bypass headers correct, but no user connected +
 *                           tool costs credits. Real fix is server-side
 *                           (this is what MCP tripped on Jul → now).
 *   INSUFFICIENT_CREDITS  — user connected via chat has empty ledger.
 *   MISSING_KEY           — INTERNAL_SERVICE_KEY unset in this deploy; free
 *                           bypass impossible; user should pay via /hub.
 *   PAYMENT_REQUIRED      — generic 402 fallback.
 *   UPSTREAM              — non-402 non-2xx from x402 route.
 */
class HubToolError extends Error {
  code: "WALLET_REQUIRED" | "INSUFFICIENT_CREDITS" | "MISSING_KEY" | "PAYMENT_REQUIRED" | "UPSTREAM";
  constructor(code: HubToolError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

async function callHubTool(toolId: string, rawArgs: Record<string, unknown>): Promise<string> {
  const args = ARG_REMAP[toolId] ? ARG_REMAP[toolId](rawArgs) : rawArgs;

  // Single source of truth for server-to-server x402 bypass headers. Ships
  // BOTH X-Blue-Internal AND X-Blue-Service:internal — the x402 route's
  // WALLET_REQUIRED guard needs the second header even when the first is
  // correct. See apps/web/src/lib/x402-internal.ts.
  const res = await fetch(`${BASE}/api/x402/${toolId}`, {
    method: "POST",
    headers: internalX402Headers(),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();

  if (res.status === 402) {
    // Parse the x402 route's structured error so a specific message reaches
    // the LLM instead of the misleading "set INTERNAL_SERVICE_KEY" stub the
    // old code returned for every 402.
    let parsed: { code?: string; error?: string } = {};
    try { parsed = JSON.parse(text) as typeof parsed; } catch {}
    const code = parsed.code ?? "";
    if (code === "WALLET_REQUIRED") {
      throw new HubToolError(
        "WALLET_REQUIRED",
        `Tool "${toolId}" is a paid tool. Server-side config gap: MCP call reached the internal bypass but was blocked by the wallet guard. If you're an operator, verify both X-Blue-Internal and X-Blue-Service:internal are attached (see @/lib/x402-internal). If you're an agent, pay via https://blueagent.dev/hub.`,
      );
    }
    if (code === "INSUFFICIENT_CREDITS") {
      throw new HubToolError(
        "INSUFFICIENT_CREDITS",
        // No "stake more BLUE for a bigger daily accrual" — staking has not fed
        // credits for a long time and the surface selling it is retired. Every
        // connected wallet gets the same daily bucket; more than that is bought.
        `Insufficient credits to call "${toolId}". Your daily allowance refreshes every 24h — top up in USDC at https://blueagent.dev/chat to keep going now.`,
      );
    }
    if (!hasInternalKey()) {
      throw new HubToolError(
        "MISSING_KEY",
        `Tool "${toolId}" requires payment (x402). Free MCP bypass is unavailable in this deployment (INTERNAL_SERVICE_KEY unset). Pay via https://blueagent.dev/hub.`,
      );
    }
    throw new HubToolError(
      "PAYMENT_REQUIRED",
      `Tool "${toolId}" returned 402 Payment Required. ${parsed.error ?? "Pay via https://blueagent.dev/hub."}`,
    );
  }
  if (res.status === 429) {
    throw new HubToolError("UPSTREAM", `Tool "${toolId}" rate-limited (429). Back off and retry.`);
  }
  if (!res.ok) {
    throw new HubToolError("UPSTREAM", `Tool "${toolId}" returned ${res.status}.`);
  }
  // Track MCP usage (paid path tracks via x402 route; internal path doesn't, so track here)
  try { await kv.incr(`usage:${toolId}`); } catch {}
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

async function callConsole(command: string, prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/console`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, prompt }),
    // Stay under the route's maxDuration (120s) so a slow Bankr LLM aborts
    // cleanly and surfaces as a JSON-RPC error envelope, instead of the whole
    // function being killed at 120s → hard 504 → client retry storm.
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) throw new Error(`console/${command} returned ${res.status}`);
  const data = await res.json() as { result?: string; text?: string };
  return data.result ?? data.text ?? JSON.stringify(data);
}

// ─── B20 MCP-native calldata builder ──────────────────────────────────────────
// Pure encoder — no keys, no x402 payment, no INTERNAL_SERVICE_KEY needed. Returns
// { to, data, value } for the user's own wallet to sign via EIP-5792 send_calls.
// This is why it works FREE even while the paid hub_* tools go through the bypass.
//
// ⚠️ Was SEVEN tools until 2026-09-26 (deploy / mint / burn / grant_mint_role /
// payment / check_activation / read_token). Six were retired from this surface with
// the 85→18 cut and their dispatch cases deleted in the same commit, NOT left
// unlisted-but-callable — see the HUB_MAP note above for why that distinction is the
// whole point. The encoders themselves live on in lib/b20/encode.ts with six other
// importers (the /app/b20 console, /api/b20/prepare, the pay page, chat ToolCards),
// so nothing was lost from the product; what was removed is MCP's copy of the door.
// Read-side B20 survives as catalog tools `b20-check` / `b20-analyze` / `b20-inspect`,
// reachable through blue_registry → blue_call.

const B20_ENCODE_TOOLS = new Set([
  "b20_encode_payment",
]);

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
function reqAddr(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!ADDR_RE.test(s)) throw new Error(`${field} must be a 0x-prefixed 40-hex address`);
  return s;
}

async function callB20Native(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "b20_encode_payment": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const to = reqAddr(args.to, "to");
      const amount = String(args.amount ?? "").trim();
      if (!amount) throw new Error("amount is required");
      const memo = String(args.memo ?? "").trim();
      if (!isValidMemo(memo)) throw new Error("memo must be 1-31 characters (bytes32 slot)");
      const decimals = args.decimals !== undefined ? Number(args.decimals) : 6;
      return JSON.stringify({
        to: tokenAddress,
        data: encodeTransferWithMemo({ to, amount, decimals, memo }),
        value: "0x0",
        chainId: 8453,
        chain: "base",
        note: "Sign with the sender wallet on Base 8453. Emits a Memo event indexed by the order id for reconciliation.",
      }, null, 2);
    }
    default:
      throw new Error(`Unknown B20 tool: ${name}`);
  }
}

// ─── blue_call — the paid door to the rest of the catalog ─────────────────────
//
// THE ONE PLACE ON THIS SURFACE THAT DOES NOT TAKE THE INTERNAL BYPASS.
//
// `callHubTool` above attaches `internalX402Headers()`, which is why the 15
// preloaded tools are free over MCP. `blue_call` deliberately does not, so the
// x402 route answers a real 402 carrying real `paymentRequirements` (USDC on
// Base 8453, EIP-3009 transferWithAuthorization, payTo + exact amount + nonce).
// The agent signs that authorization with ITS OWN wallet and calls again with
// the resulting header in `payment`.
//
// Why this asymmetry is deliberate and must not be "tidied up" into one path:
//   • The free set exists so an agent is useful on connect and can run safety
//     checks without a wallet. It is 15 tools, curated, and bounded.
//   • The paid door is the other ~95. Making THOSE free would hand the whole
//     catalog away on a surface with no metering; making the free 15 paid would
//     mean an agent cannot run a honeypot check before its first transaction.
//
// ⚠️ We relay the 402 body VERBATIM. Do not summarise, re-wrap, or "helpfully"
// restate the payment requirements — an agent has to sign the exact struct the
// facilitator will verify, and a paraphrase of a payment requirement is an
// unsignable payment requirement. Same reason the x-payment header is passed
// through byte-for-byte rather than parsed.
//
// ⚠️ This function must never learn to hold or spend a key. It forwards a header
// the CALLER produced. If a future change has this route signing anything, that
// is a custody change and it is ShunTr's call, not a refactor.

async function callPaidTool(
  toolId: string,
  input: Record<string, unknown>,
  payment: string,
): Promise<{ text: string; isError: boolean }> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(toolId)) {
    return {
      isError: true,
      text: `[BAD_TOOL_ID] "${toolId}" is not a catalog id. Ids are lowercase and hyphenated (e.g. "honeypot-check"), carry no hub_ prefix, and come from blue_registry — do not construct one from an MCP tool name.`,
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payment) headers["X-PAYMENT"] = payment;

  const res = await fetch(`${BASE}/api/x402/${toolId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();

  if (res.status === 402) {
    // Verbatim relay + a short instruction block. The instruction is OUTSIDE the
    // JSON so nothing inside `paymentRequirements` is altered.
    const settle = res.headers.get("x-payment-response");
    return {
      isError: false,
      text: [
        `HTTP 402 — payment required for catalog tool "${toolId}".`,
        ``,
        `Sign the authorization described below with your own wallet, then call blue_call`,
        `again with the SAME tool and input plus payment=<base64 X-PAYMENT header>.`,
        `Blue Agent never holds your key and cannot pull funds; you authorise one exact amount.`,
        ``,
        text,
        ...(settle ? [``, `x-payment-response: ${settle}`] : []),
      ].join("\n"),
    };
  }
  if (res.status === 404) {
    return {
      isError: true,
      text: `[NO_SUCH_TOOL] No catalog tool with id "${toolId}". Call blue_registry to list real ids — do NOT retry with a guessed variant, and do not answer from memory as if the tool had run.`,
    };
  }
  if (res.status === 429) {
    return { isError: true, text: `[RATE_LIMITED] "${toolId}" returned 429. Back off and retry.` };
  }
  if (!res.ok) {
    return { isError: true, text: `[UPSTREAM] "${toolId}" returned ${res.status}. ${text.slice(0, 500)}` };
  }

  try { return { isError: false, text: JSON.stringify(JSON.parse(text), null, 2) }; }
  catch { return { isError: false, text }; }
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

async function postPrepare(url: string, body: unknown, label: string): Promise<string> {
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

function requireChain(args: Record<string, unknown>, field = "chain"): TxChain {
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

async function callSwapTx(args: Record<string, unknown>): Promise<string> {
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
  const slippageBps = args.slippageBps !== undefined ? Number(args.slippageBps) : 100;

  // Resolve decimals on the token's OWN chain so the agent never does exponent
  // math. See lib/tx-chains.ts — a wrong exponent here is a wrong trade size.
  const inIsNative = isNativeToken(tokenIn);
  const decimals = inIsNative ? 18 : (await readTokenMeta(chain, reqAddr(tokenIn, "tokenIn") as `0x${string}`)).decimals;
  const amountInBase = parseUnits(amountIn, decimals).toString();

  if (chain === "base") {
    // 0x AllowanceHolder. GET, and it answers 200 with { error } rather than a
    // non-2xx for a bad pair, so the ok-check below reads the body not the status.
    const qs = new URLSearchParams({
      sellToken:  inIsNative ? "ETH" : tokenIn,
      buyToken:   isNativeToken(tokenOut) ? "ETH" : tokenOut,
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
      approve: data.allowanceTarget && !inIsNative
        ? { token: tokenIn, spender: data.allowanceTarget, note: "Approve before the swap if current allowance is short." }
        : null,
      meta: {
        venue: "0x AllowanceHolder", from: fromAddress,
        tokenIn, tokenOut, amountIn, amountInBase, decimals, slippageBps,
        buyAmount: data.buyAmount ?? null, minBuyAmount: data.minBuyAmount ?? null,
        explorer: TX_CHAINS.base.explorer,
      },
      note: "Unsigned. Sign in your own wallet on Base 8453. Blue Agent holds no keys.",
    }, null, 2);
  }

  // Robinhood Chain 4663 — Blue Agent's deployed RobinhoodSwapRouter over Uniswap V3.
  if (!ROBINHOOD_SWAP_ROUTER_ADDRESS) {
    throw new Error("Robinhood Chain 4663 swap router is not configured in this deployment.");
  }
  const outIsNative = isNativeToken(tokenOut);
  if (inIsNative && outIsNative) throw new Error("tokenIn and tokenOut cannot both be native ETH");
  const body: Record<string, unknown> = {
    router:    ROBINHOOD_SWAP_ROUTER_ADDRESS,
    recipient: fromAddress,
    amountIn:  amountInBase,
    // The route's own three modes: buy = ETH→token, sell = token→ETH, and
    // tokenIn present = token→token. `token` carries tokenOut except on sell.
    ...(inIsNative
      ? { direction: "buy",  token: tokenOut }
      : outIsNative
        ? { direction: "sell", token: tokenIn }
        : { tokenIn, token: tokenOut }),
  };
  return postPrepare(`${BASE}/api/robinhood/router/swap-prepare`, body, "Robinhood Chain 4663 swap-prepare");
}

async function callSendTx(args: Record<string, unknown>): Promise<string> {
  const chain = requireChain(args);
  const body = {
    fromAddress: reqAddr(args.fromAddress, "fromAddress"),
    toAddress:   reqAddr(args.toAddress, "toAddress"),
    token:       String(args.token ?? "").trim(),
    amount:      String(args.amount ?? "").trim(),
  };
  if (!body.token)  throw new Error("token is required (0x… address, or \"ETH\"/\"NATIVE\")");
  if (!isPositiveDecimal(body.amount)) {
    throw new Error("amount must be a positive decimal string in WHOLE units, e.g. \"25.5\" — not base units");
  }
  // Two routes, one shape — the Base one was written to mirror the RH one field
  // for field precisely so this switch is a URL and nothing else. If you change
  // a field name in either route, change it in both in the same commit.
  const url = chain === "base"
    ? `${BASE}/api/base/send-prepare`
    : `${BASE}/api/robinhood/router/send-prepare`;
  return postPrepare(url, body, `${TX_CHAINS[chain].label} ${TX_CHAINS[chain].chainId} send-prepare`);
}

async function callBridgeTx(args: Record<string, unknown>): Promise<string> {
  const fromChain = requireChain(args, "fromChain");
  const toChain   = requireChain(args, "toChain");
  if (fromChain === toChain) {
    throw new Error(`fromChain and toChain are both "${fromChain}" — a bridge needs two different chains. Use blue_send_tx for a transfer within one chain.`);
  }
  const amount = String(args.amount ?? "").trim();
  if (!isPositiveDecimal(amount)) {
    throw new Error("amount must be a positive decimal string in WHOLE units, e.g. \"100\" — not base units");
  }
  const body = {
    fromChain, toChain,
    fromAddress: reqAddr(args.fromAddress, "fromAddress"),
    ...(args.recipient ? { recipient: reqAddr(args.recipient, "recipient") } : {}),
    token:  String(args.token ?? "").trim(),
    amount,
  };
  if (!body.token) throw new Error("token is required (0x… address as it exists on fromChain, or \"ETH\")");
  return postPrepare(
    `${BASE}/api/robinhood/router/bridge-prepare`,
    body,
    `bridge ${TX_CHAINS[fromChain].chainId} → ${TX_CHAINS[toChain].chainId}`,
  );
}

// ─── hub_hood_arrow — resolve one Blue Hood signal ────────────────────────────
//
// Reads the PUBLIC feed (/api/hood/arrows) rather than KV directly, so this
// surface inherits the feed's trust boundary — `isPublicArrow` already strips
// test and non-engine arrows there, and one definition of "publishable" is the
// point (three hand-rolled copies of that predicate is a real past bug).
//
// ⚠️ THE CHAIN SEMANTICS ARE LOAD-BEARING AND MIRROR api/chat/route.ts:
// `chain` absent means "either desk", NOT "robinhood". Conflating those two is
// bug #206. When a chain WAS named and that desk has no arrow, we say so and
// report whether the OTHER desk has one — as a different question the user may
// ask, never as the answer. Substituting the other chain's arrow is the failure
// mode this whole block exists to prevent.

async function callHoodArrow(args: Record<string, unknown>): Promise<string> {
  const arrowIdArg = typeof args.arrow_id === "string" ? args.arrow_id.trim() : "";
  const serialArg  = typeof args.serial === "string"
    ? `#${args.serial.trim().replace(/^#/, "").padStart(4, "0")}` : "";
  const tickerArg  = typeof args.ticker === "string" ? args.ticker.trim().toUpperCase() : "";
  const chainArg   = args.chain === "base" || args.chain === "robinhood" ? args.chain : undefined;

  if (!arrowIdArg && !serialArg && !tickerArg) {
    throw new Error("Pass one of arrow_id, serial, or ticker.");
  }

  const res = await fetch(`${BASE}/api/hood/arrows?limit=200&fields=full`, {
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as {
    ok?: boolean; reason?: string; error?: string;
    arrows?: Array<Record<string, unknown>>;
  };
  if (!res.ok || data.ok === false) {
    // A KV outage is NOT an empty feed — saying "no arrows" here would publish
    // "Blue Hood has no track record" as fact. Same rule as the feed route.
    throw new Error(
      `Blue Hood feed unavailable (${data.reason ?? res.status}). The arrow record is UNKNOWN right now, not empty — do not tell the user there are no arrows.`,
    );
  }
  const arrows = data.arrows ?? [];
  const chainOf = (a: Record<string, unknown>): string =>
    typeof a.chain === "string" ? a.chain : "robinhood"; // pre-Base rows predate the field

  let hit: Record<string, unknown> | undefined;
  let otherChainHit: { serial: unknown; chain: string } | undefined;

  if (arrowIdArg) {
    hit = arrows.find((a) => a.id === arrowIdArg || a.arrow_id === arrowIdArg);
  } else if (serialArg) {
    hit = arrows.find((a) => a.serial === serialArg);
  } else {
    for (const a of arrows) {
      if (String(a.ticker ?? "").toUpperCase() !== tickerArg) continue;
      if (chainArg && chainOf(a) !== chainArg) {
        otherChainHit ??= { serial: a.serial, chain: chainOf(a) };
        continue;
      }
      hit = a; break; // feed is newest-first
    }
  }

  if (!hit) {
    if (tickerArg && chainArg) {
      return JSON.stringify({
        not_found: true, reason: "no_arrow_on_chain",
        chain: chainArg, chainId: TX_CHAINS[chainArg].chainId, ticker: tickerArg,
        other_chain: otherChainHit ?? null,
        instruction: otherChainHit
          ? `Blue Hood has NOT fired a ${chainArg} arrow for ${tickerArg}. It HAS fired ${tickerArg} on ${otherChainHit.chain} (newest ${String(otherChainHit.serial)}) — you may OFFER that as a different question, but do NOT present it as the ${chainArg} answer and do NOT quote its numbers.`
          : `Blue Hood has no ${tickerArg} arrow on either desk. Say so plainly and do not invent one.`,
      }, null, 2);
    }
    return JSON.stringify({
      not_found: true,
      query: { arrow_id: arrowIdArg, serial: serialArg, ticker: tickerArg, chain: chainArg ?? null },
      instruction: "No arrow matches that reference. Tell the user in one line and point them at https://blueagent.dev/hood/inbox. Do NOT invent an arrow.",
    }, null, 2);
  }

  const chain = chainOf(hit);
  const firedAt = typeof hit.fired_at === "string" ? Date.parse(hit.fired_at) : NaN;
  return JSON.stringify({
    ...hit,
    chain,
    chainId: chain === "base" ? TX_CHAINS.base.chainId : TX_CHAINS.robinhood.chainId,
    age_hours: Number.isFinite(firedAt) ? Math.round((Date.now() - firedAt) / 36_000) / 100 : null,
    instruction: `This arrow is on ${chain === "base" ? "Base 8453" : "Robinhood Chain 4663"} — STATE THAT CHAIN in your answer. Answer only from verdict_note, one_line_context and facts_at_fire. A graded arrow is history: describe it in the past tense with its age. NEVER invent a number or a reason.`,
  }, null, 2);
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

const JSON_HEADERS = {
  "Content-Type":                 "application/json",
  "Access-Control-Allow-Origin":  "*",
  "Cache-Control":                "no-store",
};

const SSE_HEADERS = {
  "Content-Type":                 "text/event-stream",
  "Cache-Control":                "no-cache, no-transform",
  "Connection":                   "keep-alive",
  "Access-Control-Allow-Origin":  "*",
  "X-Accel-Buffering":            "no", // disable nginx buffering
};

/** Wrap a JSON-RPC envelope as a single SSE `message` event. */
function sseEnvelope(envelope: object): string {
  return `event: message\ndata: ${JSON.stringify(envelope)}\n\n`;
}

/** True if the client prefers SSE (Streamable HTTP per MCP 2025-03-26). */
function wantsSse(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/event-stream");
}

function respond(envelope: object, useSse: boolean): NextResponse {
  if (useSse) {
    return new NextResponse(sseEnvelope(envelope), { headers: SSE_HEADERS });
  }
  return new NextResponse(JSON.stringify(envelope), { headers: JSON_HEADERS });
}

function ok(id: unknown, result: unknown, useSse = false) {
  return respond({ jsonrpc: "2.0", id, result }, useSse);
}

function err(id: unknown, code: number, message: string, useSse = false) {
  return respond({ jsonrpc: "2.0", id, error: { code, message } }, useSse);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const useSse = wantsSse(req);

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try { body = await req.json(); }
  catch { return err(null, -32700, "Parse error", useSse); }

  const { id, method, params } = body;
  const p = (params ?? {}) as Record<string, unknown>;

  // ── initialize ──────────────────────────────────────────────────────────────
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "blue-agent", version: "1.0.0" },
      instructions: `Blue Agent MCP server — ${TOOLS.length} tools for Base builders. Docs: https://blueagent.dev/.well-known/openapi.json`,
    }, useSse);
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // ── ping ────────────────────────────────────────────────────────────────────
  if (method === "ping") {
    return ok(id, {}, useSse);
  }

  // ── tools/list ──────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS }, useSse);
  }

  // ── tools/call ──────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const name = p.name as string;
    const args = (p.arguments ?? {}) as Record<string, unknown>;

    if (!name) return err(id, -32602, "tools/call requires name", useSse);

    // What this call is recorded as in the daily meter. Resolved to the CATALOG
    // id where one exists (`hub_token_price` → `token-price`) so the same tool
    // reached through MCP and through x402 aggregates into one row instead of
    // two rows that look like two different tools. Console commands share the
    // `blue_<cmd>` namespace /api/console already writes to, for the same reason.
    const meterId = HUB_MAP[name] ?? (CONSOLE_MAP[name] ? `blue_${CONSOLE_MAP[name]}` : name);

    try {
      // Console tools
      const consoleCmd = CONSOLE_MAP[name];
      if (consoleCmd) {
        const prompt = args.prompt as string;
        if (!prompt) return err(id, -32602, "prompt is required", useSse);
        const text = await callConsole(consoleCmd, prompt);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // Hub tools
      const hubId = HUB_MAP[name];
      if (hubId) {
        const text = await callHubTool(hubId, args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // blue_call — the paid door to the other 95 catalog tools.
      // ⚠️ Deliberately NOT routed through HUB_MAP/callHubTool: that path attaches
      // `internalX402Headers()` and the tool runs free. This one attaches nothing
      // but what the CALLER handed us, so an unpaid call gets a real 402 back and
      // the agent settles it with its own wallet. Keep the two paths apart.
      if (name === "blue_call") {
        const toolId = String(args.tool ?? "").trim();
        if (!toolId) return err(id, -32602, "tool is required (a catalog id from blue_registry, e.g. \"honeypot-check\")", useSse);
        const input = (args.input ?? {}) as Record<string, unknown>;
        const payment = typeof args.payment === "string" ? args.payment.trim() : "";
        const r = await callPaidTool(toolId, input, payment);
        // Meter under the CATALOG id, not "blue_call" — otherwise every paid tool
        // reached this way aggregates into one meaningless row and the per-tool
        // demand signal (the thing that decides what gets retired) disappears.
        await recordCall(toolId, "mcp", r.isError ? "err" : "ok");
        return ok(id, { content: [{ type: "text", text: r.text }], ...(r.isError ? { isError: true } : {}) }, useSse);
      }

      // Execution primitives — unsigned calldata, user signs. See the block above
      // `postPrepare` for why `chain` is required with no default on all of these.
      if (name === "blue_swap_tx") {
        const text = await callSwapTx(args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }
      if (name === "blue_send_tx") {
        const text = await callSendTx(args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }
      if (name === "blue_bridge_tx") {
        const text = await callBridgeTx(args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // hub_hood_arrow — reads the live arrow feed directly (not a catalog tool).
      if (name === "hub_hood_arrow") {
        const text = await callHoodArrow(args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // B20 MCP-native calldata builders (free — no x402, no bypass key)
      if (B20_ENCODE_TOOLS.has(name)) {
        const text = await callB20Native(name, args);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      return err(id, -32601, `Unknown tool: ${name}`, useSse);

    } catch (e) {
      const err = e as Error & { code?: string };
      // Record the FAILURE too. `callHubTool` increments `usage:<id>` only after
      // a 2xx, so before this a tool that was called constantly and failed every
      // time was indistinguishable from a tool nobody called — demand present,
      // counter reading zero. That is the shape most likely to get a tool
      // retired for the wrong reason.
      await recordCall(meterId, "mcp", "err");
      // HubToolError carries a machine-readable code (WALLET_REQUIRED,
      // INSUFFICIENT_CREDITS, MISSING_KEY, PAYMENT_REQUIRED, UPSTREAM); prefix
      // it so agents can dispatch on the code without regex-scraping the msg.
      const prefix = err.code ? `[${err.code}] ` : "Error: ";
      return ok(id, { content: [{ type: "text", text: `${prefix}${err.message}` }], isError: true }, useSse);
    }
  }

  return err(id, -32601, `Method not found: ${method}`, useSse);
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    },
  });
}

// GET — discovery + Streamable HTTP server→client stream
//
// When invoked by a browser / curl with `Accept: application/json`, returns
// discovery JSON for humans.
//
// When invoked with `Accept: text/event-stream` (MCP 2025-03-26 Streamable
// HTTP), the client is opening the server→client notification stream. We do
// NOT emit any server-initiated messages (no notifications/sampling), so per
// the spec we MUST return 405 — this tells the client "no server stream here"
// and it proceeds without holding a connection open.
//
// Previously we returned a never-closing SSE ReadableStream here. On serverless
// that kept the function alive until maxDuration (120s) for EVERY connected
// client, producing a ~2m P75 and a timeout/504 + retry storm on /api/mcp.
// Returning 405 is instant and loop-free.
export async function GET(req: NextRequest) {
  if (wantsSse(req)) {
    return new NextResponse(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Server-initiated SSE stream not supported" } }),
      { status: 405, headers: { ...JSON_HEADERS, Allow: "POST, OPTIONS" } },
    );
  }

  return NextResponse.json({
    name:        "Blue Agent MCP Server",
    version:     "1.0.0",
    protocol:    "MCP JSON-RPC 2.0 (Streamable HTTP, spec 2025-03-26)",
    tools:       TOOLS.length,
    tool_names:  TOOLS.map((t) => t.name),
    config: {
      claude_desktop: {
        mcpServers: {
          "blue-agent": { url: "https://blueagent.dev/api/mcp" },
        },
      },
      claude_code: "claude mcp add blue-agent --transport http https://blueagent.dev/api/mcp",
      mcp_remote: {
        mcpServers: {
          "blue-agent": {
            command: "npx",
            args:    ["-y", "mcp-remote", "https://blueagent.dev/api/mcp"],
          },
        },
      },
      cursor: "https://blueagent.dev/api/mcp",
    },
    docs: "https://blueagent.dev/.well-known/openapi.json",
  }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
