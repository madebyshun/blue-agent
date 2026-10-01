/**
 * What a finished chat turn was, decided once — pure, so it is testable
 * without React (scripts/chat-turn-outcome-test.ts).
 *
 * Three turns end with text in the assistant bubble that is NOT an answer:
 *   • walletBlocked  — a guest hit a paid tool and got the connect-wallet wall;
 *   • upstreamFailed — the gateway refused or returned nothing (#193);
 *   • authBlocked    — the server would not charge this wallet without a SIWE
 *                      session (`auth_required`). No model ran, nothing was
 *                      debited; the bubble holds the server's refusal.
 * None of them may print a charge, and none may be stored as conversation
 * memory: `recentChunks` feeds stored chunks back into later prompts as a
 * remembered "Q: … A: …", so a stored refusal reads as something the
 * assistant once answered. (Before 2026-10-01 an auth_required turn did both:
 * "⚡ 5 cr" under "nothing was charged", and the refusal in memory.)
 */
export interface TurnFlags {
  walletBlocked: boolean;
  upstreamFailed: boolean;
  authBlocked: boolean;
}

/** Did the turn produce an answer worth remembering? */
export function turnProducedAnswer(f: TurnFlags): boolean {
  return !(f.walletBlocked || f.upstreamFailed || f.authBlocked);
}

/** Credits to stamp on the turn's chip. 0 when nothing was (or stays) charged:
 *  local dev, the two refunded turns, and the auth refusal that was never
 *  debited. */
export function turnCreditsUsed(f: TurnFlags, cost: number, isUnlimited: boolean): number {
  return isUnlimited || !turnProducedAnswer(f) ? 0 : cost;
}

/** Whether the turn ran a model at all — the model label and response time
 *  under the bubble describe a run, so a turn refused before any model call
 *  gets neither. */
export function turnRanModel(f: TurnFlags): boolean {
  return !f.authBlocked;
}

/** The `balance` of an insufficient_credits event, or undefined when the
 *  server did not read one. A tool's event omits it rather than send a
 *  stand-in 0; turning that absence back into 0 printed "have 0" for a
 *  wallet that may hold most of what it needs. */
export function readNoticeBalance(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Run `fn` unless a previous call through the same `flag` is still running;
 * a call that arrives meanwhile is dropped (returns undefined). The flag is
 * set synchronously, before `fn`'s first await, which is the whole point: a
 * React `streaming` state is only visible after a re-render, and send() awaits
 * a SIWE session before it sets `streaming` — long enough for a second Enter to
 * post (and bill) the same message twice.
 */
export async function singleFlight<T>(
  flag: { current: boolean },
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (flag.current) return undefined;
  flag.current = true;
  try {
    return await fn();
  } finally {
    flag.current = false;
  }
}
