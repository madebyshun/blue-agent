// x402/base-grant-finder/index.ts
// Base Grant Finder — Aeon deep-research + MiroShark analyst + Blue raise
// Price: $0.35

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
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
async function aeon(skill: string, focus = ""): Promise<string | null> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const p = await r.text();
    return await llm(`You are Aeon. Synthesize from training knowledge. Today: ${new Date().toISOString().split("T")[0]}.`,
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; description?: string; stage?: string; sector?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const project = body.project ?? url.searchParams.get("project") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    const stage = body.stage ?? url.searchParams.get("stage") ?? "early";
    const sector = body.sector ?? url.searchParams.get("sector") ?? "";
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    const researchRaw = await aeon("deep-research", `Base ecosystem grants and funding programs: Coinbase Grants, Base Builder grants, Optimism RetroPGF, ecosystem funds. Requirements, amounts, application tips for ${sector || "general"} projects at ${stage} stage.`);

    const msRaw = await llm(`You are MiroShark analyst persona — grant and funding specialist.
Match this project to grant opportunities.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "grant_fit": "excellent|good|fair|poor",
  "best_match": "<grant program name>",
  "estimated_amount": "<USD range>",
  "success_probability": <0-100>,
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nResearch: ${researchRaw ?? "Base grants"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — grant finder for Base ecosystem builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "match_score": <0-100>,
  "grants": [
    {
      "name": "<grant program>",
      "org": "<Coinbase|Optimism|other>",
      "amount": "<USD range>",
      "fit": "perfect|good|stretch",
      "requirements": ["<key requirement>"],
      "apply_by": "<deadline or ongoing>",
      "application_tip": "<1 sentence on how to win>"
    }
  ],
  "strongest_narrative": "<the angle that wins grants>",
  "application_priorities": ["<what to emphasize>"],
  "missing_credentials": ["<what to build before applying>"],
  "estimated_total": "<total grantable amount>",
  "summary": "<2 sentences>"
}`,
      `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nResearch: ${researchRaw ?? "Base ecosystem"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1200);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "base-grant-finder", timestamp: new Date().toISOString(), project, stage, sector, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Base grant finder failed", message: (e as Error).message }, { status: 500 });
  }
}
