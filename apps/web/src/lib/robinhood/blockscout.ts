// Thin server-side client for Robinhood Chain's Blockscout instance (REST API
// v2 — confirmed live at robinhoodchain.blockscout.com/api/v2 and
// explorer.testnet.chain.robinhood.com/api/v2, same shape on both networks).
// Read-only — no wallet/signing involved.
//
// It used to power an "Explore" panel on /app/launches via /api/robinhood/explore;
// both went out with the Bankr launch/fee surface on 2026-09-07. This module did
// NOT go with them — it has four live importers that never touched that page:
// /api/chat (address balances), lib/wallet/rh-holdings + stock-holdings (the
// wallet's Robinhood Chain column), and the rh-rwa-verify x402 handler
// (contract-creator lookup for the impostor gate).

const EXPLORER_BASE = {
  mainnet: "https://robinhoodchain.blockscout.com",
  testnet: "https://explorer.testnet.chain.robinhood.com",
} as const;

export type RobinhoodNetwork = keyof typeof EXPLORER_BASE;

export type BlockscoutAddressRef = {
  hash: string;
  is_contract: boolean;
  is_verified: boolean;
  name: string | null;
};

export type BlockscoutTokenInfo = {
  address_hash: string;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  total_supply: string | null;
  holders_count: string | null;
  exchange_rate: string | null;
  circulating_market_cap: string | null;
  volume_24h: string | null;
  icon_url: string | null;
};

export type BlockscoutHolder = {
  address: BlockscoutAddressRef;
  value: string;
};

export type BlockscoutTransfer = {
  block_number: number;
  timestamp: string;
  from: BlockscoutAddressRef;
  to: BlockscoutAddressRef;
  total?: { value?: string; decimals?: string };
  tx_hash?: string;
  transaction_hash?: string;
};

/**
 * Who we say we are. RH Chain's Blockscout is behind Cloudflare, and Cloudflare
 * 403s Node's default `undici/x.y` User-Agent with an interstitial challenge
 * page — so every server-side call here failed, `bsFetch` mapped the non-ok to
 * `null`, and the surfaces above reported "not found" / "no holdings" instead of
 * "the explorer refused us".
 *
 * MEASURED 2026-09-04, same IP, same second:
 *   (no UA / undici default)                          → 403 + HTML challenge
 *   "BlueAgent/1.0 (+https://blueagent.dev)"          → 403 + HTML challenge
 *   "Mozilla/5.0 (compatible; BlueAgent/1.0; +url)"   → 200 + JSON
 * Production was in the same state: blueagent.dev/api/robinhood/explore returned
 * its "still indexing" 404 for RH AAPL, a token with a $4.9M market cap that
 * Blockscout indexes fine.
 *
 * The string below is the long-standing convention for a well-behaved automated
 * client — the exact shape Googlebot and friends use — and it identifies this
 * app by name with a contact URL. It is NOT a browser impersonation: nothing
 * here claims to be Chrome, and no challenge is being solved or evaded. The
 * `Mozilla/5.0 (compatible; …)` prefix is simply what the filter is keyed on.
 */
const BLOCKSCOUT_UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";

async function bsFetchOnce<T>(
  network: RobinhoodNetwork,
  path: string,
  timeoutMs?: number,
): Promise<T | null> {
  try {
    const res = await fetch(`${EXPLORER_BASE[network]}${path}`, {
      // Blockscout data changes fast (transfers/holders) — don't cache.
      cache: "no-store",
      headers: { "User-Agent": BLOCKSCOUT_UA, Accept: "application/json" },
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * `retries` defaults to 0 — every pre-existing caller keeps its exact behaviour.
 *
 * Opt in only where a blip is EXPENSIVE. MEASURED 2026-09-04: this endpoint
 * answered 12/12 in a tight loop and 5/5 via curl, but one call in an earlier
 * run came back non-ok — a genuine intermittent, call it a few percent.
 *
 * A few percent is fine for a card that degrades quietly and wrong for the
 * wallet's stock section, which renders a failed read as a full-width amber
 * "your holdings are unknown here". Crying wolf on ~1 load in 15 is how a user
 * learns to scroll past that box — and then it is worth nothing on the day the
 * explorer is genuinely down. One retry keeps the warning rare enough to mean
 * something; a real outage still fails both attempts and still shows it.
 */
async function bsFetch<T>(
  network: RobinhoodNetwork,
  path: string,
  timeoutMs?: number,
  retries = 0,
): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const out = await bsFetchOnce<T>(network, path, timeoutMs);
    if (out !== null || attempt >= retries) return out;
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
}

export async function getTokenInfo(network: RobinhoodNetwork, address: string) {
  return bsFetch<BlockscoutTokenInfo>(network, `/api/v2/tokens/${address}`);
}

export async function getTokenHolders(network: RobinhoodNetwork, address: string) {
  const data = await bsFetch<{ items: BlockscoutHolder[] }>(network, `/api/v2/tokens/${address}/holders`);
  return data?.items ?? [];
}

export async function getTokenTransfers(network: RobinhoodNetwork, address: string) {
  const data = await bsFetch<{ items: BlockscoutTransfer[] }>(network, `/api/v2/tokens/${address}/transfers`);
  return data?.items ?? [];
}

export function explorerBase(network: RobinhoodNetwork): string {
  return EXPLORER_BASE[network];
}

/**
 * Who deployed this contract. Returns the creator address, or null when
 * Blockscout doesn't know (EOA, unindexed, or the request failed).
 *
 * Provenance is the only property of a token an impersonator cannot copy:
 * name, symbol and decimals are free to forge, but the creator is written at
 * deployment. `rh-rwa-verify` leans on this to tell a real Robinhood stock
 * token from a byte-identical fake.
 *
 * Null means "couldn't determine", NOT "not the deployer" — callers must keep
 * those two apart or a Blockscout hiccup turns into a false accusation.
 *
 * Measured 2.4–8.8s per call on RH Chain's Blockscout, so the timeout is
 * explicit: a defensive tool that hangs is a defensive tool nobody calls.
 */
const CREATOR_TIMEOUT_MS = 10_000;

export async function getContractCreator(
  address: string,
  network: RobinhoodNetwork = "mainnet",
): Promise<string | null> {
  const info = await bsFetch<{ creator_address_hash?: string | null }>(
    network,
    `/api/v2/addresses/${address}`,
    CREATOR_TIMEOUT_MS,
  );
  return info?.creator_address_hash ?? null;
}

// ─── Address balances (native ETH + all ERC-20) ─────────────────────────────
// Powers the check_wallet card's Robinhood Chain leg (Moralis doesn't index
// RH). All fields come straight from Blockscout — never fabricate.
//
// ⚠️ The token address field on `/addresses/{a}/tokens` is `token.address_hash`,
// NOT `token.address` — MEASURED 2026-09-04, the response has no `address` key
// at all (keys: address_hash, circulating_market_cap, circulating_supply,
// decimals, exchange_rate, holders_count, icon_url, name, reputation, symbol,
// total_supply, type, volume_24h). Note `/tokens/{addr}` DOES use `address_hash`
// too, but the holders/transfers endpoints nest a full address object under
// `address.hash` — three shapes, one explorer.
//
// This is worth a warning because the mistake is silent in both directions:
// `bsFetch`'s generic is hand-written, so a wrong field name still typechecks,
// and the wrong field reads `undefined` rather than throwing. Both functions
// below shipped with `token.address` — the filter dropped every row, so a wallet
// holding 5,665 AAPL reported no stock holdings at all, and check_wallet's RH
// rows carried `address: undefined`. Verify field names against a live payload,
// not against the type you just wrote.

export interface RhBalance {
  symbol:    string;
  name?:     string;
  address:   string;   // "0xeee…eee" for native ETH; token contract otherwise
  amount:    string;   // human-readable, decimal
  raw:       string;   // raw integer balance
  decimals:  number;
  isNative?: boolean;
  usdValue?: number;   // computed from Blockscout exchange_rate when available
}

function trimDecimal(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Raw ERC-20 balances for an address, with the outage kept VISIBLE.
 *
 * `getRobinhoodAddressBalances` below fail-softs a dead Blockscout into an empty
 * array, which is right for a card that degrades to "what it has" — and wrong
 * for anything that renders the result as a portfolio, because "the explorer did
 * not answer" and "you hold nothing" then look identical. That is the same
 * defect as reading a KV throttle as an absent key (#150), and it is worse here:
 * the user would see an empty stock section and reasonably conclude their
 * position is gone.
 *
 * So this returns a three-way and lets the caller say "couldn't check".
 * RH Chain has no Multicall3 deployed (task #88), so the one-shot explorer
 * index is also the only way to read 200+ registry tokens without 200 eth_calls.
 */
export type RhTokenBalanceRead =
  | { status: "ok"; items: Array<{ address: string; raw: string }> }
  | { status: "unavailable" };

export async function getRobinhoodTokenBalances(
  address: string,
  network: RobinhoodNetwork = "mainnet",
): Promise<RhTokenBalanceRead> {
  const list = await bsFetch<{ items?: Array<{ token: { address_hash: string }; value: string }> }>(
    network,
    `/api/v2/addresses/${address}/tokens?type=ERC-20`,
    undefined,
    1, // see bsFetch — a spurious "holdings unknown" banner is the costly failure here
  );
  if (!list) return { status: "unavailable" };
  const items = (list.items ?? [])
    .filter((it) => it?.token?.address_hash && it.value && it.value !== "0")
    .map((it) => ({ address: it.token.address_hash, raw: it.value }));
  return { status: "ok", items };
}

/**
 * The same read as `getRobinhoodAddressBalances`, but with the outage VISIBLE.
 *
 * Prefer this anywhere the result is rendered as a PORTFOLIO. The fail-soft
 * wrapper below collapses "the explorer did not answer" into "you hold nothing",
 * and a user looking at their own wallet cannot tell those apart — they conclude
 * the position is gone. Same three-way, same reason, as `getRobinhoodTokenBalances`
 * above; this one just carries the token metadata too.
 *
 * `unavailable` is decided by the ERC-20 list call alone, because that is the one
 * that defines the portfolio. The native-ETH call failing on its own leaves the
 * token list perfectly real and the leg short by exactly one row, which is
 * `nativeUnread` — reported, not silently dropped and not counted as zero ETH.
 *
 * `balances` is populated on BOTH arms, and on the `unavailable` arm it holds
 * whatever did come back (at most the native row). That is not an invitation to
 * render it as a portfolio — it exists so the fail-soft wrapper below can return
 * exactly what it always returned. A caller that shows this to a user must branch
 * on `status` first.
 *
 * `retries` and `maxPages` are parameters rather than constants so the existing
 * chat card keeps its exact behaviour (0 and 1) while the wallet can opt into
 * more — see `bsFetch` on why a rare spurious banner is the expensive failure
 * for a portfolio.
 *
 * PAGINATION — `truncated`. Blockscout serves this endpoint 50 rows at a time
 * and hands back a `next_page_params` cursor. This function ignored it, so a
 * wallet holding more than 50 tokens was read as if it held exactly 50.
 * MEASURED 2026-09-06 on `0x1A18…A4E7`: page 1 was full, page 2 was also full,
 * and the reader was reporting 2 crypto rows (the other 48 being equities that
 * route to the stock table). Whatever sits past the cursor is invisible AND
 * unaccounted for in any total computed from this list.
 *
 * `maxPages` bounds the walk — this is a wallet page, not a crawler, and a
 * spam-airdropped address can hold hundreds of rows. When the cursor is still
 * live at the cap we stop and set `truncated`, which is the same contract as
 * `nativeUnread`: the list is short, by an amount we do not know, and the
 * caller has to SAY so rather than present it as the whole portfolio.
 */
export type RhAddressBalanceRead =
  | { status: "ok";          balances: RhBalance[]; nativeUnread: boolean; truncated: boolean }
  | { status: "unavailable"; balances: RhBalance[]; nativeUnread: boolean; truncated: boolean };

type RhTokenPage = {
  items?: Array<{
    token: {
      address_hash: string;
      name?: string | null;
      symbol?: string | null;
      decimals?: string | null;
      exchange_rate?: string | null;
    };
    value: string;
  }>;
  next_page_params?: Record<string, string | number | null> | null;
};

/**
 * Per-leg timeouts + a walk deadline. Added 2026-09-13 after the wallet's
 * Base→Robinhood switch was reported as slow; the cause was NOT the page walk.
 *
 * MEASURED 2026-09-13, `0xb058…3b5f`, 9 runs of each endpoint, same minute:
 *
 *   /addresses/{a}          16.4s·200  11.0s·500  1.0s·500  2.0s·500  6.0s·500
 *                            1.4s·200   0.9s·200  0.8s·200  0.8s·200
 *   /addresses/{a}/tokens    0.79s      2.20s     2.23s     2.33s     1.98s
 *                            2.96s      2.87s     0.70s     0.66s   — all 200
 *
 * Two things fall out of that table. The token list — the thing the user opened
 * the tab to see — is consistently sub-3s and answered 9/9. The NATIVE balance
 * is the unreliable leg: a 16-second tail and 5 of 9 non-ok. And because the
 * two ran under one `Promise.all` with NO timeout on either, the fast, reliable
 * call was held hostage by the slow, flaky one on every single load. A user
 * switching to Robinhood waited 16s for one ETH row while their tokens had been
 * sitting in memory for fifteen of those seconds.
 *
 * So the native leg gets a SHORT deadline and the token legs a longer one. This
 * costs nothing in honesty because both failure modes already have names here:
 * a native leg that misses sets `nativeUnread` (the list is short by at most one
 * row — never "holds no ETH"), and a page that misses sets `truncated` (the list
 * is short by an unknown amount and the caller has to say so). A timeout is just
 * one more way to not get an answer, and "we did not get an answer" was already
 * sayable. Nothing here invents a balance to fill the gap.
 *
 * The cursor walk is NOT parallelised, and cannot be: page N+1's query string is
 * page N's `next_page_params`. That is why the walk gets a wall-clock BUDGET
 * instead — it bounds the total the way parallelism would have, and it degrades
 * into the flag that already exists rather than into a shorter list told as a
 * whole one.
 */
const NATIVE_TIMEOUT_MS = 5_000;
const PAGE_TIMEOUT_MS   = 8_000;
/** Wall-clock budget for pages 2..N. Page 1 is exempt — there is nothing to
 *  show without it, so it is worth waiting for; every page after it is an
 *  improvement to a list the user can already read. */
const WALK_BUDGET_MS    = 12_000;

export async function readRobinhoodAddressBalances(
  address: string,
  network: RobinhoodNetwork = "mainnet",
  retries = 0,
  maxPages = 1,
): Promise<RhAddressBalanceRead> {
  const tokenPath = `/api/v2/addresses/${address}/tokens?type=ERC-20`;

  // Page 1 runs alongside the native-balance call; later pages are cursor-based
  // and therefore strictly sequential. The two timeouts differ on purpose — see
  // the measurement above: these legs have very different reliability, and one
  // shared deadline would either strand the good leg or excuse the bad one.
  const [addrInfo, firstPage] = await Promise.all([
    bsFetch<{ coin_balance?: string; exchange_rate?: string | null }>(
      network, `/api/v2/addresses/${address}`, NATIVE_TIMEOUT_MS, retries),
    bsFetch<RhTokenPage>(network, tokenPath, PAGE_TIMEOUT_MS, retries),
  ]);

  const pages: RhTokenPage[] = firstPage ? [firstPage] : [];
  let cursor = firstPage?.next_page_params ?? null;
  let truncated = false;
  const walkDeadline = Date.now() + WALK_BUDGET_MS;

  while (cursor && Object.keys(cursor).length > 0) {
    if (pages.length >= maxPages) { truncated = true; break; }
    // Out of budget is the same FACT as out of pages: the list we return is
    // real and short, and `truncated` is how the caller is told. Checked before
    // the request rather than after, so the budget bounds what we WAIT, not
    // just what we count.
    if (Date.now() >= walkDeadline) { truncated = true; break; }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(cursor)) if (v != null) qs.set(k, String(v));
    const next = await bsFetch<RhTokenPage>(network, `${tokenPath}&${qs}`, PAGE_TIMEOUT_MS, retries);
    // A mid-walk failure is a short list, not an empty one — the pages already
    // read are real, so keep them and mark the remainder unknown.
    if (!next) { truncated = true; break; }
    pages.push(next);
    cursor = next.next_page_params ?? null;
  }

  const tokenList = firstPage ? { items: pages.flatMap(p => p.items ?? []) } : null;

  const out: RhBalance[] = [];

  // Native ETH — only push when non-zero to avoid clutter.
  if (addrInfo?.coin_balance && addrInfo.coin_balance !== "0") {
    const wei = BigInt(addrInfo.coin_balance);
    // Number() may lose precision on wei bigger than 2^53, but for display
    // that's fine; the raw string is preserved in .raw for exact math.
    const eth = Number(wei) / 1e18;
    const rate = addrInfo.exchange_rate ? Number(addrInfo.exchange_rate) : null;
    out.push({
      symbol:   "ETH",
      address:  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      amount:   trimDecimal(eth.toFixed(18)),
      raw:      addrInfo.coin_balance,
      decimals: 18,
      isNative: true,
      usdValue: rate && Number.isFinite(rate) ? eth * rate : undefined,
    });
  }

  // ERC-20 holdings
  for (const it of tokenList?.items ?? []) {
    const dec = it.token.decimals ? parseInt(it.token.decimals, 10) : 18;
    const raw = it.value;
    if (!raw || raw === "0") continue;
    let amount = 0;
    try {
      amount = Number(BigInt(raw)) / Math.pow(10, dec);
    } catch { amount = 0; }
    const rate = it.token.exchange_rate ? Number(it.token.exchange_rate) : null;
    out.push({
      symbol:   it.token.symbol || "?",
      name:     it.token.name || undefined,
      address:  it.token.address_hash,
      amount:   trimDecimal(amount.toFixed(dec)),
      raw,
      decimals: dec,
      usdValue: rate && Number.isFinite(rate) ? amount * rate : undefined,
    });
  }

  // Sort: native → stablecoins → highest USD → rest
  const stables = new Set(["USDC", "USDT", "DAI", "USDG"]);
  out.sort((a, b) => {
    const ra = a.isNative ? 0 : stables.has(a.symbol.toUpperCase()) ? 1 : 2;
    const rb = b.isNative ? 0 : stables.has(b.symbol.toUpperCase()) ? 1 : 2;
    if (ra !== rb) return ra - rb;
    return (b.usdValue ?? 0) - (a.usdValue ?? 0);
  });

  return tokenList
    ? { status: "ok",          balances: out, nativeUnread: !addrInfo, truncated }
    : { status: "unavailable", balances: out, nativeUnread: !addrInfo, truncated };
}

/**
 * Live token holdings for an address on Robinhood Chain via Blockscout v2.
 * Two calls in parallel: `/addresses/{addr}` (native ETH + rate) and
 * `/addresses/{addr}/tokens?type=ERC-20` (all ERC-20). Fail-soft: any missing
 * source returns an empty leg — the caller degrades to what it has.
 *
 * ⚠️ Fail-soft is right for a card that says "here is what I could find" and
 * WRONG for a portfolio — see `readRobinhoodAddressBalances` above, which is
 * this same read with the outage kept distinguishable. Use that one for new
 * callers; this wrapper exists for the chat `check_wallet` card, whose whole
 * contract is to degrade quietly.
 */
export async function getRobinhoodAddressBalances(
  address: string,
  network: RobinhoodNetwork = "mainnet",
): Promise<RhBalance[]> {
  return (await readRobinhoodAddressBalances(address, network)).balances;
}

// ─── Address transaction history (native txs + ERC-20 transfers) ────────────
//
// Why this exists: the wallet's Activity tab was Base-only, because its one
// source is `/api/wallet/transactions` → Moralis, and Moralis does not index
// 4663. The tab therefore rendered "ONCHAIN TIMELINE · BASE" beside a
// cross-chain total, and a Robinhood send that really happened looked like a
// send that never did. `WALLET_CHAINS.robinhood.can.txHistory` was the flag
// standing in for that gap; this reader is what lets it flip to true.
//
// MEASURED 2026-09-13 against robinhoodchain.blockscout.com, address
// `0xb058…3b5f` — both legs answer with real, populated `items`:
//   /api/v2/addresses/{a}/transactions      → 200, 50 items, next_page_params
//   /api/v2/addresses/{a}/token-transfers   → 200, 50 items, next_page_params
// The field names below are transcribed from those responses, not from the
// Blockscout docs: `token-transfers` carries `transaction_hash` (not `tx_hash`,
// which is what the token-scoped endpoint above uses) and nests the amount
// under `total.value`/`total.decimals`.
//
// ⚠️ The same endpoint family as `readRobinhoodAddressBalances` — so the same
// flakiness applies (that function's header has the 9-run table: the address
// legs 500 intermittently while the list legs do not). Both legs here get an
// explicit timeout and one retry for that reason, and a leg that still does not
// answer degrades into `partial`, never into a shorter list presented as whole.

/** One row of wallet activity, in the SAME shape the Moralis-backed Base reader
 *  emits — `Tx` in `/api/wallet/transactions`. Deliberately identical so the
 *  timeline can concatenate the two chains without a translation layer that
 *  could drift; the chain itself is stamped by the route, not here, because
 *  this module only ever reads one. */
export type RhHistoryRow = {
  hash: string;
  ts: number;
  category: string;
  kind: "received" | "sent" | "swap" | "contract";
  dir: "in" | "out" | "none";
  counterparty?: string;
  amount: number | null;
  asset?: string;
  status: "complete" | "pending" | "failed";
};

/**
 * `partial` and `capped` are two DIFFERENT kinds of short, and the caller has
 * to be able to say which:
 *   partial  one of the two legs did not answer, so rows are missing from
 *            inside the window — an outage, retryable, and the list must not be
 *            presented as complete.
 *   capped   both legs answered and there is simply more history than one page
 *            — expected, not a failure, and the honest exit is the explorer.
 * Collapsing them would make a Blockscout 500 look like "you've reached the
 * end", which is the absence-as-fact family this wallet work keeps closing.
 */
export type RhAddressHistoryRead =
  | { status: "ok";          rows: RhHistoryRow[]; partial: boolean; capped: boolean }
  | { status: "unavailable"; rows: [];             partial: false;   capped: false };

type BsAddrRef = { hash?: string; name?: string | null; is_scam?: boolean };

type BsTxItem = {
  hash?: string;
  timestamp?: string;
  /** Native value in wei, as a decimal string. "0" for a pure contract call. */
  value?: string;
  from?: BsAddrRef | null;
  to?: BsAddrRef | null;
  /** Decoded method name ("transfer", "create") or a raw 4-byte selector. */
  method?: string | null;
  status?: string | null;
  transaction_types?: string[] | null;
};

type BsTransferItem = {
  transaction_hash?: string;
  timestamp?: string;
  from?: BsAddrRef | null;
  to?: BsAddrRef | null;
  method?: string | null;
  token?: {
    symbol?: string | null;
    decimals?: string | null;
    /** Blockscout's own label — "ok" | "neutral" | "scam". */
    reputation?: string | null;
  } | null;
  total?: { value?: string; decimals?: string } | null;
};

/** Per-leg ceiling. Both legs run in parallel, so this is also the wall-clock
 *  cost of the read: ~8s per attempt, ~16s worst case with the one retry. */
const HISTORY_TIMEOUT_MS = 8_000;
/** One page each. A wallet timeline is a recent-activity view, not an archive —
 *  the explorer link is the honest path to older rows, and it is already on the
 *  card. Deeper paging would multiply the flaky-leg exposure above for history
 *  nobody scrolled to. */
const HISTORY_MAX_ROWS = 50;

/** Raw integer string → human amount, or null when it cannot be read. Never 0:
 *  an unreadable amount is unknown, and a zero would be a number we invented. */
function toAmount(raw: string | null | undefined, decimals: number): number | null {
  if (!raw) return null;
  try {
    const n = Number(BigInt(raw)) / Math.pow(10, decimals);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const hasCursor = (p: { next_page_params?: unknown } | null): boolean => {
  const c = p?.next_page_params;
  return !!c && typeof c === "object" && Object.keys(c as object).length > 0;
};

/**
 * Recent wallet activity on Robinhood Chain, merged into one row per tx.
 *
 * Two legs, in parallel, because Blockscout splits what Moralis returns joined:
 * `/transactions` is every tx the address sent or received AT THE TX LEVEL, and
 * `/token-transfers` is every ERC-20 movement touching it — including transfers
 * inside a tx somebody else submitted, which the first leg does not list at all.
 * Neither alone is the wallet's activity; the union is.
 *
 * The merge is by tx hash and mirrors the Moralis normalizer exactly: a tx that
 * moved the user's tokens BOTH ways is a swap, one way in is a receive, one way
 * out is a send, and a tx that moved nothing of theirs is a contract call.
 */
export async function readRhAddressHistory(
  address: string,
  network: RobinhoodNetwork = "mainnet",
  retries = 1,
): Promise<RhAddressHistoryRead> {
  const me = address.toLowerCase();

  const [txPage, tfPage] = await Promise.all([
    bsFetch<{ items?: BsTxItem[]; next_page_params?: unknown }>(
      network, `/api/v2/addresses/${address}/transactions`, HISTORY_TIMEOUT_MS, retries),
    bsFetch<{ items?: BsTransferItem[]; next_page_params?: unknown }>(
      network, `/api/v2/addresses/${address}/token-transfers?type=ERC-20`, HISTORY_TIMEOUT_MS, retries),
  ]);

  // Neither leg answered: we know nothing, and "nothing" is not "no activity".
  if (!txPage && !tfPage) return { status: "unavailable", rows: [], partial: false, capped: false };

  // ── Leg 2: the user's token movements, grouped by the tx that caused them ──
  type Move = { dir: "in" | "out"; amount: number | null; asset: string; other?: string };
  const byHash = new Map<string, { ts: number; moves: Move[] }>();

  for (const t of tfPage?.items ?? []) {
    const hash = t.transaction_hash?.toLowerCase();
    if (!hash) continue;
    // Blockscout's own scam labels. Filtered for the same reason the Base route
    // filters Moralis's `possible_spam`: an airdropped fake in the timeline is
    // an invitation to interact with it. Only an EXPLICIT "scam" is dropped —
    // an absent label is not evidence of anything.
    if (t.token?.reputation === "scam" || t.from?.is_scam || t.to?.is_scam) continue;

    const from = t.from?.hash?.toLowerCase();
    const to   = t.to?.hash?.toLowerCase();
    const dir: "in" | "out" | null = to === me ? "in" : from === me ? "out" : null;
    // A transfer that moved somebody else's tokens inside a tx we touched is
    // not this wallet's activity. It stays out rather than being counted.
    if (!dir) continue;

    const decimals = parseInt(t.total?.decimals ?? t.token?.decimals ?? "18", 10);
    const move: Move = {
      dir,
      amount: toAmount(t.total?.value, Number.isFinite(decimals) ? decimals : 18),
      asset: t.token?.symbol || "?",
      other: dir === "in" ? t.from?.hash : t.to?.hash,
    };

    const ts = t.timestamp ? Date.parse(t.timestamp) : 0;
    const cur = byHash.get(hash);
    if (cur) { cur.moves.push(move); if (!cur.ts) cur.ts = ts; }
    else byHash.set(hash, { ts, moves: [move] });
  }

  // ── Leg 1: tx-level facts (status, method, native value, counterparty) ─────
  const txByHash = new Map<string, BsTxItem>();
  for (const t of txPage?.items ?? []) if (t.hash) txByHash.set(t.hash.toLowerCase(), t);

  // A leg that did not answer means rows are missing from inside the window.
  let partial = !txPage || !tfPage;

  const rows: RhHistoryRow[] = [];
  const hashes = new Set<string>([...byHash.keys(), ...txByHash.keys()]);

  for (const hash of hashes) {
    const tx = txByHash.get(hash);
    const moves = byHash.get(hash)?.moves ?? [];
    const ts = byHash.get(hash)?.ts || (tx?.timestamp ? Date.parse(tx.timestamp) : 0);
    if (!ts) continue;

    const status: RhHistoryRow["status"] = tx?.status === "error" ? "failed" : "complete";
    const category = tx?.method || tx?.transaction_types?.join("/") || "";
    const base = { hash, ts, category, status };

    const incoming = moves.find(m => m.dir === "in");
    const outgoing = moves.find(m => m.dir === "out");

    if (incoming && outgoing) {
      // Tokens both ways in one tx — a swap. The counterparty is the contract
      // that did it, which is what the Base reader reports too.
      rows.push({ ...base, kind: "swap", dir: "none", counterparty: tx?.to?.hash,
                  amount: incoming.amount, asset: incoming.asset });
      continue;
    }
    if (incoming) {
      rows.push({ ...base, kind: "received", dir: "in", counterparty: incoming.other,
                  amount: incoming.amount, asset: incoming.asset });
      continue;
    }
    if (outgoing) {
      rows.push({ ...base, kind: "sent", dir: "out", counterparty: outgoing.other,
                  amount: outgoing.amount, asset: outgoing.asset });
      continue;
    }

    // No token movement of theirs in this tx. Either native ETH moved, or it is
    // a contract call — UNLESS the transfers leg is the one that failed, in
    // which case we KNOW a token moved and cannot say what: dropping the row is
    // honest, captioning it "Contract call" would be a wrong row, and a wrong
    // row is worse than a missing one (the same rule the Base route's header
    // states about refusing an unlisted chain).
    if (!tfPage && tx?.transaction_types?.includes("token_transfer")) { partial = true; continue; }

    const native = toAmount(tx?.value, 18);
    if (native && native > 0) {
      const from = tx?.from?.hash?.toLowerCase();
      const to   = tx?.to?.hash?.toLowerCase();
      if (to === me)        rows.push({ ...base, kind: "received", dir: "in",  counterparty: tx?.from?.hash, amount: native, asset: "ETH" });
      else if (from === me) rows.push({ ...base, kind: "sent",     dir: "out", counterparty: tx?.to?.hash,   amount: native, asset: "ETH" });
      else                  rows.push({ ...base, kind: "contract", dir: "none", counterparty: tx?.to?.hash,  amount: null });
      continue;
    }

    rows.push({ ...base, kind: "contract", dir: "none", counterparty: tx?.to?.hash, amount: null });
  }

  rows.sort((a, b) => b.ts - a.ts);

  // More history exists than we fetched — either leg still had a cursor, or the
  // merge itself overflowed the row cap.
  const capped = hasCursor(txPage) || hasCursor(tfPage) || rows.length > HISTORY_MAX_ROWS;

  return { status: "ok", rows: rows.slice(0, HISTORY_MAX_ROWS), partial, capped };
}
