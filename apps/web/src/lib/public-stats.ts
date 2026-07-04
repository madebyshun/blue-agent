/**
 * Public traction stats — the ONLY user-facing aggregate surface.
 *
 * Hard privacy rule: this module returns AGGREGATE, on-chain-verifiable numbers
 * only. It must NEVER expose per-user data — no wallet addresses, no ledger
 * balances/spend, no launcher handles/identities. `uniqueCreators` is a COUNT
 * derived from launch records; the underlying identity values are never emitted.
 *
 * Every field is fault-tolerant: a data-source failure degrades to a safe zero /
 * null (rendered as "—"), never a thrown error and never a fabricated number.
 *
 * Sources:
 *   - Launches:  KV `bluechat:launches` (real on-chain deploys via Bankr).
 *   - Staking:   BlueMarketStaking.totalStaked() on Base mainnet (public read).
 *   - Usage:     KV `usage:<toolId>` counters — lifetime paid tool runs (aggregate
 *                sum; no wallet is ever part of the key).
 *   - Users:     KV `claim:count` — # wallets that claimed the free-credit airdrop
 *                (a count only; capped at 300). The closest honest "onboarded" number.
 *   - Product:   AGENT_TOOLS catalog length + the 5 core commands (static).
 *
 * NOTE (no fabrication): there is deliberately NO "total users", "credits spent",
 * or "chat messages" metric here — the codebase keeps no global counter for those
 * (the ledger is strictly per-wallet), so surfacing them would be invented. Only
 * numbers with a real aggregate source are exposed.
 */

import { getLaunches } from "./launches";
import { getTotalStaked, STAKING_ADDRESS_VERIFIED, formatBlue } from "./staking";
import { AGENT_TOOLS } from "./agent-tools";
import { kvGet } from "./kv";

export interface PublicLaunchLite {
  name:       string;
  symbol:     string;
  address:    string;
  txHash:     string | null;
  launchedAt: number;
}

export interface PublicStats {
  updatedAt: number;
  launches: {
    total:          number;
    uniqueCreators: number;
    peakPerDay:     number;
    byDay:          { date: string; count: number }[]; // chronological, launch days only
    recent:         PublicLaunchLite[];                 // newest first, creator stripped
  };
  staking: {
    totalStakedBlue: string;  // human, e.g. "822.3M" — null-source ⟹ "—"
    contract:        string;
    explorerUrl:     string;
    verified:        boolean; // true when the on-chain read succeeded
  };
  product: {
    tools:    number;
    commands: number;
  };
  usage: {
    totalRuns:  number;                          // Σ usage:<id> across the catalog
    revenueEst: string;                          // "$X.XX" — Σ(runs × price)
    topTools:   { name: string; runs: number }[]; // top 5 by runs (names only, aggregate)
  };
  users: {
    claims:   number;  // wallets that claimed the free-credit airdrop (count only)
    claimCap: number;  // airdrop cap (300)
  };
}

const CORE_COMMANDS = 5; // idea · build · audit · ship · raise
const CLAIM_CAP     = 300; // mirrors credits/claim route
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // UTC YYYY-MM-DD

/** Parse a "$0.05" price string to a number; non-numeric ⟹ 0. */
function priceNum(price?: string): number {
  if (!price) return 0;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? 0 : n;
}

export async function buildPublicStats(): Promise<PublicStats> {
  // ── Launches (KV) ──
  let total = 0, uniqueCreators = 0, peakPerDay = 0;
  let byDay: { date: string; count: number }[] = [];
  let recent: PublicLaunchLite[] = [];
  try {
    const launches = await getLaunches();
    total = launches.length;

    // Unique creators: COUNT only — identity values are never surfaced.
    const creators = new Set<string>();
    const perDay = new Map<string, number>();
    for (const l of launches) {
      const id = (l.feeRecipient?.value ?? "").toLowerCase();
      if (id) creators.add(id);
      if (l.launchedAt) {
        const k = dayKey(l.launchedAt);
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
      }
    }
    uniqueCreators = creators.size;
    byDay = [...perDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, count]) => ({ date, count }));
    peakPerDay = byDay.reduce((m, d) => Math.max(m, d.count), 0);

    // Recent feed — strip creator identity + private metadata.
    recent = launches
      .slice()
      .sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0))
      .slice(0, 15)
      .map((l) => ({
        name:       l.tokenName ?? "",
        symbol:     l.tokenSymbol ?? "",
        address:    l.tokenAddress ?? "",
        txHash:     l.txHash ?? null,
        launchedAt: l.launchedAt ?? 0,
      }));
  } catch {
    /* degrade to zeros */
  }

  // ── Staking (on-chain) ──
  let totalStakedBlue = "—";
  let verified = false;
  try {
    const wei = await getTotalStaked();
    if (wei !== null) { totalStakedBlue = formatBlue(wei); verified = true; }
  } catch {
    /* leave "—" */
  }

  // ── Product breadth (static) ──
  const tools = Array.isArray(AGENT_TOOLS) ? AGENT_TOOLS.length : 0;

  // ── Usage (KV usage:<id> counters — aggregate, no wallet in key) ──
  let totalRuns = 0, revenueEstNum = 0;
  let topTools: { name: string; runs: number }[] = [];
  try {
    const rows = await Promise.all(
      AGENT_TOOLS.map(async (tl) => {
        const runs = (await kvGet<number>(`usage:${tl.id}`)) ?? 0;
        return { name: tl.name, runs, rev: runs * priceNum(tl.price) };
      }),
    );
    for (const r of rows) { totalRuns += r.runs; revenueEstNum += r.rev; }
    topTools = rows
      .filter((r) => r.runs > 0)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5)
      .map((r) => ({ name: r.name, runs: r.runs }));
  } catch {
    /* degrade to zeros */
  }

  // ── Users onboarded (airdrop claim count — a count, never an address) ──
  let claims = 0;
  try { claims = (await kvGet<number>("claim:count")) ?? 0; } catch { /* leave 0 */ }

  return {
    updatedAt: Date.now(),
    launches: { total, uniqueCreators, peakPerDay, byDay, recent },
    staking: {
      totalStakedBlue,
      contract:    STAKING_ADDRESS_VERIFIED,
      explorerUrl: `https://basescan.org/address/${STAKING_ADDRESS_VERIFIED}`,
      verified,
    },
    product: { tools, commands: CORE_COMMANDS },
    usage: { totalRuns, revenueEst: `$${revenueEstNum.toFixed(2)}`, topTools },
    users: { claims, claimCap: CLAIM_CAP },
  };
}
