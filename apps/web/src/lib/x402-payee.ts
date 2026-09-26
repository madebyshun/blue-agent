/**
 * THE x402 payee. One constant, eleven former copies.
 *
 * Every off-chain USDC settlement on this app pays this address: the server
 * puts it in the 402 `payTo`, the browser signs `authorization.to` against it,
 * and the CDP facilitator rejects the payment if the two disagree. PR #284
 * taught that lesson with two copies. There were actually ELEVEN, and six of
 * them publish the payee to external agents:
 *
 *   signs / settles   api/_lib/x402-cdp.ts (PAY_TO) · hub/HubView.tsx
 *   quotes a price    api/tool/[toolId] · api/tool/_debug
 *   catalog default   lib/agent-tools.ts (BLUE_TREASURY)
 *   published to      /.well-known/pricing · /.well-known/openapi.json
 *   foreign agents    /.well-known/ai-plugin.json · /api/catalog
 *                     public/.well-known/agent.json · public/plugin.md
 *
 * Why that list matters more than the count: changing only the two that sign
 * is WORSE than changing none. An agent that read the published manifest signs
 * to the old address, CDP compares it against the new PAY_TO and refuses — so
 * every external x402 caller breaks while the Hub UI keeps working, which is
 * the hardest version of this bug to notice. The two static `public/` files
 * cannot import, so scripts/x402-payee-check.ts asserts them against this
 * value instead.
 *
 * NOT unified here: payments.ts TOPUP_TREASURY. Chat-credit top-ups are a
 * plain USDC transfer, not EIP-3009, and whether credit revenue shares this
 * wallet is a business decision — see that file's own comment.
 */

/**
 * CHANGING THIS ADDRESS — the whole job, in order:
 *   1. edit the line below (every TS consumer follows automatically);
 *   2. edit public/.well-known/agent.json and public/plugin.md by hand — static
 *      assets cannot import, and an indexing agent reads them before any route;
 *   3. edit the payTo paragraph in CLAUDE.md and rule 6 in AGENTS.md;
 *   4. `npx tsx scripts/x402-payee-check.ts` — it fails until 1–3 are all done,
 *      so treat a red run as the remaining checklist, not as a broken test;
 *   5. decide separately whether payments.ts TOPUP_TREASURY follows (chat
 *      credits — a business call, not a refactor).
 * Unchanged by design: the two deployed B20HUB contracts still pay the retired
 * 0xb058… wallet and have no setter. Only a redeploy moves those; see CLAUDE.md.
 */

// Base 8453. Lowercase because the wire format and every `.toLowerCase()`
// comparison downstream expect it that way; call getAddress() for display.
export const X402_PAY_TO = "0x02950ad38ada1d599375bd447e080cd404809205" as const satisfies `0x${string}`;
