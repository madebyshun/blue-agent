/**
 * approvalAudit — what this wallet has granted, still live, and how to take it
 * back (plan 2026-10-06 task 1.3, the Authorize layer: "keep only the paths
 * that let users cancel and revoke what they had granted").
 *
 * What a free approval list (GoPlus) does not give, and this does:
 *   • Permit2 sub-allowances and NFT setApprovalForAll, not only ERC-20;
 *   • every grant re-read LIVE (allowance() / isApprovedForAll() /
 *     Permit2.allowance()), so a grant that was spent or revoked since its log
 *     is not reported as open — logs are history, state is the answer;
 *   • the amount actually exposed = min(allowance, balance), in token units;
 *   • who the spender is (contract or plain wallet, GoPlus flags);
 *   • an UNSIGNED revoke transaction per grant, for the user's own wallet.
 * MEASURED 2026-10-04: GoPlus approval_security returned [] for wallet
 * 0x0295… on Base while it held a live USDC approval to the ACP escrow.
 *
 * Sources: Blockscout etherscan-compatible getLogs (Base 8453, Robinhood Chain
 * 4663; full history in ~1–6 s, pages of 1,000), chain RPC for live state,
 * GoPlus address_security for spender flags. No LLM.
 *
 * Levels, decided in code:
 *   BLOCK  the spender is flagged for theft, phishing, sanctions → revoke now
 *   WARN   unlimited, a plain-wallet spender, operator-for-all, a Permit2 grant
 *          valid for more than 30 days
 *   INFO   bounded grants to contracts
 * An unread source is reported as unread; it never becomes "no approvals".
 */
import { encodeFunctionData } from "viem";
import { clientFor, readTokenMeta, type TxChain } from "@/lib/tx-chains";
import { addressFlags, flagLabel } from "@/lib/recipient-check";
import { kvGet, kvSet } from "@/lib/kv";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";
const EXPLORER: Record<TxChain, string> = {
  base: "https://base.blockscout.com",
  robinhood: "https://robinhoodchain.blockscout.com",
};
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const T_APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";      // Approval(address,address,uint256) — ERC-20 & ERC-721
const T_APPROVAL_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";  // ApprovalForAll(address,address,bool)
const T_P2_APPROVAL = "0xda9fa7c1b00402c17d0161b249b1ab8bbec047c5a52207b9c112deffd817036b";   // Permit2 Approval(owner,token,spender,uint160,uint48)
const T_P2_PERMIT = "0xc6a377bfc4eb120024a8ac08eef205be16b817020812c73223e81d1bdb9708ec";     // Permit2 Permit(owner,token,spender,uint160,uint48,uint48)
const UNLIMITED = 2n ** 128n;
const LONG_LIVED_S = 30 * 86_400;
/** Spenders screened against GoPlus, most exposed first. Logged when exceeded. */
const MAX_SCREEN = 25;

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const NFT_ABI = [
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] },
] as const;
const PERMIT2_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "address" }], outputs: [{ type: "uint160" }, { type: "uint48" }, { type: "uint48" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint160" }, { type: "uint48" }], outputs: [] },
] as const;

export type GrantType = "erc20" | "nft_operator" | "permit2";
export interface Grant {
  type: GrantType;
  /** Token (erc20, permit2) or collection (nft_operator). */
  asset: string;
  symbol: string;
  spender: string;
  /** Token units, "UNLIMITED", or "all items" for an operator. */
  allowance: string;
  unlimited: boolean;
  /** min(allowance, balance) in token units — what the spender could take today. null = balance unread. */
  exposed: string | null;
  /** Permit2 only: ISO date the grant lapses, or "never". */
  expires: string | null;
  spender_is_contract: boolean | null;
  spender_flags: string[] | null;
  level: "BLOCK" | "WARN" | "INFO";
  why: string;
  /** Unsigned revoke for the user's own wallet. */
  revoke: { chain_id: number; to: string; data: string; value: "0" };
}
export interface ApprovalAudit {
  wallet: string;
  chain: TxChain;
  chain_id: number;
  grants: Grant[];
  counts: { live: number; block: number; warn: number; info: number; closed_since: number };
  /** Sources that could not be read. Non-empty means the list may be incomplete. */
  unread: string[];
  note: string | null;
  checked_at: string;
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
let RETRY_MS = 1_500;
/** Tests inject a stub for the explorer requests (and skip the retry wait). */
export function __setAuditFetch(f: typeof fetch | null, retryMs = 1_500) { fetchImpl = f ?? ((...a) => fetch(...a)); RETRY_MS = retryMs; }

type Log = { address: string; topics: (string | null)[]; data: string };

/**
 * Optional key for Blockscout's higher rate tier. MEASURED 2026-10-07: the
 * keyless tier allowed 10 requests, then 429 with an ~8-minute reset, so a
 * production audit needs a key or the cache below. Not printed anywhere.
 */
function apiKeyParam(): string {
  const k = process.env.BLOCKSCOUT_API_KEY;
  return k ? `&apikey=${encodeURIComponent(k)}` : "";
}

/** History by topic0 (or by emitting contract when `topic0` is null) and owner in topic1. */
async function logs(chain: TxChain, topic0: string | null, owner: string, address?: string): Promise<Log[] | null> {
  const t1 = "0x" + owner.slice(2).toLowerCase().padStart(64, "0");
  const out: Log[] = [];
  for (let page = 1; page <= 5; page++) {
    const sel = topic0 ? `&topic0=${topic0}&topic1=${t1}&topic0_1_opr=and` : `&topic1=${t1}`;
    const url = `${EXPLORER[chain]}/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest${address ? `&address=${address}` : ""}${sel}&page=${page}&offset=1000${apiKeyParam()}`;
    try {
      let r = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      // The free explorer tier answers 429 under bursts (measured 2026-10-07).
      // One spaced retry; after that the source is reported unread.
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, RETRY_MS));
        r = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      }
      if (!r.ok) return page === 1 ? null : out;
      const j = await r.json() as { message?: string; result?: Log[] | string };
      if (!Array.isArray(j.result)) return /no logs/i.test(String(j.message)) ? out : (page === 1 ? null : out);
      out.push(...j.result);
      if (j.result.length < 1000) break;
    } catch { return page === 1 ? null : out; }
  }
  return out;
}

const topicAddr = (t: string | null | undefined) => (t ? ("0x" + t.slice(26)).toLowerCase() : "");
const lc = (a: string) => a.toLowerCase();
const CHAIN_ID: Record<TxChain, number> = { base: 8453, robinhood: 4663 };

function units(raw: bigint, decimals: number | null): string {
  if (raw >= UNLIMITED) return "UNLIMITED";
  if (decimals == null) return `${raw} (raw)`;
  const s = raw.toString().padStart(decimals + 1, "0");
  const w = s.slice(0, s.length - decimals), f = s.slice(s.length - decimals).replace(/0+$/, "").slice(0, 6);
  return f ? `${w}.${f}` : w;
}

/** Cached 10 minutes per wallet and chain: the explorer's free tier is tight,
 *  and a revoke the user just signed shows up on `fresh: true`. A result with
 *  an unread source is never cached. */
export async function approvalAudit(chain: TxChain, wallet: string, opts: { fresh?: boolean } = {}): Promise<ApprovalAudit> {
  if (!ADDR.test(wallet)) throw new Error("wallet must be a 0x address");
  const key = `approvals:${chain}:${wallet.toLowerCase()}`;
  if (!opts.fresh) {
    const hit = await kvGet<ApprovalAudit>(key).catch(() => null);
    if (hit && Array.isArray(hit.grants)) return hit;
  }
  const out = await auditUncached(chain, wallet);
  if (!out.unread.length) await kvSet(key, out, 600).catch(() => {});
  return out;
}

async function auditUncached(chain: TxChain, wallet: string): Promise<ApprovalAudit> {
  const owner = lc(wallet);
  const unread: string[] = [];
  // Sequential on purpose: four parallel queries per wallet tripped the free
  // explorer's rate limit (429) on the second wallet of a live test.
  // Three queries: every Permit2 event for this owner comes from one contract,
  // so it is one address-filtered query, not one per event type.
  const erc = await logs(chain, T_APPROVAL, owner);
  const all = await logs(chain, T_APPROVAL_ALL, owner);
  const p2 = await logs(chain, null, owner, PERMIT2);
  if (!erc) unread.push("ERC-20 Approval history (explorer)");
  if (!all) unread.push("NFT ApprovalForAll history (explorer)");
  if (!p2) unread.push("Permit2 history (explorer)");

  // Candidate pairs from history; state decides what is still open.
  const ercPairs = new Map<string, { token: string; spender: string }>();
  // Blockscout pads `topics` to four with null, so count the real ones: three
  // is ERC-20 (amount in data), four is an ERC-721 single-token approval.
  const nTopics = (l: Log) => l.topics.filter((t) => t != null).length;
  for (const l of erc ?? []) if (nTopics(l) === 3) ercPairs.set(`${lc(l.address)}|${topicAddr(l.topics[2])}`, { token: lc(l.address), spender: topicAddr(l.topics[2]) });
  const opPairs = new Map<string, { collection: string; operator: string }>();
  for (const l of all ?? []) opPairs.set(`${lc(l.address)}|${topicAddr(l.topics[2])}`, { collection: lc(l.address), operator: topicAddr(l.topics[2]) });
  const p2Pairs = new Map<string, { token: string; spender: string }>();
  for (const l of p2 ?? []) {
    if (lc(l.address) !== lc(PERMIT2)) continue;
    const t0 = lc(l.topics[0] ?? "");
    if (t0 !== T_P2_APPROVAL && t0 !== T_P2_PERMIT) continue;   // Lockdown etc. close grants; state decides
    p2Pairs.set(`${topicAddr(l.topics[2])}|${topicAddr(l.topics[3])}`, { token: topicAddr(l.topics[2]), spender: topicAddr(l.topics[3]) });
  }

  const client = clientFor(chain);
  const now = BigInt(Math.floor(Date.now() / 1000));
  type Raw = { type: GrantType; asset: string; spender: string; amount: bigint; expiration: bigint | null };
  const live: Raw[] = [];
  let closed = 0, stateUnread = 0;

  await Promise.all([
    ...[...ercPairs.values()].map(async (p) => {
      try {
        const a = await client.readContract({ address: p.token as `0x${string}`, abi: ERC20_ABI, functionName: "allowance", args: [owner as `0x${string}`, p.spender as `0x${string}`] });
        if (a > 0n) live.push({ type: "erc20", asset: p.token, spender: p.spender, amount: a, expiration: null }); else closed++;
      } catch { stateUnread++; }  // ERC-721 single-token approvals land here too: no allowance()
    }),
    ...[...opPairs.values()].map(async (p) => {
      try {
        const on = await client.readContract({ address: p.collection as `0x${string}`, abi: NFT_ABI, functionName: "isApprovedForAll", args: [owner as `0x${string}`, p.operator as `0x${string}`] });
        if (on) live.push({ type: "nft_operator", asset: p.collection, spender: p.operator, amount: UNLIMITED, expiration: null }); else closed++;
      } catch { stateUnread++; }
    }),
    ...[...p2Pairs.values()].map(async (p) => {
      try {
        const [amount, expiration] = await client.readContract({ address: PERMIT2 as `0x${string}`, abi: PERMIT2_ABI, functionName: "allowance", args: [owner as `0x${string}`, p.token as `0x${string}`, p.spender as `0x${string}`] });
        if (amount > 0n && BigInt(expiration) > now) live.push({ type: "permit2", asset: p.token, spender: p.spender, amount, expiration: BigInt(expiration) }); else closed++;
      } catch { stateUnread++; }
    }),
  ]);
  if (stateUnread) unread.push(`${stateUnread} grant${stateUnread === 1 ? "" : "s"} whose current state could not be read`);

  // Token metadata + balances, then spender screening (most exposed first).
  const meta = new Map<string, { symbol: string; decimals: number | null; balance: bigint | null }>();
  await Promise.all([...new Set(live.filter((g) => g.type !== "nft_operator").map((g) => g.asset))].map(async (t) => {
    let symbol = `${t.slice(0, 6)}…${t.slice(-4)}`, decimals: number | null = null, balance: bigint | null = null;
    try { const m = await readTokenMeta(chain, t as `0x${string}`); symbol = m.symbol || symbol; decimals = m.decimals; } catch { /* keep address */ }
    try { balance = await client.readContract({ address: t as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [owner as `0x${string}`] }); } catch { /* null */ }
    meta.set(t, { symbol, decimals, balance });
  }));
  const exposure = (g: Raw) => { const b = meta.get(g.asset)?.balance; return g.type === "nft_operator" ? 1n : b == null ? 0n : (g.amount < b ? g.amount : b); };
  live.sort((a, b) => (exposure(b) > exposure(a) ? 1 : -1));
  const spenders = [...new Set(live.map((g) => g.spender))];
  const screened = new Map<string, { flags: string[] | null; contract: boolean | null }>();
  await Promise.all(spenders.slice(0, MAX_SCREEN).map(async (s) => {
    const [f, code] = await Promise.all([
      addressFlags(chain, s),
      client.getCode({ address: s as `0x${string}` }).then((c) => !!c && c !== "0x").catch(() => null),
    ]);
    screened.set(s, { flags: f ? f.hard.concat(f.soft) : null, contract: code });
  }));
  let note: string | null = null;
  if (spenders.length > MAX_SCREEN) note = `${spenders.length} distinct spenders; the ${MAX_SCREEN} with the most exposure were screened against the risk feed, the rest were not.`;

  const grants: Grant[] = live.map((g) => {
    const m = meta.get(g.asset);
    const s = screened.get(g.spender) ?? { flags: null, contract: null };
    const unlimited = g.amount >= UNLIMITED;
    const hard = (s.flags ?? []).filter((f) => !["blacklist_doubt", "mixer", "fake_kyc"].includes(f));
    let level: Grant["level"] = "INFO", why = "A bounded allowance to a contract.";
    if (hard.length) { level = "BLOCK"; why = `The spender is flagged for ${hard.map(flagLabel).join(", ")}. Revoke now.`; }
    else if (s.contract === false) { level = "WARN"; why = "The spender is a plain wallet, not an app contract — the way most drainers collect."; }
    else if (g.type === "nft_operator") { level = "WARN"; why = "Operator for the whole collection: it can move every item, including ones you buy later."; }
    else if (unlimited) { level = "WARN"; why = "Unlimited: if this spender is ever compromised, your whole balance of this token is exposed."; }
    else if (g.type === "permit2" && g.expiration != null && g.expiration > now + BigInt(LONG_LIVED_S)) { level = "WARN"; why = "A Permit2 grant that stays valid for more than 30 days."; }
    if (level !== "BLOCK" && s.flags?.length) why += ` A risk feed also marks it: ${s.flags.map(flagLabel).join(", ")}.`;

    const revokeData = g.type === "erc20"
      ? encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [g.spender as `0x${string}`, 0n] })
      : g.type === "nft_operator"
        ? encodeFunctionData({ abi: NFT_ABI, functionName: "setApprovalForAll", args: [g.spender as `0x${string}`, false] })
        : encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [g.asset as `0x${string}`, g.spender as `0x${string}`, 0n, 0] });
    const bal = m?.balance;
    return {
      type: g.type,
      asset: g.asset,
      symbol: g.type === "nft_operator" ? "NFT collection" : (m?.symbol ?? g.asset),
      spender: g.spender,
      allowance: g.type === "nft_operator" ? "all items" : units(g.amount, m?.decimals ?? null),
      unlimited: g.type === "nft_operator" || unlimited,
      exposed: g.type === "nft_operator" ? null : bal == null ? null : units(g.amount < bal ? g.amount : bal, m?.decimals ?? null),
      // Permit2 lets an app pass uint48 max (year ~8.9 million): that is "never".
      expires: g.expiration == null ? null : g.expiration > 253_402_300_799n ? "never" : new Date(Number(g.expiration) * 1000).toISOString().slice(0, 10),
      spender_is_contract: s.contract,
      spender_flags: s.flags,
      level,
      why,
      revoke: { chain_id: CHAIN_ID[chain], to: g.type === "erc20" || g.type === "nft_operator" ? g.asset : PERMIT2, data: revokeData, value: "0" },
    };
  });
  const order = { BLOCK: 0, WARN: 1, INFO: 2 } as const;
  grants.sort((a, b) => order[a.level] - order[b.level]);
  return {
    wallet: owner, chain, chain_id: CHAIN_ID[chain], grants,
    counts: {
      live: grants.length,
      block: grants.filter((g) => g.level === "BLOCK").length,
      warn: grants.filter((g) => g.level === "WARN").length,
      info: grants.filter((g) => g.level === "INFO").length,
      closed_since: closed,
    },
    unread, note, checked_at: new Date().toISOString(),
  };
}
