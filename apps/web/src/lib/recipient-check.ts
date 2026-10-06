/**
 * Recipient check — the half of a SEND that the token check never looked at.
 *
 * preTradeCheck (G2) judged only the token being moved. On a send the costly
 * mistake is usually the ADDRESS: a poisoned look-alike copied from history,
 * a flagged address, the token's own contract, or the zero address. Plan
 * 2026-10-06 task 1.1; demand: address poisoning, ≥ $83.8M lost on Ethereum
 * + BSC 2022–24 (USENIX Security 2025) and one $50M loss in December 2025.
 *
 * Verdict levels follow G2's rule — BLOCK only on evidence:
 *   BLOCK  the zero address; the token contract itself (tokens sent there are
 *          stranded); an address a security feed flags for theft, phishing,
 *          sanctions or laundering (GoPlus `address_security`, which names its
 *          own data_source).
 *   WARN   a look-alike of an address the sender has paid before (same first
 *          and last 4 hex, different middle); an address that sent the sender
 *          a zero-value transfer (the poisoning move itself); a contract
 *          recipient (an exchange or a Safe is fine; most contracts are not).
 *   INFO   paid before (and how often), first payment to it, an EIP-7702
 *          delegated account, a self-send, and every source that could not be
 *          read. An unread source is never a pass and never a block.
 *
 * Sources: chain RPC (eth_getCode), Blockscout v2 transfers for Base 8453 and
 * Robinhood Chain 4663 (UA convention of lib/wallet/base-token-discovery.ts),
 * GoPlus address_security (free, keyless, covers both chains — measured
 * 2026-10-07). No LLM.
 */
import { clientFor, type TxChain } from "@/lib/tx-chains";

export type RecipientCode =
  | "RECIPIENT_NOT_ADDRESS" | "RECIPIENT_ZERO" | "RECIPIENT_IS_TOKEN" | "RECIPIENT_FLAGGED"
  | "RECIPIENT_FLAG_DOUBT" | "RECIPIENT_LOOKALIKE" | "RECIPIENT_POISON_DUST" | "RECIPIENT_CONTRACT"
  | "RECIPIENT_7702" | "RECIPIENT_SELF" | "RECIPIENT_KNOWN" | "RECIPIENT_NEW"
  | "RECIPIENT_FLAGS_UNREAD" | "RECIPIENT_HISTORY_UNREAD";

export type RecipientReason = { level: "BLOCK" | "WARN" | "INFO"; code: RecipientCode; text: string };

export interface RecipientInput {
  chain: TxChain;
  recipient: string;
  /** The sending wallet. Without it there is no history to compare against. */
  sender?: string | null;
  /** The token being sent (0x… or ETH), to catch a send to the token itself. */
  token?: string | null;
}

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";
const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";
const EXPLORER: Record<TxChain, string> = {
  base: "https://base.blockscout.com",
  robinhood: "https://robinhoodchain.blockscout.com",
};
const GOPLUS_CHAIN: Record<TxChain, number> = { base: 8453, robinhood: 4663 };

/** GoPlus flags that are evidence of harm → BLOCK. */
const HARD_FLAGS = [
  "stealing_attack", "phishing_activities", "sanctioned", "cybercrime", "money_laundering",
  "financial_crime", "blackmail_activities", "darkweb_transactions", "honeypot_related_address",
] as const;
/** Weaker or ambiguous flags → WARN. */
const SOFT_FLAGS = ["blacklist_doubt", "mixer", "fake_kyc"] as const;

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub. */
export function __setRecipientFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

async function getJson(url: string, ms = 6_000): Promise<unknown | null> {
  try {
    const r = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const lc = (a: string) => a.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Same first 4 and last 4 hex digits, different address: what a poisoner mints. */
export function isLookalike(a: string, b: string): boolean {
  const x = lc(a), y = lc(b);
  return x !== y && x.slice(2, 6) === y.slice(2, 6) && x.slice(-4) === y.slice(-4);
}

type Transfer = { from: string; to: string; value: string };

/** Up to `pages` pages of the sender's ERC-20 transfers in one direction. null = unread. */
async function transfers(chain: TxChain, wallet: string, filter: "from" | "to", pages = 2): Promise<Transfer[] | null> {
  const out: Transfer[] = [];
  let next = "";
  for (let p = 0; p < pages; p++) {
    const j = await getJson(`${EXPLORER[chain]}/api/v2/addresses/${wallet}/token-transfers?filter=${filter}${next}`) as
      { items?: { from?: { hash?: string }; to?: { hash?: string }; total?: { value?: string } }[]; next_page_params?: Record<string, unknown> | null } | null;
    if (!j || !Array.isArray(j.items)) return p === 0 ? null : out;
    for (const it of j.items) {
      if (it.from?.hash && it.to?.hash) out.push({ from: it.from.hash, to: it.to.hash, value: String(it.total?.value ?? "") });
    }
    if (!j.next_page_params) break;
    next = "&" + new URLSearchParams(Object.entries(j.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

/** The sender's native-ETH payees (outgoing transactions with value). null = unread. */
async function nativePayees(chain: TxChain, wallet: string): Promise<string[] | null> {
  const j = await getJson(`${EXPLORER[chain]}/api/v2/addresses/${wallet}/transactions?filter=from`) as
    { items?: { to?: { hash?: string } | null; value?: string }[] } | null;
  if (!j || !Array.isArray(j.items)) return null;
  return j.items.filter((t) => t.to?.hash && t.value && t.value !== "0").map((t) => t.to!.hash!);
}

/** GoPlus address_security for one address. null = the feed did not answer. */
export async function addressFlags(chain: TxChain, addr: string): Promise<{ hard: string[]; soft: string[]; source: string; isContract: boolean | null } | null> {
  const j = await getJson(`https://api.gopluslabs.io/api/v1/address_security/${addr}?chain_id=${GOPLUS_CHAIN[chain]}`) as
    { code?: number; result?: Record<string, string> } | null;
  if (!j || j.code !== 1 || !j.result) return null;
  const r = j.result;
  return {
    hard: HARD_FLAGS.filter((f) => r[f] === "1"),
    soft: SOFT_FLAGS.filter((f) => r[f] === "1"),
    source: typeof r.data_source === "string" ? r.data_source : "",
    isContract: r.contract_address === "1" ? true : r.contract_address === "0" ? false : null,
  };
}

export const flagLabel = (f: string) => f.replace(/_/g, " ");

export async function recipientReasons(input: RecipientInput): Promise<RecipientReason[]> {
  const { chain } = input;
  const to = (input.recipient ?? "").trim();
  const reasons: RecipientReason[] = [];

  if (!ADDR.test(to)) {
    return [{ level: "BLOCK", code: "RECIPIENT_NOT_ADDRESS", text: "The recipient is not a 0x address. Paste the full address, or a name that resolves to one." }];
  }
  if (lc(to) === ZERO) {
    return [{ level: "BLOCK", code: "RECIPIENT_ZERO", text: "The recipient is the zero address — anything sent there is burned and cannot be recovered." }];
  }
  const token = (input.token ?? "").trim();
  if (ADDR.test(token) && lc(token) === lc(to)) {
    return [{ level: "BLOCK", code: "RECIPIENT_IS_TOKEN", text: "The recipient is the token's own contract. Tokens sent to it are stranded — no one can send them back." }];
  }
  const sender = (input.sender ?? "").trim();
  if (ADDR.test(sender) && lc(sender) === lc(to)) {
    // Nothing to screen in the user's own wallet, and no network: the MCP
    // builder refuses a self-send itself, before any request
    // (mcp-send-self-test).
    return [{ level: "INFO", code: "RECIPIENT_SELF", text: "This sends to the same wallet it comes from." }];
  }

  const [code, flags, outgoing, incoming, native] = await Promise.all([
    clientFor(chain).getCode({ address: to as `0x${string}` }).catch(() => undefined),
    addressFlags(chain, to),
    ADDR.test(sender) ? transfers(chain, sender, "from") : Promise.resolve(null),
    ADDR.test(sender) ? transfers(chain, sender, "to") : Promise.resolve(null),
    ADDR.test(sender) ? nativePayees(chain, sender) : Promise.resolve(null),
  ]);

  // ── Security feed ────────────────────────────────────────────────────────
  if (!flags) {
    reasons.push({ level: "INFO", code: "RECIPIENT_FLAGS_UNREAD", text: "The address-risk feed (GoPlus) did not answer, so this address was not screened for theft, phishing or sanctions." });
  } else if (flags.hard.length) {
    reasons.push({ level: "BLOCK", code: "RECIPIENT_FLAGGED", text: `This address is flagged for ${flags.hard.map(flagLabel).join(", ")}${flags.source ? ` (source: ${flags.source})` : ""}. Do not send to it.` });
  } else if (flags.soft.length) {
    reasons.push({ level: "WARN", code: "RECIPIENT_FLAG_DOUBT", text: `An address-risk feed marks this address: ${flags.soft.map(flagLabel).join(", ")}${flags.source ? ` (source: ${flags.source})` : ""}. Make sure you know who it belongs to.` });
  }

  // ── What is at the address ───────────────────────────────────────────────
  if (code && code.toLowerCase().startsWith("0xef0100") && code.length === 48) {
    reasons.push({ level: "INFO", code: "RECIPIENT_7702", text: `This is a wallet that has delegated its code (EIP-7702) to ${short("0x" + code.slice(8))}. Funds sent here are controlled by that code as well as by the key.` });
  } else if (code && code !== "0x") {
    reasons.push({ level: "WARN", code: "RECIPIENT_CONTRACT", text: "The recipient is a smart contract, not a plain wallet. Exchanges and multisigs are contracts and accept this; most other contracts do not, and tokens sent to them can be stuck." });
  }

  // ── The sender's own history ─────────────────────────────────────────────
  if (ADDR.test(sender) && lc(sender) !== lc(to)) {
    if (outgoing === null && native === null) {
      reasons.push({ level: "INFO", code: "RECIPIENT_HISTORY_UNREAD", text: "This wallet's past payments could not be read, so the address was not compared against people you have paid before." });
    } else {
      const paid = [...(outgoing ?? []).map((t) => t.to), ...(native ?? [])];
      const times = paid.filter((a) => lc(a) === lc(to)).length;
      const twin = paid.find((a) => isLookalike(a, to));
      if (times > 0) {
        reasons.push({ level: "INFO", code: "RECIPIENT_KNOWN", text: `You have paid this exact address before (${times} time${times === 1 ? "" : "s"} in recent history).` });
      } else if (twin) {
        reasons.push({ level: "WARN", code: "RECIPIENT_LOOKALIKE", text: `This address looks like one you have paid before but is NOT it: you paid ${twin}, this is ${to}. The first and last characters match and the middle differs — the pattern of an address-poisoning scam. Check every character.` });
      } else {
        reasons.push({ level: "INFO", code: "RECIPIENT_NEW", text: "You have not paid this address before in recent history. Check it against a source you trust, not your transaction list." });
      }
      const dust = (incoming ?? []).some((t) => lc(t.from) === lc(to) && (t.value === "0" || t.value === ""));
      if (dust && times === 0) {
        reasons.push({ level: "WARN", code: "RECIPIENT_POISON_DUST", text: "This address sent your wallet a zero-value transfer — the move address poisoners use to plant a look-alike in your history. Do not copy addresses from your transaction list." });
      }
    }
  }
  return reasons;
}
