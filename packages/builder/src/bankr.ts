/**
 * Lightweight Bankr LLM caller for builder utility commands.
 * Discovery/analytics commands use this directly — they don't need
 * the grounding system that core workflow commands use.
 */

export async function callBankr(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error(
      "BANKR_API_KEY is not set.\n" +
      "  Export it: export BANKR_API_KEY=<your-key>\n" +
      "  Check setup: blue doctor"
    );
  }

  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      system,
      messages: [{ role: "user", content: user }],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1500,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bankr LLM error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ text: string }>; text?: string };
  if (data.content?.[0]?.text) return data.content[0].text;
  if (data.text) return data.text;
  throw new Error("Invalid response from Bankr LLM");
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  const aStart = text.indexOf("[");
  const aEnd   = text.lastIndexOf("]");
  if (aStart >= 0 && aEnd > aStart) return JSON.parse(text.slice(aStart, aEnd + 1));
  throw new Error("No JSON found in LLM response");
}
