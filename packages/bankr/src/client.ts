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
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  return JSON.parse(raw);
}
