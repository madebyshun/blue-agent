/**
 * Base token DISCOVERY — find every ERC-20 a wallet holds, without Moralis.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `holdings.ts` reads the full token list from Moralis. When Moralis is down or
 * out of quota (free plan PAUSED with a 401 in production, 2026-09-12) it falls
 * back to `checkBalance()` — ETH plus three curated majors. That fallback is
 * honest but tiny: a wallet whose entire position is a long-tail token sees an
 * empty portfolio and a "≥ $0.00" total. The ask was an alternative that does
 * not cost what a Moralis upgrade costs, so this module is deliberately KEYLESS:
 * a public explorer for the candidate list, the public Base RPC for the numbers.
 *
 * ── The split that makes it safe: candidates vs balances ──────────────────────
 * Two different jobs, two different trust levels, and conflating them is the
 * whole risk:
 *
 *   ENUMERATION (which contracts might this wallet hold?) is a HINT. It may be
 *   stale, short, or wrong, and being wrong here is survivable — a candidate
 *   that isn't held reads zero and disappears; a candidate that is missed is a
 *   row we don't show, which `truncated`/`status` then has to admit.
 *
 *   BALANCES are AUTHORITATIVE and come from exactly one place: `balanceOf` on
 *   the chain itself, via Multicall3. No explorer's cached balance is ever
 *   rendered. This is why an incomplete explorer index costs us rows and never
 *   costs us accuracy.
 *
 * ── Enumeration sources (MEASURED 2026-09-12, Base mainnet) ───────────────────
 * Blockscout's Base balance index is INCOMPLETE, and it fails in the worst
 * possible shape — `HTTP 200` with an empty list, which is indistinguishable
 * from "this wallet holds nothing":
 *
 *   0x0295…9205 (holds 5.0 USDC)   → token-balances `[]`, tokens `[]`, legacy
 *                                    tokenlist "No tokens found" — AND
 *                                    token-transfers returns 0 items too.
 *   0xb026BA…1B22 (holds 17)       → token-balances returns all of them.
 *   0x…0001 (dust magnet)          → token-balances FAILED, transfers carried
 *                                    the whole read: 196 candidates, 195 held.
 *
 * All three balance endpoints share one index, so the empty answers are a gap in
 * the index, not a bug in one route — and each source covers a case the others
 * miss, which is why they are UNIONED rather than one being picked as "the good
 * one". None is trusted for a number.
 *
 * `BASE_MAJORS` is always folded into the candidate set as a floor, and that
 * floor is not a nicety: on 0x0295…9205 EVERY explorer source came back empty,
 * so the seeded USDC candidate is the only reason its real 5.0 USDC renders at
 * all. It also makes discovery a strict superset of the curated-majors fallback
 * it replaces — worst case it lands exactly where the old path landed.
 *
 * The honest limit, stated because it is invisible from the output: for a wallet
 * the explorer does not index, a LONG-TAIL token is not discoverable by this
 * module at all. `sources` is carried out so a caller can tell "two explorers
 * answered and you hold three tokens" from "no explorer answered and these three
 * are just the majors we always check".
 *
 * ── Never a silent zero ───────────────────────────────────────────────────────
 * The first version of this pipeline issued one `eth_call` per candidate and
 * treated an errored call as a zero balance. MEASURED against 0xb026BA…1B22:
 * `mainnet.base.org` answered `{"code":-32016,"message":"over rate limit"}` for
 * 13 of 18 calls, and the probe reported a confident, complete-LOOKING portfolio
 * that was missing 158,707,811 USDC — the wallet's entire position. That is
 * strictly worse than the Moralis outage it was meant to replace: an outage
 * gives dashes and an honest "≥", while a rate-limited RPC read as zeros gives a
 * wrong number with no warning on it.
 *
 * Both halves of the fix are load-bearing:
 *   1. ONE `eth_call` per chunk via Multicall3, not one per token. The same 18
 *      reads that lost 13 to the rate limit return 17 held / 0 unread in a
 *      single call.
 *   2. A read that does not answer is counted in `unread` and its row is DROPPED
 *      — never emitted as `0n`. `unread > 0` makes the caller's total a floor.
 *
 * Same family as #211/#212/#213 (an unread list rendered as an empty one) and
 * #322 ("Stablecoin 0%" printed under "No assets yet"). CLAUDE.md: "Missing data
 * → 'unknown' / 'insufficient data'. NEVER infer a … fake number from absent
 * data."
 *
 * Mainnet only, on purpose. Blockscout's Base index and GeckoTerminal's pricing
 * are both mainnet; running this on Sepolia would enumerate play-money tokens
 * and, worse, hand them mainnet prices when their addresses collide. Sepolia
 * keeps the curated-majors path.
 *
 * ZERO LLM. Never throws — the caller renders this, so "couldn't look" has to be
 * sayable.
 */

import { createPublicClient, http, formatUnits, isAddress, getAddress } from "viem";
import { base } from "viem/chains";
import { BASE_MAJORS, NATIVE_SENTINEL } from "@/lib/wallet/token-trust";

/** Canonical Multicall3 — same address on every chain including Base. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const BASE_RPC = "https://mainnet.base.org";
const BLOCKSCOUT = "https://base.blockscout.com";

/**
 * Same UA convention `lib/robinhood/blockscout.ts` documents: Blockscout sits
 * behind Cloudflare, which 403s Node's default `undici/x.y` with a challenge
 * page. Not a browser impersonation — nothing here claims to be Chrome, and no
 * challenge is solved or evaded.
 */
const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";

/**
 * Transfer pages to walk, 50 transfers each.
 *
 * This endpoint pages by TRANSFER, not by token, so a wallet with thousands of
 * USDC transfers can spend every page on one contract. That is the reason the
 * balance index is queried too rather than being treated as redundant: when it
 * answers, it is ordered by value and yields the whole list in one request. When
 * this cap is the binding constraint, `truncated` says so.
 */
const MAX_TRANSFER_PAGES = 4;

/**
 * Candidate ceiling. Bounds both the calldata we hand the public RPC and the
 * latency of the whole read. Airdrop-magnet addresses sit in the hundreds — on
 * RH, one measured at 450+ — and the tail there is pennies or unpriced.
 */
const MAX_CANDIDATES = 400;

/**
 * Reads per `eth_call`. One Multicall3 `aggregate3` carries all of them; the
 * point of the module is that this number is NOT 1.
 */
const CHUNK = 120;

/**
 * Wall-clock budget for the ENUMERATION phase, shared by both explorer sources.
 *
 * Transfer pages are cursor-based, so page N+1 cannot be requested until page N
 * has answered — that sequential walk is the latency floor of the whole read.
 * MEASURED 2026-09-12 on 0x…0001 (a dust magnet): the full 4-page walk was ~11s
 * of a 14s total, while the balance index beside it had already answered.
 *
 * Out of budget the walk stops with what it has and reports `truncated`. A short
 * list the UI admits to beats a complete one that arrives after the user has
 * given up — and the balances that DO get read are still read on-chain, so a
 * truncated candidate set costs rows, never accuracy.
 */
const ENUM_BUDGET_MS = 6_000;

/** One shared ABI so the multicall `contracts` array stays homogeneous —
 *  mixing two `as const` ABIs breaks viem's tuple inference (same workaround
 *  and same reason as ./balance.ts). */
const READ_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getEthBalance", stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export interface DiscoveredHolding {
  symbol:    string;
  name?:     string;
  address:   `0x${string}`;   // native ETH uses the ERC-20 sentinel
  amount:    string;          // human-readable, trailing zeros trimmed
  raw:       string;          // raw integer balance
  decimals:  number;
  isNative?: boolean;
  logo?:     string;
}

export interface BaseDiscovery {
  /** "ok" — the chain answered for at least one candidate. "unavailable" — it
   *  answered for NONE, so an empty `holdings` is ignorance, not an empty
   *  wallet, and the caller must not render it as a zero portfolio. */
  status: "ok" | "unavailable";
  holdings: DiscoveredHolding[];
  /** Candidates whose `balanceOf` did not come back. Their rows are absent, so
   *  any total built from `holdings` is a LOWER BOUND while this is > 0. */
  unread: number;
  /** Native ETH specifically did not read. At most one row short — never treat
   *  as "holds no ETH". */
  nativeUnread: boolean;
  /** Enumeration hit a cap, so the CANDIDATE list itself was short. Rows here
   *  are real; the list is not provably complete. */
  truncated: boolean;
  /** Distinct contracts considered. Diagnostic — lets a caller tell "we looked
   *  at 200 and you hold 3" apart from "we looked at 3". */
  candidates: number;
  /** Which enumeration sources actually answered. Empty means every explorer
   *  read failed and only `BASE_MAJORS` seeded the candidate set. */
  sources: string[];
  /** Set only when the INPUT was rejected — a malformed address. Distinct from
   *  `status: "unavailable"`, which blames the network. */
  error?: string;
}

type Candidate = { address: `0x${string}`; symbol?: string; name?: string; decimals?: number; logo?: string };

/** "1.2300" → "1.23", "5.0" → "5". */
function trimAmount(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Blockscout serves `decimals` as a STRING and sometimes as null. Parsed
 * strictly: anything that isn't a plain small integer returns undefined so the
 * on-chain `decimals()` read covers it. Defaulting to 18 would be the cheap
 * option and the wrong one — 18 on a 6-decimal token overstates the balance by
 * a factor of a trillion, which is precisely the fabrication this file is here
 * to avoid.
 */
function parseDecimals(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 36) return v;
  if (typeof v !== "string" || !/^\d{1,2}$/.test(v.trim())) return undefined;
  const n = Number(v.trim());
  return n >= 0 && n <= 36 ? n : undefined;
}

type BsToken = {
  address_hash?: string; address?: string;
  symbol?: string | null; name?: string | null;
  decimals?: string | null; icon_url?: string | null;
};

/**
 * `address_hash` is the v2 field name. An earlier pass read `token.address`,
 * found zero contracts on every wallet, and looked exactly like "this wallet
 * holds nothing" — noted here because the two spellings are one character apart
 * and the failure is silent.
 */
function toCandidate(t: BsToken | undefined): Candidate | null {
  const raw = t?.address_hash ?? t?.address;
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw)) return null;
  return {
    address: raw.toLowerCase() as `0x${string}`,
    symbol: t?.symbol ?? undefined,
    name: t?.name ?? undefined,
    decimals: parseDecimals(t?.decimals),
    logo: t?.icon_url ?? undefined,
  };
}

/** Balance index — cheap and complete WHEN it answers; silently empty when the
 *  index has a gap, which is why it is one source and not the source. */
async function fromBalanceIndex(addr: string): Promise<Candidate[] | null> {
  const j = await getJson<Array<{ token?: BsToken }>>(
    `${BLOCKSCOUT}/api/v2/addresses/${addr}/token-balances`,
  );
  if (!Array.isArray(j)) return null;
  return j.map((r) => toCandidate(r?.token)).filter((c): c is Candidate => c !== null);
}

/**
 * Transfer history — correct on the wallets the balance index misses. Pages are
 * cursor-based and therefore SEQUENTIAL, which makes this the latency floor of
 * the whole module, so it is bound by a wall-clock budget as well as a page cap.
 *
 * MEASURED 2026-09-12 on 0x…0001, a dust magnet: walking the full 4 pages took
 * ~11s of a 14s read. The budget stops the walk with what it has and reports
 * `truncated` — a short list the UI admits to beats a complete one that arrives
 * after the user has given up.
 */
async function fromTransfers(
  addr: string, deadline: number,
): Promise<{ list: Candidate[]; truncated: boolean } | null> {
  const out = new Map<string, Candidate>();
  let query = "?type=ERC-20";
  let answered = false;
  let truncated = false;

  for (let page = 0; page < MAX_TRANSFER_PAGES; page++) {
    const left = deadline - Date.now();
    // Out of budget mid-walk. Whatever we already collected is real; the list
    // is short, and `truncated` is how that gets said out loud.
    if (left <= 500) { truncated = answered; break; }

    const j = await getJson<{
      items?: Array<{ token?: BsToken }>;
      next_page_params?: Record<string, string | number> | null;
    }>(`${BLOCKSCOUT}/api/v2/addresses/${addr}/token-transfers${query}`, Math.min(8000, left));
    if (!j) break;
    answered = true;

    for (const it of j.items ?? []) {
      const c = toCandidate(it?.token);
      if (c && !out.has(c.address)) out.set(c.address, c);
    }

    const np = j.next_page_params;
    if (!np || Object.keys(np).length === 0) { truncated = false; break; }
    // More history exists. If this was the last allowed page, the list is short.
    if (page === MAX_TRANSFER_PAGES - 1) { truncated = true; break; }
    query = `?type=ERC-20&${new URLSearchParams(
      Object.fromEntries(Object.entries(np).map(([k, v]) => [k, String(v)])),
    )}`;
  }

  if (!answered) return null;
  return { list: [...out.values()], truncated };
}

export async function discoverBaseTokens(address: string): Promise<BaseDiscovery> {
  // Validate FIRST, before any I/O — and validate STRICTLY.
  //
  // Not defensive boilerplate; both halves were live bugs the probe caught.
  //
  // Without any check: viem rejects a mis-checksummed address inside
  // `encodeAbiParameters`, so an address one character wrong threw out of the
  // multicall, the catch counted every candidate as `unread`, and this reported
  // `status:"unavailable"` — "the chain would not answer us" — for what was
  // really "you gave us a bad address". Nine wasted requests, blame misplaced.
  //
  // With a LOOSE check it was worse. `isAddress(a, {strict:false})` waves
  // through any 40 hex characters, and `getAddress` then re-derives the
  // checksum from the lowercased input — so a mistyped address is silently
  // normalised into a DIFFERENT, valid address and its balances are rendered
  // under the one the user typed. EIP-55 mixed case exists precisely to catch
  // that transcription error; re-checksumming discards the evidence. MEASURED:
  // `0xcAdacC42…6DE1` (a typo) was accepted and read as `0xCaDaCc42…6dE1`.
  //
  // Strict is also what the sibling readers already do — `checkBalance` and
  // `checkWallet` both call bare `isAddress`, whose `strict` defaults to true.
  // An all-lowercase address carries no case information and is still accepted;
  // only a mixed-case address whose pattern disagrees with its own checksum is
  // rejected, and that one is a typo or a corruption every time.
  if (!isAddress(address)) {
    return {
      status: "unavailable", holdings: [], unread: 0, nativeUnread: true,
      truncated: false, candidates: 0, sources: [], error: "Invalid wallet address.",
    };
  }
  const wallet = getAddress(address);

  // Both explorer reads at once — they are independent, and one coming back
  // empty is the normal case rather than an error. The budget is shared: it
  // bounds the enumeration phase as a whole, not each request.
  const deadline = Date.now() + ENUM_BUDGET_MS;
  const [indexed, transferred] = await Promise.all([
    fromBalanceIndex(wallet).catch(() => null),
    fromTransfers(wallet, deadline).catch(() => null),
  ]);

  const sources: string[] = [];
  if (indexed) sources.push("blockscout:balances");
  if (transferred) sources.push("blockscout:transfers");

  // Union, majors-first so the curated metadata (correct decimals, canonical
  // symbol) wins over whatever an explorer chose to call the same contract.
  const byAddr = new Map<string, Candidate>();
  for (const m of BASE_MAJORS) {
    if (m.native) continue;
    byAddr.set(m.addr.toLowerCase(), { address: m.addr.toLowerCase() as `0x${string}`, symbol: m.sym, decimals: m.decimals });
  }
  for (const c of [...(indexed ?? []), ...(transferred?.list ?? [])]) {
    if (c.address === NATIVE_SENTINEL.toLowerCase()) continue;   // native is read separately
    const prev = byAddr.get(c.address);
    if (!prev) byAddr.set(c.address, c);
    else byAddr.set(c.address, { ...c, ...prev, decimals: prev.decimals ?? c.decimals, logo: prev.logo ?? c.logo });
  }

  const all = [...byAddr.values()];
  const overCap = all.length > MAX_CANDIDATES;
  const candidates = overCap ? all.slice(0, MAX_CANDIDATES) : all;
  const truncated = (transferred?.truncated ?? false) || overCap;

  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  type MCResult = { status: "success"; result: bigint | number } | { status: "failure"; error: unknown };

  // ── One flat read plan, then chunk it ────────────────────────────────────────
  // Native, every balance, and every missing-decimals lookup go into ONE array
  // with stable global indices. The first cut of this special-cased the first
  // chunk and rebuilt the decimals map per chunk, which had a real bug: the
  // decimals reads all rode on chunk 1, but the map was scoped inside the loop,
  // so a token in chunk 2 could never see the decimals that had just been read
  // for it and was miscounted as `unread`. A flat plan makes that class of
  // off-by-chunk mistake unrepresentable.
  const needDecimals = candidates.filter((c) => c.decimals === undefined);
  const plan = [
    { address: MULTICALL3, abi: READ_ABI, functionName: "getEthBalance", args: [wallet] },
    ...candidates.map((c) => ({ address: c.address, abi: READ_ABI, functionName: "balanceOf", args: [wallet] })),
    ...needDecimals.map((c) => ({ address: c.address, abi: READ_ABI, functionName: "decimals", args: [] })),
  ];
  const NATIVE_AT = 0;
  const BAL_AT = 1;
  const DEC_AT = 1 + candidates.length;

  // Chunks run CONCURRENTLY. The rate limit that started all this bit at 18
  // sequential `eth_call`s; this is at most ceil(400/120) + 1 = 4 calls total,
  // an order of magnitude under it, and it turns the read into one round-trip.
  const chunks: Array<{ start: number; items: typeof plan }> = [];
  for (let s = 0; s < plan.length; s += CHUNK) chunks.push({ start: s, items: plan.slice(s, s + CHUNK) });

  const results: Array<MCResult | undefined> = new Array(plan.length).fill(undefined);
  await Promise.all(
    chunks.map(async ({ start, items }) => {
      try {
        const out = (await client.multicall({
          allowFailure: true,
          multicallAddress: MULTICALL3,
          // Disable viem's own calldata-size splitting so a chunk is exactly ONE
          // eth_call. Letting it re-split would quietly reintroduce the N-calls
          // shape this module exists to avoid.
          batchSize: 0,
          contracts: items as never,
        })) as unknown as MCResult[];
        out.forEach((r, k) => { results[start + k] = r; });
      } catch {
        // The whole call failed. Its slots stay `undefined`, which reads as
        // UNREAD below — never as a zero balance.
      }
    }),
  );

  const ok = (r: MCResult | undefined): r is { status: "success"; result: bigint | number } =>
    r?.status === "success";

  const holdings: DiscoveredHolding[] = [];
  let unread = 0;
  let anyAnswered = false;

  // Decimals we had to learn on-chain, resolved once for all chunks.
  const resolvedDecimals = new Map<string, number>();
  needDecimals.forEach((c, k) => {
    const r = results[DEC_AT + k];
    if (!ok(r)) return;
    const d = Number(r.result);
    if (Number.isInteger(d) && d >= 0 && d <= 36) resolvedDecimals.set(c.address, d);
  });

  // ── Native ETH ──────────────────────────────────────────────────────────────
  const nativeRes = results[NATIVE_AT];
  const nativeUnread = !ok(nativeRes);
  if (ok(nativeRes)) {
    anyAnswered = true;
    const raw = BigInt(nativeRes.result as bigint);
    // ETH is emitted even at zero: it is the gas asset, and an absent ETH row
    // reads as "not checked" on a card that warns when gas is low.
    holdings.push({
      symbol: "ETH", address: NATIVE_SENTINEL as `0x${string}`, decimals: 18,
      amount: trimAmount(formatUnits(raw, 18)), raw: raw.toString(), isNative: true,
    });
  } else {
    unread++;
  }

  // ── ERC-20 balances ─────────────────────────────────────────────────────────
  candidates.forEach((c, k) => {
    const r = results[BAL_AT + k];
    if (!ok(r)) { unread++; return; }
    anyAnswered = true;

    const raw = BigInt(r.result as bigint);
    if (raw === 0n) return;                       // read fine, genuinely not held

    const decimals = c.decimals ?? resolvedDecimals.get(c.address);
    if (decimals === undefined) {
      // A non-zero amount of something whose scale we never learned. Printing it
      // would be off by up to 10^18; dropping it quietly would hide a real
      // position. Counted as unread so the caller's total becomes a floor.
      unread++;
      return;
    }

    holdings.push({
      symbol: c.symbol || "?",
      name: c.name,
      address: c.address,
      decimals,
      amount: trimAmount(formatUnits(raw, decimals)),
      raw: raw.toString(),
      logo: c.logo,
    });
  });

  return {
    status: anyAnswered ? "ok" : "unavailable",
    holdings,
    unread,
    nativeUnread,
    truncated,
    // Includes the native read, so `holdings.length + unread <= candidates`
    // always holds. Counting only contracts let `held` exceed `candidates` on a
    // wallet where everything was held — a number larger than its own
    // denominator is the kind of thing a later reader treats as a bug in the
    // data rather than in the label.
    candidates: candidates.length + 1,
    sources,
  };
}
