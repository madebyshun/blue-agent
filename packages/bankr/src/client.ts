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

  const data = await response.json();
  if (data.content && Array.isArray(data.content)) return data.content[0].text;
  if (data.text) return data.text;
  throw new Error("Invalid response format from Bankr LLM");
}

export function extractJsonObject(text: string): any {
  let raw = text.trim();
  // Strip markdown code fences
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

  // Try direct parse first
  try { return JSON.parse(raw); } catch {}

  // State-machine pass: fix control chars AND unescaped quotes inside strings
  // Strategy: when inString and we see ", peek ahead to decide if it closes the string
  // A closing " is followed by optional whitespace then one of: , } ] :
  // An unescaped inner " is followed by anything else (word chars, spaces mid-sentence)
  let cleaned = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { cleaned += ch; escaped = false; continue; }
    if (ch === "\\") { cleaned += ch; escaped = true; continue; }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        cleaned += ch;
        continue;
      }
      // Peek ahead: skip whitespace and check next meaningful char
      let j = i + 1;
      while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
      const next = raw[j] ?? "";
      if (next === "," || next === "}" || next === "]" || next === "\n" || next === "\r" || next === "") {
        // Looks like a legitimate closing quote
        inString = false;
        cleaned += ch;
      } else {
        // Unescaped quote inside string — escape it
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

  // Last resort: strip all control characters and retry
  const stripped = raw.replace(/[\x00-\x1F\x7F]/g, " ");
  return JSON.parse(stripped);
}
