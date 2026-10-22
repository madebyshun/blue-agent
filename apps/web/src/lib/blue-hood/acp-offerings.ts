/**
 * Blue Agent's ACP offerings beyond Offering #1 (execution-plan) — the demand
 * test ShunTr chose on 2026-10-22: list three cheap services where agents
 * already buy, and only launch wider what gets repeat buyers.
 *
 * Picked from the ACP leaderboard read that day (top 100 = $441K revenue,
 * 259K jobs): swap execution (Capminal, Nox $0.05, Otto $0.01 — 900 to 1,400
 * buyer wallets each), cheap high-frequency market intel (Otto $0.01–0.1, 2,363
 * wallets) and trending discovery (aixbt, 1,022 wallets). Security alone sold
 * worst (GOSLOW Guard: 24 wallets), so it rides along inside swap_prepare
 * instead of being sold by itself.
 *
 *   swap_prepare   — an UNSIGNED swap on Base 8453 or Robinhood Chain 4663,
 *                    pre-trade checked. Built by lib/tx-build.ts, the same
 *                    builder as MCP `blue_swap_tx`. Never signs, never holds.
 *   stock_signal   — a tokenized stock's DEX price against its Chainlink feed
 *                    on one chain, or the gap BETWEEN Base and Robinhood
 *                    Chain. Read from the Blue Hood desk, never recomputed.
 *   trending_safe  — trending Base tokens with tax read from the contract and
 *                    exit depth (the `safe-trending` catalog tool, in-process).
 *
 * Every offering answers in one of three ways, and the seller maps them so a
 * job can never hang (10 expirations in a row ungraduate the agent):
 *   deliver — submit the deliverable;
 *   reject  — the buyer's input is wrong; refunded, no charge;
 *   decline — we cannot answer right now; refunded, no charge.
 *
 * PRICES live here and must equal the price each offering is registered with
 * on the Virtuals ACP dashboard. The seller proposes this number with
 * setBudget; a mismatch means the buyer is asked for a different price than
 * the one they chose.
 */
import { parseTxChain, isPositiveDecimal } from "@/lib/tx-chains";
import { reqAddr, buildSwapTx, withPreTradeCheck } from "@/lib/tx-build";
import { runInternalTool } from "@/lib/x402-internal-run";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";

export type OfferResult =
  | { kind: "deliver"; deliverable: Record<string, unknown> }
  | { kind: "reject"; reason: string; error: string }
  | { kind: "decline"; reason: string; error: string };

export interface AcpOffering {
  name: string;
  priceUsdc: number;
  /** Cheap, no network: null when the requirement can be priced, else why not. */
  check(req: Record<string, unknown>): string | null;
  run(req: Record<string, unknown>): Promise<OfferResult>;
}

/** First present key among aliases (buyers send snake_case or camelCase). */
const pick = (req: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (req[k] !== undefined && req[k] !== null && req[k] !== "") return req[k];
  return undefined;
};

// ── swap_prepare ──────────────────────────────────────────────────────────────

function swapArgs(req: Record<string, unknown>): Record<string, unknown> {
  return {
    chain: pick(req, "chain"),
    fromAddress: pick(req, "from_address", "fromAddress", "wallet"),
    tokenIn: pick(req, "token_in", "tokenIn"),
    tokenOut: pick(req, "token_out", "tokenOut"),
    amountIn: pick(req, "amount_in", "amountIn"),
    slippageBps: pick(req, "slippage_bps", "slippageBps"),
  };
}

const tokenOk = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s.toUpperCase() === "ETH" || /^0x[a-fA-F0-9]{40}$/.test(s);
};

const swapPrepare: AcpOffering = {
  name: "swap_prepare",
  priceUsdc: 0.01,
  check(req) {
    const a = swapArgs(req);
    if (!parseTxChain(a.chain)) return `chain is required: "base" (8453) or "robinhood" (4663) — no default, the two share no state`;
    try { reqAddr(a.fromAddress, "from_address"); } catch { return "from_address must be the 0x wallet that will sign"; }
    if (!tokenOk(a.tokenIn)) return `token_in must be a 0x token address on that chain, or "ETH" — a ticker does not identify a token`;
    if (!tokenOk(a.tokenOut)) return `token_out must be a 0x token address on that chain, or "ETH" — a ticker does not identify a token`;
    if (!isPositiveDecimal(String(a.amountIn ?? "").trim())) return `amount_in must be a positive decimal in WHOLE units, e.g. "25.5"`;
    return null;
  },
  async run(req) {
    const args = swapArgs(req);
    let text: string;
    try {
      text = await withPreTradeCheck("swap", args, () => buildSwapTx(args));
    } catch (e) {
      const err = e as Error & { code?: string };
      // A BLOCK is a finding about the token, delivered as a refusal: the buyer
      // is not charged for being told not to trade it.
      return err.code === "PRE_TRADE_BLOCK"
        ? { kind: "reject", reason: err.message, error: "pre_trade_block" }
        : { kind: "reject", reason: err.message, error: "bad_requirement" };
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.ok === false) {
      const e = (parsed.error ?? {}) as { code?: string; message?: string };
      return { kind: "decline", reason: e.message ?? "no route", error: (e.code ?? "no_route").toLowerCase() };
    }
    return { kind: "deliver", deliverable: parsed };
  },
};

// ── stock_signal ──────────────────────────────────────────────────────────────

type StockScope = "base" | "robinhood" | "both";
function stockScope(v: unknown): StockScope | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "both") return "both";
  const c = parseTxChain(s);
  return c ?? null;
}
/** "NVDA", "nvda" or the Base B20 symbol "NVDAc" → "NVDA". Only a LOWERCASE
 *  trailing c is the B20 suffix: "INTC" is Intel and keeps its C. */
const tickerOf = (req: Record<string, unknown>) => {
  const raw = String(pick(req, "ticker", "symbol") ?? "").trim();
  return (/^[A-Z]{1,6}c$/.test(raw) ? raw.slice(0, -1) : raw).toUpperCase();
};

const stockSignal: AcpOffering = {
  name: "stock_signal",
  priceUsdc: 0.01,
  check(req) {
    if (!/^[A-Z]{1,6}$/.test(tickerOf(req))) return `ticker is required, e.g. "NVDA"`;
    if (!stockScope(pick(req, "chain"))) return `chain must be "base", "robinhood" or "both" (default "both")`;
    return null;
  },
  async run(req) {
    const ticker = tickerOf(req);
    const scope = stockScope(pick(req, "chain"))!;
    const url = scope === "both"
      ? `${BASE}/api/hood/dislocation/spread?ticker=${encodeURIComponent(ticker)}`
      : `${BASE}/api/hood/dislocation?ticker=${encodeURIComponent(ticker)}&chain=${scope}`;
    let body: Record<string, unknown>;
    let status: number;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      status = r.status;
      body = (await r.json()) as Record<string, unknown>;
    } catch {
      return { kind: "decline", reason: "the stock desk did not answer", error: "upstream" };
    }
    if (status === 400 || status === 404) {
      return { kind: "reject", reason: String(body.error ?? body.message ?? `"${ticker}" is not a watched tokenized stock`), error: "unknown_ticker" };
    }
    // A stale or unreadable desk is not sold as a reading: decline, no charge.
    if (body.ok !== true || body.stale === true) {
      return { kind: "decline", reason: String(body.stale_reason ?? body.error ?? "desk reading unavailable"), error: "stale" };
    }
    // `ok: true` with no number is an honest "nothing to measure" from the desk
    // — MEASURED 2026-10-22: an unknown ticker came back ok with spread_pct
    // null ("not_on_both_venues"). That is not a reading a buyer pays for.
    const reading = scope === "both" ? body.spread_pct : body.drift_pct;
    if (typeof reading !== "number" || !Number.isFinite(reading)) {
      const why = String(body.spread_unavailable_reason ?? body.no_data_reason ?? "no reading");
      return {
        kind: "reject",
        reason: `no ${scope === "both" ? "Base vs Robinhood Chain spread" : `${scope} reading`} for "${ticker}" (${why})` +
          (scope === "both" ? ` — send chain "base" or "robinhood" for a single-venue reading` : ""),
        error: "no_reading",
      };
    }
    return {
      kind: "deliver",
      deliverable: {
        ...body,
        note: "Facts, not a signal: nothing here says buy or sell. drift_pct = DEX price vs the Chainlink feed on that chain; spread_pct = Base vs Robinhood Chain DEX price.",
      },
    };
  },
};

// ── trending_safe ─────────────────────────────────────────────────────────────

const trendingSafe: AcpOffering = {
  name: "trending_safe",
  priceUsdc: 0.05,
  check(req) {
    const lim = pick(req, "limit");
    if (lim !== undefined && !(Number(lim) >= 1 && Number(lim) <= 20)) return "limit must be 1–20";
    return null;
  },
  async run(req) {
    const limit = Number(pick(req, "limit") ?? 10);
    const minLiq = Number(pick(req, "min_liquidity_usd", "minLiquidityUsd") ?? 500_000);
    const r = await runInternalTool({
      tool: "safe-trending",
      body: { limit, min_liquidity_usd: Number.isFinite(minLiq) && minLiq >= 0 ? minLiq : 500_000 },
      service: true,
      timeoutMs: 45_000,
    });
    if (r.status !== 200) {
      return { kind: "decline", reason: String(r.body.error ?? r.body.message ?? `upstream ${r.status}`), error: "upstream" };
    }
    return { kind: "deliver", deliverable: { ...r.body, chain: "base", chain_id: 8453 } };
  },
};

export const ACP_OFFERINGS: readonly AcpOffering[] = [swapPrepare, stockSignal, trendingSafe];

/**
 * Match on letters and digits only. MEASURED 2026-10-22: Offering #1 is
 * registered on the ACP dashboard as "executionplan" while the code calls it
 * "execution-plan" — the registry evidently keeps no separators, so
 * "swap_prepare" may arrive as "swapprepare". Either spelling must dispatch.
 */
const nameKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function findOffering(name: string | null | undefined): AcpOffering | undefined {
  const n = nameKey(name);
  return n ? ACP_OFFERINGS.find((o) => nameKey(o.name) === n) : undefined;
}
