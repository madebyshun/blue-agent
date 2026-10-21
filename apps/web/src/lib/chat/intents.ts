/**
 * Intent checks that FORCE a tool call in /api/chat (tool_choice), for questions
 * whose only honest answer is a read of the user's own data.
 */

/**
 * True when the last user message asks to SEE the wallet's own price alerts
 * or automations. Forces `my_alerts` for the same reason as check_wallet above.
 * MEASURED 2026-10-02 on production: "summarize my alerts" came back as prose
 * ("Looking at your memory… nothing armed right now") with no tool call at
 * all — the tool's own empty answer is a fixed line, and that line was absent.
 * A model that narrates "you have no alerts" from memory is inventing a fact
 * about the user's account. Requests to SET an alert are excluded: they need
 * set_price_alert and its arguments.
 */
export function wantsMyAlerts(messages: readonly { role: string; content: unknown }[]): boolean {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return false;
  const t = last.content.toLowerCase();
  if (t.length > 120) return false;
  if (/\b(alert me|notify me|tell me when|ping me|set (an? )?(price )?alert|create (an? )?alert|báo tôi|đặt (cảnh báo|alert))\b/.test(t)) return false;
  return /\bmy (price )?(alerts?|watch(es|list)?|automations?)\b/.test(t)
      || /\bwhat am i watching\b/.test(t)
      || /\b(list|show|summari[sz]e|check) (all )?(my )?(price )?alerts\b/.test(t)
      || /\b(cảnh báo|alert) của tôi\b/.test(t);
}

/**
 * The trade tool a message obviously asks for, or null. FORCES a real tool call
 * (tool_choice on that one function; the model still writes its arguments).
 * MEASURED 2026-10-13 in a manual test: "Swap $1 eth to usdc on Base" ran NO
 * tool, and the reply copied the previous turn's "Your Base trade card is
 * above" — a receipt for a card that did not exist. An imperative trade with a
 * number in it has exactly one honest answer: build the card (or have the card
 * say why it cannot). Questions ("should I buy…", "how do I swap…") are not
 * forced — those are asking for an explanation, not a trade.
 */
export function tradeToolFor(messages: readonly { role: string; content: unknown }[]): "prepare_swap" | "robinhood_swap" | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return null;
  const t = last.content.toLowerCase().trim();
  if (t.length > 160 || !/\d/.test(t)) return null;
  if (!/^(please\s+)?(swap|buy|sell|convert|trade)\b/.test(t)) return null;
  if (/\?$|\b(should|how|why|can i|is it|what if)\b/.test(t)) return null;
  return /\b(robinhood|rh chain|on rh|chain 4663)\b/.test(t) ? "robinhood_swap" : "prepare_swap";
}

/**
 * The ONE tool a message obviously needs, or null. Forced with tool_choice on
 * that function; the model still writes the arguments. Measured 2026-10-13 in
 * manual tests, each a wrong or missing tool:
 *   • a pasted EIP-712 payload on the Fast preset spent its whole length
 *     budget without calling hub_sign_check;
 *   • "is 0x… safe?" went to hub_risk_gate (a TRANSACTION screen), whose
 *     PROCEED on an empty call came back as "✅ Safe" — for VIRTUAL, whose
 *     pre-trade check is WARN, and for a liquidity pool;
 *   • "send 1 USDC to name.base.eth" ran no tool at all.
 */
/** "What changed in my wallet" — the brief, not the holdings list. */
const BRIEF_RE = /\b(wallet|morning|daily)\s+brief\b|\bwhat(?:'s| has| did)?\s+chang\w*\b.*\b(wallet|portfolio)\b|\b(wallet|portfolio)\b.*\bwhat(?:'s| has)?\s+chang|\bovernight\b.*\b(wallet|portfolio)\b|\b(wallet|portfolio)\b.*\bovernight\b|\banything new in my (wallet|portfolio)\b|ví.*(thay đổi|có gì mới)|(thay đổi|có gì mới).*ví|tóm tắt ví|bản tin ví/;

/** "How are my stocks" — the stock brief (desk gaps, NAV, session). */
const STOCK_BRIEF_RE = /\bstock brief\b|\bhow (are|is) my (onchain |tokeni[sz]ed )?stocks?\b|\b(onchain|tokeni[sz]ed) stocks? (today|now|brief|overview)\b|\bstock (gaps?|premium|discount)\b|\bweekend gap\b|\b(premium|discount) to nav\b|cổ phiếu onchain|cổ phiếu (của )?(mình|tôi)/;

/**
 * Which stock desk the user asked about, read from their own words (2026-10-20:
 * "stock tokens on base" answered with both chains). Exactly one chain named
 * ⇒ that chain; none or both ⇒ null (the report covers both).
 */
export function stockChainFromText(text: string): "base" | "robinhood" | null {
  const t = text.toLowerCase();
  const base = /\bbase\b|\b8453\b|coinbase|\bb20\b/.test(t);
  const rh = /\brobinhood\b|\brh\b|\b4663\b/.test(t);
  return base && !rh ? "base" : rh && !base ? "robinhood" : null;
}

export function forcedToolFor(messages: readonly { role: string; content: unknown }[]):
  "hub_sign_check" | "hub_pretrade" | "explain_tx" | "wallet_brief" | "stock_brief" | "set_price_alert" | "prepare_swap" | "robinhood_swap" | "prepare_send" | "robinhood_send" | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return null;
  const raw = last.content;
  const t = raw.toLowerCase();
  if (/"primarytype"\s*:/.test(t) && /"domain"\s*:/.test(t)) return "hub_sign_check";
  // A pasted transaction hash: 64 hex, never a 40-hex address.
  if (t.length <= 240 && /(^|[^0-9a-fx])0x[a-f0-9]{64}(?![0-9a-f])/.test(t)) return "explain_tx";
  const hasAddr = /0x[a-f0-9]{40}\b/.test(t);
  // "why is the weekend gap different?" is a question about the idea, not a
  // request for today's report (2026-10-21: it got the full brief).
  const explaining = /^(why|how does|how do|explain|what does|what is a |what's a )/.test(t.trim());
  if (!hasAddr && !explaining && t.length <= 160 && BRIEF_RE.test(t)) return "wallet_brief";
  if (!hasAddr && !explaining && t.length <= 160 && STOCK_BRIEF_RE.test(t)) return "stock_brief";
  if (hasAddr && t.length <= 200 && /\b(safe|scam|rug|honeypot|legit|risky|trust)\b|an toàn|lừa đảo/.test(t)) return "hub_pretrade";
  // An alert request must reach set_price_alert (2026-10-21: "alert me when
  // ETH on Base goes above $2,500" ran no tool and told the user to press a
  // card that did not exist).
  if (!hasAddr && t.length <= 220 && /\b(alert me|notify me|tell me when|ping me|let me know when|báo tôi|nhắc tôi)\b|^every (day|week|morning)\b.*\bif\b/.test(t)) return "set_price_alert";
  if (t.length <= 160 && /\d/.test(t) && /^(please\s+)?(send|transfer|pay)\b/.test(t.trim()) && /\bto\b/.test(t) && !/\?$/.test(t.trim())) {
    return /\b(robinhood|rh chain|on rh|chain 4663)\b/.test(t) ? "robinhood_send" : "prepare_send";
  }
  return tradeToolFor(messages);
}
