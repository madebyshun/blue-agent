// x402/pre-trade-check — PASS / WARN / BLOCK before an agent signs.
// Price: free (safety checks should never be gated — same rule as rh-rwa-verify)
//
// The check Blue Chat's swap/send/bridge cards gate signing on, and the one
// `blue_swap_tx` / `blue_send_tx` / `blue_bridge_tx` already attach to the tx
// they build. Until 2026-10-04 it was reachable only THROUGH those builders, so
// an agent signing with its own wallet (a Coinbase Agentic Wallet, an ACP
// buyer, anything that routes elsewhere) could not ask for it on its own. This
// is that door: same lib/pre-trade-check.ts, no second implementation.
//
// What it answers that a DEX API does not: is this address a real token or a
// pool (read off the contract), an impostor of a canonical stock token (Base
// B20 desk / Robinhood registry), a honeypot or a taxed token (tax read by
// eth_call), and is the stock's DEX price adrift from its oracle. The verdict is
// picked in code from machine-readable reason codes; no LLM is involved.
//
// BLOCK only on evidence. A tax we could not read is a WARN that says so, never
// a pass and never a block.

import { preTradeCheck } from "@/lib/pre-trade-check";
import { parseTxChain } from "@/lib/tx-chains";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { chain?: unknown; kind?: unknown; token?: unknown; bridge_cost_percent?: unknown } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const chain = parseTxChain(body.chain ?? url.searchParams.get("chain") ?? "base");
    const kindRaw = String(body.kind ?? url.searchParams.get("kind") ?? "swap");
    const kind = kindRaw === "send" || kindRaw === "bridge" || kindRaw === "swap" ? kindRaw : null;
    const token = String(body.token ?? url.searchParams.get("token") ?? "").trim();
    const costRaw = body.bridge_cost_percent ?? url.searchParams.get("bridge_cost_percent");
    const bridgeCostPercent = costRaw === null || costRaw === undefined || costRaw === "" ? null : Number(costRaw);

    if (!chain) return Response.json({ error: "chain must be base (8453) or robinhood (4663)" }, { status: 400 });
    if (!kind) return Response.json({ error: "kind must be swap, send or bridge" }, { status: 400 });
    if (!token) return Response.json({ error: "Provide `token` — the 0x address being bought (swap) or moved (send/bridge), or ETH" }, { status: 400 });

    const check = await preTradeCheck({
      chain,
      kind,
      token,
      bridgeCostPercent: bridgeCostPercent !== null && Number.isFinite(bridgeCostPercent) ? bridgeCostPercent : null,
    });

    return Response.json({
      tool: "pre-trade-check",
      chain,
      chain_id: chain === "robinhood" ? 4663 : 8453,
      kind,
      token,
      ...check,
      how_to_use: "BLOCK: do not sign. WARN: sign only after showing the reasons to the user. PASS: no evidence of harm was found — not a recommendation to buy.",
      data_sources: ["Base / Robinhood Chain RPC (eth_getCode, eth_call)", "Blue Hood Base desk + Robinhood RWA registry", "Chainlink oracle"],
    });
  } catch (e) {
    return Response.json({ error: "pre-trade-check failed", message: (e as Error).message }, { status: 502 });
  }
}
