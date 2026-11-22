/**
 * On-chain forensics for `token_verdict` on Base (8453), ported from Quadra's
 * verified `simulate.ts` + `verdict.ts` + `origin.ts` design:
 *   1. `simulateRoundTripOnBase`: eth_simulateV1 buy 0.01 ETH -> transfer half -> sell all
 *   2. `readTokenHolders`: Top 10 concentration excluding pools, v4 PoolManager, and burns
 *   3. `readTokenOrigin`: Blockscout v2 deployer/factory + liquidity-pull history
 *
 * Fail-soft by design: every check returns an explicit `status: "checked" | "not_checked"`
 * so an unreachable upstream is never silently treated as a pass.
 */
import { TX_CHAINS } from "@/lib/tx-chains";

const SIM_ACCOUNT = "0x5157000000000000000000000000000000005157";
const PROBE_ACCOUNT = "0x5157000000000000000000000000000000000002";
const SIM_ETH_IN = 10n ** 16n; // 0.01 ETH
const NATIVE = "0x0000000000000000000000000000000000000000";
const ETH_PSEUDO = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RELAY_QUOTE = "https://api.relay.link/quote";
const BLOCKSCOUT_BASE = "https://base.blockscout.com/api/v2";
const UNISWAP_V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const BURN_ADDRS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0xdead000000000000000042069420694206942069",
]);
const PULLS_RE = /^(removeLiquidity|decreaseLiquidity)/i;
const NO_MARKET_RE = /impact is too high/i;

export const LOSS_WARN = 0.08;
export const LOSS_BAD = 0.25;
export const CONCENTRATED_PCT = 50;
export const SERIAL_LAUNCHES = 5;

export type RoundTripResult =
  | {
      status: "checked";
      tone: "ok" | "warn" | "bad";
      kind: "traded";
      loss_pct: number;
      shortfall_pct: number;
      transfer_ok: boolean;
      transfer_arrived_pct: number | null;
      transfer_error?: string;
      summary: string;
    }
  | {
      status: "checked";
      tone: "bad" | "warn";
      kind: "buy_reverted" | "sell_reverted" | "empty_market";
      reason: string;
      half_sold?: boolean | null;
      transfer_ok?: boolean;
      summary: string;
    }
  | {
      status: "not_checked";
      tone: "warn";
      kind: "no_route" | "rpc_unavailable";
      reason: string;
      summary: string;
    };

export type HoldersResult =
  | {
      status: "checked";
      tone: "ok" | "warn";
      top_10_pct: number;
      in_pools_or_burned_pct: number;
      largest_holder: { address: string; label: string | null; pct: number } | null;
      summary: string;
    }
  | {
      status: "not_checked";
      tone: "warn";
      reason: string;
      summary: string;
    };

export type OriginResult =
  | {
      status: "checked";
      tone: "ok" | "warn" | "bad";
      launcher: string | null;
      via_contract: { address: string; name: string | null } | null;
      relay?: string;
      wallet_age_hours: number | null;
      tx_count: number | null;
      deployments: number | null;
      factory_calls: number | null;
      pulled_liquidity_at: string | null;
      summary: string;
    }
  | {
      status: "not_checked";
      tone: "warn";
      reason: string;
      summary: string;
    };

type SimTx = { to: string; data: string; value: bigint };
type SimCall = { ok: boolean; reason: string; logs: { address: string; topics: string[]; data: string }[] };

let fetchImpl: typeof fetch = (...args) => fetch(...args);
/** Tests inject a fixture fetcher; production always uses global fetch. */
export function __setForensicsFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...args) => fetch(...args));
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)",
    ...(init?.headers ?? {}),
  };
  const res = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!res.ok) {
    const msg = (parsed && typeof parsed === "object" && "message" in parsed && typeof (parsed as { message?: unknown }).message === "string")
      ? (parsed as { message: string }).message
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

async function baseRpc(method: string, params: unknown[]): Promise<unknown> {
  const endpoints = Array.from(new Set([TX_CHAINS.base.rpc, "https://mainnet.base.org"]));
  let lastErr = "RPC failed";
  for (const url of endpoints) {
    try {
      const body = await fetchJson<{ result?: unknown; error?: { message?: string } }>(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }, 7_000);
      if (body?.error) {
        lastErr = body.error.message ?? "RPC error";
        continue;
      }
      if (body && "result" in body) return body.result;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr);
}

function stepsOf(body: unknown): SimTx[] {
  if (!body || typeof body !== "object") return [];
  const steps = Array.isArray((body as { steps?: unknown }).steps) ? (body as { steps: unknown[] }).steps : [];
  const out: SimTx[] = [];
  for (const s of steps) {
    if (!s || typeof s !== "object") continue;
    const items = Array.isArray((s as { items?: unknown }).items) ? (s as { items: unknown[] }).items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const d = (item as { data?: unknown }).data;
      if (!d || typeof d !== "object") continue;
      const to = typeof (d as { to?: unknown }).to === "string" ? (d as { to: string }).to : "";
      const data = typeof (d as { data?: unknown }).data === "string" ? (d as { data: string }).data : "";
      const rawVal = String((d as { value?: unknown }).value ?? "0");
      let value = 0n;
      try { if (/^\d+$/.test(rawVal) || /^0x[0-9a-fA-F]+$/.test(rawVal)) value = BigInt(rawVal); } catch {}
      if (to && data) out.push({ to, data, value });
    }
  }
  return out;
}

async function relayQuote(sell: string, buy: string, amount: bigint): Promise<{ steps: SimTx[]; out: bigint }> {
  const body = await fetchJson<Record<string, unknown>>(RELAY_QUOTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user: SIM_ACCOUNT,
      recipient: SIM_ACCOUNT,
      originChainId: 8453,
      destinationChainId: 8453,
      originCurrency: sell,
      destinationCurrency: buy,
      amount: amount.toString(),
      tradeType: "EXACT_INPUT",
      slippageTolerance: "1500",
    }),
  }, 7_000);
  const steps = stepsOf(body);
  if (steps.length === 0) throw new Error("Relay: quote carried no transaction");
  const rawOut = (body.details as { currencyOut?: { amount?: unknown } } | undefined)?.currencyOut?.amount;
  const out = typeof rawOut === "string" && /^\d+$/.test(rawOut) ? BigInt(rawOut) : 0n;
  return { steps, out };
}

function parseSimCalls(result: unknown): SimCall[] {
  if (!Array.isArray(result) || !result[0] || typeof result[0] !== "object") return [];
  const calls = Array.isArray((result[0] as { calls?: unknown }).calls) ? (result[0] as { calls: unknown[] }).calls : [];
  return calls.map((c) => {
    const obj = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const err = obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : {};
    const rawLogs = Array.isArray(obj.logs) ? obj.logs : [];
    const logs = rawLogs.flatMap((l) => {
      if (!l || typeof l !== "object") return [];
      const lo = l as Record<string, unknown>;
      if (typeof lo.address !== "string" || typeof lo.data !== "string") return [];
      const topics = Array.isArray(lo.topics) ? lo.topics.filter((t): t is string => typeof t === "string") : [];
      return [{ address: lo.address, topics, data: lo.data }];
    });
    return {
      ok: obj.status === "0x1",
      reason: typeof err.message === "string" ? err.message : "reverted with no reason",
      logs,
    };
  });
}

async function simulateAt(txs: readonly SimTx[], blockTag = "latest"): Promise<{ calls: SimCall[]; block: string | null }> {
  const payload = {
    blockStateCalls: [{
      stateOverrides: { [SIM_ACCOUNT]: { balance: `0x${(10n ** 19n).toString(16)}` } },
      calls: txs.map((t) => ({ from: SIM_ACCOUNT, to: t.to, data: t.data, value: `0x${t.value.toString(16)}` })),
    }],
    traceTransfers: true,
  };
  let result: unknown;
  try {
    result = await baseRpc("eth_simulateV1", [payload, blockTag]);
  } catch (e) {
    if (blockTag === "latest") throw e;
    result = await baseRpc("eth_simulateV1", [payload, "latest"]);
  }
  const first = Array.isArray(result) && result[0] && typeof result[0] === "object" ? (result[0] as Record<string, unknown>) : null;
  const num = first && typeof first.number === "string" && /^0x[0-9a-fA-F]+$/.test(first.number) ? first.number : null;
  return { calls: parseSimCalls(result), block: num };
}

function arrived(calls: readonly SimCall[], asset: string, to: string): bigint {
  const target = `0x${to.slice(2).toLowerCase().padStart(64, "0")}`;
  let sum = 0n;
  for (const c of calls) {
    for (const l of c.logs) {
      if (l.address.toLowerCase() === asset.toLowerCase() && l.topics[0] === TRANSFER_TOPIC && l.topics[2]?.toLowerCase() === target && /^0x[0-9a-fA-F]+$/.test(l.data)) {
        sum += BigInt(l.data);
      }
    }
  }
  return sum;
}

function transferData(to: string, amount: bigint): string {
  return `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

export async function simulateRoundTripOnBase(token: string): Promise<RoundTripResult> {
  let buy: { steps: SimTx[]; out: bigint };
  try {
    buy = await relayQuote(NATIVE, token, SIM_ETH_IN);
  } catch (e) {
    const why = (e as Error).message;
    if (NO_MARKET_RE.test(why)) {
      return {
        status: "checked",
        tone: "bad",
        kind: "empty_market",
        reason: why,
        summary: `0.01 ETH buy cannot be filled (${why})`,
      };
    }
    return { status: "not_checked", tone: "warn", kind: "no_route", reason: why, summary: `no buy route (${why})` };
  }

  let buySim: { calls: SimCall[]; block: string | null };
  try {
    buySim = await simulateAt(buy.steps);
  } catch (e) {
    const reason = (e as Error).message;
    return { status: "not_checked", tone: "warn", kind: "rpc_unavailable", reason, summary: `simulation RPC failed (${reason})` };
  }
  const pin = buySim.block ?? "latest";
  const buyFail = buySim.calls.find((c) => !c.ok);
  if (buyFail) {
    return { status: "checked", tone: "warn", kind: "buy_reverted", reason: buyFail.reason, summary: `simulated buy reverted (${buyFail.reason})` };
  }

  const received = arrived(buySim.calls, token, SIM_ACCOUNT);
  const half = received / 2n;
  let transferOk = true;
  let transferArrivedPct: number | null = null;
  let transferError: string | undefined;

  if (half > 0n) {
    try {
      const moved = (await simulateAt([...buy.steps, { to: token, data: transferData(PROBE_ACCOUNT, half), value: 0n }], pin)).calls;
      const last = moved[moved.length - 1];
      if (last && !last.ok) {
        transferOk = false;
        transferError = last.reason;
      } else if (last) {
        const got = arrived([last], token, PROBE_ACCOUNT);
        transferArrivedPct = +(Number(got) / Number(half) * 100).toFixed(2);
      }
    } catch { /* non-fatal for transfer step */ }
  }

  let sell: { steps: SimTx[]; out: bigint };
  try {
    sell = await relayQuote(token, NATIVE, received);
  } catch (e) {
    const why = (e as Error).message;
    return { status: "not_checked", tone: "warn", kind: "no_route", reason: why, summary: `buy succeeded, sell route not checked (${why})` };
  }

  let traded: SimCall[];
  try {
    traded = (await simulateAt([...buy.steps, ...sell.steps], pin)).calls;
  } catch (e) {
    const reason = (e as Error).message;
    return { status: "not_checked", tone: "warn", kind: "rpc_unavailable", reason, summary: `sell simulation failed (${reason})` };
  }

  const sold = traded.slice(buy.steps.length);
  const sellFail = sold.find((c) => !c.ok);
  if (sellFail) {
    let halfSold: boolean | null = null;
    try {
      const part = await relayQuote(token, NATIVE, received / 2n);
      const partCalls = (await simulateAt([...buy.steps, ...part.steps], pin)).calls.slice(buy.steps.length);
      halfSold = partCalls.every((c) => c.ok);
    } catch { halfSold = null; }
    return {
      status: "checked",
      tone: "bad",
      kind: "sell_reverted",
      reason: sellFail.reason,
      half_sold: halfSold,
      transfer_ok: transferOk,
      summary: `bought then SELL reverted (${sellFail.reason})${halfSold ? " — selling half succeeded (partial-sell trap)" : ""}`,
    };
  }

  const ethBack = arrived(sold, ETH_PSEUDO, SIM_ACCOUNT);
  const loss = 1 - Number(ethBack) / Number(SIM_ETH_IN);
  const shortfall = buy.out > 0n ? 1 - Number(received) / Number(buy.out) : 0;
  const lossPct = +(loss * 100).toFixed(2);
  const shortfallPct = +(shortfall * 100).toFixed(2);
  const transferCut = transferArrivedPct !== null && transferArrivedPct < 90;
  const tone: "ok" | "warn" | "bad" =
    !transferOk || transferCut || loss > LOSS_BAD || shortfall > 0.1
      ? "bad"
      : loss > LOSS_WARN || shortfall > 0.01 || (transferArrivedPct !== null && transferArrivedPct < 99.9)
        ? "warn"
        : "ok";

  return {
    status: "checked",
    tone,
    kind: "traded",
    loss_pct: lossPct,
    shortfall_pct: shortfallPct,
    transfer_ok: transferOk,
    transfer_arrived_pct: transferArrivedPct,
    ...(transferError ? { transfer_error: transferError } : {}),
    summary: `${lossPct}% round-trip loss (0.01 ETH -> token -> ETH)${!transferOk ? `; transfer reverted (${transferError})` : ""}`,
  };
}

export async function readTokenHolders(token: string, pairAddresses: readonly string[]): Promise<HoldersResult> {
  try {
    const [info, holdersBody] = await Promise.all([
      fetchJson<{ total_supply?: string | null }>(`${BLOCKSCOUT_BASE}/tokens/${token}`, undefined, 6_000),
      fetchJson<{ items?: Array<{ address?: { hash?: string; name?: string | null }; value?: string }> }>(`${BLOCKSCOUT_BASE}/tokens/${token}/holders`, undefined, 6_000),
    ]);
    const supply = info?.total_supply && /^\d+$/.test(info.total_supply) ? BigInt(info.total_supply) : 0n;
    if (supply <= 0n || !Array.isArray(holdersBody?.items) || holdersBody.items.length === 0) {
      return { status: "not_checked", tone: "warn", reason: "Blockscout has no holder list or supply yet", summary: "Holders not indexed yet" };
    }
    const pools = new Set([UNISWAP_V4_POOL_MANAGER, ...pairAddresses.map((p) => p.toLowerCase())]);
    let set = 0n;
    const people: { address: string; label: string | null; raw: bigint }[] = [];
    for (const item of holdersBody.items) {
      const addr = item.address?.hash;
      const val = item.value;
      if (!addr || !val || !/^\d+$/.test(val)) continue;
      const raw = BigInt(val);
      const lower = addr.toLowerCase();
      if (pools.has(lower) || BURN_ADDRS.has(lower)) set += raw;
      else people.push({ address: addr, label: item.address?.name ?? null, raw });
    }
    people.sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));
    const top10 = people.slice(0, 10);
    const held = top10.reduce((s, h) => s + h.raw, 0n);
    const top10Pct = +(Number((held * 10_000n) / supply) / 100).toFixed(2);
    const setPct = +(Number((set * 10_000n) / supply) / 100).toFixed(2);
    const largest = top10[0]
      ? { address: top10[0].address, label: top10[0].label, pct: +(Number((top10[0].raw * 10_000n) / supply) / 100).toFixed(2) }
      : null;

    return {
      status: "checked",
      tone: top10Pct > CONCENTRATED_PCT ? "warn" : "ok",
      top_10_pct: top10Pct,
      in_pools_or_burned_pct: setPct,
      largest_holder: largest,
      summary: `Top 10 holders own ${top10Pct}% of supply (excluding pools & burns)`,
    };
  } catch (e) {
    const reason = (e as Error).message;
    return { status: "not_checked", tone: "warn", reason, summary: `Holders unavailable (${reason})` };
  }
}

export async function readTokenOrigin(token: string): Promise<OriginResult> {
  try {
    const addrInfo = await fetchJson<{ creator_address_hash?: string | null; creation_transaction_hash?: string | null }>(
      `${BLOCKSCOUT_BASE}/addresses/${token}`, undefined, 6_000,
    );
    const creation = addrInfo?.creation_transaction_hash;
    const creator = addrInfo?.creator_address_hash ?? null;
    if (!creation) {
      return { status: "not_checked", tone: "warn", reason: "No direct creation transaction on Blockscout", summary: "Launcher not directly indexed" };
    }
    const tx = await fetchJson<{ from?: { hash?: string }; to?: { hash?: string; name?: string | null } | null; method?: string | null }>(
      `${BLOCKSCOUT_BASE}/transactions/${creation}`, undefined, 6_000,
    );
    const from = tx?.from?.hash ?? null;
    if (!from) return { status: "not_checked", tone: "warn", reason: "Creation tx has no sender", summary: "Launcher unknown" };
    if (tx?.method === "handleOps") {
      return {
        status: "checked",
        tone: "warn",
        launcher: null,
        via_contract: creator ? { address: creator, name: tx?.to?.name ?? null } : null,
        relay: "ERC-4337 bundle",
        wallet_age_hours: null,
        tx_count: null,
        deployments: null,
        factory_calls: null,
        pulled_liquidity_at: null,
        summary: "Launched via ERC-4337 bundle — true launcher hidden behind bundler",
      };
    }

    const hist = await fetchJson<{ items?: Array<{ from?: { hash?: string }; to?: { hash?: string } | null; created_contract?: unknown; timestamp?: string; method?: string | null }>; next_page_params?: unknown }>(
      `${BLOCKSCOUT_BASE}/addresses/${from}/transactions`, undefined, 6_000,
    );
    const items = Array.isArray(hist?.items) ? hist.items : [];
    const complete = !hist?.next_page_params;
    const mine = items.filter((t) => t.from?.hash?.toLowerCase() === from.toLowerCase());
    const factoryAddr = creator && creator.toLowerCase() !== from.toLowerCase() ? creator : (tx?.to?.hash && tx.to.hash.toLowerCase() !== from.toLowerCase() ? tx.to.hash : null);
    const factoryCalls = factoryAddr ? mine.filter((t) => t.to?.hash?.toLowerCase() === factoryAddr.toLowerCase()).length : 0;
    const deployments = mine.filter((t) => !!t.created_contract).length;
    const pulled = mine.find((t) => typeof t.method === "string" && PULLS_RE.test(t.method));
    const oldestTs = complete && items.length > 0 ? Date.parse(items[items.length - 1]?.timestamp ?? "") : NaN;
    const ageHours = Number.isFinite(oldestTs) ? Math.max(0, +((Date.now() - oldestTs) / 3_600_000).toFixed(1)) : null;

    const tone: "ok" | "warn" | "bad" = pulled
      ? "bad"
      : (ageHours !== null && ageHours < 24) || factoryCalls >= SERIAL_LAUNCHES
        ? "warn"
        : "ok";

    return {
      status: "checked",
      tone,
      launcher: from,
      via_contract: factoryAddr ? { address: factoryAddr, name: tx?.to?.name ?? null } : null,
      wallet_age_hours: ageHours,
      tx_count: items.length,
      deployments,
      factory_calls: factoryCalls,
      pulled_liquidity_at: pulled?.timestamp ?? null,
      summary: pulled
        ? `Launcher ${from.slice(0, 6)}…${from.slice(-4)} previously pulled liquidity (${pulled.timestamp})`
        : `Launcher ${from.slice(0, 6)}…${from.slice(-4)}${ageHours !== null ? `, wallet age ${ageHours}h` : ""}`,
    };
  } catch (e) {
    const reason = (e as Error).message;
    return { status: "not_checked", tone: "warn", reason, summary: `Launcher forensics unavailable (${reason})` };
  }
}
