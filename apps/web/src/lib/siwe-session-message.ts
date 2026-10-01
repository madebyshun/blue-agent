/**
 * The exact bytes signed for a Blue Agent sign-in session.
 *
 * This lives in its own dependency-free module because BOTH sides need it: the
 * browser builds it to sign, the route builds it to verify, and if the two ever
 * drift by one character every sign-in fails with "signature does not match" —
 * an error that points at the wallet rather than at the real cause.
 *
 * That drift is not hypothetical here. `hub/_components/SubmitTool.tsx` keeps
 * its own hand-copied duplicates of `hub-registry.ts`'s SIWE builders
 * (`buildHostedSiwe` / `buildExternalSiwe`) — two copies of the same string,
 * maintained by hand. This module is the fix for that pattern, not another
 * instance of it: there is exactly one definition and both callers import it.
 *
 * Keep this file free of imports. The moment it pulls in `next/server`, `viem`,
 * or anything else server-side, the client can no longer import it and someone
 * will "solve" that by pasting a copy.
 *
 * The statement must say what the signature ENABLES, not what it was first
 * built for. It used to read "Sign in to sync your Blue Chat workspace across
 * devices" — true while the session's only use was sync. Since 2026-09-30 the
 * same session is the proof every charging or private route asks for
 * (lib/acting-wallet.ts): it lets Blue Agent debit this wallet's prepaid
 * credits for chat and tool runs, run its scheduled tasks, claim its free
 * credits, write its Hood alerts and Telegram link, read its private usage
 * history and get it sponsored gas — for 30 days (SESSION_TTL_S in
 * lib/session.ts). The prompt now appears on Send, so a user who had turned
 * sync OFF was being asked to sign "to sync" in order to spend. If the session
 * grows a new power, this text changes in the same commit. Credits are an
 * off-chain ledger, which is why "no funds moved on-chain" stays true.
 */

/**
 * @param domain  request host — `window.location.host` on the client, the
 *                `Host` header on the server. Binding the message to the host
 *                keeps a signature obtained on a preview deploy from being
 *                replayed against production.
 * @param address the signer, lowercased in the message for stability.
 * @param nonce   64 hex chars, issued by `GET /api/auth/nonce`. Never
 *                client-generated — that is the whole point (see lib/session.ts).
 */
export function sessionSiweMessage(domain: string, address: string, nonce: string): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address.toLowerCase(),
    ``,
    `Sign in to Blue Agent with this wallet for 30 days.`,
    ``,
    `While signed in, Blue Agent may spend this wallet's prepaid credits on`,
    `chat and tool runs, run its scheduled tasks, manage its alerts, and sync`,
    `its Blue Chat workspace across devices.`,
    ``,
    `This signature proves you control this wallet. It does NOT approve a`,
    `transaction, move any funds on-chain, or grant any token allowance.`,
    ``,
    `URI: https://${domain}`,
    `Version: 1`,
    `Chain ID: 8453`,
    `Nonce: ${nonce}`,
  ].join("\n");
}
