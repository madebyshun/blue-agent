// x402/blue-simulate
// Blue Simulate — scenario modeling for a Base project decision (tokenomics,
// fee model, growth, runway). Returns bull/base/bear projections with
// assumptions + sensitivities. Resilient: retry + graceful fallback.
// Price: $0.15

import { NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1300): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system: `${NO_FABRICATION_RULE}\n\n${system}`, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = (await r.json()) as { content?: { text: string }[] };
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
    let body: { scenario?: string; params?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const scenario = (body.scenario ?? url.searchParams.get("scenario") ?? "").trim();
    const params   = (body.params ?? url.searchParams.get("params") ?? "").trim();
    if (!scenario) {
      return Response.json({ error: "scenario is required (the decision/model to simulate — e.g. tokenomics, fee model, growth)." }, { status: 400 });
    }

    const system = `You are Blue Simulate — model bull/base/bear scenarios for a Base project decision.
Be explicit about assumptions and label every projected number as an ESTIMATE (these are modeled, not live data). Keep math internally consistent. Be Base-native where relevant.
Return ONLY raw JSON. No markdown.
Schema: {
  "key_assumptions": ["<assumption + value used>"],
  "scenarios": {
    "bull": {"summary":"<1-2 sentences>","projected_metrics":["<metric: estimate>"]},
    "base": {"summary":"<1-2 sentences>","projected_metrics":["<metric: estimate>"]},
    "bear": {"summary":"<1-2 sentences>","projected_metrics":["<metric: estimate>"]}
  },
  "sensitivities": ["<which input moves the outcome most>"],
  "recommendation": "<what to do given the spread>"
}`;
    const user = `Simulate: ${scenario}${params ? `\nParameters: ${params}` : ""}`;

    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try { result = parseJson(await llm(system, user)); } catch { /* retry then fallback */ }
    }
    if (!result) {
      result = {
        key_assumptions: ["Live modeling was briefly unavailable — re-run for full projections."],
        scenarios: {
          bull: { summary: "Upside case.", projected_metrics: [] },
          base: { summary: "Expected case.", projected_metrics: [] },
          bear: { summary: "Downside case.", projected_metrics: [] },
        },
        sensitivities: [],
        recommendation: "Re-run the simulation; the synthesis step failed this round.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "blue-simulate",
      timestamp: new Date().toISOString(),
      disclaimer: "Projections are modeled ESTIMATES, not live or guaranteed data.",
      scenario,
      params: params || null,
      ...result,
    });
  } catch (e) {
    return Response.json({ error: "Blue simulate failed", message: (e as Error).message }, { status: 500 });
  }
}
