/**
 * signCheck — "what will signing this do?" (plan 2026-10-06 task 1.2).
 *
 * preTradeCheck asks about a token or a recipient. This asks about the thing a
 * wallet is about to SIGN, in three shapes:
 *
 *   transaction        { to, data?, value? } — decoded (approve, permit,
 *                      Permit2, setApprovalForAll, transfer) and SIMULATED with
 *                      eth_simulateV1 + traceTransfers (works on both chains'
 *                      public RPCs, measured 2026-10-07), so the answer says
 *                      which assets would leave and arrive.
 *   typed_data         an EIP-712 payload (eth_signTypedData_v4). Off-chain
 *                      signatures cannot be simulated — they are DECODED:
 *                      ERC-2612 Permit, DAI permit, Permit2 (single, batch,
 *                      transfer-from, witness) and Seaport orders.
 *   7702_authorization an EIP-7702 delegation (who gets to run code as you).
 *
 * Why: in Scam Sniffer's 2025 report Permit/Permit2 signatures were the
 * largest category among thefts ≥ $1M, and none of it shows in a simulation —
 * the signature moves nothing until the thief spends it.
 *
 * Verdict, decided in code (G2 rule — BLOCK only on evidence):
 *   BLOCK  the spender / operator / delegate / receiving party is flagged by
 *          GoPlus for theft, phishing, sanctions or laundering; a Seaport order
 *          that gives assets away and returns nothing to the signer.
 *   WARN   an unlimited or long-lived grant; setApprovalForAll(true); a grant
 *          to an address with no code; any 7702 delegation; a simulation that
 *          reverts or moves assets out with nothing back; a typed-data domain
 *          on another chain; anything this file cannot read (an unmeasured
 *          gap is a WARN, never a PASS).
 *   PASS   every effect was read and none of the above.
 * No LLM.
 */
import { clientFor, readTokenMeta, TX_CHAINS, type TxChain } from "@/lib/tx-chains";
import { addressFlags, flagLabel } from "@/lib/recipient-check";

export type SignVerdict = "PASS" | "WARN" | "BLOCK";
export type SignReason = { level: "BLOCK" | "WARN" | "INFO"; code: string; text: string };
export type Effect = { direction: "out" | "in"; asset: string; symbol: string; amount: string; counterparty: string };

export interface SignCheck {
  verdict: SignVerdict;
  kind: "transaction" | "typed_data" | "7702_authorization";
  /** Plain-language lines: what this does, in order. */
  summary: string[];
  /** Simulated asset movements for `from` (transactions only). */
  effects: Effect[] | null;
  /** true = simulated, false = simulation failed or unread, null = not applicable. */
  simulated: boolean | null;
  reasons: SignReason[];
  checked_at: string;
}

export interface SignCheckInput {
  chain: TxChain;
  /** The signing wallet. Required to simulate a transaction. */
  from?: string | null;
  tx?: { to?: string; data?: string; value?: string | number } | null;
  /** EIP-712 payload: an object, or its JSON string. */
  typedData?: unknown;
  /** EIP-7702 authorization: the delegate address (`address` or `contractAddress`). */
  authorization?: { address?: string; contractAddress?: string; chainId?: number | string } | null;
}

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const UNLIMITED = 2n ** 128n;          // same threshold as risk-gate: above any real supply
const LONG_LIVED_S = 30 * 86_400;       // a grant valid for more than 30 days
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; // ERC-7528, how traceTransfers reports ETH
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CHAIN_ID: Record<TxChain, number> = { base: 8453, robinhood: 4663 };

const lc = (a: string) => a.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

let rpcFetch: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub for the eth_simulateV1 request. */
export function __setSignFetch(f: typeof fetch | null) { rpcFetch = f ?? ((...a) => fetch(...a)); }

function finish(kind: SignCheck["kind"], summary: string[], reasons: SignReason[], effects: Effect[] | null, simulated: boolean | null): SignCheck {
  const verdict: SignVerdict = reasons.some((r) => r.level === "BLOCK") ? "BLOCK" : reasons.some((r) => r.level === "WARN") ? "WARN" : "PASS";
  return { verdict, kind, summary, effects, simulated, reasons, checked_at: new Date().toISOString() };
}

async function tokenName(chain: TxChain, token: string): Promise<{ symbol: string; decimals: number | null }> {
  if (lc(token) === NATIVE) return { symbol: "ETH", decimals: 18 };
  try { const m = await readTokenMeta(chain, token as `0x${string}`); return { symbol: m.symbol || short(token), decimals: m.decimals }; }
  catch { return { symbol: short(token), decimals: null }; }
}

function fmt(raw: bigint, decimals: number | null): string {
  if (raw >= UNLIMITED) return "UNLIMITED";
  if (decimals == null) return `${raw} (raw units)`;
  const s = raw.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals), frac = s.slice(s.length - decimals).replace(/0+$/, "").slice(0, 6);
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * "0x" for no code, the bytecode otherwise, null when the read failed. viem's
 * getCode answers `undefined` for an address with no code, which is not the
 * same thing as a failed read.
 */
async function codeAt(chain: TxChain, a: string): Promise<string | null> {
  try { return (await clientFor(chain).getCode({ address: a as `0x${string}` })) ?? "0x"; } catch { return null; }
}

/** Who gets the power: flags + code. Adds reasons; returns nothing. */
async function screenParty(chain: TxChain, who: string, role: string, reasons: SignReason[], opts: { noCodeIsRisk?: boolean } = {}) {
  if (!ADDR.test(who)) return;
  const [flags, code] = await Promise.all([
    addressFlags(chain, who),
    codeAt(chain, who),
  ]);
  if (flags?.hard.length) {
    reasons.push({ level: "BLOCK", code: "PARTY_FLAGGED", text: `The ${role} ${who} is flagged for ${flags.hard.map(flagLabel).join(", ")}${flags.source ? ` (source: ${flags.source})` : ""}. Do not sign.` });
  } else if (flags?.soft.length) {
    reasons.push({ level: "WARN", code: "PARTY_FLAG_DOUBT", text: `The ${role} ${short(who)} is marked by an address-risk feed: ${flags.soft.map(flagLabel).join(", ")}.` });
  } else if (!flags) {
    reasons.push({ level: "INFO", code: "PARTY_FLAGS_UNREAD", text: `The ${role} could not be screened — the address-risk feed (GoPlus) did not answer.` });
  }
  if (opts.noCodeIsRisk && code === "0x") {
    reasons.push({ level: "WARN", code: "PARTY_NO_CODE", text: `The ${role} ${short(who)} is a plain wallet, not a contract. Apps spend allowances through contracts; a grant to a wallet is how most drainers collect.` });
  }
}

// ── transactions ─────────────────────────────────────────────────────────────

const word = (d: string, i: number) => d.slice(10 + i * 64, 10 + (i + 1) * 64);
const wAddr = (d: string, i: number) => "0x" + word(d, i).slice(24);
const wInt = (d: string, i: number) => BigInt("0x" + (word(d, i) || "0"));

type Decoded =
  | { kind: "approve"; token: string; spender: string; amount: bigint; expiration?: bigint }
  | { kind: "operator"; collection: string; operator: string; on: boolean }
  | { kind: "transfer"; token: string; to: string; amount: bigint }
  | { kind: "unknown"; selector: string }
  | { kind: "none" };

export function decodeCall(to: string, data: string | undefined): Decoded {
  const d = (data ?? "0x").toLowerCase();
  if (d === "0x" || d === "") return { kind: "none" };
  if (!/^0x[0-9a-f]+$/.test(d) || d.length < 10) return { kind: "unknown", selector: d.slice(0, 10) };
  const sel = d.slice(0, 10);
  try {
    if (sel === "0x095ea7b3" || sel === "0x39509351") return { kind: "approve", token: to, spender: wAddr(d, 0), amount: wInt(d, 1) };
    if (sel === "0xd505accf") return { kind: "approve", token: to, spender: wAddr(d, 1), amount: wInt(d, 2) };            // permit(owner,spender,value,deadline,…)
    if (sel === "0x87517c45" && lc(to) === PERMIT2) return { kind: "approve", token: wAddr(d, 0), spender: wAddr(d, 1), amount: wInt(d, 2), expiration: wInt(d, 3) }; // Permit2.approve
    if (sel === "0xa22cb465") return { kind: "operator", collection: to, operator: wAddr(d, 0), on: wInt(d, 1) !== 0n };
    if (sel === "0xa9059cbb") return { kind: "transfer", token: to, to: wAddr(d, 0), amount: wInt(d, 1) };
    if (sel === "0x23b872dd") return { kind: "transfer", token: to, to: wAddr(d, 1), amount: wInt(d, 2) };
  } catch { /* fall through */ }
  return { kind: "unknown", selector: sel };
}

async function simulate(chain: TxChain, from: string, tx: { to: string; data?: string; value?: bigint }):
  Promise<{ ok: true; status: "success" | "reverted"; logs: { address: string; topics: string[]; data: string }[]; error?: string } | { ok: false; error: string }> {
  const call: Record<string, string> = { from, to: tx.to };
  if (tx.data && tx.data !== "0x") call.data = tx.data;
  if (tx.value && tx.value > 0n) call.value = "0x" + tx.value.toString(16);
  try {
    const r = await rpcFetch(TX_CHAINS[chain].rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_simulateV1", params: [{ blockStateCalls: [{ calls: [call] }], traceTransfers: true }, "latest"] }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json() as { result?: { calls?: { status?: string; logs?: { address: string; topics: string[]; data: string }[]; error?: { message?: string } }[] }[]; error?: { message?: string } };
    if (j.error) return { ok: false, error: j.error.message ?? "simulation error" };
    const c = j.result?.[0]?.calls?.[0];
    if (!c) return { ok: false, error: "empty simulation result" };
    return { ok: true, status: c.status === "0x1" ? "success" : "reverted", logs: c.logs ?? [], error: c.error?.message };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function checkTransaction(input: SignCheckInput): Promise<SignCheck> {
  const { chain } = input;
  const tx = input.tx!;
  const to = String(tx.to ?? "");
  const reasons: SignReason[] = [], summary: string[] = [];
  if (!ADDR.test(to)) {
    return finish("transaction", ["No valid `to` address."], [{ level: "WARN", code: "TX_NO_TARGET", text: "The transaction has no valid destination address, so nothing about it could be read." }], null, null);
  }
  let value = 0n;
  try { value = BigInt(tx.value ?? 0); } catch { value = 0n; }

  const dec = decodeCall(to, tx.data);
  if (dec.kind === "approve") {
    const t = await tokenName(chain, dec.token);
    summary.push(`Lets ${dec.spender} spend ${fmt(dec.amount, t.decimals)} ${t.symbol} from this wallet.`);
    if (dec.amount >= UNLIMITED) reasons.push({ level: "WARN", code: "GRANT_UNLIMITED", text: `This grants an UNLIMITED ${t.symbol} allowance. If ${short(dec.spender)} is ever compromised, everything you hold of it can be taken. Approve only the amount you are about to use.` });
    else if (dec.amount === 0n) summary[summary.length - 1] = `Revokes ${short(dec.spender)}'s ${t.symbol} allowance (sets it to 0).`;
    if (dec.expiration != null && dec.expiration > BigInt(Math.floor(Date.now() / 1000) + LONG_LIVED_S)) {
      reasons.push({ level: "WARN", code: "GRANT_LONG_LIVED", text: "The Permit2 approval stays valid for more than 30 days." });
    }
    if (dec.amount > 0n) await screenParty(chain, dec.spender, "spender", reasons, { noCodeIsRisk: true });
  } else if (dec.kind === "operator") {
    if (dec.on) {
      summary.push(`Lets ${dec.operator} move EVERY NFT you hold in collection ${short(dec.collection)}.`);
      reasons.push({ level: "WARN", code: "OPERATOR_ALL", text: "setApprovalForAll hands over the whole collection, now and later. Marketplaces ask for it; so do NFT drainers." });
      await screenParty(chain, dec.operator, "operator", reasons, { noCodeIsRisk: true });
    } else {
      summary.push(`Revokes ${short(dec.operator)}'s operator rights over collection ${short(dec.collection)}.`);
    }
  } else if (dec.kind === "transfer") {
    const t = await tokenName(chain, dec.token);
    summary.push(`Sends ${fmt(dec.amount, t.decimals)} ${t.symbol} to ${dec.to}.`);
    await screenParty(chain, dec.to, "recipient", reasons);
  } else if (dec.kind === "unknown") {
    summary.push(`Calls ${to} with function ${dec.selector}, which this check does not decode.`);
  } else if (value > 0n) {
    summary.push(`Sends ${fmt(value, 18)} ETH to ${to}.`);
    await screenParty(chain, to, "recipient", reasons);
  } else {
    summary.push(`Calls ${to} with no data and no value.`);
  }
  if (value > 0n && dec.kind !== "none") summary.push(`Also sends ${fmt(value, 18)} ETH with the call.`);

  // ── simulation ──
  const from = String(input.from ?? "");
  let effects: Effect[] | null = null, simulated: boolean | null = false;
  if (!ADDR.test(from)) {
    reasons.push({ level: dec.kind === "unknown" ? "WARN" : "INFO", code: "SIM_NO_FROM", text: "No signing wallet was given, so the transaction was not simulated." });
  } else {
    const sim = await simulate(chain, from, { to, data: tx.data, value });
    if (!sim.ok) {
      reasons.push({ level: dec.kind === "unknown" ? "WARN" : "INFO", code: "SIM_UNREAD", text: `The transaction could not be simulated (${sim.error.slice(0, 120)}), so its asset movements were not measured.` });
    } else {
      simulated = true;
      if (sim.status === "reverted") {
        reasons.push({ level: "WARN", code: "SIM_REVERTS", text: `Simulated against the latest block, this transaction FAILS${sim.error ? ` (${sim.error.slice(0, 120)})` : ""}. Signing it would only spend gas.` });
      }
      effects = [];
      for (const l of sim.logs) {
        if (lc(l.topics[0] ?? "") !== TOPIC_TRANSFER || l.topics.length !== 3) continue; // ERC-20 + native; ERC-721 has 4 topics
        const src = "0x" + l.topics[1].slice(26), dst = "0x" + l.topics[2].slice(26);
        const amt = BigInt(l.data && l.data !== "0x" ? l.data : "0x0");
        if (lc(src) === lc(from)) effects.push({ direction: "out", asset: lc(l.address), symbol: "", amount: amt.toString(), counterparty: dst });
        else if (lc(dst) === lc(from)) effects.push({ direction: "in", asset: lc(l.address), symbol: "", amount: amt.toString(), counterparty: src });
      }
      for (const e of effects) {
        const t = await tokenName(chain, e.asset);
        e.symbol = t.symbol;
        e.amount = fmt(BigInt(e.amount), t.decimals);
      }
      const outs = effects.filter((e) => e.direction === "out"), ins = effects.filter((e) => e.direction === "in");
      for (const e of outs) summary.push(`Simulated: ${e.amount} ${e.symbol} leaves this wallet to ${short(e.counterparty)}.`);
      for (const e of ins) summary.push(`Simulated: ${e.amount} ${e.symbol} arrives from ${short(e.counterparty)}.`);
      if (sim.status === "success" && outs.length && !ins.length && dec.kind === "unknown") {
        reasons.push({ level: "WARN", code: "SIM_OUT_ONLY", text: "In simulation, assets leave this wallet and nothing comes back. That is right for a payment or a deposit; it is also exactly what a drainer contract does." });
      }
    }
  }
  if (dec.kind === "unknown" && simulated !== true) {
    reasons.push({ level: "WARN", code: "TX_UNREAD", text: "Neither the function nor its effects could be read. Sign only if you know exactly what this contract call does." });
  }
  return finish("transaction", summary, reasons, effects, simulated);
}

// ── EIP-712 typed data ───────────────────────────────────────────────────────

type TD = { domain?: Record<string, unknown>; primaryType?: string; message?: Record<string, unknown> };

const big = (v: unknown): bigint | null => { try { return v == null ? null : BigInt(String(v)); } catch { return null; } };
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function grantLines(chain: TxChain, token: string, spender: string, amount: bigint | null, expiry: bigint | null, reasons: SignReason[], summary: string[], via: string) {
  const t = ADDR.test(token) ? await tokenName(chain, token) : { symbol: token || "a token", decimals: null };
  summary.push(`Signing lets ${spender || "an unnamed spender"} spend ${amount == null ? "an unread amount of" : fmt(amount, t.decimals)} ${t.symbol} from this wallet${via}. No transaction is sent now; the spender can use it later.`);
  if (amount != null && amount >= UNLIMITED) reasons.push({ level: "WARN", code: "GRANT_UNLIMITED", text: `This signature grants an UNLIMITED ${t.symbol} allowance.` });
  if (amount == null) reasons.push({ level: "WARN", code: "GRANT_UNREAD", text: "The amount this signature grants could not be read." });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiry != null && expiry > now + BigInt(LONG_LIVED_S)) reasons.push({ level: "WARN", code: "GRANT_LONG_LIVED", text: `It stays valid until ${expiry > 10n ** 12n ? "effectively forever" : new Date(Number(expiry) * 1000).toISOString().slice(0, 10)}.` });
  if (ADDR.test(spender)) await screenParty(chain, spender, "spender", reasons, { noCodeIsRisk: true });
}

async function checkTypedData(input: SignCheckInput): Promise<SignCheck> {
  const { chain } = input;
  let td: TD | null = null;
  try { td = (typeof input.typedData === "string" ? JSON.parse(input.typedData) : input.typedData) as TD; } catch { td = null; }
  const reasons: SignReason[] = [], summary: string[] = [];
  if (!td || typeof td !== "object" || !td.message || !td.primaryType) {
    return finish("typed_data", ["The payload is not EIP-712 typed data."], [{ level: "WARN", code: "TD_UNREAD", text: "This is not a readable EIP-712 payload, so what it authorises is unknown." }], null, null);
  }
  const dom = td.domain ?? {}, m = td.message, pt = td.primaryType;
  const domChain = big(dom.chainId);
  if (domChain != null && Number(domChain) !== CHAIN_ID[chain]) {
    reasons.push({ level: "WARN", code: "TD_OTHER_CHAIN", text: `The signature is for chain ${domChain}, not ${chain === "base" ? "Base 8453" : "Robinhood Chain 4663"}.` });
  }
  const verifying = lc(str(dom.verifyingContract));
  const isPermit2 = verifying === PERMIT2 || str(dom.name) === "Permit2";

  if (isPermit2 && (pt === "PermitSingle" || pt === "PermitBatch")) {
    const details = pt === "PermitSingle" ? [m.details] : (Array.isArray(m.details) ? m.details : []);
    for (const d of details as Record<string, unknown>[]) {
      await grantLines(chain, str(d?.token), str(m.spender), big(d?.amount), big(d?.expiration), reasons, summary, " through Permit2");
    }
  } else if (isPermit2 && /^Permit(Batch)?(Witness)?TransferFrom$/.test(pt)) {
    const permitted = (Array.isArray(m.permitted) ? m.permitted : [m.permitted]) as Record<string, unknown>[];
    for (const p of permitted) {
      await grantLines(chain, str(p?.token), str(m.spender), big(p?.amount), big(m.deadline), reasons, summary, " in a single Permit2 transfer");
    }
    if (/Witness/.test(pt)) summary.push("It carries a witness (an order attached to the transfer), as UniswapX-style orders do.");
  } else if (pt === "Permit" && "spender" in m && ("value" in m || "allowed" in m)) {
    const amount = "allowed" in m ? (m.allowed === true || m.allowed === "true" ? UNLIMITED * 2n : 0n) : big(m.value);
    await grantLines(chain, verifying, str(m.spender), amount, big(m.deadline ?? m.expiry), reasons, summary, " (ERC-2612 permit)");
  } else if (/seaport/i.test(str(dom.name)) && (pt === "OrderComponents" || pt === "BulkOrder")) {
    const offerer = lc(str(m.offerer));
    const offer = (Array.isArray(m.offer) ? m.offer : []) as Record<string, unknown>[];
    const consideration = (Array.isArray(m.consideration) ? m.consideration : []) as Record<string, unknown>[];
    summary.push(`A Seaport marketplace order: you offer ${offer.length} item${offer.length === 1 ? "" : "s"}; ${consideration.length} payment${consideration.length === 1 ? " is" : "s are"} due in return.`);
    const toYou = consideration.filter((c) => lc(str(c.recipient)) === offerer && (big(c.startAmount) ?? 0n) > 0n);
    if (offer.length && !toYou.length) {
      reasons.push({ level: "BLOCK", code: "SEAPORT_GIVEAWAY", text: "This order hands your items over and pays nothing back to you. That is the signature NFT drainers ask for. Do not sign." });
    } else {
      reasons.push({ level: "WARN", code: "SEAPORT_ORDER", text: "Signing lists your items for sale. Check the price on the marketplace you meant to use; anyone can fill this order until it expires." });
    }
    for (const c of consideration.filter((c) => lc(str(c.recipient)) !== offerer)) await screenParty(chain, str(c.recipient), "payment recipient", reasons);
  } else {
    summary.push(`A "${pt}" signature for ${str(dom.name) || "an unnamed app"}${verifying ? ` (${short(verifying)})` : ""}.`);
    reasons.push({ level: "WARN", code: "TD_UNKNOWN_TYPE", text: `This check does not recognise "${pt}", so it cannot say what the signature authorises. Sign only if you know the app and what it asked for.` });
  }
  return finish("typed_data", summary, reasons, null, null);
}

// ── EIP-7702 ─────────────────────────────────────────────────────────────────

async function checkAuthorization(input: SignCheckInput): Promise<SignCheck> {
  const { chain } = input;
  const a = input.authorization ?? {};
  const delegate = str(a.address) || str(a.contractAddress);
  const reasons: SignReason[] = [], summary: string[] = [];
  if (!ADDR.test(delegate)) {
    return finish("7702_authorization", ["No delegate address."], [{ level: "WARN", code: "AUTH_UNREAD", text: "The authorization names no readable delegate address." }], null, null);
  }
  if (lc(delegate) === "0x0000000000000000000000000000000000000000") {
    return finish("7702_authorization", ["Clears this account's EIP-7702 delegation (back to a plain wallet)."], [], null, null);
  }
  summary.push(`Signing makes this wallet run the code at ${delegate}. That code can move anything the wallet holds, now and in later transactions, until the delegation is replaced.`);
  reasons.push({ level: "WARN", code: "AUTH_DELEGATION", text: "An EIP-7702 delegation hands control of the whole account to a contract. Only sign one your wallet app itself asks for." });
  const authChain = big(a.chainId);
  if (authChain === 0n) reasons.push({ level: "WARN", code: "AUTH_ANY_CHAIN", text: "chainId is 0: this authorization is valid on EVERY chain, not only this one." });
  const code = await codeAt(chain, delegate);
  if (code === "0x") reasons.push({ level: "WARN", code: "AUTH_NO_CODE", text: `There is no contract at ${short(delegate)} on this chain.` });
  await screenParty(chain, delegate, "delegate", reasons);
  return finish("7702_authorization", summary, reasons, null, null);
}

export async function signCheck(input: SignCheckInput): Promise<SignCheck> {
  if (input.authorization) return checkAuthorization(input);
  if (input.typedData != null && input.typedData !== "") return checkTypedData(input);
  if (input.tx) return checkTransaction(input);
  return finish("transaction", ["Nothing to check."], [{ level: "WARN", code: "NOTHING", text: "Pass a transaction (tx), EIP-712 typed data (typed_data) or an EIP-7702 authorization." }], null, null);
}
