/**
 * OWNER POWERS of a Virtuals `AgentToken` / `AgentTokenV4`, read straight off
 * the deployed bytecode. Chain-parameterised: Base 8453 and Robinhood Chain
 * 4663 both host this template and they share no state.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26 across the 18 tools on `/api/mcp`: a holder of
 * $BLUEAGENT (`0x765eecec…27b3`, an AgentTokenV4 on RH 4663) asking Blue Agent
 * "is this token safe?" could not be answered by any tool we ship. The closest,
 * `hub_honeypot`, reads Base only. So the project's own token was the one token
 * the project could not inspect.
 *
 * `token-tax.ts` already reads the two tax selectors on Base and is the reason
 * `honeypot-check` stopped saying SAFE at 95% over an unread tax. This module is
 * the rest of that contract — the levers an owner still holds after launch,
 * which is what "safe?" actually means once the tax is known:
 *   owner · pendingOwner · projectTaxRecipient · vault · blacklist · bot window.
 *
 * WHY SELECTORS AND NOT THE CONTRACT NAME
 * ---------------------------------------
 * Same reason as `token-tax.ts`, restated because it is the load-bearing one:
 * `ContractName` on an explorer is a string the DEPLOYER chose. An impostor can
 * call itself `AgentTokenV4` and implement none of it, and a genuine
 * implementation that was never verified has no name at all. A selector either
 * answers an `eth_call` with a well-formed word or it does not, and that is a
 * property of the bytecode rather than of anyone's claim about it.
 *
 * WHAT A FAILED READ MUST NOT BECOME
 * ----------------------------------
 * `null`. Never `0`, never `"unknown"`, never the zero address.
 *
 * This is sharper here than in `token-tax.ts` because three fields on this
 * contract have a MEANINGFUL zero, and each of them is a *reassuring* value:
 *   • `owner() == 0x0`                       → ownership RENOUNCED
 *   • `pendingOwner() == 0x0`                → no takeover queued
 *   • `botProtectionDurationInSeconds() == 0` → no trading window restriction
 * So collapsing "we could not read it" into `0` does not merely lose
 * information, it manufactures the single most calming answer the field can
 * give. `null` and `0` are kept apart everywhere below, and the flags are
 * derived only from values that were actually read.
 *
 * NO HOLDER CONCENTRATION HERE, ON PURPOSE. The obvious next field is "top 10
 * holders hold N%", and on this template it is actively misleading: the LP pool
 * and `vault()` are top holders BY CONSTRUCTION, so a naive percentage reports
 * alarming concentration for a perfectly ordinary token. An alarming number
 * that is wrong is worse than no number. It also keeps this module pure
 * `eth_call` — no explorer, no indexer, no key, nothing behind Cloudflare.
 */
import { decodeAbiParameters, encodeFunctionData, toFunctionSelector } from "viem";
import { bpsToPct, type Probe } from "@/lib/token-tax";
import { TX_CHAINS, type TxChain } from "@/lib/tx-chains";

/** Derived, never pasted — a hand-copied selector is a silent wrong call. */
export const AGENT_TOKEN_SELECTORS = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  owner: toFunctionSelector("owner()"),
  pendingOwner: toFunctionSelector("pendingOwner()"),
  projectTaxRecipient: toFunctionSelector("projectTaxRecipient()"),
  vault: toFunctionSelector("vault()"),
  botProtection: toFunctionSelector("botProtectionDurationInSeconds()"),
  buyTax: toFunctionSelector("totalBuyTaxBasisPoints()"),
  sellTax: toFunctionSelector("totalSellTaxBasisPoints()"),
} as const;

/** `blacklists(address)` needs an argument. The zero address is only ever the
 *  ARGUMENT — we are asking whether the lever exists, not whether some
 *  particular wallet is blocked, so a `false` answers that as well as a `true`. */
export const BLACKLIST_CALLDATA = encodeFunctionData({
  abi: [{
    type: "function", name: "blacklists", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }],
  }],
  functionName: "blacklists",
  args: ["0x0000000000000000000000000000000000000000"],
});

export type AgentTokenProbeKey = keyof typeof AGENT_TOKEN_SELECTORS | "blacklist";

/** Every selector's raw answer. A missing key reads the same as `{ok:false}`. */
export type AgentTokenProbes = Partial<Record<AgentTokenProbeKey, Probe>>;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** One ABI word and nothing else. A `fallback()` answering `0x` does not
 *  implement the selector, and neither does a 4-byte revert string. */
const WORD = /^0x[0-9a-fA-F]{64}$/;

/** 10000 bps = 100%. Above that is a selector collision on a contract whose
 *  fallback returns arbitrary bytes, not a tax — so it degrades to unread.
 *  Exactly 10000 SURVIVES: a genuine 100% sell tax is the honeypot itself. */
const MAX_BPS = 10_000;

function word(p: Probe | undefined): string | null {
  return p && p.ok && WORD.test(p.data) ? p.data : null;
}

function decodeUint(p: Probe | undefined, max?: number): number | null {
  const w = word(p);
  if (w === null) return null;
  let v: bigint;
  try { v = BigInt(w); } catch { return null; }
  if (max != null && v > BigInt(max)) return null;
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v);
}

/** Raw `uint256` as a decimal STRING — `totalSupply` on an 18-decimal token
 *  overflows `Number` and a rounded supply is a wrong supply. */
function decodeBigUint(p: Probe | undefined): string | null {
  const w = word(p);
  if (w === null) return null;
  try { return BigInt(w).toString(); } catch { return null; }
}

/** An address word is 12 zero bytes then 20 address bytes. Anything else — a
 *  packed struct, a bool, garbage from a fallback — is not an address and must
 *  not be reported as one. Returned EIP-55 checksummed by viem. */
function decodeAddress(p: Probe | undefined): string | null {
  const w = word(p);
  if (w === null) return null;
  if (!/^0x0{24}/.test(w)) return null;
  try {
    const [addr] = decodeAbiParameters([{ type: "address" }], w as `0x${string}`);
    return addr as string;
  } catch {
    return null;
  }
}

/** ERC-20 `name`/`symbol` are dynamic strings. Some older tokens return a
 *  fixed `bytes32` instead; that is not decoded here and reads as unread,
 *  which is correct — this module exists for one specific template. */
function decodeString(p: Probe | undefined): string | null {
  if (!p || !p.ok || !p.data || p.data === "0x") return null;
  try {
    const [s] = decodeAbiParameters([{ type: "string" }], p.data as `0x${string}`);
    return typeof s === "string" && s.length > 0 && s.length <= 128 ? s : null;
  } catch {
    return null;
  }
}

export type AgentTokenTemplate = "AgentTokenV4" | "AgentToken" | null;

export interface AgentTokenRead {
  /** `null` ⇒ neither tax selector answered: not this template. Every owner
   *  field is then unread rather than absent. */
  template: AgentTokenTemplate;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  /** Decimal string — see `decodeBigUint`. */
  total_supply: string | null;

  /** `ZERO_ADDRESS` means RENOUNCED, a measured fact. `null` means unread. */
  owner: string | null;
  /** Non-zero ⇒ a two-step ownership handover is queued but not accepted. */
  pending_owner: string | null;
  /** Where the tax actually lands. */
  project_tax_recipient: string | null;
  vault: string | null;

  tax_units: "basis_points";
  buy_tax: number | null;
  sell_tax: number | null;
  buy_tax_pct: string | null;
  sell_tax_pct: string | null;
  /** `true` the lever exists, `false` this template provably has none, `null`
   *  we could not tell. Three-valued for the same reason as `token-tax.ts`:
   *  a `false` inferred from silence reads identically to a measured clean. */
  has_blacklist: boolean | null;
  /** Seconds. `0` is a real "no restriction"; `null` is unread. */
  bot_protection_seconds: number | null;
}

/** The shape returned when the address is not even shaped like an address. */
export const AGENT_TOKEN_UNREAD: AgentTokenRead = interpretAgentToken({});

/**
 * PURE. Raw probes in, one honest read out. No network, no clock, no env.
 *
 * Template detection is the two TAX selectors, not `blacklists` — `blacklists`
 * alone distinguishes V4 from V1 but says nothing about whether this is the
 * template at all, and a contract that answers only `blacklists` is far more
 * likely to be a selector collision than a half-implemented AgentToken.
 */
export function interpretAgentToken(p: AgentTokenProbes): AgentTokenRead {
  const buy_tax = decodeUint(p.buyTax, MAX_BPS);
  const sell_tax = decodeUint(p.sellTax, MAX_BPS);
  const isTemplate = buy_tax != null && sell_tax != null;
  const blacklisted = word(p.blacklist) !== null;

  return {
    template: blacklisted && isTemplate ? "AgentTokenV4" : isTemplate ? "AgentToken" : null,
    name: decodeString(p.name),
    symbol: decodeString(p.symbol),
    decimals: decodeUint(p.decimals, 255),
    total_supply: decodeBigUint(p.totalSupply),

    owner: decodeAddress(p.owner),
    pending_owner: decodeAddress(p.pendingOwner),
    project_tax_recipient: decodeAddress(p.projectTaxRecipient),
    vault: decodeAddress(p.vault),

    tax_units: "basis_points",
    buy_tax,
    sell_tax,
    buy_tax_pct: bpsToPct(buy_tax),
    sell_tax_pct: bpsToPct(sell_tax),
    has_blacklist: blacklisted ? true : isTemplate ? false : null,
    bot_protection_seconds: decodeUint(p.botProtection),
  };
}

// ─── Flags ────────────────────────────────────────────────────────────────────

/** > 5% either side. Same threshold the safe-trending spec uses, so the two
 *  surfaces cannot disagree about what "high" means. */
export const HIGH_TAX_BPS = 500;

export type AgentTokenFlag =
  | "NOT_AGENT_TOKEN"
  | "OWNER_NOT_RENOUNCED"
  | "OWNERSHIP_TRANSFER_PENDING"
  | "BLACKLIST_CAPABLE"
  | "TAX_MUTABLE"
  | "HIGH_TAX"
  | "BOT_PROTECTION_ACTIVE";

/**
 * Deterministic, derived in code, never by a model — CLAUDE.md's rule for any
 * output a reader will act on.
 *
 * Every flag fires only on a value that was READ. An unread owner raises no
 * `OWNER_NOT_RENOUNCED`, because the absence of a flag here means "we did not
 * measure this", which the caller states explicitly rather than implying.
 *
 * `TAX_MUTABLE` is the one INFERENCE and is labelled as such: `setProjectTaxRates`
 * is `onlyOwner` and state-changing, so an `eth_call` from the zero address
 * reverts whether or not the function exists — presence is genuinely
 * unprobeable. What IS measured is that this is the template (which carries the
 * setter) and that the owner still exists to call it. Both halves are required:
 * a renounced AgentToken has an immutable tax and must not carry this flag.
 */
export function agentTokenFlags(r: AgentTokenRead): AgentTokenFlag[] {
  const flags: AgentTokenFlag[] = [];
  if (r.template === null) flags.push("NOT_AGENT_TOKEN");
  if (r.owner != null && r.owner !== ZERO_ADDRESS) flags.push("OWNER_NOT_RENOUNCED");
  if (r.pending_owner != null && r.pending_owner !== ZERO_ADDRESS) {
    flags.push("OWNERSHIP_TRANSFER_PENDING");
  }
  if (r.has_blacklist === true) flags.push("BLACKLIST_CAPABLE");
  if (r.template !== null && r.owner != null && r.owner !== ZERO_ADDRESS) {
    flags.push("TAX_MUTABLE");
  }
  if ((r.buy_tax != null && r.buy_tax > HIGH_TAX_BPS)
    || (r.sell_tax != null && r.sell_tax > HIGH_TAX_BPS)) {
    flags.push("HIGH_TAX");
  }
  if (r.bot_protection_seconds != null && r.bot_protection_seconds > 0) {
    flags.push("BOT_PROTECTION_ACTIVE");
  }
  return flags;
}

/** Which fields this read did NOT obtain. Shipped alongside the flags because
 *  "no flags" and "nothing was readable" render identically otherwise, and the
 *  second one is not a clean bill of health. */
export function agentTokenUnread(r: AgentTokenRead): string[] {
  const missing: string[] = [];
  if (r.buy_tax == null) missing.push("buy_tax");
  if (r.sell_tax == null) missing.push("sell_tax");
  if (r.owner == null) missing.push("owner");
  if (r.pending_owner == null) missing.push("pending_owner");
  if (r.project_tax_recipient == null) missing.push("project_tax_recipient");
  if (r.vault == null) missing.push("vault");
  if (r.has_blacklist == null) missing.push("has_blacklist");
  if (r.bot_protection_seconds == null) missing.push("bot_protection_seconds");
  return missing;
}

// ─── Network tier ─────────────────────────────────────────────────────────────

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** A defensive tool that hangs is a defensive tool nobody calls. */
const PROBE_TIMEOUT_MS = 6_000;

/** One `eth_call`. Revert, 429, JSON-RPC error object and timeout all collapse
 *  to `{ok:false}` — here they genuinely mean the same thing: not read. */
async function ethCall(rpc: string, to: string, data: string): Promise<Probe> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const d = (await res.json()) as { result?: string; error?: unknown };
    if (d.error || typeof d.result !== "string") return { ok: false };
    return { ok: true, data: d.result };
  } catch {
    return { ok: false };
  }
}

export type AgentTokenProbeFn = (address: string) => Promise<AgentTokenProbes>;

/**
 * The live probe for one chain. Twelve parallel `eth_call`s, no key, no
 * indexer — cheap enough that this tool stays free.
 *
 * Chain-parameterised rather than Base-pinned because the same template is
 * deployed on both live venues and CLAUDE.md hard rule 1 applies: a token
 * address is meaningless without its chain, and the two share no state. The
 * caller names the chain; this never guesses it.
 */
export function makeAgentTokenProbe(chain: TxChain): AgentTokenProbeFn {
  const rpc = TX_CHAINS[chain].rpc;
  return async (address) => {
    const keys = Object.keys(AGENT_TOKEN_SELECTORS) as (keyof typeof AGENT_TOKEN_SELECTORS)[];
    const results = await Promise.all([
      ...keys.map((k) => ethCall(rpc, address, AGENT_TOKEN_SELECTORS[k])),
      ethCall(rpc, address, BLACKLIST_CALLDATA),
    ]);
    const out: AgentTokenProbes = {};
    keys.forEach((k, i) => { out[k] = results[i]; });
    out.blacklist = results[keys.length];
    return out;
  };
}

/**
 * Read one token's owner-power surface. `probe` is injectable so the guard
 * suite exercises every branch hermetically — CI runs with no network.
 */
export async function readAgentToken(
  rawAddress: string,
  probe: AgentTokenProbeFn,
): Promise<AgentTokenRead> {
  const address = (rawAddress ?? "").trim();
  if (!ADDRESS.test(address)) return AGENT_TOKEN_UNREAD;
  try {
    return interpretAgentToken(await probe(address));
  } catch {
    return AGENT_TOKEN_UNREAD;
  }
}
