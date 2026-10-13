/**
 * txExplain — "what did this transaction do?" (plan 2026-10-13, F).
 *
 * sign-check answers BEFORE a wallet signs, from a simulation. This answers
 * AFTER, from what the chain recorded: the receipt's status and fee, and the
 * event logs — tokens and NFTs that moved, approvals and Permit2 allowances
 * that were granted, operators that were switched on, and an EIP-7702
 * delegation if the transaction carried one. No LLM; every line is a decoded
 * log or a field of the transaction.
 *
 * Perspective: the `viewer` (the connected wallet) when given, else the
 * sender. Movements and grants are reported for that address; anything else
 * the transaction touched is counted, not listed.
 *
 * Notes, decided in code (same evidence rule as sign-check and recipient-check):
 *   BLOCK  a grant, delegation or outgoing payment to an address a security
 *          feed flags for theft, phishing, sanctions or laundering;
 *   WARN   an unlimited grant; setApprovalForAll(true); a 7702 delegation;
 *          a zero-value transfer OUT of the viewer that the viewer did not send
 *          (the address-poisoning move); a token arriving that wears a pinned
 *          symbol from another address (an impostor);
 *   INFO   reverted, known infrastructure, a flag feed that did not answer.
 *
 * Sources: the chain's RPC (transaction, receipt, block) on Base 8453 or
 * Robinhood Chain 4663; Blockscout v2 for the method name when the explorer
 * has decoded it; GoPlus address_security through recipient-check.
 */
import { formatUnits } from "viem";
import { clientFor, readTokenMeta, TX_CHAINS, type TxChain } from "@/lib/tx-chains";
import { addressFlags, flagLabel } from "@/lib/recipient-check";
import { classifyToken } from "@/lib/wallet/token-trust";
import { decodeCall } from "@/lib/sign-check";
import { T_APPROVAL, T_APPROVAL_ALL, T_P2_APPROVAL, T_P2_PERMIT, PERMIT2 } from "@/lib/approval-audit";

export const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** WETH9 wraps and unwraps without a Transfer event: Deposit(dst, wad) / Withdrawal(src, wad). */
export const T_WETH_DEPOSIT = "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c";
export const T_WETH_WITHDRAWAL = "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
const UNLIMITED = 2n ** 128n;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const lc = (a: string) => a.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const topicAddr = (t: string | null | undefined) => (t ? "0x" + t.slice(-40).toLowerCase() : "");

export interface RawLog { address: string; topics: (string | null)[]; data: string }
export type Move = { dir: "out" | "in"; kind: "erc20" | "nft" | "native"; token: string; counterparty: string; raw: bigint; tokenId?: bigint };
export type Grant = { kind: "erc20" | "permit2" | "operator"; token: string; spender: string; raw: bigint; on?: boolean; expiration?: bigint };
export type Note = { level: "BLOCK" | "WARN" | "INFO"; code: string; text: string };

/** Pure: the viewer's movements and grants out of a receipt's logs. */
export function readLogs(logs: RawLog[], subject: string): { moves: Move[]; grants: Grant[]; others: number } {
  const s = lc(subject);
  const moves: Move[] = [], grants: Grant[] = [];
  let others = 0;
  for (const l of logs) {
    const t = l.topics.filter((x): x is string => x != null).map(lc);
    const t0 = t[0];
    const data = l.data && l.data !== "0x" ? l.data : "0x0";
    if (t0 === T_TRANSFER) {
      const from = topicAddr(t[1]), to = topicAddr(t[2]);
      if (from !== s && to !== s) { others++; continue; }
      const dir = from === s ? "out" : "in";
      const counterparty = dir === "out" ? to : from;
      if (t.length === 4) moves.push({ dir, kind: "nft", token: lc(l.address), counterparty, raw: 1n, tokenId: BigInt(t[3]) });
      else moves.push({ dir, kind: "erc20", token: lc(l.address), counterparty, raw: BigInt(data.slice(0, 66)) });
    } else if ((t0 === T_WETH_DEPOSIT || t0 === T_WETH_WITHDRAWAL) && t.length === 2) {
      if (topicAddr(t[1]) !== s) continue;
      moves.push({ dir: t0 === T_WETH_DEPOSIT ? "in" : "out", kind: "erc20", token: lc(l.address), counterparty: lc(l.address), raw: BigInt(data.slice(0, 66)) });
    } else if (t0 === T_APPROVAL && t.length === 3) {
      if (topicAddr(t[1]) !== s) continue;
      grants.push({ kind: "erc20", token: lc(l.address), spender: topicAddr(t[2]), raw: BigInt(data.slice(0, 66)) });
    } else if (t0 === T_APPROVAL_ALL) {
      if (topicAddr(t[1]) !== s) continue;
      grants.push({ kind: "operator", token: lc(l.address), spender: topicAddr(t[2]), raw: 0n, on: BigInt(data.slice(0, 66)) !== 0n });
    } else if ((t0 === T_P2_APPROVAL || t0 === T_P2_PERMIT) && lc(l.address) === lc(PERMIT2)) {
      if (topicAddr(t[1]) !== s) continue;
      const w = data.slice(2).padEnd(128, "0");
      grants.push({ kind: "permit2", token: topicAddr(t[2]), spender: topicAddr(t[3]), raw: BigInt("0x" + w.slice(0, 64)), expiration: BigInt("0x" + w.slice(64, 128)) });
    }
  }
  return { moves, grants, others };
}

/**
 * Pure: zero-value token transfers OUT of wallets the sender is not — the
 * poisoning campaign shape (one transaction, many victims). Counted whatever
 * the viewer, so a group asking about a hash with no wallet still sees it.
 */
export function foreignZeroTransfers(logs: RawLog[], sender: string): { victims: number; tokens: string[] } {
  const s = lc(sender), victims = new Set<string>(), tokens = new Set<string>();
  for (const l of logs) {
    const t = l.topics.filter((x): x is string => x != null).map(lc);
    if (t[0] !== T_TRANSFER || t.length !== 3) continue;
    const from = topicAddr(t[1]);
    const raw = l.data && l.data !== "0x" ? BigInt(l.data.slice(0, 66)) : 0n;
    if (raw === 0n && from !== s && from !== lc(l.address)) { victims.add(from); tokens.add(lc(l.address)); }
  }
  return { victims: victims.size, tokens: [...tokens] };
}

export interface TxExplain {
  chain: TxChain;
  chain_id: number;
  hash: string;
  status: "success" | "reverted";
  at: string | null;
  from: string;
  to: string | null;
  subject: string;
  sent_by_subject: boolean;
  method: string;
  fee_eth: string | null;
  lines: string[];
  notes: Note[];
  explorer: string;
}

const EXPLORER: Record<TxChain, string> = { base: "https://basescan.org/tx/", robinhood: "https://robinhoodchain.blockscout.com/tx/" };
const BLOCKSCOUT: Record<TxChain, string> = { base: "https://base.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com" };
const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";

async function methodName(chain: TxChain, hash: string): Promise<string | null> {
  try {
    const r = await fetch(`${BLOCKSCOUT[chain]}/api/v2/transactions/${hash}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return null;
    const j = await r.json() as { method?: string | null };
    // Blockscout names undecoded calls "0x1234abcd" or "func_<n>": neither says anything.
    return j.method && !/^0x[0-9a-f]{8}$/i.test(j.method) && !/^func_\d+$/.test(j.method) ? j.method : null;
  } catch { return null; }
}

async function meta(chain: TxChain, token: string, cache: Map<string, { symbol: string; decimals: number | null }>) {
  const hit = cache.get(token);
  if (hit) return hit;
  let m: { symbol: string; decimals: number | null };
  try { const r = await readTokenMeta(chain, token as `0x${string}`); m = { symbol: r.symbol || short(token), decimals: r.decimals }; }
  catch { m = { symbol: short(token), decimals: null }; }
  cache.set(token, m);
  return m;
}

const amount = (raw: bigint, d: number | null) => (raw >= UNLIMITED ? "UNLIMITED" : d == null ? `${raw} (raw units)` : Number(formatUnits(raw, d)).toLocaleString("en-US", { maximumFractionDigits: 6 }));

/** Find the transaction on the given chain, or on either when none is given. */
async function locate(hash: `0x${string}`, chain?: TxChain) {
  for (const c of chain ? [chain] : (["base", "robinhood"] as TxChain[])) {
    const client = clientFor(c);
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return { chain: c, client, receipt };
  }
  return null;
}

export async function txExplain(input: { hash: string; chain?: TxChain; viewer?: string | null }): Promise<TxExplain | { error: string }> {
  const hash = input.hash.trim();
  if (!HASH.test(hash)) return { error: "Not a transaction hash (0x + 64 hex characters)." };
  const found = await locate(hash as `0x${string}`, input.chain);
  if (!found) return { error: `No transaction ${short(hash)} on ${input.chain ? (input.chain === "base" ? "Base" : "Robinhood Chain") : "Base or Robinhood Chain"}.` };
  const { chain, client, receipt } = found;
  const [tx, block, method] = await Promise.all([
    client.getTransaction({ hash: hash as `0x${string}` }),
    client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null),
    methodName(chain, hash),
  ]);
  const from = lc(tx.from), to = tx.to ? lc(tx.to) : null;
  const viewer = input.viewer && /^0x[a-fA-F0-9]{40}$/.test(input.viewer) ? lc(input.viewer) : null;
  const subject = viewer ?? from;
  const you = viewer ? "You" : short(from);
  // An outgoing movement the subject did not sign was moved, not sent.
  const outVerb = from === subject ? `${you} sent` : `${viewer ? "Your wallet" : short(subject)} was made to send`;
  const notes: Note[] = [];
  const lines: string[] = [];
  const cache = new Map<string, { symbol: string; decimals: number | null }>();

  const decoded = decodeCall(to ?? "", tx.input);
  const methodLabel = method ?? (decoded.kind === "none" ? (to ? "plain ETH transfer" : "contract creation") : decoded.kind === "unknown" ? `call ${decoded.selector}${to ? ` on ${short(to)}` : ""}` : `${decoded.kind}() on ${short(to ?? "")}`);
  if (receipt.status !== "success") notes.push({ level: "INFO", code: "REVERTED", text: "The transaction reverted: nothing in it took effect except the fee." });

  const { moves, grants, others } = receipt.status === "success" ? readLogs(receipt.logs as RawLog[], subject) : { moves: [], grants: [], others: 0 };
  if (receipt.status === "success" && tx.value > 0n && to) {
    if (from === subject) moves.unshift({ dir: "out", kind: "native", token: "native", counterparty: to, raw: tx.value });
    else if (to === subject) moves.unshift({ dir: "in", kind: "native", token: "native", counterparty: from, raw: tx.value });
  }

  // Who received power or money: screened once each.
  const parties = new Set<string>();
  for (const g of grants) if (g.kind !== "operator" || g.on) parties.add(g.spender);
  for (const m of moves) if (m.dir === "out" && m.raw > 0n) parties.add(m.counterparty);
  const auth = (tx as { authorizationList?: { address: string }[] }).authorizationList ?? [];
  for (const a of auth) parties.add(lc(a.address));
  const flags = new Map(await Promise.all([...parties].map(async (p) => [p, await addressFlags(chain, p).catch(() => null)] as const)));
  const flagText = (p: string) => {
    const f = flags.get(p);
    return f?.hard.length ? `flagged for ${f.hard.map(flagLabel).join(", ")}${f.source ? ` (${f.source})` : ""}` : null;
  };

  for (const m of moves) {
    if (m.kind === "native") { lines.push(`${m.dir === "out" ? outVerb : `${you} received`} ${amount(m.raw, 18)} ETH ${m.dir === "out" ? "to" : "from"} ${short(m.counterparty)}`); }
    else if (m.kind === "nft") { const k = await meta(chain, m.token, cache); lines.push(`${m.dir === "out" ? outVerb : `${you} received`} ${k.symbol} #${m.tokenId} ${m.dir === "out" ? "to" : "from"} ${short(m.counterparty)}`); }
    else {
      const k = await meta(chain, m.token, cache);
      lines.push(`${m.dir === "out" ? outVerb : `${you} received`} ${amount(m.raw, k.decimals)} ${k.symbol} ${m.dir === "out" ? "to" : "from"} ${short(m.counterparty)}`);
      if (m.dir === "out" && m.raw === 0n && from !== subject) {
        notes.push({ level: "WARN", code: "POISON_ZERO", text: `${viewer ? "You" : short(subject)} did not send this: a third party (${short(from)}) moved 0 ${k.symbol} "from" ${viewer ? "your wallet" : "this wallet"} to ${m.counterparty}. That is the address-poisoning move: it plants a look-alike in the history. Never copy an address from it.` });
      }
      if (m.dir === "in" && classifyToken({ symbol: k.symbol, address: m.token }, chain) === "impostor") {
        notes.push({ level: "WARN", code: "IMPOSTOR_IN", text: `The ${k.symbol} that arrived is not the real ${k.symbol} on ${chain === "base" ? "Base" : "Robinhood Chain"} (contract ${short(m.token)}). Do not trade it or follow links about it.` });
      }
    }
    const ft = m.dir === "out" ? flagText(m.counterparty) : null;
    if (ft) notes.push({ level: "BLOCK", code: "PAID_FLAGGED", text: `Funds went to ${m.counterparty}, ${ft}.` });
  }

  for (const g of grants) {
    const k = g.kind === "operator" ? await meta(chain, g.token, cache) : await meta(chain, g.token, cache);
    if (g.kind === "operator") {
      lines.push(g.on ? `${you} let ${short(g.spender)} move ALL your ${k.symbol} items` : `${you} switched off ${short(g.spender)} as an operator for ${k.symbol}`);
      if (g.on) notes.push({ level: "WARN", code: "OPERATOR_ON", text: `${short(g.spender)} can now move every ${k.symbol} item ${viewer ? "you hold" : "this wallet holds"}, until it is switched off.` });
    } else {
      const amt = g.raw === 0n ? "nothing (a revoke)" : amount(g.raw, k.decimals);
      const exp = g.kind === "permit2" && g.expiration ? `, until ${new Date(Number(g.expiration) * 1000).toISOString().slice(0, 10)}` : "";
      lines.push(`${you} allowed ${short(g.spender)} to spend ${amt}${g.raw === 0n ? "" : ` ${k.symbol}`}${g.kind === "permit2" ? " via Permit2" : ""}${exp}`);
      if (g.raw >= UNLIMITED) notes.push({ level: "WARN", code: "UNLIMITED_GRANT", text: `Unlimited ${k.symbol} allowance to ${short(g.spender)}: if it is ever compromised, the whole balance is exposed. Ask "check my approvals" to revoke it.` });
    }
    const ft = (g.kind !== "operator" || g.on) && g.raw !== 0n ? flagText(g.spender) : null;
    if (ft || (g.kind === "operator" && g.on && flagText(g.spender))) notes.push({ level: "BLOCK", code: "GRANT_FLAGGED", text: `The spender ${g.spender} is ${flagText(g.spender)}. Revoke this now.` });
  }

  for (const a of auth) {
    const d = lc(a.address);
    lines.push(`${short(from)} delegated its account to the contract ${short(d)} (EIP-7702)`);
    const ft = flagText(d);
    notes.push(ft
      ? { level: "BLOCK", code: "DELEGATE_FLAGGED", text: `The delegate ${d} is ${ft}. It can act as the account.` }
      : { level: "WARN", code: "DELEGATION", text: `EIP-7702: the code at ${short(d)} now runs as ${short(from)} until replaced. Know what it is.` });
  }

  // The campaign view: only when the viewer's own line did not already say it.
  if (receipt.status === "success" && !notes.some((n) => n.code === "POISON_ZERO")) {
    const z = foreignZeroTransfers(receipt.logs as RawLog[], from);
    if (z.victims) {
      const named = (await Promise.all(z.tokens.slice(0, 3).map((t) => meta(chain, t, cache)))).map((m) => m.symbol).join(", ");
      const rest = z.tokens.length - 3;
      const syms = rest > 0 ? `${named} and ${rest} other token${rest === 1 ? "" : "s"}` : named;
      notes.push({ level: "WARN", code: "POISON_CAMPAIGN", text: `This transaction moved 0 ${syms} out of ${z.victims} wallet${z.victims === 1 ? "" : "s"} that ${short(from)} does not own. That is an address-poisoning run: each victim now sees a look-alike address in their history, as if they had sent to it. Never copy an address from your history.` });
    }
  }

  for (const p of parties) {
    const f = flags.get(p);
    if (f?.infra) notes.push({ level: "INFO", code: "INFRA", text: `${short(p)} is ${f.infra}.` });
  }
  if ([...flags.values()].some((f) => f === null)) notes.push({ level: "INFO", code: "FLAGS_UNREAD", text: "The address-risk feed (GoPlus) did not answer for every party, so not all were screened." });

  if (receipt.status === "success" && !lines.length) {
    lines.push(subject === from
      ? `Nothing moved to or from ${you} and no approval was granted${others ? ` (${others} transfer${others === 1 ? "" : "s"} between other addresses)` : ""}.`
      : `This transaction did not move anything to or from ${viewer ? "your wallet" : short(subject)}.`);
  } else if (others) lines.push(`…plus ${others} transfer${others === 1 ? "" : "s"} between other addresses.`);

  const gasPrice = receipt.effectiveGasPrice ?? tx.gasPrice ?? null;
  const l1 = (receipt as { l1Fee?: bigint | null }).l1Fee ?? 0n;
  const rank = { BLOCK: 0, WARN: 1, INFO: 2 } as const;
  return {
    chain, chain_id: TX_CHAINS[chain].chainId, hash, status: receipt.status === "success" ? "success" : "reverted",
    at: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
    from, to, subject, sent_by_subject: from === subject, method: methodLabel,
    fee_eth: gasPrice != null ? formatUnits(receipt.gasUsed * gasPrice + l1, 18) : null,
    lines, notes: notes.sort((a, b) => rank[a.level] - rank[b.level]),
    explorer: EXPLORER[chain] + hash,
  };
}

/** 0.000000279, not 2.79e-7: three significant digits, written out. */
export function feeEth(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return "0";
  const d = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(n))));
  return n.toFixed(Math.min(d, 18)).replace(/\.?0+$/, "");
}

/** The answer as text (chat markdown or Telegram HTML). */
export function explainText(x: TxExplain, fmt: "md" | "html"): string {
  const e = (s: string) => (fmt === "html" ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : s);
  const b = (s: string) => (fmt === "html" ? `<b>${s}</b>` : `**${s}**`);
  const chainName = x.chain === "base" ? "Base 8453" : "Robinhood Chain 4663";
  const out = [
    `${b("What this transaction did")} · ${chainName}`,
    e(`${x.status === "success" ? "Succeeded" : "Reverted"}${x.at ? ` at ${x.at.replace("T", " ").slice(0, 16)} UTC` : ""} · ${x.method} · sent by ${x.sent_by_subject ? (x.subject === x.from ? short(x.from) : "you") : short(x.from)}${x.fee_eth ? ` · fee ${feeEth(x.fee_eth)} ETH` : ""}`),
    "",
    ...x.lines.map((l) => `• ${e(l)}`),
  ];
  if (x.notes.length) {
    out.push("");
    for (const n of x.notes) out.push(`${n.level === "BLOCK" ? "⛔" : n.level === "WARN" ? "⚠️" : "ℹ️"} ${e(n.text)}`);
  }
  out.push("", fmt === "html" ? `<a href="${x.explorer}">Open in explorer</a>` : `[Open in explorer](${x.explorer})`);
  return out.join("\n");
}
