// x402/repo-health/index.ts
// Repo Health Check — Aeon github-monitor + Blue audit + MiroShark analyst
// Price: $0.35
// Fully self-contained

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
    let body: { repo?: string; description?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const repo = body.repo ?? url.searchParams.get("repo") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    if (!repo) return Response.json({ error: "repo is required (e.g. 'user/repo' or full GitHub URL)" }, { status: 400 });

    const [repoMonitor, auditRaw] = await Promise.all([
      aeon("github-monitor", `${repo}: commit velocity, issues, docs quality, test coverage signals, last activity`),
      llm(`You are Blue Agent running 'blue audit'. Assess code quality and security signals for a Base project repo.
CRITICAL: Return ONLY raw JSON.
Schema: {"code_quality_score":<0-10>,"security_concerns":["<concern or 'none identified'>"],"missing_basics":["<e.g. no tests, no .env.example>"],"positive_signals":["<good practice found>"],"audit_note":"<1 sentence>"}`,
        `Repo: ${repo}\nDescription: ${description || "Base project"}`, 0.3, 600),
    ]);

    const audit = parseJson(auditRaw) ?? {};

    const msRaw = await llm(`You are MiroShark analyst persona.
Review repo health signals from a technical investor perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {"health_rating":"excellent|good|fair|poor","shipping_velocity":"high|medium|low|stalled","trust_score":<0-10>,"red_flags":["<flag>"],"green_flags":["<flag>"],"analyst_note":"<1 sentence>"}`,
      `Repo: ${repo}\nMonitor: ${repoMonitor ?? "Base project repo"}\nAudit: ${JSON.stringify(audit)}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — repo health report engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "health_score": <0-100>,
  "grade": "A|B|C|D|F",
  "status": "healthy|needs_attention|at_risk|stalled",
  "dimensions": {
    "activity": <0-10>,
    "code_quality": <0-10>,
    "documentation": <0-10>,
    "security": <0-10>,
    "community": <0-10>
  },
  "critical_issues": ["<issue>"],
  "quick_wins": ["<easy fix>"],
  "summary": "<2 sentences>"
}`,
      `Repo: ${repo}\nMonitor: ${repoMonitor ?? "Base project"}\nAudit: ${JSON.stringify(audit)}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 900);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "repo-health", timestamp: new Date().toISOString(), repo, audit, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Repo health check failed", message: (e as Error).message }, { status: 500 });
  }
}
