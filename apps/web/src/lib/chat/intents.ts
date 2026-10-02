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
