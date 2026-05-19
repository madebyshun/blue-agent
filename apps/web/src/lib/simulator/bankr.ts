// Inlined Bankr LLM client — avoids workspace package resolution on Vercel

export type BankrLLMMessage = { role: string; content: string };

export async function callBankrLLM(options: {
  model?: string;
  system: string;
  messages: BankrLLMMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const response = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.BANKR_API_KEY || "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options.model ?? "claude-haiku-4-5",
      system: options.system,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bankr LLM error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { content?: { text: string }[]; text?: string };
  if (data.content && Array.isArray(data.content)) return data.content[0].text;
  if (data.text) return data.text;
  throw new Error("Invalid response format from Bankr LLM");
}

export function extractJsonObject(text: string): unknown {
  let raw = text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

  try { return JSON.parse(raw); } catch {}

  let cleaned = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { cleaned += ch; escaped = false; continue; }
    if (ch === "\\") { cleaned += ch; escaped = true; continue; }
    if (ch === '"') {
      if (!inString) { inString = true; cleaned += ch; continue; }
      let j = i + 1;
      while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
      const next = raw[j] ?? "";
      if (next === "," || next === "}" || next === "]" || next === "\n" || next === "\r" || next === "") {
        inString = false; cleaned += ch;
      } else {
        cleaned += '\\"';
      }
      continue;
    }
    if (inString) {
      if (ch === "\n") { cleaned += "\\n"; continue; }
      if (ch === "\r") { cleaned += "\\r"; continue; }
      if (ch === "\t") { cleaned += "\\t"; continue; }
    }
    cleaned += ch;
  }
  try { return JSON.parse(cleaned); } catch {}

  const stripped = raw.replace(/[\x00-\x1F\x7F]/g, " ");
  return JSON.parse(stripped);
}
