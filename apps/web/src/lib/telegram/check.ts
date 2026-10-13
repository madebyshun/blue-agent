/**
 * `/check <address> [base|rh]` and `/tx <hash>` for the Telegram bot — in a
 * private chat or in a group (plan 2026-10-13, H).
 *
 * Read-only by construction: nothing here knows a wallet, signs, or trades.
 *   • a CONTRACT is judged by preTradeCheck as if it were about to be bought
 *     (the same verdict every swap card in Blue Chat gates on);
 *   • a WALLET (no code) is screened by recipient-check's addressFlags plus
 *     the chain explorer's own scam mark — FLAGGED / CAUTION / NO_KNOWN_FLAGS,
 *     never "clean";
 *   • `/tx` is lib/tx-explain from the sender's point of view (no wallet is
 *     linked in a group, so there is no "you").
 *
 * The word "safe" never appears: a PASS is "no blocking risk found by these
 * checks", which is what was measured.
 *
 * The chain: `rh` / `robinhood` / `4663` selects Robinhood Chain; otherwise
 * the address is looked up on both and the chain where it has code wins
 * (Base when both or neither) — and the reply always names the chain.
 */
import { clientFor, type TxChain } from "@/lib/tx-chains";
import { preTradeCheck } from "@/lib/pre-trade-check";
import { addressFlags, flagLabel } from "@/lib/recipient-check";
import { explainText, txExplain } from "@/lib/tx-explain";
import { esc } from "@/lib/telegram/bot";

const ADDR_RE = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
const HASH_RE = /0x[a-fA-F0-9]{64}(?![a-fA-F0-9])/;
const CHAIN_NAME: Record<TxChain, string> = { base: "Base 8453", robinhood: "Robinhood Chain 4663" };
const ICON = { PASS: "🟢", WARN: "🟡", BLOCK: "🔴", INFO: "ℹ️" } as const;

/** Pure: the first address / hash in a command, or in the message it replies to. */
export function findAddress(...texts: (string | undefined)[]): string | null {
  for (const t of texts) { const m = t?.match(ADDR_RE); if (m) return m[0]; }
  return null;
}
export function findHash(...texts: (string | undefined)[]): string | null {
  for (const t of texts) { const m = t?.match(HASH_RE); if (m) return m[0]; }
  return null;
}
/** Pure: an explicit chain word in the command, else null. */
export function chainWord(text: string): TxChain | null {
  const t = text.toLowerCase();
  if (/\b(rh|robinhood|4663)\b/.test(t)) return "robinhood";
  if (/\b(base|8453)\b/.test(t)) return "base";
  return null;
}

async function hasCode(chain: TxChain, a: string): Promise<boolean | null> {
  try { const c = await clientFor(chain).getCode({ address: a as `0x${string}` }); return !!c && c !== "0x"; } catch { return null; }
}

const EXPLORER: Record<TxChain, string> = { base: "https://base.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com" };
async function explorerScam(chain: TxChain, a: string): Promise<boolean> {
  try {
    const r = await fetch(`${EXPLORER[chain]}/api/v2/addresses/${a}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)" }, signal: AbortSignal.timeout(5_000) });
    return r.ok ? (await r.json() as { is_scam?: boolean }).is_scam === true : false;
  } catch { return false; }
}

export async function checkReply(arg: string, replied?: string): Promise<string> {
  const addr = findAddress(arg, replied);
  if (!addr) return `Send <code>/check 0x…</code> with a token or wallet address, or reply <code>/check</code> to a message that contains one. Add <code>rh</code> for Robinhood Chain.`;
  const asked = chainWord(arg);
  let chain: TxChain = asked ?? "base";
  let code: boolean | null;
  if (asked) code = await hasCode(asked, addr);
  else {
    const [b, r] = await Promise.all([hasCode("base", addr), hasCode("robinhood", addr)]);
    chain = !b && r ? "robinhood" : "base";
    code = chain === "base" ? b : r;
  }
  const head = `<b>${addr.slice(0, 6)}…${addr.slice(-4)}</b> · ${CHAIN_NAME[chain]}`;

  if (code) {
    const c = await preTradeCheck({ chain, kind: "swap", token: addr });
    const verdictLine = c.verdict === "PASS" ? "PASS: no blocking risk found by these checks" : c.verdict;
    const lines = [`${ICON[c.verdict]} ${head}`, `${esc(c.label)}: <b>${verdictLine}</b>`];
    for (const r of c.reasons.slice(0, 5)) lines.push(`${ICON[r.level]} ${esc(r.text)}`);
    if (c.pool) lines.push(`This is a pool. Its tokens: ${esc(c.pool.token0.symbol)} <code>${c.pool.token0.address}</code>, ${esc(c.pool.token1.symbol)} <code>${c.pool.token1.address}</code>`);
    lines.push(`<i>Contract checks: impersonation, measured sell tax, registry and oracle where they exist. Not financial advice.</i>`);
    return lines.join("\n");
  }
  if (code === null) return `${head}\nCould not read the chain right now — try again in a moment.`;

  // A wallet: who is it known to be?
  const [flags, scam] = await Promise.all([addressFlags(chain, addr), explorerScam(chain, addr)]);
  if (!flags) return `${head}\nℹ️ A wallet, not a contract. The address-risk feed (GoPlus) did not answer, so it was not screened — that is not a pass.`;
  const verdict = flags.hard.length || scam ? "FLAGGED" : flags.soft.length || flags.unconfirmed.length ? "CAUTION" : "NO_KNOWN_FLAGS";
  const icon = verdict === "FLAGGED" ? "🔴" : verdict === "CAUTION" ? "🟡" : "⚪";
  const lines = [`${icon} ${head}`, `A wallet, not a contract: <b>${verdict}</b>`];
  if (flags.infra) lines.push(`ℹ️ ${esc(flags.infra)}.`);
  for (const f of flags.hard) lines.push(`🔴 GoPlus: ${esc(flagLabel(f))}${flags.source ? ` (${esc(flags.source)})` : ""}`);
  for (const f of flags.unconfirmed) lines.push(`🟡 GoPlus mark with no named source: ${esc(flagLabel(f))}`);
  for (const f of flags.soft) lines.push(`🟡 GoPlus: ${esc(flagLabel(f))}`);
  if (scam) lines.push(`🔴 The chain explorer marks this address as a scam.`);
  if (verdict === "NO_KNOWN_FLAGS") lines.push(`No feed names it. That is not a clean bill of health — only that nothing is known against it.`);
  return lines.join("\n");
}

export async function txReply(arg: string, replied?: string): Promise<string> {
  const hash = findHash(arg, replied);
  if (!hash) return `Send <code>/tx 0x…</code> with a transaction hash (66 characters), or reply <code>/tx</code> to a message that contains one.`;
  const x = await txExplain({ hash, chain: chainWord(arg) ?? undefined });
  return "error" in x ? esc(x.error) : explainText(x, "html");
}
