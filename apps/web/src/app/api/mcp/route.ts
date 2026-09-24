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
 * Tools: 86 — 15 blue_* + 64 hub_* + 7 b20_*
 *        The 7 b20_* (deploy/mint/burn/grant/payment/check_activation/read_token) are
 *        MCP-only — pure calldata builders + on-chain reads, no x402 payment.
 *        MEASURED 2026-09-17 against a live tools/list POST, and the source agrees.
 *        The header said 87 for months; it was off by one, which is exactly why this
 *        line is now pinned by apps/web/scripts/docs-truth-check.ts and fails CI if
 *        it drifts. Do not hand-edit it — re-measure, then update both.
 *
 *        This is NOT the catalog total. `AGENT_TOOLS` holds 111; the hub_* names here
 *        are a deliberately-curated subset, and each maps to a real catalog id (also
 *        checked by docs-truth-check.ts, because an MCP tool pointing at a toolId that
 *        does not exist is a 404 an agent cannot diagnose).
 * Docs: https://blueagent.dev/.well-known/openapi.json
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { kv } from "@/lib/kv";
import { recordCall } from "@/lib/usage-daily";
import { internalX402Headers, hasInternalKey } from "@/lib/x402-internal";
import {
  buildB20Calldata,
  encodeMint,
  encodeMintWithMemo,
  encodeBurnWithMemo,
  encodeGrantMintRole,
  encodeTransferWithMemo,
  isValidMemo,
} from "@/lib/b20/encode";
import { getB20Activation } from "@/lib/b20/activation";
import { inspectB20 } from "@/lib/b20/inspect";
import { MCP_TOOLS } from "@/lib/mcp-tools";

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

const HUB_MAP: Record<string, string> = {
  hub_agent_score:      "agent-score",
  hub_market_fit:       "market-fit",
  hub_token_pick:       "token-pick-signal",
  hub_narrative:        "narrative-position",
  hub_ecosystem:        "ecosystem-digest",
  hub_competitor_scan:  "competitor-scan",
  hub_investor_memo:    "investor-memo",
  hub_repo_health:      "repo-health",
  hub_base_grant:       "base-grant-finder",
  hub_risk_gate:        "risk-gate",
  hub_honeypot:         "honeypot-check",
  hub_deep_analysis:    "deep-analysis",
  hub_whale_signal:     "whale-copy-signal",
  hub_fundraise_timing: "fundraise-timing",
  // Security (extended)
  hub_contract_trust:       "contract-trust",
  hub_aml_screen:           "aml-screen",
  hub_key_exposure:         "key-exposure",
  // Research (extended)
  hub_token_momentum:       "token-momentum-scanner",
  hub_whale_tracker:        "whale-tracker",
  hub_community_sentiment:  "community-sentiment",
  // Builder (extended)
  hub_launch_simulator:     "launch-simulator-1",
  hub_token_launch:         "token-launch-readiness",
  hub_builder_dd:           "builder-deep-dd",
  hub_roadmap:              "roadmap-validator",
  hub_gtm:                  "gtm-brief",
  hub_pitch_intel:          "pitch-intelligence",
  // Premium
  hub_defi_opportunity:     "defi-opportunity",
  hub_protocol_risk:        "protocol-risk-monitor",
  // Multi-agent
  hub_multi_agent:          "multi-agent-workflow",
  hub_agent_match:          "agent-collab-match",
  hub_agent_perf:           "agent-performance",
  // Community
  hub_community_growth:     "community-growth-playbook",
  hub_thread_intel:         "thread-intelligence",
  hub_narrative_pulse:      "narrative-position",
  // Blue first-party (extended)
  blue_monitor:             "blue-monitor",
  blue_registry:            "blue-registry",
  blue_research:            "blue-research",
  blue_compose:             "blue-compose",
  blue_deploy:              "blue-deploy",
  blue_analytics:           "blue-analytics",
  blue_simulate:            "blue-simulate",
  blue_stream:              "blue-stream",
  // Catalog parity (extended) — every remaining first-party catalog tool
  hub_stack:                "stack-recommender",
  hub_protocol_compare:     "base-protocol-comparison",
  hub_airdrop:              "airdrop-check",
  hub_dex_flow:             "dex-flow",
  hub_lp_analyzer:          "lp-analyzer",
  hub_launch_sim_tier2:     "launch-simulator-2",
  hub_launch_sim_tier3:     "launch-simulator-3",
  hub_grant_eval:           "grant-evaluator",
  // B20 / Beryl
  hub_b20_analyze:          "b20-analyze",
  hub_b20_tracker:          "b20-tracker",
  // On-chain primitives & data (new batch)
  hub_token_price:          "token-price",
  hub_pool_scan:            "pool-scan",
  hub_wallet_holdings:      "wallet-holdings",
  hub_new_pools:            "new-pools",
  hub_gas_tracker:          "gas-tracker",
  hub_quick_safety:         "quick-safety",
  hub_wallet_risk:          "wallet-risk",
  hub_b20_check:            "b20-check",
  hub_liquidity_depth:      "liquidity-depth",
  hub_token_distribution:   "token-distribution",
  hub_base_alpha:           "base-alpha",
  hub_token_alpha:          "token-alpha",
  hub_protocol_health:      "protocol-health",
  hub_founder_check:        "founder-check",
  hub_narrative_live:       "narrative-pulse",
  hub_base_activity:        "base-activity-score",
  hub_scam_detector:        "scam-detector",
  hub_cross_yield:          "cross-protocol-yield",
  hub_agent_readiness:      "agent-readiness",
  hub_base_pulse:           "base-pulse",
};

const CONSOLE_MAP: Record<string, string> = {
  blue_idea:  "idea",
  blue_build: "build",
  blue_audit: "audit",
  blue_ship:  "ship",
  blue_raise: "raise",
};

// ─── Internal API callers ─────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

// Some MCP tool schemas use agent-friendly field names (task, agent, pitch,
// target, handle) that differ from the handler's expected body fields. Map them
// here, keyed by handler id, so the MCP path doesn't 400. The Hub-UI path
// already sends the correct fields, so this only touches MCP calls.
const ARG_REMAP: Record<string, (a: Record<string, unknown>) => Record<string, unknown>> = {
  "repo-health":          (a) => ({ ...a, repo: a.repo ?? a.url }),
  "community-sentiment":  (a) => ({ ...a, project: a.project ?? a.target }),
  "builder-deep-dd":      (a) => ({ ...a, target: a.target ?? a.handle }),
  "roadmap-validator":    (a) => ({ ...a, project: a.project ?? "this project", roadmap: a.roadmap }),
  "gtm-brief":            (a) => ({ ...a, project: a.project, description: a.description ?? a.target ?? a.project }),
  "pitch-intelligence":   (a) => ({ ...a, project: a.project ?? a.pitch, description: a.description ?? a.pitch }),
  "multi-agent-workflow": (a) => ({ ...a, goal: a.goal ?? a.task }),
  "agent-collab-match":   (a) => ({ ...a, agent_a: a.agent_a ?? a.task, agent_b: a.agent_b ?? "best-fit Base ecosystem agent", collab_goal: a.collab_goal ?? a.task }),
  "agent-performance":    (a) => ({ ...a, handle: a.handle ?? a.agent }),
  // Catalog parity (extended) — mirror each tool's x402Body so MCP calls match
  // the handler's expected body exactly (same contract the Hub UI sends).
  "stack-recommender":        (a) => ({ ...a, description: a.description ?? a.project, team_size: a.team_size ?? "1", timeline: a.timeline ?? "" }),
  "base-protocol-comparison": (a) => ({ ...a, category: a.category ?? "Base DeFi", use_case: a.use_case ?? "" }),
  "lp-analyzer":              (a) => ({ ...a, token1: a.token1 ?? "", entryPrice: a.entryPrice ?? "", investedAmount: a.investedAmount ?? "" }),
  "launch-simulator-2":       (a) => ({ ...a, description: a.description ?? "", ticker: a.ticker ?? "", contract: a.contract ?? "" }),
  "launch-simulator-3":       (a) => ({ ...a, description: a.description ?? "", ticker: a.ticker ?? "", contract: a.contract ?? "" }),
  "grant-evaluator":          (a) => ({ ...a, teamBackground: a.teamBackground ?? "", requestedAmount: a.requestedAmount ?? "", milestones: a.milestones ?? "", githubUrl: a.githubUrl ?? "" }),
  // On-chain primitives & data (new batch) — numeric coercions + defaults
  "pool-scan":               (a) => ({ ...a, limit: a.limit !== undefined ? Number(a.limit) : 10 }),
  "new-pools":               (a) => ({ ...a, hours: a.hours !== undefined ? Number(a.hours) : 24 }),
  "cross-protocol-yield":    (a) => ({ ...a, risk_tolerance: a.risk_tolerance ?? "medium" }),
  "narrative-pulse":         (a) => ({ ...a, focus: a.focus ?? "" }),
  "base-alpha":              (a) => a,
  "base-pulse":              (a) => a,
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

async function callBuilderScore(handle: string): Promise<string> {
  const res = await fetch(`https://blueagent.dev/api/builder-score?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`Builder Score API: ${res.status}`);
  return JSON.stringify(await res.json(), null, 2);
}

// ─── B20 MCP-native calldata builders ─────────────────────────────────────────
// Pure encoders — no keys, no x402 payment, no INTERNAL_SERVICE_KEY needed. Each
// returns { to, data, value } for the user's own wallet to sign via EIP-5792
// send_calls / Base MCP. This is why they work FREE even when the paid hub_*
// tools are gated behind the payment bypass.

const B20_ENCODE_TOOLS = new Set([
  "b20_encode_deploy",
  "b20_encode_mint",
  "b20_encode_burn",
  "b20_encode_grant_mint_role",
  "b20_encode_payment",
  "b20_check_activation",
  "b20_read_token",
]);

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
function reqAddr(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!ADDR_RE.test(s)) throw new Error(`${field} must be a 0x-prefixed 40-hex address`);
  return s;
}
function chainIdToNetwork(c: unknown): "mainnet" | "sepolia" {
  return Number(c) === 84532 ? "sepolia" : "mainnet";
}

async function callB20Native(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "b20_encode_deploy": {
      const variant = args.variant === "stablecoin" ? "stablecoin" : "asset";
      const admin = reqAddr(args.admin, "admin");
      const symbol = String(args.symbol ?? "").trim();
      const tokenName = String(args.name ?? "").trim();
      if (!tokenName) throw new Error("name is required");
      if (!symbol) throw new Error("symbol is required");
      const chainId = args.chainId !== undefined ? Number(args.chainId) : 8453;
      const built = buildB20Calldata({
        name: tokenName,
        symbol,
        variant,
        admin,
        decimals: args.decimals !== undefined ? Number(args.decimals) : undefined,
        currency_code: args.currency_code ? String(args.currency_code) : undefined,
        supply_cap: args.supply_cap ? String(args.supply_cap) : undefined,
        initial_supply: args.initial_supply ? String(args.initial_supply) : undefined,
      });
      return JSON.stringify({
        to: built.factory,
        data: built.data,
        value: "0x0",
        chainId,
        salt: built.salt,
        decimals: built.decimals,
        variant,
        note: "Sign with the admin wallet via EIP-5792 send_calls / Base MCP. Run b20_check_activation first — createB20 reverts until B20 is active on this chain.",
      }, null, 2);
    }
    case "b20_encode_mint": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const to = reqAddr(args.to, "to");
      const amount = String(args.amount ?? "").trim();
      if (!amount) throw new Error("amount is required");
      const decimals = Number(args.decimals);
      if (!Number.isFinite(decimals)) throw new Error("decimals is required");
      const memo = args.memo ? String(args.memo) : "";
      if (memo && !isValidMemo(memo)) throw new Error("memo must be non-empty and fit in 32 bytes (≤31 chars)");
      const data = memo
        ? encodeMintWithMemo({ to, amount, decimals, memo })
        : encodeMint({ to, amount, decimals });
      return JSON.stringify({
        to: tokenAddress,
        data,
        value: "0x0",
        note: `Sign with a wallet holding MINT_ROLE.${memo ? " Uses mintWithMemo." : ""}`,
      }, null, 2);
    }
    case "b20_encode_burn": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const amount = String(args.amount ?? "").trim();
      if (!amount) throw new Error("amount is required");
      const decimals = Number(args.decimals);
      if (!Number.isFinite(decimals)) throw new Error("decimals is required");
      const memo = String(args.memo ?? "").trim();
      if (!isValidMemo(memo)) throw new Error("memo must be non-empty and fit in 32 bytes (≤31 chars)");
      return JSON.stringify({
        to: tokenAddress,
        data: encodeBurnWithMemo({ amount, decimals, memo }),
        value: "0x0",
        note: "Sign with a wallet holding BURN_ROLE. Burns from the caller's own balance.",
      }, null, 2);
    }
    case "b20_encode_grant_mint_role": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const account = reqAddr(args.account, "account");
      return JSON.stringify({
        to: tokenAddress,
        data: encodeGrantMintRole(account),
        value: "0x0",
        note: "Sign with the DEFAULT_ADMIN_ROLE holder. Grants MINT_ROLE to the account.",
      }, null, 2);
    }
    case "b20_encode_payment": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const to = reqAddr(args.to, "to");
      const amount = String(args.amount ?? "").trim();
      if (!amount) throw new Error("amount is required");
      const memo = String(args.memo ?? "").trim();
      if (!isValidMemo(memo)) throw new Error("memo must be non-empty and fit in 32 bytes (≤31 chars)");
      const decimals = args.decimals !== undefined ? Number(args.decimals) : 6;
      return JSON.stringify({
        to: tokenAddress,
        data: encodeTransferWithMemo({ to, amount, decimals, memo }),
        value: "0x0",
        note: "Sign with the sender wallet. Emits a Memo event indexed by the order id for reconciliation.",
      }, null, 2);
    }
    case "b20_check_activation": {
      const network = chainIdToNetwork(args.chainId);
      const act = await getB20Activation(network);
      // act.ok === false ⟹ registry read failed → status UNKNOWN, never claim active.
      const known = act.ok;
      const asset = known ? act.asset : null;
      const stablecoin = known ? act.stablecoin : null;
      const live = known ? (act.asset || act.stablecoin) : null;
      return JSON.stringify({
        network,
        chainId: network === "sepolia" ? 84532 : 8453,
        known,
        live,
        asset,
        stablecoin,
        source: "on-chain ActivationRegistry 0x8453…0001 · isActivated",
        note: known
          ? (live ? "B20 is active — deploys will succeed." : "B20 is NOT yet active on this chain — createB20 will revert.")
          : "Could not read the ActivationRegistry right now — status unknown. Retry shortly.",
      }, null, 2);
    }
    case "b20_read_token": {
      const tokenAddress = reqAddr(args.tokenAddress, "tokenAddress");
      const network = chainIdToNetwork(args.chainId);
      const account = args.account ? reqAddr(args.account, "account") : undefined;
      const result = await inspectB20(tokenAddress, network, account);
      return JSON.stringify(result, null, 2);
    }
    default:
      throw new Error(`Unknown B20 tool: ${name}`);
  }
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

      // blue_score
      if (name === "blue_score") {
        const handle = args.handle as string;
        if (!handle) return err(id, -32602, "handle is required", useSse);
        const text = await callBuilderScore(handle);
        await recordCall(meterId, "mcp", "ok");
        return ok(id, { content: [{ type: "text", text }] }, useSse);
      }

      // blue_new — can't scaffold files server-side, explain how to use locally
      if (name === "blue_new") {
        const projectName = args.name as string;
        const type = args.type as string;
        return ok(id, {
          content: [{
            type: "text",
            text: [
              `To scaffold a ${type} project named "${projectName}", run locally:`,
              ``,
              `  npx @blueagent/skill`,
              `  # Then use blue_new tool in your local MCP session`,
              ``,
              `Or use the CLI:`,
              `  npm install -g @blueagent/cli`,
              `  blue new ${projectName} --template ${type}`,
            ].join("\n"),
          }],
        }, useSse);
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
