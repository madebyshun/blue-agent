// x402/token-pick-signal
// One actionable token pick chosen from REAL Base pools (GeckoTerminal trending +
// new). The candidate set, prices, %-moves, volume and liquidity are all live;
// the LLM only picks one and writes the thesis. It cannot pick a token that
// isn't in the live list, so no invented tickers.
// Price: $0.20

import { getBaseTrending, getBaseNewPools, poolsToPrompt, type Pool } from "@/lib/market-data";

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 800,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { min_mcap?: number; context?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const minMcap = body.min_mcap ?? Number(url.searchParams.get("min_mcap") ?? "0");
    const context = body.context ?? url.searchParams.get("context") ?? "";

    const [trending, fresh] = await Promise.all([getBaseTrending(15), getBaseNewPools(10)]);
    const candidates: Pool[] = [...trending, ...fresh]
      .filter((p) => p.baseSymbol && (minMcap ? (p.marketCap ?? 0) >= minMcap : true));

    if (!candidates.length) {
      return Response.json(
        { error: "Live Base pool data is unavailable right now. Retry shortly." },
        { status: 503 }
      );
    }

    const validSymbols = Array.from(new Set(candidates.map((p) => p.baseSymbol)));
    const realContext = `Live Base candidates (GeckoTerminal — trending + newly active):\n${poolsToPrompt(candidates)}${context ? `\n\nUser focus: ${context}` : ""}`;

    const synthesis = await callBankrLLM({
      system: `You are Blue Agent — token signal for Base. You are given a REAL list of live Base tokens with real prices, %-moves, volume and liquidity.
Rules:
- Your pick MUST be one of: ${validSymbols.join(", ")}. Never invent a ticker. "Base" is the chain, not a token.
- Anchor entry to the real current price. Quote real %-moves only.
- If nothing is compelling, set blue_verdict to "NO_PICK" and no_pick to true.
Return ONLY raw JSON. No markdown.
Schema: {
  "no_pick": <boolean>,
  "pick": {"token":"<symbol from list or null>","price":"<real current price>","change_24h":"<real %>","thesis":"<1 sentence>","entry":"<level vs current price>","kill_criterion":"<1 sentence>","sizing":"small|medium|large|null","horizon":"<hours/days/weeks or null>"},
  "near_misses": ["<symbol: reason>"],
  "risk_flags": ["<flag>"],
  "blue_verdict": "BUY|WATCH|SKIP|NO_PICK",
  "confidence": <0-100>,
  "note": "<1 sentence context>"
}`,
      messages: [{ role: "user", content: realContext }],
      temperature: 0.35,
      maxTokens: 800,
    });

    let result = extractJsonObject(synthesis);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({
      tool: "token-pick-signal",
      timestamp: new Date().toISOString(),
      chain: "base",
      data_source: "GeckoTerminal (live Base pools)",
      candidates_scanned: candidates.length,
      ...result,
    });
  } catch (error) {
    console.error("[TokenPickSignal]", error);
    return Response.json({ error: "Token pick signal failed", message: (error as Error).message }, { status: 500 });
  }
}
