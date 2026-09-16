/**
 * Wallet holdings reader — the FULL live token list a Base wallet holds.
 *
 * ── Three sources, in descending order of what they can establish ─────────────
 *
 *   "moralis"    `/wallets/{address}/tokens` — every non-zero token, native ETH
 *                included, priced. The only source that can be COMPLETE.
 *   "discovery"  keyless: a public explorer names the candidate contracts, the
 *                public Base RPC reads every balance on-chain via Multicall3,
 *                GeckoTerminal prices them. See ./base-token-discovery.ts.
 *                Mainnet only. ALWAYS `partial` — see below.
 *   "rpc"        ./balance.ts — ETH plus three curated majors. The floor, and
 *                the only path on Sepolia.
 *
 * ── Why "discovery" was added, and why it is still `partial` ──────────────────
 * Moralis' free plan PAUSED with a 401 in production (2026-09-12) and the ask
 * was explicitly for an alternative that does not cost a Moralis upgrade. The
 * curated-majors fallback is honest but tiny: a wallet whose whole position is a
 * long-tail token saw an empty portfolio and "≥ $0.00".
 *
 * Discovery is nonetheless flagged `partial` on EVERY read, including the ones
 * that look complete. It cannot prove completeness: its candidate list comes
 * from an explorer index MEASURED to return `HTTP 200` with an empty body for a
 * wallet that demonstrably holds USDC. A token the index omits is not read, and
 * "the explorer didn't mention it" is not evidence of absence. Completeness is
 * the absence of every reason to doubt (see ./read-state.ts) — and this source
 * always has one. `partialReason` carries WHICH doubt, so the UI stops printing
 * "the full token list needs Moralis" over a list Moralis had no part in.
 *
 * The balances themselves are not hedged: every number here was read from the
 * chain. An incomplete candidate list costs ROWS, never accuracy.
 *
 * B20 tokens (Beryl-20, address prefix 0xb200…) are confirmed on-chain via the
 * B20Factory.isB20() read so the card can badge + deep-link them. ZERO LLM.
 */

import { createPublicClient, http, formatUnits, isAddress, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import { B20_FACTORY_ADDRESS, FACTORY_ABI } from "@/lib/b20/inspect-abi";
import { getWalletTokenBalances } from "@/lib/moralis";
import { checkBalance } from "@/lib/wallet/balance";
import { discoverBaseTokens } from "@/lib/wallet/base-token-discovery";
import { getBaseTokenPricesUsd } from "@/lib/wallet/token-prices";
import { classifyToken, type TokenTrust } from "@/lib/wallet/token-trust";

type Network = "mainnet" | "sepolia";

const NETS: Record<Network, { chain: Chain; rpc: string; explorer: string; moralis: "base" | "base sepolia" }> = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org", explorer: "https://basescan.org",         moralis: "base"         },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org", moralis: "base sepolia" },
};

/**
 * Symbols treated as stablecoins for the display sort (native → stable → B20 → rest).
 *
 * A SYMBOL match is all this is, and that is why it is no longer sufficient on
 * its own — see `rank()`. A token calling itself USDC used to sort into this
 * tier and land directly under the card showing the user's real USDC.
 */
const STABLES = new Set(["USDC", "USDT", "DAI", "USDBC", "USDC.E", "USDE", "EURC", "PYUSD", "USDM", "CRVUSD"]);

export interface WalletHolding {
  symbol:    string;
  name?:     string;
  address:   string;   // token contract; 0xeee…eee for native ETH
  amount:    string;   // human-readable, trailing-zeros trimmed
  raw:       string;   // raw integer balance as string
  decimals:  number;
  isNative?: boolean;
  isB20?:    boolean;
  usdValue?: number;
  logo?:     string;
  /** Derived here, not in the view, so the sort and the table cannot disagree
   *  about which rows this app is willing to stand behind. */
  trust:     TokenTrust;
}

export interface WalletLookup {
  address:    string;
  network:    Network;
  explorer:   string;
  addressUrl: string;
  source:     "moralis" | "discovery" | "rpc";
  /** True when the list is known NOT to cover everything. See ./read-state.ts —
   *  completeness is the absence of every reason to doubt, so this is false only
   *  on a Moralis read that returned cleanly. */
  partial:    boolean;
  /**
   * WHY `partial` is true, in the words of the reader that knows — one sentence,
   * user-facing, no jargon. Absent iff `partial` is false.
   *
   * This exists because the caveat used to be hardcoded at the far end of the
   * pipe: `TokenTable` printed "Showing majors only — the full token list needs
   * Moralis" and `net-worth.ts` pushed "token list limited to majors (Moralis
   * unavailable)". Both were written when `partial` had exactly one cause. With
   * a third source they became confident, specific, WRONG explanations of a
   * correct flag — a list built by on-chain discovery is neither majors-only nor
   * waiting on Moralis. The reason now travels WITH the flag that it explains.
   */
  partialReason?: string;
  holdings:   WalletHolding[];
  error?:     string;
  /**
   * The list is short because something FAILED, not merely because a source has
   * limited coverage. The two look identical in `partial` and read very
   * differently: "Moralis is down so we discovered on-chain instead" is a
   * complete measurement of a narrower set, while "4 of those balance reads did
   * not complete" is a measurement that did not finish.
   *
   * Only the cache below reads it, and it reads it for one reason: a degraded
   * result must never be stored. Pinning one rate-limited read for a TTL turns a
   * two-second blip into a minute of a wallet reporting "$0.00" — which is the
   * exact defect this flag was added to stop (measured 2026-09-16: six parallel
   * page reads, one came back with Base at $0 and four unread balances).
   */
  degraded?:  boolean;
}

/** Accept base/baseSepolia AND mainnet/sepolia → canonical mainnet/sepolia. */
function normalizeNetwork(n: string): Network {
  const v = (n || "").toLowerCase();
  if (v === "base" || v === "mainnet") return "mainnet";
  return "sepolia";
}

/** "1.2300" → "1.23", "5.0" → "5". */
function trimAmount(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Display rank: native ETH → stablecoins → B20 → long tail → impostors last.
 *
 * The stablecoin tier is gated on `trust !== "impostor"` because the tier is a
 * claim, not a label: it says "this row is one of the boring safe ones", and it
 * puts the row near the top where the eye goes first. A token whose entire
 * purpose is to be mistaken for USDC scored that placement off its ticker
 * alone. Impostors now sort BELOW the long tail — the ranking itself carries
 * the warning, so it survives even if the badge is missed.
 */
function rank(h: WalletHolding): number {
  if (h.trust === "impostor") return 4;
  if (h.isNative) return 0;
  if (STABLES.has(h.symbol.toUpperCase())) return 1;
  if (h.isB20) return 2;
  return 3;
}

/** A row before B20 detection and trust classification have run. */
type Draft = Omit<WalletHolding, "trust">;

/**
 * Attach `usdValue` from GeckoTerminal — keyless, quota-free, and keyed BY TOKEN
 * ADDRESS, which is the property that matters: a price looked up by ticker or by
 * "deepest pool" answers a different question than the one asked (#223 — USDC's
 * deepest Base pair is LAPTOP/USDC, so the pool's own price reads a dollar at 38
 * cents).
 *
 * Rows that already carry a price keep it — Moralis prices its own rows, and
 * re-pricing them would introduce a second writer for one field.
 *
 * Sepolia is SKIPPED, not attempted-and-failed: GeckoTerminal indexes Base
 * mainnet, and a testnet token sharing an address with a mainnet one would
 * otherwise be valued at the mainnet price — play money shown as real money.
 *
 * The value is computed in CODE from `raw` and `decimals`, never from the
 * display string: `amount` is trimmed for the eye and would silently round the
 * figure it is multiplied into. An unpriced row stays unpriced — a dash the
 * caller turns into "≥", never a zero.
 */
async function attachPrices(rows: Draft[], net: Network): Promise<Draft[]> {
  if (net !== "mainnet" || rows.length === 0) return rows;
  const need = rows.filter(h => typeof h.usdValue !== "number" && h.address);
  if (need.length === 0) return rows;

  const prices = await getBaseTokenPricesUsd(need.map(h => h.address));
  return rows.map(h => {
    if (typeof h.usdValue === "number") return h;
    const price = prices.get((h.address || "").toLowerCase());
    if (price == null) return h;                       // unpriced stays a dash
    const units = Number(formatUnits(BigInt(h.raw), h.decimals));
    if (!Number.isFinite(units)) return h;
    return { ...h, usdValue: units * price };
  });
}

/**
 * The shared tail every source runs: confirm B20s on-chain, classify trust, sort.
 *
 * Factored out when discovery became the third source. It used to live inline in
 * the Moralis branch ONLY, so the fallback rows reached the UI unsorted and
 * never B20-badged — a difference in which source answered showing up as a
 * difference in what the token is. Trust classification is deliberately LAST:
 * `classifyToken` reads `isB20`, and that flag is an on-chain read, so running
 * the classifier before it would decide on an input that had not arrived.
 */
async function finalize(
  drafts: Draft[],
  cfg: { chain: Chain; rpc: string },
  trustNet: "base" | "baseSepolia",
): Promise<WalletHolding[]> {
  // ── B20 detection — confirm 0xb200…-prefixed tokens via Factory.isB20() ──────
  const candidates = drafts.filter(h => h.address.toLowerCase().startsWith("0xb200"));
  if (candidates.length) {
    try {
      const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });
      type MC = { status: "success"; result: boolean } | { status: "failure"; error: unknown };
      const res = (await client.multicall({
        allowFailure: true,
        contracts: candidates.map(c => ({
          address: B20_FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "isB20", args: [c.address as `0x${string}`],
        })) as never,
      })) as unknown as MC[];
      candidates.forEach((c, i) => {
        const r = res[i];
        if (r && r.status === "success" && r.result === true) c.isB20 = true;
      });
    } catch {
      // Leave isB20 unset — never fabricate; the card just won't badge it.
    }
  }

  // Now that isB20 is settled, every input to the classifier is final.
  const holdings: WalletHolding[] = drafts.map(d => ({ ...d, trust: classifyToken(d, trustNet) }));

  // native → stable → B20 → rest → impostors; within a tier, highest USD first.
  holdings.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.usdValue ?? 0) - (a.usdValue ?? 0);
  });
  return holdings;
}

async function readWallet(address: string, network: string): Promise<WalletLookup> {
  const net  = normalizeNetwork(network);
  const cfg  = NETS[net];
  const meta = { address, network: net, explorer: cfg.explorer, addressUrl: `${cfg.explorer}/address/${address}` };

  if (!isAddress(address)) {
    return { ...meta, source: "rpc", partial: false, holdings: [], error: "Invalid wallet address." };
  }

  // ── Primary: Moralis full token list ────────────────────────────────────────
  const tokens = await getWalletTokenBalances(address, cfg.moralis);

  // Which spelling of the network `token-trust.ts` speaks.
  const trustNet = net === "mainnet" ? "base" : "baseSepolia";

  // ── Moralis unavailable (no key / 401 / down) ───────────────────────────────
  if (tokens === null) {
    // Second choice: keyless on-chain discovery. Mainnet only — see the module
    // header for why running it on Sepolia would be worse than not running it.
    if (net === "mainnet") {
      const d = await discoverBaseTokens(address);
      if (d.status === "ok") {
        const priced = await attachPrices(
          d.holdings.map(h => ({
            symbol: h.symbol, name: h.name, address: h.address, amount: h.amount,
            raw: h.raw, decimals: h.decimals, isNative: h.isNative, logo: h.logo,
          })),
          net,
        );
        const holdings = await finalize(priced, cfg, trustNet);

        // Name the SPECIFIC doubt, most-limiting first. Every one of these is a
        // measured reason the list may be short; none of them makes a number on
        // it wrong, which is why the caveat is about coverage, not accuracy.
        const why: string[] = [];
        if (d.unread > 0 || d.nativeUnread)
          why.push(`${d.unread + (d.nativeUnread ? 1 : 0)} balance read${d.unread + (d.nativeUnread ? 1 : 0) === 1 ? "" : "s"} did not complete`);
        if (d.truncated) why.push("the scan hit its limit before the end of the list");
        if (d.sources.length === 0) why.push("no explorer answered, so only major tokens were checked");

        return {
          ...meta,
          source: "discovery",
          partial: true,
          partialReason:
            why.length > 0
              ? `Found on-chain without Moralis — ${why.join("; ")}. Other tokens may be held here.`
              : "Found on-chain without Moralis — a token the explorer has not indexed would not appear here.",
          holdings,
          // `truncated` is deliberately NOT degradation: the scan reached its
          // own limit and said so, which is a complete read of a capped range.
          // An unread balance is a read that did not finish.
          degraded: d.unread > 0 || d.nativeUnread,
        };
      }
    }

    // Last resort: the curated-majors RPC read. Reached when discovery could not
    // reach the chain at all, and always on Sepolia.
    const r = await checkBalance(address, network);
    const rows: Draft[] = (r.balances ?? [])
      .filter(b => b.raw && b.raw !== "0")
      // `address` and `decimals` come THROUGH from balance.ts, which read the
      // balance off that exact contract. They used to be reconstructed here from
      // the symbol (`address: ""`, `decimals: symbol === "USDC" ? 6 : 18`) —
      // which silently gave cbBTC 18 decimals instead of 8, and left the row
      // with no address at all, so nothing downstream could tell what it was.
      .map(b => ({
        symbol:   b.symbol,
        address:  b.address,
        amount:   b.amount,
        raw:      b.raw,
        decimals: b.decimals,
        isNative: b.isNative,
      }));

    // Price from a SECOND source, because the only reason we are on this branch
    // is that the first one is down — and `usdValue` used to have Moralis as its
    // single writer. Without this, one 401 cost us both the token list AND every
    // dollar figure on the chain, so a wallet holding real USDC reported
    // "≥ $0.00" beside a Robinhood total that was fine (measured in production
    // 2026-09-12; Blue Hood's independent source is exactly why the two chains
    // disagreed).
    const holdings = await finalize(await attachPrices(rows, net), cfg, trustNet);

    return {
      ...meta,
      source: "rpc",
      partial: true,
      partialReason: r.error
        ? "Only major tokens were checked, and part of that read failed. Other tokens may be held here."
        : r.unread > 0
          ? `Only major tokens were checked, and ${r.unread} of those reads did not complete. Other tokens may be held here.`
          : "Only major tokens were checked. Other tokens may be held here.",
      holdings,
      error: r.error,
      degraded: !!r.error || r.unread > 0,
    };
  }

  // Only tokens the wallet actually holds; drop spam.
  const drafts: Draft[] = tokens
    .filter(t => !t.possible_spam && t.balance && t.balance !== "0")
    .map(t => ({
      symbol:   t.symbol || "?",
      name:     t.name || undefined,
      address:  t.token_address,
      amount:   trimAmount(t.balance_formatted ?? t.balance),
      raw:      t.balance,
      decimals: t.decimals ?? 18,
      isNative: !!t.native_token,
      usdValue: typeof t.usd_value === "number" ? t.usd_value : undefined,
      logo:     t.logo ?? undefined,
    }));

  // Moralis prices its own rows; `attachPrices` fills only the ones it left
  // blank, so a token Moralis lists but cannot value stops being a permanent
  // dash without ever giving `usdValue` two writers for the same row.
  const holdings = await finalize(await attachPrices(drafts, net), cfg, trustNet);

  return { ...meta, source: "moralis", partial: false, holdings };
}

/* ────────────────────────────────────────────────────────────────────────────
 * One read per address, shared by everything that asks at once
 * ────────────────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-09-16, and this is the bug, not a nicety:
 *
 *   for i in 1..6: GET /api/wallet/net-worth  &  GET /api/wallet/holdings
 *   → run 4  base = $0
 *     reasons: "Only major tokens were checked, and 4 of those reads did not
 *               complete."
 *
 * Five of six runs returned $5.00. One returned $0.00 on the same wallet, in
 * the same second, and the UI rendered that as "Base mainnet ≥ $0.00" beside a
 * token table that was showing the very same tokens priced correctly.
 *
 * The cause is us. Opening the wallet fires several server routes that each
 * independently call `checkWallet(addr, "base")`, and each one replays the
 * whole Moralis → on-chain discovery → curated-majors chain against the public
 * Base RPC. So the page rate-limits ITSELF: discovery loses the chain, the read
 * falls to the last-resort majors branch, some of those balance reads fail too,
 * and the chain total collapses to zero. Nothing was wrong with the wallet, the
 * prices, or the indexer — we asked the same question four times at once.
 *
 * Two mechanisms, and the first is the one that matters:
 *
 *   inflight  Concurrent callers for the same key share ONE promise. The burst
 *             on page load is simultaneous, so this collapses it to a single
 *             upstream read — no rate limit, no divergence between two panels
 *             reading the same wallet.
 *   cache     A short TTL for calls that arrive just after, e.g. a tab switch.
 *
 * ── What may be stored ───────────────────────────────────────────────────────
 * Measurements only — the same law `rh-holdings-cache.ts` applies to a failed
 * explorer read and the sellable route applies to an unreadable pool. A read
 * with `error` or `degraded` is served to ITS caller and then dropped, because
 * caching it would pin one blip for the whole TTL and hand every later panel
 * the same fabricated zero. Failing reads are also exactly the fast ones, so a
 * cache that accepted them would preferentially remember the outage.
 *
 * Deliberately process-local, never KV: Upstash has been suspended three times
 * on budget (#148), and this is a hot path on every wallet open.
 *
 * TTL is short on purpose. This exists to de-duplicate one page load, not to
 * serve a stale balance — a user who just sent a transaction and hits refresh
 * must not be told their old balance for a minute.
 */
const READ_TTL_MS = 15_000;

const readCache = new Map<string, { at: number; value: WalletLookup }>();
const readInflight = new Map<string, Promise<WalletLookup>>();

const readKey = (address: string, network: string) =>
  `${normalizeNetwork(network)}|${(address || "").toLowerCase()}`;

/**
 * Token holdings for `address` on `network`.
 *
 * Same contract as before — this is a de-duplicating wrapper, not a new answer.
 * A caller that needs to bypass the cache (a post-transaction refresh) should
 * call `invalidateWallet` first rather than being given a "force" flag, so that
 * skipping the cache stays an explicit act at the call site.
 */
export async function checkWallet(address: string, network: string): Promise<WalletLookup> {
  const key = readKey(address, network);

  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.value;
  if (hit) readCache.delete(key);

  const pending = readInflight.get(key);
  if (pending) return pending;

  const p = readWallet(address, network)
    .then((value) => {
      // Store the measurement; drop anything that did not finish reading.
      if (!value.error && !value.degraded) readCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => { readInflight.delete(key); });

  readInflight.set(key, p);
  return p;
}

/** Drop any memo for this address so the next read goes back to the chain. */
export function invalidateWallet(address: string, network: string): void {
  const key = readKey(address, network);
  readCache.delete(key);
  readInflight.delete(key);
}
