// Shared on-chain data helpers for Base.
//
// Token/native transfers come from Moralis. Contract source comes from the
// Etherscan v2 multichain explorer API.
//
// 🔴 The `[]`/`null`-returning fetchers below are LEGACY and fail SILENTLY.
// Prefer the `*Result` variants: they return a discriminated `SourceResult<T>`
// carrying `error.code`, so a caller can tell "wallet is empty" apart from
// "we never got an answer". The legacy names delegate to them and are kept
// only because ~12 handlers still import them — see the sweep list in the
// PR that added this layer. New code should not call them.
//
// MEASURED 2026-09-26, and this is why the layer exists: every Moralis
// endpoint this file touches returned HTTP 401 `{"message":"Your Moralis Free
// usage is paused. Upgrade to a paid plan to resume usage…"}` — 15/15 probes
// across 3 wallets × 5 endpoints. A BILLING failure, not a code, endpoint or
// chain-param bug. `wallet-holdings` and `wallet-risk` turned that 401 into
// `$0` / `tx_count: 0` / `verdict: CLEAN` with HTTP 200, so the caller PAID
// for a fabricated answer about a wallet holding 4.1 ETH. Silent-[] is not a
// resilience feature; it is how an outage gets billed as a result.
//
// The Etherscan v2 *account* module is not a fallback for any of this: probed
// the same day, `balance`/`txlist`/`tokentx` on chainid 8453 return HTTP 200
// with `status:"0", result:"Free API access is not supported for this chain"`.
// A 200, so `if (!res.ok)` never fires and `Array.isArray(result) ? … : []`
// swallows it — the same bug family, one layer down (`onchain.ts`'s
// `basescanTokenTx` is silently broken by it today). The `contract` module
// (`getsourcecode`, below) still works.

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

// ─── Result-carrying fetch layer ─────────────────────────────────────────────

export type UpstreamErrorCode =
  | "NO_API_KEY"            // server misconfiguration — nothing was even attempted
  | "UPSTREAM_PLAN_PAUSED"  // credentials fine, the plan/quota is exhausted
  | "UPSTREAM_AUTH"         // key rejected
  | "UPSTREAM_RATE_LIMITED" // 429 — retryable
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_BAD_RESPONSE"   // 2xx with a body we cannot parse
  | "UPSTREAM_INCONSISTENT"   // two sources answered, and they disagree
  | "UPSTREAM_ERROR";         // anything else

export interface UpstreamError {
  source: string;
  code: UpstreamErrorCode;
  message: string;
}

export type SourceResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: UpstreamError };

/** Upstream's own `message`/`error` field, if the body is JSON. Diagnostics
 *  live here — "Free usage is paused" is the entire root cause in one line. */
function upstreamMessage(body: string): string | null {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const m = j.message ?? j.error ?? j.detail;
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 300);
  } catch {}
  const t = body.trim();
  return t ? t.slice(0, 200) : null;
}

const PAUSED_RE = /usage is paused|upgrade to a paid plan|plan .*(expired|exceeded)|quota/i;

function classifyStatus(status: number, body: string): UpstreamErrorCode {
  if (status === 429) return "UPSTREAM_RATE_LIMITED";
  if (status === 401 || status === 402 || status === 403) {
    return PAUSED_RE.test(body) ? "UPSTREAM_PLAN_PAUSED" : "UPSTREAM_AUTH";
  }
  return "UPSTREAM_ERROR";
}

async function moralisGet<T>(path: string, timeoutMs: number): Promise<SourceResult<T>> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) {
    return { ok: false, error: { source: "moralis", code: "NO_API_KEY", message: "MORALIS_API_KEY is not configured on the server." } };
  }
  let res: Response;
  try {
    res = await fetch(`${MORALIS_BASE}${path}`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as Error;
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    return {
      ok: false,
      error: {
        source: "moralis",
        code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        message: timedOut ? `Moralis did not respond within ${timeoutMs}ms.` : `Moralis request failed: ${err.message}`,
      },
    };
  }
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    const detail = upstreamMessage(body);
    return {
      ok: false,
      error: {
        source: "moralis",
        code: classifyStatus(res.status, body),
        message: `Moralis returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      },
    };
  }
  try {
    return { ok: true, data: JSON.parse(body) as T };
  } catch {
    return { ok: false, error: { source: "moralis", code: "UPSTREAM_BAD_RESPONSE", message: `Moralis returned HTTP ${res.status} with a non-JSON body.` } };
  }
}

/** Moralis returns either a bare array or `{ result: [...] }` depending on the
 *  endpoint version. Both are valid; anything else is a shape we don't know. */
function asRows<T>(payload: unknown): T[] | null {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const r = (payload as { result?: unknown }).result;
    if (Array.isArray(r)) return r as T[];
    if (r === undefined) return [];
  }
  return null;
}

function badShape<T>(path: string): SourceResult<T> {
  return { ok: false, error: { source: "moralis", code: "UPSTREAM_BAD_RESPONSE", message: `Moralis ${path} returned an unrecognised payload shape.` } };
}

/** One token row from Moralis `/wallets/{address}/tokens` (verified live shape). */
export interface MoralisWalletToken {
  token_address:     string;   // 0xeeee…eeee for native ETH
  symbol:            string;
  name:              string;
  logo?:             string | null;
  decimals:          number;
  balance:           string;   // raw integer (wei) as string
  balance_formatted: string;   // human-readable decimal string
  possible_spam:     boolean;
  verified_contract: boolean;
  native_token:      boolean;  // true only for the native-ETH row
  usd_value?:        number | null;
  usd_price?:        number | null;
}

/** One ERC-20 row from the address-scoped `/{address}/erc20` endpoint. Shares
 *  most fields with the `/wallets/…/tokens` shape but is not price-enriched. */
export interface MoralisErc20Balance {
  token_address?: string;
  symbol?:        string;
  name?:          string;
  balance?:       string;            // raw integer (wei) as string
  decimals?:      number | string;
  usd_value?:     number | string;
  usd_price?:     number | string;
  possible_spam?: boolean;
}

/**
 * Full live token list for a Base wallet (Moralis), price-enriched. Returns
 * every token the address actually holds (balance > 0), including the
 * native-ETH row.
 *
 * @param chain  "base" (mainnet) or "base sepolia" (testnet) — Moralis chain id.
 */
export async function getWalletTokenBalancesResult(
  address: string,
  chain: "base" | "base sepolia" = "base",
): Promise<SourceResult<MoralisWalletToken[]>> {
  const qs = new URLSearchParams({ chain, limit: "100" });
  // 12s: the price-enriched token list can take ~7s for whale wallets with
  // hundreds of positions (normal wallets return in ~1.5s).
  const r = await moralisGet<unknown>(`/wallets/${address}/tokens?${qs}`, 12000);
  if (!r.ok) return r;
  const rows = asRows<MoralisWalletToken>(r.data);
  return rows ? { ok: true, data: rows } : badShape("/wallets/{address}/tokens");
}

/** Live ERC-20 balances for a Base address (address-scoped endpoint). */
export async function getMoralisErc20BalancesResult(address: string): Promise<SourceResult<MoralisErc20Balance[]>> {
  const r = await moralisGet<unknown>(`/${address}/erc20?chain=base`, 8000);
  if (!r.ok) return r;
  const rows = asRows<MoralisErc20Balance>(r.data);
  return rows ? { ok: true, data: rows } : badShape("/{address}/erc20");
}

/** Native ETH balance (wei, as a decimal string) for a Base address. Used as a
 *  cross-check against the RPC, not as the authoritative read. */
export async function getMoralisNativeBalanceResult(address: string): Promise<SourceResult<string>> {
  const r = await moralisGet<{ balance?: string }>(`/${address}/balance?chain=base`, 8000);
  if (!r.ok) return r;
  const bal = r.data?.balance;
  if (typeof bal !== "string" || !/^\d+$/.test(bal)) return badShape("/{address}/balance");
  return { ok: true, data: bal };
}

/** Live ERC-20 transfers for a Base address (Moralis). */
export async function getMoralisERC20TransfersResult(address: string, limit = 100): Promise<SourceResult<Record<string, unknown>[]>> {
  const r = await moralisGet<unknown>(`/${address}/erc20/transfers?chain=base&limit=${limit}`, 8000);
  if (!r.ok) return r;
  const rows = asRows<Record<string, unknown>>(r.data);
  return rows ? { ok: true, data: rows } : badShape("/{address}/erc20/transfers");
}

/** Live native (ETH) transactions for a Base address (Moralis, decoded). */
export async function getMoralisNativeTxResult(address: string, limit = 100): Promise<SourceResult<Record<string, unknown>[]>> {
  const r = await moralisGet<unknown>(`/${address}/verbose?chain=base&limit=${limit}`, 8000);
  if (!r.ok) return r;
  const rows = asRows<Record<string, unknown>>(r.data);
  return rows ? { ok: true, data: rows } : badShape("/{address}/verbose");
}

// ─── Legacy silent-failure wrappers — do not use in new code ────────────────
// Each drops `error` on the floor. Kept so existing importers keep their
// current behaviour until they are individually migrated.

/** @deprecated Use {@link getWalletTokenBalancesResult}. `null` on any failure. */
export async function getWalletTokenBalances(
  address: string,
  chain: "base" | "base sepolia" = "base",
): Promise<MoralisWalletToken[] | null> {
  const r = await getWalletTokenBalancesResult(address, chain);
  return r.ok ? r.data : null;
}

/** @deprecated Use {@link getMoralisERC20TransfersResult}. `[]` on any failure. */
export async function getMoralisERC20Transfers(address: string, limit = 100): Promise<Record<string, unknown>[]> {
  const r = await getMoralisERC20TransfersResult(address, limit);
  return r.ok ? r.data : [];
}

/** @deprecated Use {@link getMoralisNativeTxResult}. `[]` on any failure. */
export async function getMoralisNativeTx(address: string, limit = 100): Promise<Record<string, unknown>[]> {
  const r = await getMoralisNativeTxResult(address, limit);
  return r.ok ? r.data : [];
}

/** Verified contract source/ABI for a Base address (Etherscan v2 multichain). null on failure. */
export async function getBasescanSource(address: string): Promise<Record<string, unknown> | null> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    // Etherscan v2 unified endpoint (chainid 8453 = Base). The legacy
    // api.basescan.org host is deprecated; v2 is what Etherscan now serves.
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${address}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { result?: Record<string, unknown>[] };
    return data.result?.[0] ?? null;
  } catch {
    return null;
  }
}
