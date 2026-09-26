// x402/rh-token-scan (L4) — owner-power scan for a Virtuals AgentToken on
// Robinhood Chain 4663.
// Price: free. Same reasoning as `rh-rwa-verify`: charging for a safety check
// is charging people not to run it.
//
// ── Why this exists ────────────────────────────────────────────────────────
// MEASURED 2026-09-26 over the 18 tools on /api/mcp: a $BLUEAGENT holder asking
// "is this token safe?" could not be answered by anything we ship. `hub_honeypot`
// reads Base 8453 only, and $BLUEAGENT (`0x765eecec…27b3`) is an AgentTokenV4 on
// RH 4663 — so the project's own token was the one token the project could not
// inspect. That is not a gap in coverage, it is the demo failing.
//
// ── What it answers, and what it does not ──────────────────────────────────
// It answers ONE question: what can the owner still do to this token after
// launch. Tax rates, who receives the tax, the blacklist lever, the bot window,
// whether ownership is renounced, whether a handover is queued.
//
// It does NOT answer "will this go up", and it does NOT price liquidity —
// `rh-stock-liquidity` and `hub_liquidity_depth` already do that, and adding a
// GeckoTerminal call here would spend the shared per-IP budget (the P0 GT 429
// lesson) on a number another tool already serves.
//
// NO LLM ANYWHERE IN THIS FILE. Every field is an `eth_call` result and every
// flag is derived in code — CLAUDE.md's rule for output a reader will act on.
// There is no prose for a model to write here that would not be a worse version
// of the numbers themselves.
//
// ── The zero trap ──────────────────────────────────────────────────────────
// Three fields on this template have a meaningful zero and all three are the
// REASSURING value: `owner() == 0x0` is renounced, `pendingOwner() == 0x0` is no
// takeover queued, `botProtectionDurationInSeconds() == 0` is no restriction. So
// a failed read that degrades to `0` does not lose information, it fabricates
// the calmest possible answer. `lib/agent-token.ts` keeps `null` and `0` apart,
// and `unread[]` below names every field that came back unread so "no flags"
// can never be mistaken for "nothing wrong".
import {
  agentTokenFlags,
  agentTokenUnread,
  makeAgentTokenProbe,
  readAgentToken,
  ZERO_ADDRESS,
  type AgentTokenRead,
} from "@/lib/agent-token";
import { TX_CHAINS } from "@/lib/tx-chains";

const RH = TX_CHAINS.robinhood;
const probe = makeAgentTokenProbe("robinhood");

/** Deterministic one-liner, assembled in code from what was measured. Ordered
 *  by what a holder acts on first: can I be blocked, can the tax change. */
function summarise(r: AgentTokenRead, flags: string[], unread: string[]): string {
  if (r.template === null) {
    // No symbol AND no owner means not one selector answered — an EOA, a wrong
    // chain, or an RPC that refused us. Separated from "answered, but is not
    // this template" because a reader acts on them differently.
    return r.symbol === null && r.owner === null
      ? `Nothing answered at this address on ${RH.label} ${RH.chainId}. Nothing was read, so nothing is cleared — check the address is a contract on 4663 and not on Base 8453.`
      : `This contract does not implement the Virtuals AgentToken tax selectors on ${RH.label} ${RH.chainId}. Its owner powers are UNREAD, not absent.`;
  }
  const parts: string[] = [
    `${r.template} on ${RH.label} ${RH.chainId}.`,
    r.buy_tax_pct && r.sell_tax_pct ? `Buy ${r.buy_tax_pct} / sell ${r.sell_tax_pct}.` : "",
    r.owner === ZERO_ADDRESS
      ? "Ownership is renounced — the levers below cannot be pulled."
      : flags.includes("OWNER_NOT_RENOUNCED")
        ? "Ownership is NOT renounced — the owner can still change the tax rate."
        : "",
    flags.includes("BLACKLIST_CAPABLE")
      ? "The contract exposes blacklists(address): individual wallets can be blocked from selling."
      : "",
    flags.includes("OWNERSHIP_TRANSFER_PENDING") ? "An ownership handover is queued and not yet accepted." : "",
    unread.length ? `Unread: ${unread.join(", ")}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string; address?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const contract = (
      body.contract ?? body.address
      ?? url.searchParams.get("contract") ?? url.searchParams.get("address") ?? ""
    ).trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return Response.json(
        { error: "Provide `contract` — a 42-char hex address on Robinhood Chain 4663" },
        { status: 400 },
      );
    }

    const read = await readAgentToken(contract, probe);
    const flags = agentTokenFlags(read);
    const unread = agentTokenUnread(read);

    return Response.json({
      tool: "rh-token-scan",
      // Chain first and non-negotiable — CLAUDE.md hard rule 1. NVDA/META/GOOGL
      // exist on both live venues as DIFFERENT tokens, so an address without its
      // chain is unreadable, and a Basescan link for a 4663 address resolves to
      // nothing.
      chain: "robinhood",
      chain_id: RH.chainId,
      contract,
      explorer: `${RH.explorer}/address/${contract}`,
      ...read,
      flags,
      // Named explicitly so an empty `flags` cannot read as a clean bill of
      // health when the truth is that nothing was measured.
      unread,
      summary: summarise(read, flags, unread),
      data_sources: [`${RH.label} ${RH.chainId} eth_call — AgentToken/AgentTokenV4 selectors`],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: `rh-token-scan failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
