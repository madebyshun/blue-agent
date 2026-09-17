/**
 * Public traction stats — the ONLY user-facing aggregate surface.
 *
 * Hard privacy rule: this module returns AGGREGATE, on-chain-verifiable numbers
 * only. It must NEVER expose per-user data — no wallet addresses, no ledger
 * balances/spend, no launcher handles/identities. `uniqueCreators` is a COUNT
 * derived from launch records; the underlying identity values are never emitted.
 *
 * Every field is fault-tolerant: a data-source failure never throws and never
 * fabricates. #150 sharpened what that means — a zero is NOT a safe default on
 * this page, because every number here is a public traction claim and a zero
 * reads as a measurement ("nobody launched", "nobody signed up", "no runs").
 * So each block carries an `ok` flag (`launches.ok`, `usage.ok`,
 * `users.claimsOk`, `settlement.ok`); false ⟹ the value is a placeholder the
 * view must render as "—" or as a "≥" lower bound, never as a total.
 *
 * Sources:
 *   - Launches:  KV `bluechat:launches` (real on-chain deploys — see lib/launches.ts
 *                for who writes it; the Bankr-era writer was deleted 2026-09-06,
 *                the ROWS it wrote are deliberately kept).
 *   - Usage:     KV `usage:<toolId>` counters — lifetime paid tool runs (aggregate
 *                sum; no wallet is ever part of the key).
 *   - Users:     KV `claim:count` — # wallets that claimed the free-credit airdrop
 *                (a count only; capped at 300). The closest honest "onboarded" number.
 *   - Activity:  Derived live from every `ledger:<addr>` row via getLedgerActivity()
 *                — distinct wallets that spent, Σ credits debited, and chat-message
 *                spend events. COUNTS/SUMS only; no address is ever emitted.
 *   - Product:   AGENT_TOOLS catalog length + the 5 core commands (static).
 *
 * NOTE (no fabrication): the active-users / credits-spent / chat-messages numbers
 * are computed by scanning the existing per-wallet ledgers and summing their
 * recorded spend history — real all-time activity, not a fabricated or forward-only
 * counter. Per-row history is capped at 50 events, so the credit/message sums are
 * exact at current scale and a conservative floor thereafter. Every value degrades
 * to 0 on a source failure; none is ever invented.
 *
 * REMOVED: a `staking` block that read BlueMarketStaking.totalStaked() on Base and
 * published it as a headline metric. The contract is untouched and still live, but
 * the app no longer sells a stake, so quoting its TVL as traction advertised a
 * retired product. The field is gone from the response, not zeroed — an absent
 * number is honest, a zero would be a false measurement.
 */

import { getLaunchesProbe } from "./launches";
import { AGENT_TOOLS } from "./agent-tools";
import { kvGet, kvGetCounter } from "./kv";
import { getLedgerActivity } from "./credit-ledger";
import { getX402Settlements } from "./x402-settlements";

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
    /** #150 — false ⟹ the `bluechat:launches` registry could not be READ. Every
     *  number in this block is then 0 as a placeholder and must render as "—".
     *  A 0 here would state "no token has ever been launched through Blue Agent",
     *  which is the single strongest claim on the page and the one we are least
     *  entitled to make from a throttled read. Same convention as `usage.ok`,
     *  `users.claimsOk` and `settlement.ok`. */
    ok:             boolean;
  };
  product: {
    tools:    number;
    commands: number;
  };
  usage: {
    totalRuns:  number;                          // Σ usage:<id> across the catalog
    revenueEst: string;                          // "$X.XX" — Σ(runs × price)
    topTools:   { name: string; runs: number }[]; // top 5 by runs (names only, aggregate)
    /** #150 — false ⟹ at least one `usage:<id>` counter could not be READ and was
     *  left out of the sums above, making them a LOWER BOUND rather than a
     *  measurement. Same convention as `settlement.ok`: an unreadable source is
     *  declared, never folded into the number as a zero. */
    ok:         boolean;
    unreadable: number;                          // how many counters were dropped
  };
  users: {
    claims:   number;  // wallets that claimed the free-credit airdrop (count only)
    claimCap: number;  // airdrop cap (300)
    total:    number;  // distinct wallets that ever spent credits (count only)
    /** #150 — false ⟹ `claim:count` was unreadable; `claims` above is 0 as a
     *  placeholder and must render as "—", not as "nobody signed up". */
    claimsOk: boolean;
  };
  credits: {
    spent:    number;  // Σ credits debited across all wallets (chat + tool)
    messages: number;  // chat messages debited (reason "chat:*")
  };
  settlement: {        // real USDC settled on Base via the Coinbase CDP facilitator
    usdc:   number;    // human USDC settled (0 on source failure)
    count:  number;    // # of confirmed on-chain settlements
    lastTx: string | null; // latest settlement tx hash (Basescan proof) — null if none
    ok:     boolean;   // false ⟹ meter unavailable → render "—", never a fake number
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
  //
  // #150. `total` is the headline "Tokens Launched" number. Reading an outage as
  // an empty registry publishes "0 tokens have ever been launched" — a claim
  // about the whole history of the product, made from a read that failed. The
  // probe keeps "empty" and "unreadable" apart so the page can render "—".
  let total = 0, uniqueCreators = 0, peakPerDay = 0;
  let byDay: { date: string; count: number }[] = [];
  let recent: PublicLaunchLite[] = [];
  let launchesOk = true;
  try {
    const probe = await getLaunchesProbe();
    launchesOk = probe.ok;
    const launches = probe.launches;
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
    // Thrown rather than probed — same conclusion: we did not read the registry.
    launchesOk = false;
  }
  if (!launchesOk) {
    console.error(`[public-stats] launch registry unreadable — launches.* published as unknown, not as 0`);
  }

  // ── Product breadth (static) ──
  const tools = Array.isArray(AGENT_TOOLS) ? AGENT_TOOLS.length : 0;

  // ── Usage (KV usage:<id> counters — aggregate, no wallet in key) ──
  //
  // #150. `?? 0` put an unreadable counter into a SUM, which is the one place a
  // fabricated zero leaves no trace: a throttled read did not surface as an
  // error or a gap, it surfaced as a smaller traction number on the public
  // page, indistinguishable from a quiet week. An unreadable counter is now
  // dropped from the sum and COUNTED, so the page can say "≥" instead of
  // publishing a floor as if it were the total.
  let totalRuns = 0, revenueEstNum = 0, usageUnreadable = 0;
  let topTools: { name: string; runs: number }[] = [];
  let usageOk = true;
  try {
    const rows = await Promise.all(
      AGENT_TOOLS.map(async (tl) => {
        const runs = await kvGetCounter(`usage:${tl.id}`); // null ⟹ read failed
        return { name: tl.name, runs, rev: runs === null ? 0 : runs * priceNum(tl.price) };
      }),
    );
    for (const r of rows) {
      if (r.runs === null) { usageUnreadable++; continue; }
      totalRuns += r.runs; revenueEstNum += r.rev;
    }
    usageOk = usageUnreadable === 0;
    topTools = rows
      .filter((r): r is typeof r & { runs: number } => r.runs !== null && r.runs > 0)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5)
      .map((r) => ({ name: r.name, runs: r.runs }));
  } catch {
    // Whole batch failed — publish nothing rather than a zeroed traction claim.
    usageOk = false;
    usageUnreadable = AGENT_TOOLS.length;
    totalRuns = 0; revenueEstNum = 0; topTools = [];
  }
  if (!usageOk) {
    console.error(`[public-stats] ${usageUnreadable}/${AGENT_TOOLS.length} usage counters unreadable — totals published as a lower bound`);
  }

  // ── Users onboarded (airdrop claim count — a count, never an address) ──
  // Unreadable ⟹ claimsOk:false so the page renders "—". A 0 here would read as
  // "nobody has ever signed up", which is a much stronger claim than we can make.
  let claims = 0, claimsOk = true;
  try {
    const c = await kvGetCounter("claim:count");
    if (c === null) claimsOk = false; else claims = c;
  } catch { claimsOk = false; }

  // ── Active users + credits spent + chat messages ──
  // Derived live from the existing per-wallet ledgers (aggregate counts/sums only,
  // no address emitted) — real all-time activity, not a forward-only counter.
  let totalUsers = 0, creditsSpent = 0, chatMessages = 0;
  try {
    const act = await getLedgerActivity();
    totalUsers = act.activeUsers; creditsSpent = act.creditsSpent; chatMessages = act.chatMessages;
  } catch { /* degrade to zeros */ }

  // ── Onchain settlement (Coinbase CDP facilitator) ──
  // Aggregate USDC actually settled on Base via CDP /settle. Forward-only meter,
  // count/sum/lastTx only — no wallet is ever stored. Null source ⟹ ok:false → "—".
  let settlement = { usdc: 0, count: 0, lastTx: null as string | null, ok: false };
  try {
    const s = await getX402Settlements();
    if (s) settlement = { usdc: s.usdc, count: s.count, lastTx: s.lastTx, ok: true };
  } catch { /* leave ok:false → renders "—" */ }

  return {
    updatedAt: Date.now(),
    launches: { total, uniqueCreators, peakPerDay, byDay, recent, ok: launchesOk },
    product: { tools, commands: CORE_COMMANDS },
    usage: { totalRuns, revenueEst: `$${revenueEstNum.toFixed(2)}`, topTools, ok: usageOk, unreadable: usageUnreadable },
    users: { claims, claimCap: CLAIM_CAP, total: totalUsers, claimsOk },
    credits: { spent: creditsSpent, messages: chatMessages },
    settlement,
  };
}
