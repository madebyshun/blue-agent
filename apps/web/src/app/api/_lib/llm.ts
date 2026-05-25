// Shared Bankr LLM client for Next.js API routes
// Uses BANKR_API_KEY from Vercel env vars

export type BankrMessage = { role: string; content: string };

export async function callBankrLLM(opts: {
  model?: string;
  system: string;
  messages: BankrMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Force JSON output via assistant prefill — auto-enabled when system contains "Return ONLY raw JSON" */
  jsonMode?: boolean;
}): Promise<string> {
  // Auto-enable JSON prefill: inject `{"` as the start of the assistant turn so the
  // model is forced to complete a JSON object (Anthropic assistant-prefill technique).
  const wantsJson = opts.jsonMode ?? opts.system.includes("Return ONLY raw JSON");
  const messages: BankrMessage[] = wantsJson
    ? [...opts.messages, { role: "assistant", content: "{" }]
    : opts.messages;

  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  let text = "";
  if (d.content?.length) text = d.content[0].text;
  else if (d.text) text = d.text;
  else throw new Error("Invalid Bankr LLM response");
  // Re-attach the prefill character we injected so extractJsonObject gets complete JSON
  return wantsJson ? "{" + text : text;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

export async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const skillPrompt = await res.text();
    const today = new Date().toISOString().split("T")[0];
    const varLine = varInput ? `\nFocus on: ${varInput}` : "";
    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Aeon — autonomous intelligence agent. Synthesize from training knowledge. Be specific, data-driven. Today is ${today}.`,
      messages: [{ role: "user", content: `Follow this skill template. Generate from training knowledge — be concrete.\n\nSkill:\n${skillPrompt}${varLine}\n\nReturn only the skill output.` }],
      temperature: 0.2,
      maxTokens: 1200,
    });
  } catch { return null; }
}
