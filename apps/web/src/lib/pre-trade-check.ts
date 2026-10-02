/**
 * preTradeCheck (G2, 2026-09-30 — docs/rebuild-5-tang-2026-09-30.md §0b, §1).
 *
 * One function every execution door asks before a user signs: the five cards,
 * the three MCP builders, and the x402 rh-stock-swap-* tools. It is assembled
 * from checks that already existed; what is new is that there is ONE answer,
 * and that it is decided in code.
 *
 *   BLOCK — only on EVIDENCE (ShunTr, §7 #14):
 *     • a token wearing a registered stock token's or verified major's symbol
 *       from a different contract (an impostor);
 *     • a measured honeypot (sell tax ≥ 50%, read on-chain);
 *     • a bridge whose measured cost is over BRIDGE_BLOCK_COST_PERCENT.
 *   WARN  — a measured risk or an unmeasured gap the user should see first,
 *           including an address that is NOT a token at all (NOT_A_TOKEN:
 *           no contract there, or a liquidity pool — measured by
 *           eth_getCode / token0()+token1(), 2026-10-02, after a pool
 *           address pasted into BlueBot came back as "tax could not be
 *           read — try a small amount first", which reads as "a token,
 *           probably fine").
 *   PASS  — nothing measured against it.
 * No reason is ever "country" — tokenized assets are gated by their issuers'
 * own offering terms, not by this check (§7 #1).
 *
 * Asset types come from the registries only, never from a name (§1 table):
 *   rh_stock_token  — rwa-registry, issuer RHJ: a Robinhood Assets (Jersey)
 *                     debt security tracking a US share;
 *   b20_stock_token — BASE_STOCKS: a Coinbase B20 tokenized stock;
 *   major / native  — the addresses this app pins;
 *   crypto          — anything else.
 */
import { findByContract as findRwaByContract } from "@/lib/robinhood/rwa-registry";
import { nyseMarketStatus } from "@/lib/robinhood/rwa-market";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { classifyToken, normalizeSymbol } from "@/lib/wallet/token-trust";
import { readTokenTax } from "@/lib/token-tax";
import { measuredHoneypotVerdict } from "@/lib/honeypot-verdict";
import { clientFor, isNativeToken, readTokenMeta, type TxChain } from "@/lib/tx-chains";
import { kvGetProbe } from "@/lib/kv";
import { KV_BASE_ROWS_LATEST, BASE_ROWS_MAX_AGE_MS } from "@/lib/blue-hood/kv-keys";
import { partitionBaseRows, type BaseDeskLatest } from "@/lib/blue-hood/types";
import { HIGH_COST_PERCENT } from "@/lib/wallet/bridge-pairs";

export type PreTradeVerdict = "PASS" | "WARN" | "BLOCK";
export type AssetType = "native" | "major" | "crypto" | "rh_stock_token" | "b20_stock_token";
/** Machine-readable reason, so an agent (and the public meter) can dispatch on
 *  WHY without reading prose. */
export type ReasonCode =
  | "BRIDGE_COST" | "BRIDGE_COST_HIGH" | "NOT_ADDRESS" | "IMPOSTOR" | "HONEYPOT"
  | "SELL_LEVER" | "TAX_UNREAD" | "TAX_CLEAN" | "RH_UNREGISTERED" | "WEEKEND"
  | "RH_ORACLE_GAP_PAUSED" | "NO_ORACLE_FEED" | "ISSUER_POLICY" | "DRIFT" | "DRIFT_UNAVAILABLE"
  | "NOT_A_TOKEN";
export type Reason = { level: "BLOCK" | "WARN" | "INFO"; code: ReasonCode; text: string };

export interface PreTradeCheck {
  verdict: PreTradeVerdict;
  asset_type: AssetType;
  /** The asset in the issuer's terms — never "shares". */
  label: string;
  reasons: Reason[];
  checked_at: string;
  /** Set when the address is a liquidity pool: the two tokens it holds, so a
   *  caller can offer to check the right one. Read from the pool itself. */
  pool?: { token0: { address: string; symbol: string }; token1: { address: string; symbol: string } };
}

export interface PreTradeInput {
  chain: TxChain;
  kind: "swap" | "send" | "bridge";
  /** The token being BOUGHT (swap) or moved (send/bridge): 0x… or "ETH". */
  token: string;
  /** Bridges only: Relay's total cost as a percent of the amount. */
  bridgeCostPercent?: number | null;
  /** Injected in tests; defaults to now. */
  now?: Date;
}

/** Above this measured cost, a bridge is refused rather than warned. */
export const BRIDGE_BLOCK_COST_PERCENT = 20;
/** DEX drift from the oracle worth a warning on a stock token (Hood's own floor). */
export const STOCK_DRIFT_WARN_PCT = 2;

const ADDR = /^0x[a-fA-F0-9]{40}$/;

function finish(asset_type: AssetType, label: string, reasons: Reason[]): PreTradeCheck {
  const verdict: PreTradeVerdict = reasons.some((r) => r.level === "BLOCK") ? "BLOCK"
    : reasons.some((r) => r.level === "WARN") ? "WARN" : "PASS";
  return { verdict, asset_type, label, reasons, checked_at: new Date().toISOString() };
}

/** Buying or bridging INTO an impersonator is the harm; sending one you already
 *  hold hurts no one — so a send is told, not stopped. */
function impostorLevel(kind: PreTradeInput["kind"]): Reason["level"] {
  return kind === "send" ? "WARN" : "BLOCK";
}

function weekendReason(now: Date): Reason | null {
  const m = nyseMarketStatus(now);
  return m.session === "weekend"
    ? { level: "WARN", code: "WEEKEND", text: "US market is closed for the weekend — the oracle is frozen at Friday's close and the DEX price can drift from it." }
    : null;
}

export async function preTradeCheck(input: PreTradeInput): Promise<PreTradeCheck> {
  const now = input.now ?? new Date();
  const reasons: Reason[] = [];

  // Bridge cost is measured by the route before anything else matters.
  if (input.kind === "bridge" && typeof input.bridgeCostPercent === "number" && Number.isFinite(input.bridgeCostPercent)) {
    if (input.bridgeCostPercent > BRIDGE_BLOCK_COST_PERCENT) {
      reasons.push({ level: "BLOCK", code: "BRIDGE_COST", text: `Bridge cost is ${input.bridgeCostPercent.toFixed(1)}% of the amount (limit ${BRIDGE_BLOCK_COST_PERCENT}%) — send more, or not at all.` });
    } else if (input.bridgeCostPercent > HIGH_COST_PERCENT) {
      reasons.push({ level: "WARN", code: "BRIDGE_COST_HIGH", text: `Bridge cost is ${input.bridgeCostPercent.toFixed(1)}% of the amount — above ${HIGH_COST_PERCENT}%.` });
    }
  }

  const token = (input.token ?? "").trim();
  if (!token || isNativeToken(token)) return finish("native", "ETH (native)", reasons);
  if (!ADDR.test(token)) {
    reasons.push({ level: "BLOCK", code: "NOT_ADDRESS", text: "The token is not a contract address — a ticker does not identify a token." });
    return finish("crypto", token, reasons);
  }

  // ── Robinhood Chain 4663 ──────────────────────────────────────────────────
  if (input.chain === "robinhood") {
    const rwa = findRwaByContract(token);
    if (rwa && (rwa.kind === "stock" || rwa.kind === "etf")) {
      const label = `${rwa.kind === "etf" ? "ETF token" : "Stock token"} (Robinhood, Jersey) · tracks ${rwa.ticker}`;
      if (input.kind === "swap") {
        const wk = weekendReason(now);
        if (wk) reasons.push(wk);
        // Plan §0b: said as a gap, never measured. F6's price source was fixed
        // on 2026-10-01 (stamped RH rows now publish a pool-rate drift), but
        // this check still does NOT read the RH desk: unlike Base
        // (`BASE_ROWS_MAX_AGE_MS` on `KV_BASE_ROWS_LATEST`) the RH snapshot has
        // no freshness bound a pre-trade read could honour, and a stale drift
        // presented as current is worse than the gap. Wiring it needs that
        // bound first; the code stays the same so dispatching agents keep
        // working.
        reasons.push({ level: "WARN", code: "RH_ORACLE_GAP_PAUSED", text: "Oracle-vs-DEX check for Robinhood Chain is not run here — check the pool price against the oracle yourself." });
        if (!rwa.chainlinkFeed) reasons.push({ level: "INFO", code: "NO_ORACLE_FEED", text: "No Chainlink feed exists for this ticker yet — there is no oracle to compare against." });
      }
      return finish("rh_stock_token", label, reasons);
    }
    if (rwa) return finish("major", rwa.ticker, reasons); // WETH / USDG rows
    let symbol = "";
    try { symbol = (await readTokenMeta("robinhood", token as `0x${string}`)).symbol; } catch { /* unread */ }
    if (classifyToken({ address: token, symbol, isNative: false }, "robinhood") === "impostor") {
      reasons.push({ level: impostorLevel(input.kind), code: "IMPOSTOR", text: `This contract calls itself ${symbol} but is not the registered ${symbol} token on Robinhood Chain — an impersonator.` });
      return finish("crypto", symbol || token, reasons);
    }
    if (input.kind === "swap") {
      reasons.push({ level: "WARN", code: "RH_UNREGISTERED", text: "Not a registered token — buy/sell tax cannot be read on Robinhood Chain. Try a small amount first." });
    }
    return finish("crypto", symbol || token, reasons);
  }

  // ── Base 8453 ─────────────────────────────────────────────────────────────
  const stock = BASE_STOCKS.find((s) => s.token.toLowerCase() === token.toLowerCase());
  if (stock) {
    const label = `B20 tokenized stock (Coinbase) · tracks ${stock.ticker}`;
    reasons.push({ level: "INFO", code: "ISSUER_POLICY", text: "B20 tokens can carry issuer transfer policies — a transfer the policy forbids will revert." });
    if (input.kind === "swap") {
      const wk = weekendReason(now);
      if (wk) reasons.push(wk);
      // The Base desk's own blob — NOT `KV_SNAPSHOT_LATEST`, which is the
      // Robinhood desk's. Rows older than the board's own freshness line are
      // "unavailable", never a stale drift presented as the current one.
      const desk = await kvGetProbe<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
      const fresh = desk.status === "hit" && Array.isArray(desk.value.rows)
        && Date.now() - new Date(desk.value.started_at).getTime() <= BASE_ROWS_MAX_AGE_MS;
      const row = fresh
        ? partitionBaseRows(desk.value.rows).attributed.find((t) => t.contract.toLowerCase() === token.toLowerCase())
        : undefined;
      if (!row || row.drift_pct == null) {
        reasons.push({ level: "WARN", code: "DRIFT_UNAVAILABLE", text: "The oracle-vs-DEX reading for this token is unavailable right now." });
      } else if (Math.abs(row.drift_pct) >= STOCK_DRIFT_WARN_PCT) {
        reasons.push({ level: "WARN", code: "DRIFT", text: `The DEX price is ${row.drift_pct > 0 ? "+" : ""}${row.drift_pct.toFixed(2)}% from the Chainlink oracle (Blue Hood desk).` });
      }
    }
    return finish("b20_stock_token", label, reasons);
  }

  let symbol = "";
  let metaRead = true;
  try { symbol = (await readTokenMeta("base", token as `0x${string}`)).symbol; } catch { metaRead = false; }
  if (!metaRead) {
    const not = await notATokenOnBase(token as `0x${string}`);
    if (not) {
      reasons.push(not.reason);
      return { ...finish("crypto", not.label, reasons), ...(not.pool ? { pool: not.pool } : {}) };
    }
  }
  const trust = classifyToken({ address: token, symbol, isNative: false }, "base");
  if (trust === "verified") return finish("major", symbol || token, reasons);
  // A registered B20 stock's symbol from another contract is an impostor too.
  const norm = normalizeSymbol(symbol);
  if (trust === "impostor" || (norm && BASE_STOCKS.some((s) => normalizeSymbol(s.symbol) === norm))) {
    reasons.push({ level: impostorLevel(input.kind), code: "IMPOSTOR", text: `This contract calls itself ${symbol} but is not the verified ${symbol} on Base — an impersonator.` });
    return finish("crypto", symbol || token, reasons);
  }
  if (input.kind === "swap") {
    const hp = measuredHoneypotVerdict(await readTokenTax(token));
    if (hp.verdict === "HONEYPOT") reasons.push({ level: "BLOCK", code: "HONEYPOT", text: "Measured sell tax ≥ 50% — once bought, this token cannot be sold." });
    else if (hp.verdict === "SUSPICIOUS") reasons.push({ level: "WARN", code: "SELL_LEVER", text: "Measured sell lever: a blacklist function or a sell tax ≥ 10%." });
    else if (hp.verdict === "UNKNOWN") reasons.push({ level: "WARN", code: "TAX_UNREAD", text: "Buy/sell tax could not be read from this contract — try a small amount first." });
    else reasons.push({ level: "INFO", code: "TAX_CLEAN", text: "Buy/sell tax read on-chain: clean." });
  }
  return finish("crypto", symbol || token, reasons);
}

const POOL_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/**
 * Only asked when decimals() could not be read. Answers ONLY on a positive
 * reading — no code at the address, or a contract that answers token0() and
 * token1() (Uniswap v2/v3, Aerodrome and their forks all do). An RPC that
 * could not be reached answers null, and the caller falls through to the
 * unread-tax WARN as before: "could not tell" is never presented as "not a
 * token".
 */
async function notATokenOnBase(token: `0x${string}`): Promise<{ reason: Reason; label: string; pool?: PreTradeCheck["pool"] } | null> {
  const client = clientFor("base");
  let code: string | undefined;
  try { code = await client.getCode({ address: token }); } catch { return null; }
  if (!code || code === "0x") {
    return {
      label: token,
      reason: { level: "WARN", code: "NOT_A_TOKEN", text: "There is no contract at this address on Base — it is a wallet, not a token. Paste the token's contract address." },
    };
  }
  let t0: string, t1: string;
  try {
    // Sequential, not Promise.all: the client batches same-tick reads into
    // multicall3, and this path is rare enough that one extra round-trip is
    // cheaper than a second code path to test.
    t0 = await client.readContract({ address: token, abi: POOL_ABI, functionName: "token0" });
    t1 = await client.readContract({ address: token, abi: POOL_ABI, functionName: "token1" });
  } catch { return null; }
  const sym = async (a: string) => {
    try { return (await readTokenMeta("base", a as `0x${string}`)).symbol || ""; } catch { return ""; }
  };
  const s0 = await sym(t0), s1 = await sym(t1);
  const name = (s: string, a: string) => s || `${a.slice(0, 6)}…${a.slice(-4)}`;
  const pair = `${name(s0, t0)} / ${name(s1, t1)}`;
  return {
    label: `Liquidity pool ${pair}`,
    pool: { token0: { address: t0, symbol: s0 }, token1: { address: t1, symbol: s1 } },
    reason: { level: "WARN", code: "NOT_A_TOKEN", text: `This is a liquidity pool (${pair}) on Base, not a token. Check the token itself: ${name(s0, t0)} ${t0} or ${name(s1, t1)} ${t1}.` },
  };
}
