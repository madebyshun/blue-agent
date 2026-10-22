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
  // A held token GoPlus did not answer for today keeps yesterday's reading, so
  // tomorrow's "worse than last time" compares against something real.
  const screened = new Set((cur.risk ?? []).map((r) => r.token));
  const held = new Set(holdings.map((r) => r.token));
  const risk = [...(cur.risk ?? []), ...(prev.risk ?? []).filter((r) => !screened.has(r.token) && held.has(r.token))];
  return { ...cur, holdings, holdingsRead, grants, grantsRead, risk };
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
      // An impostor never appears as a balance move. MEASURED 2026-10-21: a
      // fake "ՍՏDС" whose balanceOf mirrors the wallet's real USDC printed
      // "1.64384 → 9.72906 (+491.8%)" right under the real USDC line — the
      // exact disguise it exists for. Only `new` was guarded. If yesterday's
      // snapshot did not call it an impostor (it predates the classifier's
      // look-alike fix, fccb5d87), warn once in the unsolicited section.
      if (r.trust === "impostor") { if (b.trust !== "impostor") unsolicited.push(r); continue; }
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
  // Poisoning: every attempt the snapshot found in its window (it reads from
  // the last brief onward), newest first.
  const poison = cur.poison ?? [];
  for (const c of BRIEF_CHAINS) if (cur.poisonRead && !cur.poisonRead[c]) unread.push(`transfer history on ${c === "base" ? "Base" : "Robinhood Chain"}`);

  // Held-token risk: worse than last time = new to the brief.
  const sev = { OK: 0, WARN: 1, BLOCK: 2 } as const;
  const riskNow = (cur.risk ?? []).filter((r) => r.level !== "OK").sort((a, b) => sev[b.level] - sev[a.level]);
  const before = new Map((prev?.risk ?? []).map((r) => [r.token, r]));
  const riskNew = prev ? riskNow.filter((r) => { const b = before.get(r.token); return !b || sev[r.level] > sev[b.level]; }) : riskNow;
  if (cur.riskStat && cur.riskStat.read < cur.riskStat.picked) unread.push(`token screen for ${cur.riskStat.picked - cur.riskStat.read} of ${cur.riskStat.picked} held Base tokens`);

  const rank = { BLOCK: 0, WARN: 1, INFO: 2 } as const;
  // Only chains whose approvals were read: a partial read's grants beside a
  // missing "N open" line reads as a contradiction (measured 2026-10-13).
  const grantsRisky = cur.grants.filter((g) => g.level !== "INFO" && cur.grantsRead[g.chain]).sort((a, b) => rank[a.level] - rank[b.level]);

  // Biggest moves first: gone and new, then changes by size.
  const order = { gone: 0, new: 1, changed: 2 } as const;
  balances.sort((a, b) => order[a.kind] - order[b.kind]
    || Math.abs((b.kind === "changed" ? b.deltaPct : 0) ?? 0) - Math.abs((a.kind === "changed" ? a.deltaPct : 0) ?? 0));

  return {
    wallet: cur.wallet, at: cur.at, since: prev?.at ?? null,
    totals, balances, unsolicited, grantsNew, grantsClosed, grantsRisky, grantsOpen,
    poison, riskNew, riskNow, riskStat: cur.riskStat ?? null, unread,
  };
}
