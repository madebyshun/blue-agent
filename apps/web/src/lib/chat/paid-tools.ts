/**
 * Chat tools that cost credits on top of the message (ShunTr 2026-10-21,
 * option (a)): only the ones that run a model call of their own, so each run
 * spends real inference beyond the chat model. Every data-only tool is free
 * in chat (lib/credit-pricing.ts CREDIT_PRICE_OVERRIDE): one question, one
 * price.
 *
 * A paid tool never runs on the model's say-so alone. The first call answers
 * with its price and parks the call here; the user's own "yes" (matched in
 * code, lib/chat/confirm.ts isConfirmWord) runs exactly that call. Nothing is
 * charged until then.
 */
import { kvDel, kvGet, kvSet } from "@/lib/kv";

export const PAID_CONFIRM_TOOLS: ReadonlySet<string> = new Set([
  "hub_deep_analysis",
  "hub_risk_gate",
  "hub_contract_trust",
  "hub_dex_flow",
  "hub_honeypot",
  "blue_compose",
]);

const LABEL: Record<string, string> = {
  hub_deep_analysis: "A deep analysis",
  hub_risk_gate: "A transaction risk review",
  hub_contract_trust: "A contract trust review",
  hub_dex_flow: "A DEX flow read",
  hub_honeypot: "A honeypot review",
  blue_compose: "A composed tool run",
};

export const PAID_PENDING_MS = 10 * 60_000;

export interface PaidPending { tool: string; args: Record<string, unknown>; at: number }

const key = (wallet: string) => `chat:paid-pending:${wallet.toLowerCase()}`;

export async function parkPaidCall(wallet: string, p: PaidPending): Promise<void> {
  await kvSet(key(wallet), p, Math.ceil(PAID_PENDING_MS / 1000));
}

/** The parked call, if it is still fresh — and it is removed either way, so a
 *  "yes" runs it at most once. */
export async function takePaidCall(wallet: string, now = Date.now()): Promise<PaidPending | null> {
  const p = await kvGet<PaidPending>(key(wallet)).catch(() => null);
  if (!p) return null;
  await kvDel(key(wallet));
  return isFresh(p, now) ? p : null;
}

/** Pure. */
export function isFresh(p: PaidPending, now: number): boolean {
  return PAID_CONFIRM_TOOLS.has(p.tool) && now - p.at >= 0 && now - p.at <= PAID_PENDING_MS;
}

/** Pure: the price, said before anything runs. */
export function paidPrompt(tool: string, cost: number, balance: number | null): string {
  const what = LABEL[tool] ?? "This answer";
  const have = balance == null ? "" : balance >= cost ? ` You have ${balance.toLocaleString("en-US")}.` : ` You have ${balance.toLocaleString("en-US")}, so top up first.`;
  return `${what} costs ${cost.toLocaleString("en-US")} credits on top of this message.${have} Reply **yes** to run it.`;
}
