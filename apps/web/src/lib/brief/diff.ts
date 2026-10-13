/**
 * The brief's arithmetic: today's snapshot minus the last one. Pure — no IO —
 * so every rule here is pinned by scripts/brief-test.ts.
 *
 * Rules that exist because the naive version lies:
 *   • a leg that was UNREAD on either side is not diffed — a failed read
 *     against a full one would report every token as gone, or as new;
 *   • a token that arrived unasked and is either an impostor of a pinned
 *     symbol or an unpriced unknown goes to `unsolicited`, not "new holding":
 *     that is the address-poisoning / airdrop-bait shape, and listing it as a
 *     balance gain would invite the user to go and look it up;
 *   • totals count priced, non-impostor rows only, and say how many were
 *     left unpriced — a sum that silently skips rows reads as complete.
 */
import {
  BRIEF_CHAINS, type BalanceChange, type BriefChain, type BriefDiff, type GrantRow, type HoldRow, type Snapshot,
} from "./types";

/** Smallest relative move reported as a change (0.1%). Below it is rounding. */
export const CHANGE_MIN_REL = 0.001;

const rowKey = (r: { chain: BriefChain; token: string }) => `${r.chain}|${r.token}`;

function relDelta(after: string, before: string): number | null {
  const a = Number(after), b = Number(before);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b === 0) return a === 0 ? 0 : null;
  return (a - b) / Math.abs(b);
}

function isUnsolicited(r: HoldRow): boolean {
  return r.trust === "impostor" || (r.trust === "unverified" && !(r.usd && r.usd > 0));
}

function total(rows: HoldRow[], chain: BriefChain) {
  let usd = 0, priced = 0, unpriced = 0;
  for (const r of rows) {
    if (r.chain !== chain || r.trust === "impostor") continue;
    if (typeof r.usd === "number" && Number.isFinite(r.usd)) { usd += r.usd; priced++; } else unpriced++;
  }
  return { usd, priced, unpriced };
}

/**
 * The snapshot to keep as tomorrow's baseline. A leg that was unread today
 * keeps yesterday's reading (and its timestamp's meaning: "last known"), so
 * one failed read does not blind the next brief as well.
 */
export function baselineFor(cur: Snapshot, prev: Snapshot | null): Snapshot {
  if (!prev) return cur;
  const holdings: HoldRow[] = [], grants: GrantRow[] = [];
  const holdingsRead = { ...cur.holdingsRead }, grantsRead = { ...cur.grantsRead };
  for (const c of BRIEF_CHAINS) {
    if (cur.holdingsRead[c] === "unread") { holdings.push(...prev.holdings.filter((r) => r.chain === c)); holdingsRead[c] = prev.holdingsRead[c]; }
    else holdings.push(...cur.holdings.filter((r) => r.chain === c));
    if (!cur.grantsRead[c]) { grants.push(...prev.grants.filter((g) => g.chain === c)); grantsRead[c] = prev.grantsRead[c]; }
    else grants.push(...cur.grants.filter((g) => g.chain === c));
  }
  return { ...cur, holdings, holdingsRead, grants, grantsRead };
}

export function diffSnapshots(cur: Snapshot, prev: Snapshot | null): BriefDiff {
  const unread: string[] = [];
  for (const c of BRIEF_CHAINS) {
    if (cur.holdingsRead[c] === "unread") unread.push(`holdings on ${c === "base" ? "Base" : "Robinhood Chain"}`);
    if (!cur.grantsRead[c]) unread.push(`approvals on ${c === "base" ? "Base" : "Robinhood Chain"}`);
  }

  const balances: BalanceChange[] = [];
  const unsolicited: HoldRow[] = [];
  const totals: BriefDiff["totals"] = {};

  for (const c of BRIEF_CHAINS) {
    if (cur.holdingsRead[c] === "unread") continue;
    const t = total(cur.holdings, c);
    const comparable = !!prev && prev.holdingsRead[c] !== "unread";
    totals[c] = { ...t, before: comparable ? total(prev!.holdings, c).usd : null };
    if (!comparable) continue;

    const before = new Map(prev!.holdings.filter((r) => r.chain === c).map((r) => [rowKey(r), r]));
    const after = new Map(cur.holdings.filter((r) => r.chain === c).map((r) => [rowKey(r), r]));
    for (const [k, r] of after) {
      const b = before.get(k);
      if (!b) {
        if (isUnsolicited(r)) unsolicited.push(r); else balances.push({ kind: "new", row: r });
        continue;
      }
      const d = relDelta(r.amount, b.amount);
      if (d === null || Math.abs(d) >= CHANGE_MIN_REL) balances.push({ kind: "changed", row: r, before: b.amount, deltaPct: d === null ? null : d * 100 });
    }
    for (const [k, b] of before) {
      // An unsolicited token that left is not news; a real holding that left is.
      if (!after.has(k) && !isUnsolicited(b)) balances.push({ kind: "gone", row: b });
    }
  }

  const grantsNew: GrantRow[] = [], grantsClosed: GrantRow[] = [];
  const grantsOpen: BriefDiff["grantsOpen"] = {};
  for (const c of BRIEF_CHAINS) {
    if (!cur.grantsRead[c]) continue;
    const now = cur.grants.filter((g) => g.chain === c);
    grantsOpen[c] = now.length;
    if (!prev || !prev.grantsRead[c]) continue;
    const was = new Set(prev.grants.filter((g) => g.chain === c).map((g) => g.key));
    const is = new Set(now.map((g) => g.key));
    for (const g of now) if (!was.has(g.key)) grantsNew.push(g);
    for (const g of prev.grants) if (g.chain === c && !is.has(g.key)) grantsClosed.push(g);
  }
  const rank = { BLOCK: 0, WARN: 1, INFO: 2 } as const;
  const grantsRisky = cur.grants.filter((g) => g.level !== "INFO").sort((a, b) => rank[a.level] - rank[b.level]);

  // Biggest moves first: gone and new, then changes by size.
  const order = { gone: 0, new: 1, changed: 2 } as const;
  balances.sort((a, b) => order[a.kind] - order[b.kind]
    || Math.abs((b.kind === "changed" ? b.deltaPct : 0) ?? 0) - Math.abs((a.kind === "changed" ? a.deltaPct : 0) ?? 0));

  return {
    wallet: cur.wallet, at: cur.at, since: prev?.at ?? null,
    totals, balances, unsolicited, grantsNew, grantsClosed, grantsRisky, grantsOpen, unread,
  };
}
