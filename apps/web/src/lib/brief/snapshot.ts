/**
 * Take one wallet's snapshot: holdings and open approvals on Base 8453 and
 * Robinhood Chain 4663, read the same way Blue Chat reads them.
 *
 *   Base holdings   lib/wallet/holdings.checkWallet — Moralis when it answers,
 *                   else keyless discovery, which is ALWAYS partial;
 *   RH holdings     Blockscout (readRobinhoodAddressBalances), ok/unavailable;
 *   approvals       lib/approval-audit, per chain; any unread source ⇒ that
 *                   chain's grants are not diffed.
 *
 * Partial lists and "gone": a discovery read can omit a token it simply did
 * not find, so a token yesterday's snapshot held and today's list lacks is
 * re-read on-chain (balanceOf through Multicall3) before it is called gone.
 * A reading of zero is gone; a non-zero reading is put back as held; a failed
 * reading keeps it as held with yesterday's amount — "no news" rather than a
 * false "gone".
 */
import { erc20Abi, formatUnits } from "viem";
import { approvalAudit } from "@/lib/approval-audit";
import { checkWallet } from "@/lib/wallet/holdings";
import { readRobinhoodAddressBalances } from "@/lib/robinhood/blockscout";
import { classifyToken } from "@/lib/wallet/token-trust";
import { clientFor } from "@/lib/tx-chains";
import { BRIEF_CHAINS, type BriefChain, type GrantRow, type HoldRow, type LegRead, type Snapshot } from "./types";

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const tokenId = (addr: string, isNative?: boolean) => (isNative || addr.toLowerCase() === NATIVE ? "native" : addr.toLowerCase());
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const nonZero = (amount: string) => Number(amount) !== 0;

async function baseHoldings(wallet: string): Promise<{ read: LegRead; rows: HoldRow[] }> {
  const r = await checkWallet(wallet, "mainnet");
  if (r.error && r.holdings.length === 0) return { read: "unread", rows: [] };
  const rows = r.holdings.filter((h) => nonZero(h.amount)).map((h): HoldRow => ({
    chain: "base", token: tokenId(h.address, h.isNative), symbol: h.symbol, amount: h.amount,
    usd: num(h.usdValue), trust: h.trust,
  }));
  return { read: r.partial || r.degraded ? "partial" : "ok", rows };
}

async function rhHoldings(wallet: string): Promise<{ read: LegRead; rows: HoldRow[] }> {
  const r = await readRobinhoodAddressBalances(wallet);
  if (r.status !== "ok") return { read: "unread", rows: [] };
  const rows = r.balances.filter((h) => nonZero(h.amount)).map((h): HoldRow => ({
    chain: "robinhood", token: tokenId(h.address, h.isNative), symbol: h.symbol, amount: h.amount,
    usd: num(h.usdValue), trust: classifyToken({ symbol: h.symbol, address: h.address, isNative: h.isNative }, "robinhood"),
  }));
  return { read: r.nativeUnread || r.truncated ? "partial" : "ok", rows };
}

/** Re-read on-chain the tokens `prev` held that `rows` lacks (partial legs). */
async function confirmMissing(chain: BriefChain, wallet: string, rows: HoldRow[], prev: Snapshot | null): Promise<HoldRow[]> {
  if (!prev) return rows;
  const have = new Set(rows.map((r) => r.token));
  const missing = prev.holdings.filter((p) => p.chain === chain && !have.has(p.token));
  if (!missing.length) return rows;
  const client = clientFor(chain);
  const out = [...rows];
  const erc = missing.filter((m) => m.token !== "native");
  const [native, decs, bals] = await Promise.all([
    missing.some((m) => m.token === "native") ? client.getBalance({ address: wallet as `0x${string}` }).catch(() => null) : Promise.resolve(null),
    erc.length ? client.multicall({ contracts: erc.map((m) => ({ address: m.token as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const })), allowFailure: true }).catch(() => null) : Promise.resolve([]),
    erc.length ? client.multicall({ contracts: erc.map((m) => ({ address: m.token as `0x${string}`, abi: erc20Abi, functionName: "balanceOf" as const, args: [wallet as `0x${string}`] })), allowFailure: true }).catch(() => null) : Promise.resolve([]),
  ]);
  for (const m of missing) {
    let amount: string | null = null;
    if (m.token === "native") amount = native == null ? null : formatUnits(native, 18);
    else {
      const i = erc.indexOf(m);
      const d = decs?.[i], b = bals?.[i];
      if (d?.status === "success" && b?.status === "success") amount = formatUnits(b.result as bigint, Number(d.result));
    }
    if (amount === null) out.push(m);                                       // unread: no news
    else if (nonZero(amount)) out.push({ ...m, amount, usd: m.usd != null && Number(m.amount) ? m.usd * Number(amount) / Number(m.amount) : null });
    // zero: gone — leave it out
  }
  return out;
}

async function grants(chain: BriefChain, wallet: string): Promise<{ read: boolean; rows: GrantRow[] }> {
  try {
    const a = await approvalAudit(chain, wallet, { fresh: true });
    return {
      read: a.unread.length === 0,
      rows: a.grants.map((g) => ({
        chain, key: `${g.type}|${g.asset.toLowerCase()}|${g.spender.toLowerCase()}`, type: g.type, symbol: g.symbol,
        spender: g.spender, allowance: g.allowance, unlimited: g.unlimited, level: g.level, why: g.why,
      })),
    };
  } catch { return { read: false, rows: [] }; }
}

export async function takeSnapshot(wallet: string, prev: Snapshot | null, now = Date.now()): Promise<Snapshot> {
  const w = wallet.toLowerCase();
  const [bh, rh] = await Promise.all([
    baseHoldings(w).catch(() => ({ read: "unread" as const, rows: [] })),
    rhHoldings(w).catch(() => ({ read: "unread" as const, rows: [] })),
  ]);
  const legs = { base: bh, robinhood: rh } as Record<BriefChain, { read: LegRead; rows: HoldRow[] }>;
  for (const c of BRIEF_CHAINS) {
    if (legs[c].read === "partial") legs[c].rows = await confirmMissing(c, w, legs[c].rows, prev).catch(() => legs[c].rows);
  }
  // Approvals one chain after the other: the audit paces its own explorer
  // queries, and two chains at once doubles the burst it was paced against.
  const gb = await grants("base", w);
  const gr = await grants("robinhood", w);
  return {
    v: 1, at: now, wallet: w,
    holdings: [...legs.base.rows, ...legs.robinhood.rows],
    holdingsRead: { base: legs.base.read, robinhood: legs.robinhood.read },
    grants: [...gb.rows, ...gr.rows],
    grantsRead: { base: gb.read, robinhood: gr.read },
  };
}
