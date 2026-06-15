// x402/base-grant-finder/index.ts
// Base Grant Finder — Aeon deep-research + MiroShark analyst + Blue raise
// Price: $0.35

type Msg = { role: string; content: string };
import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";

async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

// Real, stable Base funding ladder — used as a graceful fallback when the live
// LLM match fails, so a paid call never 500s. Amounts kept deliberately vague
// (we don't fabricate precise figures); program names + channels are accurate.
function fallbackGrants(stage: string): Record<string, unknown> {
  return {
    match_score: 55,
    grants: [
      {
        name: "Base Builder Grants",
        org: "Coinbase / Base",
        amount: "builder-tier (varies)",
        fit: "good",
        requirements: ["Building on Base mainnet", "Working prototype or clear plan", "Active development"],
        apply_by: "Rolling",
        application_tip: "Apply via the official Base grants channel; lead with a working demo on Base.",
      },
      {
        name: "Optimism RetroPGF (Superchain)",
        org: "Optimism Collective",
        amount: "varies by round",
        fit: stage === "live" ? "good" : "stretch",
        requirements: ["Shipped product with measurable impact", "Public-good contribution to the ecosystem"],
        apply_by: "Seasonal rounds",
        application_tip: "Frame your work as public goods that improve Base / Superchain UX.",
      },
      {
        name: "Coinbase Ventures",
        org: "Coinbase",
        amount: "equity (varies)",
        fit: "stretch",
        requirements: ["Incorporated entity", "Early traction", "Clear go-to-market"],
        apply_by: "Via warm intro",
        application_tip: "Pursue after an MVP + early traction; position as consumer infra on Base.",
      },
    ],
    strongest_narrative: "Position the project as infrastructure that strengthens the Base ecosystem and drives onchain activity.",
    application_priorities: ["Ship an MVP on Base mainnet", "Show real usage / traction", "Emphasize Base-native value"],
    missing_credentials: ["Working MVP", "Early user traction"],
    estimated_total: "varies",
    summary: "Tailored live matching was briefly unavailable — this is the standard Base funding ladder. Re-run the tool for a project-specific match.",
    degraded: true,
  };
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string): Promise<string | null> {
  try {
    const fresh = await getAeonOutput(skill);
    if (fresh) return formatAeonForLLM(fresh);
  } catch {}
  return null;
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

    // Analyst pass — non-fatal: a hiccup here shouldn't sink the whole call.
    let analyst: Record<string, unknown> = {};
    try {
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
      analyst = parseJson(msRaw) ?? {};
    } catch { analyst = {}; }

    const resultSystem = `You are Blue Agent — grant finder for Base ecosystem builders.
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
}`;
    const resultUser = `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nResearch: ${researchRaw ?? "Base ecosystem"}\nAnalyst: ${JSON.stringify(analyst)}`;

    // Up to 2 attempts, then a graceful real-data fallback — never 500 on a paid call.
    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = parseJson(await llm(resultSystem, resultUser, 0.3, 1200));
      } catch { /* retry, then fall through to fallback */ }
    }
    if (!result) result = fallbackGrants(stage);

    return Response.json({ tool: "base-grant-finder", timestamp: new Date().toISOString(), project, stage, sector, analyst, ...result, disclaimer: "Grant programs are known Base/ecosystem programs from model knowledge plus AI matching — they may be out of date. Verify current status, deadlines and eligibility on each program's official channel before applying." });
  } catch (e) {
    return Response.json({ error: "Base grant finder failed", message: (e as Error).message }, { status: 500 });
  }
}
