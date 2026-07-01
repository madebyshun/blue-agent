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
 *   - Product:   AGENT_TOOLS catalog length + the 5 core commands (static).
 */

import { getLaunches } from "./launches";
import { getTotalStaked, STAKING_ADDRESS_VERIFIED, formatBlue } from "./staking";
import { AGENT_TOOLS } from "./agent-tools";

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
}

const CORE_COMMANDS = 5; // idea · build · audit · ship · raise
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // UTC YYYY-MM-DD

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
  };
}
