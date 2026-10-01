/**
 * "What launched today on X?" — counts read from the launchpads' own events,
 * graduations listed by token, and the new pools worth a look (2026-10-01).
 *
 * WHY THREE PARTS. Launch volume is spam-scale (RH: ~6.9k Pons and ~5.2k Flap
 * launches a day), so a list of launches is noise and a pick from it would be
 * advice. What the feed shows instead:
 *   1. COUNTS in the last hour, per launchpad, from eth_getLogs on the
 *      launch event — complete and keyless (one call each fits the RPC caps:
 *      Base 2,000 blocks, RH 100,000 blocks / 10,000 logs).
 *   2. GRADUATIONS (Pons, Virtuals) — a token that filled its curve is the
 *      rare, meaningful event; listed by contract with its on-chain symbol.
 *   3. NEW POOLS above a liquidity floor, from GeckoTerminal's keyless
 *      new_pools, labelled with the launchpad only where GeckoTerminal's own
 *      dex id names one (a "bankr" filing only after the on-chain integrator
 *      check). Asked about ONE launchpad GeckoTerminal cannot attribute pools
 *      to (Doppler, Flap, Clanker on Base), the feed says so instead of
 *      reporting "no pool". Facts only — never a buy signal.
 * A part that could not be read says so; it is never shown as zero.
 */
import { parseAbi, type Address, type Hex } from "viem";
import { hasBankrIntegrator, launchClient } from "./resolve";
import { gtJson } from "./gt";
import {
  CLANKER_FACTORY, DOPPLER_AIRLOCK, FLAP_RH, LAUNCHPAD_INFO, PONS_V2_FACTORY, TOPICS,
  VIRTUALS_BONDING, type LaunchChain, type LaunchpadId,
} from "./registry";

/** Seconds per block, measured 2026-10-01 (Base 2s; RH ~0.1s). */
const BLOCK_TIME_S: Record<LaunchChain, number> = { base: 2, robinhood: 0.1 };
/** Liquidity floor for the "new pools" part, USD. */
export const NEW_POOL_MIN_RESERVE_USD = 10_000;
/** A pool with less 24h volume than this is not "trending" — the 2026-10-01
 *  test share listed four Virtuals pools at $0–$3 under that word. */
export const TRENDING_MIN_VOLUME_USD = 1_000;

type CountSpec = { id: LaunchpadId; address: Address; topic: Hex };
const COUNT_SPECS: Record<LaunchChain, CountSpec[]> = {
  robinhood: [
    { id: "pons", address: PONS_V2_FACTORY, topic: TOPICS.ponsLaunched },
    { id: "flap", address: FLAP_RH, topic: TOPICS.flapCreated },
    { id: "doppler", address: DOPPLER_AIRLOCK.robinhood, topic: TOPICS.dopplerCreate },
    { id: "virtuals", address: VIRTUALS_BONDING.robinhood, topic: TOPICS.virtualsLaunched },
    { id: "clanker", address: CLANKER_FACTORY.robinhood, topic: TOPICS.clankerTokenCreated },
  ],
  base: [
    { id: "doppler", address: DOPPLER_AIRLOCK.base, topic: TOPICS.dopplerCreate },
    { id: "clanker", address: CLANKER_FACTORY.base, topic: TOPICS.clankerTokenCreated },
    { id: "virtuals", address: VIRTUALS_BONDING.base, topic: TOPICS.virtualsLaunched },
  ],
};

/**
 * GeckoTerminal dex ids that name a launchpad (listed 2026-10-01), with the
 * launchpad they attribute a pool to and the chain the dex id lives on. A
 * launchpad with NO dex id on a chain (Doppler-generic, Flap, Zora, Clanker on
 * Base) cannot have its new pools picked out of GeckoTerminal's list at all.
 */
const GT_DEX_LAUNCHPAD: Record<string, { label: string; id: LaunchpadId | null; chain: LaunchChain | null }> = {
  "pons-v2":               { label: "Pons (on curve)", id: "pons", chain: "robinhood" },
  "pons-v2-dex":           { label: "Pons (graduated)", id: "pons", chain: "robinhood" },
  "pons-dot-family":       { label: "Pons V1", id: "pons", chain: "robinhood" },
  // GeckoTerminal's own "bankr" filing — every such row is checked on-chain
  // (Doppler integrator = Bankr's fee address) before it is shown as one.
  "bankr":                 { label: "Bankr", id: "bankr", chain: "base" },
  "bankr-robinhood":       { label: "Bankr", id: "bankr", chain: "robinhood" },
  "virtuals-base":         { label: "Virtuals", id: "virtuals", chain: "base" },
  "virtuals-unicorn-base": { label: "Virtuals", id: "virtuals", chain: "base" },
  "virtuals-robinhood":    { label: "Virtuals", id: "virtuals", chain: "robinhood" },
  "clanker-robinhood":     { label: "Clanker", id: "clanker", chain: "robinhood" },
  "uniswap-pools-trade":   { label: "Uniswap Liquidity Launcher", id: null, chain: null },
};

/** Can GeckoTerminal's new-pools list attribute a pool to this launchpad on this chain? */
export function gtAttributes(only: LaunchpadId, chain: LaunchChain): boolean {
  return Object.values(GT_DEX_LAUNCHPAD).some((d) => d.id === only && d.chain === chain);
}

/** On-chain Bankr checks run this many at a time (public RPCs refuse bursts). */
const BANKR_CHECK_CONCURRENCY = 4;
/** …and at most this many rows are checked per list. */
const BANKR_CHECK_MAX_ROWS = 16;
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export interface LaunchFeed {
  chain: LaunchChain;
  windowMinutes: number;
  counts: Array<{ id: LaunchpadId; name: string; launches: number | null }>;
  /**
   * `windowHours` is MEASURED from the start block's own timestamp (null when
   * that read failed — then the window is only the ~24h block-time estimate).
   */
  graduations: { windowHours: number | null; items: Array<{ launchpad: string; token: Address; symbol: string | null }>; unread: string[] };
  newPools: {
    minReserveUsd: number;
    /** Set when one launchpad was asked for and GeckoTerminal cannot attribute pools to it on this chain — its name. */
    unattributableTo: string | null;
    items: Array<{ name: string; launchpad: string | null; reserveUsd: number; volume24hUsd: number | null; ageMinutes: number | null; token: string | null; unconfirmed?: boolean }> | null;
  };
  /** Only when one launchpad was asked for: its pools by 24h volume. */
  trending: { available: boolean; items: Array<{ name: string; reserveUsd: number; volume24hUsd: number | null; change24hPct: number | null; token: string | null; unconfirmed?: boolean }> | null };
}

/**
 * Keep up to `max` rows, in order, after checking every row `isBankrRow`
 * marks: a "no" (not a Doppler launch with Bankr's integrator) is dropped, an
 * unread check is kept and flagged `unconfirmed`. Checks run in parallel
 * batches of BANKR_CHECK_CONCURRENCY, stopping once `max` rows are kept.
 */
export async function keepCheckedBankr<T extends { token: string | null; unconfirmed?: boolean }>(
  chain: LaunchChain, rows: T[], max: number, isBankrRow: (r: T) => boolean,
  check: (chain: LaunchChain, token: Address) => Promise<boolean | null> = hasBankrIntegrator,
): Promise<T[]> {
  const out: T[] = [];
  const candidates = rows.slice(0, BANKR_CHECK_MAX_ROWS);
  for (let i = 0; i < candidates.length && out.length < max; i += BANKR_CHECK_CONCURRENCY) {
    const batch = candidates.slice(i, i + BANKR_CHECK_CONCURRENCY);
    const verdicts = await Promise.all(batch.map((r) =>
      !isBankrRow(r) ? Promise.resolve(true as boolean | null)
        : r.token && ADDR.test(r.token) ? check(chain, r.token as Address) : Promise.resolve(null)));
    batch.forEach((r, j) => {
      if (out.length >= max || verdicts[j] === false) return;
      out.push(isBankrRow(r) ? { ...r, unconfirmed: verdicts[j] === null } : r);
    });
  }
  return out;
}

const erc20 = parseAbi(["function symbol() view returns (string)"]);

/**
 * Raw `eth_getLogs` filtered by topic0. NOT viem's `getLogs`: it takes an
 * `event` ABI and silently ignores a raw `topics` field, so the first draft of
 * this feed counted every log from each contract — Flap's trades read as
 * "2,942 launches an hour" and a Virtuals curve token read as graduated.
 */
async function rawLogs(chain: LaunchChain, address: Address, topic: Hex, from: bigint, to: bigint): Promise<Array<{ topics: Hex[] }>> {
  const hex = (n: bigint) => `0x${n.toString(16)}` as Hex;
  return (await launchClient(chain).request({
    method: "eth_getLogs",
    params: [{ address, fromBlock: hex(from), toBlock: hex(to), topics: [topic] }],
  } as never)) as Array<{ topics: Hex[] }>;
}

async function countLogs(chain: LaunchChain, spec: CountSpec, from: bigint, to: bigint): Promise<number | null> {
  try { return (await rawLogs(chain, spec.address, spec.topic, from, to)).length; }
  catch { return null; }
}

async function topicLogs(chain: LaunchChain, address: Address, topic: Hex, from: bigint, to: bigint, step: bigint) {
  const ranges: Array<[bigint, bigint]> = [];
  for (let a = from; a <= to; a += step) ranges.push([a, a + step - 1n > to ? to : a + step - 1n]);
  const parts = await Promise.all(ranges.map(([a, b]) => rawLogs(chain, address, topic, a, b)));
  return parts.flat();
}

async function symbolOf(chain: LaunchChain, token: Address): Promise<string | null> {
  try { return await launchClient(chain).readContract({ address: token, abi: erc20, functionName: "symbol" }); }
  catch { return null; }
}

type GtPools = { data?: Array<{ attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } }> }> };

/**
 * GeckoTerminal dex ids that ARE a launchpad's own pools, per chain (listed
 * 2026-10-01). Only these can answer "what's trending on <launchpad>" — Flap,
 * Zora, Doppler-generic and Clanker-on-Base pools are filed under plain
 * uniswap-v4 there, so for them trending is said to be unavailable.
 */
const LAUNCHPAD_GT_DEXES: Partial<Record<LaunchpadId, Partial<Record<LaunchChain, string[]>>>> = {
  pons:     { robinhood: ["pons-v2-dex", "pons-v2"] },
  bankr:    { base: ["bankr"], robinhood: ["bankr-robinhood"] },
  virtuals: { base: ["virtuals-base"], robinhood: ["virtuals-robinhood"] },
  clanker:  { robinhood: ["clanker-robinhood"] },
};

async function trendingFor(chain: LaunchChain, only: LaunchpadId): Promise<LaunchFeed["trending"]> {
  const dexes = LAUNCHPAD_GT_DEXES[only]?.[chain];
  if (!dexes) return { available: false, items: null };
  const rows: NonNullable<LaunchFeed["trending"]["items"]> = [];
  let readAny = false;
  for (const dex of dexes) {
    const { body } = await gtJson<GtPools>(`/networks/${chain}/dexes/${dex}/pools?sort=h24_volume_usd_desc&page=1`);
    if (!body) continue;
    readAny = true;
    for (const p of body.data ?? []) {
      const a = p.attributes ?? {};
      const reserve = Number(a.reserve_in_usd);
      const vol = Number((a.volume_usd as Record<string, unknown> | undefined)?.h24);
      const ch = Number((a.price_change_percentage as Record<string, unknown> | undefined)?.h24);
      const baseTok = String(p.relationships?.base_token?.data?.id ?? "");
      if (!Number.isFinite(reserve) || reserve < NEW_POOL_MIN_RESERVE_USD) continue;
      if (!Number.isFinite(vol) || vol < TRENDING_MIN_VOLUME_USD) continue;
      rows.push({
        name: String(a.name ?? "?"), reserveUsd: reserve,
        volume24hUsd: Number.isFinite(vol) ? vol : null,
        change24hPct: Number.isFinite(ch) ? ch : null,
        token: baseTok.includes("_") ? baseTok.split("_").pop() ?? null : null,
      });
    }
  }
  if (!readAny) return { available: true, items: null };
  const top = rows.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
  if (only !== "bankr") return { available: true, items: top.slice(0, 5) };
  // GeckoTerminal's `bankr` listing also files pools with no Bankr-integrator
  // Doppler record (e.g. STONX/wtSPYM on the 2026-10-01 share). Each row is
  // checked on-chain, in parallel batches: a "no" is dropped, an unread check
  // is kept and labelled.
  return { available: true, items: await keepCheckedBankr(chain, top, 5, () => true) };
}

async function newPools(chain: LaunchChain, only?: LaunchpadId): Promise<LaunchFeed["newPools"]["items"]> {
  try {
    const { body: j } = await gtJson<GtPools>(`/networks/${chain}/new_pools?include=dex`);
    if (!j) return null;
    const now = Date.now();
    type Row = NonNullable<LaunchFeed["newPools"]["items"]>[number] & { launchpadId: LaunchpadId | null };
    const rows = (j.data ?? []).map((p): Row => {
      const a = p.attributes ?? {};
      const dex = GT_DEX_LAUNCHPAD[String(p.relationships?.dex?.data?.id ?? "")];
      const reserve = Number(a.reserve_in_usd);
      const vol = Number((a.volume_usd as Record<string, unknown> | undefined)?.h24);
      const created = Date.parse(String(a.pool_created_at ?? ""));
      const baseTok = String(p.relationships?.base_token?.data?.id ?? "");
      return {
        name: String(a.name ?? "?"),
        launchpadId: dex?.id ?? null,
        launchpad: dex?.label ?? null,
        reserveUsd: Number.isFinite(reserve) ? reserve : 0,
        volume24hUsd: Number.isFinite(vol) ? vol : null,
        ageMinutes: Number.isFinite(created) ? Math.round((now - created) / 60_000) : null,
        token: baseTok.includes("_") ? baseTok.split("_").pop() ?? null : null,
      };
    })
      .filter((p) => p.reserveUsd >= NEW_POOL_MIN_RESERVE_USD)
      // By GeckoTerminal's dex id — the old label-prefix match never matched
      // Doppler or Flap and then reported "no pool" for them (a false negative).
      .filter((p) => !only || p.launchpadId === only)
      .sort((a, b) => b.reserveUsd - a.reserveUsd);
    // A pool GeckoTerminal files under its "bankr" dex is shown as Bankr only
    // after the on-chain check (same rule as trending): dropped on a "no",
    // flagged when the check could not be read.
    const kept = await keepCheckedBankr(chain, rows, 5, (r) => r.launchpadId === "bankr");
    return kept.map(({ launchpadId, ...r }) => ({
      ...r,
      launchpad: launchpadId === "bankr" && !r.unconfirmed ? LAUNCHPAD_INFO.bankr.name : r.launchpad,
    }));
  } catch { return null; }
}

export async function launchFeed(chain: LaunchChain, only?: LaunchpadId): Promise<LaunchFeed> {
  const c = launchClient(chain);
  const head = await c.getBlockNumber();
  const hourBlocks = BigInt(Math.round(3600 / BLOCK_TIME_S[chain]));
  // The block time is an estimate; the window REPORTED is measured from the
  // two blocks' own timestamps, so "N launches in the last M minutes" is true.
  let windowMinutes = 60;
  let headTs: bigint | null = null;
  // Blocks per second MEASURED over the hour window — used to size the 24h
  // graduation scan, whose reported window is then measured again below.
  let blocksPerSec: number | null = null;
  try {
    const [a, b] = await Promise.all([c.getBlock({ blockNumber: head - hourBlocks }), c.getBlock({ blockNumber: head })]);
    windowMinutes = Math.max(1, Math.round(Number(b.timestamp - a.timestamp) / 60));
    headTs = b.timestamp;
    const secs = Number(b.timestamp - a.timestamp);
    if (secs > 0) blocksPerSec = Number(hourBlocks) / secs;
  } catch { /* keep the estimate */ }
  // Bankr is a Doppler front-end: its launches are counted inside Doppler's.
  const specs = COUNT_SPECS[chain].filter((s) => !only || s.id === only || (only === "bankr" && s.id === "doppler"));

  const counts = await Promise.all(specs.map(async (s) => ({
    id: s.id, name: LAUNCHPAD_INFO[s.id].name,
    launches: await countLogs(chain, s, head - hourBlocks, head),
  })));

  // Graduations, last 24h. RH only: Pons graduates ~77/day; Virtuals on Base
  // graduated 0 times in the 7 days measured, and a 24h Base scan would take
  // 22 calls against the public RPC's 2,000-block cap.
  const gradItems: LaunchFeed["graduations"]["items"] = [];
  const unread: string[] = [];
  let gradWindowHours: number | null = null;
  if (chain === "robinhood") {
    // Sized from the MEASURED block rate when there is one, and the window
    // REPORTED is read from the start block's own timestamp — "the last 24h"
    // from an assumed 0.1s block time could have been 10h or 60h.
    const dayBlocks = BigInt(Math.round(24 * 3600 * (blocksPerSec ?? 1 / BLOCK_TIME_S.robinhood)));
    try {
      const start = await c.getBlock({ blockNumber: head - dayBlocks });
      const end = headTs ?? (await c.getBlock({ blockNumber: head })).timestamp;
      const secs = Number(end - start.timestamp);
      if (secs > 0) gradWindowHours = Math.round((secs / 3600) * 10) / 10;
    } catch { /* stays null — labelled as an estimate */ }
    const jobs: Array<[LaunchpadId, Address, Hex]> = [
      ["pons", PONS_V2_FACTORY, TOPICS.ponsGraduated],
      ["virtuals", VIRTUALS_BONDING.robinhood, TOPICS.virtualsGraduated],
    ];
    for (const [id, addr, topic] of jobs) {
      if (only && only !== id) continue;
      try {
        const logs = await topicLogs(chain, addr, topic, head - dayBlocks, head, 99_000n);
        for (const l of logs.slice(-5).reverse()) {
          const token = `0x${l.topics[1].slice(26)}` as Address;
          gradItems.push({ launchpad: LAUNCHPAD_INFO[id].name, token, symbol: await symbolOf(chain, token) });
        }
      } catch { unread.push(LAUNCHPAD_INFO[id].name); }
    }
  }

  const trending = only ? await trendingFor(chain, only) : { available: false, items: null };
  // With one launchpad asked for, new pools are shown only when trending is
  // not — and only when GeckoTerminal can attribute a pool to that launchpad
  // at all. Otherwise saying "no pool" would be a false negative.
  const unattributable = !!only && !gtAttributes(only, chain);
  const showNewPools = !trending.available;
  return {
    chain, windowMinutes, counts,
    graduations: { windowHours: gradWindowHours, items: gradItems, unread },
    newPools: {
      minReserveUsd: NEW_POOL_MIN_RESERVE_USD,
      unattributableTo: unattributable ? LAUNCHPAD_INFO[only!].name : null,
      items: showNewPools && !unattributable ? await newPools(chain, only) : showNewPools ? [] : null,
    },
    trending,
  };
}
