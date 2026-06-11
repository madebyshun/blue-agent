// x402/wallet-strategy-analyzer
// Wallet Strategy Analyzer — grounded in REAL Base on-chain activity: native ETH
// balance + tx count (viem RPC), ERC-20 transfer patterns (Basescan), and current
// top holdings (multicall balanceOf + DexScreener price). The LLM only decodes the
// strategy narrative on top of these live numbers — never invents balances or trades.
// Resilient: retry + graceful fallback, never 500.
// Price: $0.50

import { getWalletSnapshot, getHoldings, snapshotToPrompt, holdingsToPrompt, normalizeAddress, type Holding } from "@/lib/onchain";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.3, tokens = 1100): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; focus?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const address = body.address ?? url.searchParams.get("address") ?? "";
    const focus = body.focus ?? url.searchParams.get("focus") ?? "general";
    if (!address) return Response.json({ error: "address is required (wallet address 0x...)" }, { status: 400 });
    if (!normalizeAddress(address)) return Response.json({ error: "invalid Base address" }, { status: 400 });

    // ── Ground in real Base on-chain activity ─────────────────────────────────
    const snap = await getWalletSnapshot(address);
    const holdings: Holding[] = snap?.topTokens.length
      ? await getHoldings(address, snap.topTokens.map((t) => t.contractAddress))
      : [];
    const grounded = !!snap && (snap.txCount !== null || snap.transferCount > 0);

    const ctx = grounded
      ? `${snapshotToPrompt(snap!)}\n${holdingsToPrompt(holdings)}\nFocus: ${focus}`
      : `Wallet: ${address} — on-chain data could not be read this run. Give a clearly-labelled qualitative ESTIMATE; do not present precise behavior as measured.`;

    const system = `You are Blue Agent — wallet strategy analyzer for Base (chain 8453).
${grounded
      ? "You are given REAL on-chain metrics (ETH balance, tx count, ERC-20 transfer patterns, current priced holdings). Reference them exactly; NEVER invent balances, token amounts or trades. Decode archetype/strategy from the actual activity and holdings shown."
      : "No live data was readable — clearly frame the output as an estimate, not measured."}
Return ONLY raw JSON. No markdown.
Schema: {
  "strategy_score": <0-100>,
  "wallet_archetype": "whale|smart_money|degen|yield_farmer|builder|mixed",
  "strategy": { "primary": "<main strategy>", "timeframe": "scalp|swing|position|long_term", "risk_profile": "aggressive|moderate|conservative", "key_behaviors": ["<behavior grounded in the data>"] },
  "holdings_pattern": { "dominant_sectors": ["<sector>"], "typical_position_size": "<small|medium|large>", "entry_style": "<how they enter>" },
  "replicable_plays": ["<specific play to copy>"],
  "watch_signals": ["<on-chain signal to watch>"],
  "risk_flags": ["<risk in copying this wallet>"],
  "summary": "<2 sentences>"
}`;

    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try { result = parseJson(await llm(system, ctx)); } catch { /* retry then fallback */ }
    }
    if (!result) {
      result = {
        strategy_score: null,
        wallet_archetype: "mixed",
        strategy: { primary: "unknown", timeframe: "position", risk_profile: "moderate", key_behaviors: [] },
        holdings_pattern: { dominant_sectors: [], typical_position_size: "medium", entry_style: "unknown" },
        replicable_plays: [],
        watch_signals: ["Continued token rotation", "New large inflows"],
        risk_flags: ["Strategy synthesis briefly unavailable — re-run for detail"],
        summary: grounded
          ? "Narrative synthesis briefly unavailable — the on-chain snapshot below is real. Re-run for the full strategy read."
          : "Estimate unavailable this run; the address could not be read on-chain.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "wallet-strategy-analyzer",
      timestamp: new Date().toISOString(),
      data_source: grounded ? "Base RPC + Basescan + DexScreener (live on-chain)" : "estimate (wallet not readable on-chain)",
      address,
      focus,
      onchain: grounded
        ? {
            eth_balance: snap!.ethBalance,
            tx_count: snap!.txCount,
            erc20_transfers_sample: snap!.transferCount,
            distinct_tokens: snap!.distinctTokens,
            last_activity_days: snap!.lastActivityDays,
            holdings: holdings.map((h) => ({ symbol: h.symbol, balance: h.balance, price_usd: h.priceUsd, value_usd: h.valueUsd, allocation_pct: h.allocationPct, contract: h.contractAddress })),
          }
        : null,
      ...result,
    });
  } catch (e) {
    return Response.json({ error: "Wallet strategy analyzer failed", message: (e as Error).message }, { status: 500 });
  }
}
