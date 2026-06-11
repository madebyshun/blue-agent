// x402/token-momentum-scanner
// Momentum scan over REAL Base pools (GeckoTerminal trending + new). Candidates,
// prices, %-changes and volume are live — the LLM only scores/annotates them and
// anchors entry/target to the real current price. No invented tickers.
// Price: $0.25

import { getBaseTrending, getBaseNewPools, poolsToPrompt, type Pool } from "@/lib/market-data";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.3, tokens = 1100): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
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
    let body: { min_mcap?: number } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const minMcap = body.min_mcap ?? Number(url.searchParams.get("min_mcap") ?? 0);

    const [trending, fresh] = await Promise.all([getBaseTrending(15), getBaseNewPools(10)]);
    const candidates: Pool[] = [...trending, ...fresh]
      .filter((p) => p.baseSymbol && (minMcap ? (p.marketCap ?? 0) >= minMcap : true));

    if (!candidates.length) {
      return Response.json(
        { error: "Live Base pool data is unavailable right now. Retry shortly." },
        { status: 503 }
      );
    }

    const realContext = `Live Base pools (GeckoTerminal — trending + newly active):\n${poolsToPrompt(candidates)}`;
    const validSymbols = Array.from(new Set(candidates.map((p) => p.baseSymbol)));

    const resultRaw = await llm(
      `You are Blue Agent — momentum scanner for Base chain tokens. You are given REAL live pools with real prices, %-changes, volume and liquidity.
Rules:
- Use ONLY tokens from this list: ${validSymbols.join(", ")}. Never invent a ticker. "Base" is the chain, not a token.
- For entry_zone / target, anchor to the REAL current price shown for that token.
- momentum_score / stage / catalyst are your analysis; prices and %-moves must match the data.
Return ONLY raw JSON. No markdown.
Schema: {
  "scan_score": <0-100>,
  "market_phase": "accumulation|markup|distribution|markdown",
  "momentum_plays": [
    {"token":"<symbol from list>","current_price":"<real price>","change_24h":"<real %>","momentum_score":<0-100>,"stage":"early|mid|late","catalyst":"<what's driving it>","entry_zone":"<level vs current price>","target":"<price or %>","invalidation":"<when thesis is wrong>"}
  ],
  "avoid": ["<symbol: reason>"],
  "best_setup": "<token with best risk/reward>",
  "summary": "<2 sentences>"
}`,
      realContext,
      0.3,
      1100
    );

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({
      tool: "token-momentum-scanner",
      timestamp: new Date().toISOString(),
      chain: "base",
      data_source: "GeckoTerminal (live Base pools)",
      candidates_scanned: candidates.length,
      ...result,
    });
  } catch (e) {
    return Response.json({ error: "Token momentum scanner failed", message: (e as Error).message }, { status: 500 });
  }
}
