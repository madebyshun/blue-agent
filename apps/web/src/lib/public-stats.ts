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
 * reads as a measurement ("nobody traded", "nobody signed up", "no runs").
 * So each block carries an `ok` flag (`actions.ok`, `usage.ok`,
 * `users.claimsOk`, `settlement.ok`); false ⟹ the value is a placeholder the
 * view must render as "—" or as a "≥" lower bound, never as a total.
 *
 * Sources:
 *   - Actions:   lib/action-stats.ts — swaps, sends and bridges the CHAIN proved
 *                a wallet signed (G4, 2026-09-30), realized slippage against the
 *                quote, and refusals the server measured. Replaces arrow figures
 *                as the accountability number: arrows had no traders.
 *   - Usage:     KV `usage:<toolId>` counters — lifetime tool runs of EVERY kind
 *                (aggregate sum; no wallet is ever part of the key). These counters
 *                are incremented by the x402 route, the free MCP bypass AND the Hub
 *                runner alike, so they CANNOT say which runs were paid — see the
 *                comment beside `kv.incr(\`usage:${tool}\`)` in api/x402/[tool]/route.ts.
 *                That is why `revenueEst` is labelled an estimate and why the actual
 *                settled figure comes from lib/x402-settlements.ts instead. This line
 *                used to read "lifetime PAID tool runs", which made the file that
 *                computes the public revenue number contradict the two files it
 *                depends on.
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
 * REMOVED (2026-09-30, plan §5): the `launches` block. MEASURED that day it
 * read 0 in production: the flow it counted is gone (the Bankr launch path was
 * deleted 2026-09-06; the B20HUB pages 404), so "Tokens Launched" and
 * "Creators" headlined a dead product's zero as traction. `lib/launches.ts`
 * and the rows in `bluechat:launches` are untouched — `b20hub/*` and
 * `robinhood/receipt` still use them, and user state is evidence — only the
 * public claim went. Same reasoning as the staking block below.
 *
 * REMOVED: a `staking` block that read BlueMarketStaking.totalStaked() on Base and
 * published it as a headline metric. The contract is untouched and still live, but
 * the app no longer sells a stake, so quoting its TVL as traction advertised a
 * retired product. The field is gone from the response, not zeroed — an absent
 * number is honest, a zero would be a false measurement.
 */

import { AGENT_TOOLS } from "./agent-tools";
import { readActionStats, type ActionStats } from "./action-stats";
import { X402_PAY_TO } from "./x402-payee";
import { kvGet, kvGetCounter } from "./kv";
import { getLedgerActivity } from "./credit-ledger";
import { getX402Settlements } from "./x402-settlements";
import { getLlmUsage } from "./llm-usage";

export interface PublicStats {
  updatedAt: number;
  /** G4 — real trades, from action records (see lib/action-stats.ts). */
  actions: ActionStats;
  product: {
    tools:    number;
    commands: number;
  };
  usage: {
    totalRuns:  number;                          // Σ usage:<id> across the catalog
    revenueEst: string;                          // "$X.XX" — Σ(runs × price) — an ESTIMATE
    /** What `revenueEst` is — published beside it so no reader takes it for
     *  settled revenue: the counters include free and internal runs. */
    revenueEstBasis: string;
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
    /** The meter is forward-only; the payee's full on-chain history is longer.
     *  Said, with the address to check it against — see buildPublicStats. */
    scope:      string;
    payee:      string;
    verify_url: string;
  };
  tokens: {            // aggregate LLM tokens served through the inference nets
    total: number;     // Σ total_tokens (prompt + completion) — forward-only meter
    /** #150 — false ⟹ the token meter was unreadable; `total` is 0 as a
     *  placeholder and must render as "—", never as "no tokens served". Same
     *  convention as `settlement.ok`. Forward-only + non-streaming-only, so even
     *  when ok it is an honest lower bound of all inference (see lib/llm-usage.ts). */
    ok:    boolean;
  };
}

const CORE_COMMANDS = 5; // idea · build · audit · ship · raise
const CLAIM_CAP     = 300; // mirrors credits/claim route

/** Parse a "$0.05" price string to a number; non-numeric ⟹ 0. */
function priceNum(price?: string): number {
  if (!price) return 0;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? 0 : n;
}

export async function buildPublicStats(): Promise<PublicStats> {
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
  //
  // SCOPE, stated (plan §5): this meter only counts settlements THIS server
  // recorded since it started, so it reads far lower than the payee's real
  // history on Base (MEASURED 2026-09-30: 2 here, ~20 on-chain). The payee
  // also receives credit top-ups and ACP flows, so its explorer page is not a
  // settlement count either — it is published as the place to verify, not as
  // a second number.
  const payee = X402_PAY_TO;
  const settleScope =
    "Forward-only: settlements this server recorded since the meter started — lower than the payee's full on-chain history. " +
    "The payee also receives credit top-ups, so its USDC history on Basescan is broader than x402 settlements.";
  const verifyUrl = `https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?a=${payee}`;
  let settlement = { usdc: 0, count: 0, lastTx: null as string | null, ok: false, scope: settleScope, payee, verify_url: verifyUrl };
  try {
    const s = await getX402Settlements();
    if (s) settlement = { ...settlement, usdc: s.usdc, count: s.count, lastTx: s.lastTx, ok: true };
  } catch { /* leave ok:false → renders "—" */ }

  // ── Actions (G4) — trades the chain proved, never a guess ──
  const actions = await readActionStats();

  // ── LLM tokens served (forward-only meter — lib/llm-usage.ts) ──
  // Aggregate prompt+completion tokens across the non-streaming inference calls.
  // Forward-only like `settlement`: starts accruing at deploy, never backfilled.
  // Null source ⟹ ok:false → the landing renders "—", never a fabricated 0.
  let tokens = { total: 0, ok: false };
  try {
    const u = await getLlmUsage();
    if (u) tokens = { total: u.tokens, ok: true };
  } catch { /* leave ok:false → renders "—" */ }

  return {
    updatedAt: Date.now(),
    actions,
    product: { tools, commands: CORE_COMMANDS },
    usage: {
      totalRuns, revenueEst: `$${revenueEstNum.toFixed(2)}`,
      revenueEstBasis: "Estimate: lifetime runs × list price. The run counters include free and internal runs, so this is not revenue — settled USDC is `settlement`.",
      topTools, ok: usageOk, unreadable: usageUnreadable,
    },
    users: { claims, claimCap: CLAIM_CAP, total: totalUsers, claimsOk },
    credits: { spent: creditsSpent, messages: chatMessages },
    settlement,
    tokens,
  };
}
