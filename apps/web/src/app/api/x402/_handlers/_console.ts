/**
 * Shared helper for the 5 paid Console commands (idea / build / audit / ship / raise).
 * Each command is a thin handler that calls runConsoleCommand with its system
 * prompt; payment is handled upstream by /api/x402/[tool] (verify → run → settle).
 */
import { CONSOLE_SYSTEMS, type ConsoleCommand } from "@/lib/console-systems";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

export async function runConsoleCommand(
  command: ConsoleCommand,
  prompt: string
): Promise<Response> {
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "BANKR_API_KEY not configured" }, { status: 500 });
  }
  try {
    const res = await fetch(BANKR_LLM, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        system: CONSOLE_SYSTEMS[command],
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: `Bankr LLM ${res.status}`, detail: errText.slice(0, 200) },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { content?: { text: string }[] };
    const result = data.content?.[0]?.text ?? "";
    if (!result) {
      return Response.json({ error: "Empty LLM response" }, { status: 502 });
    }
    return Response.json({
      command,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "Console command failed", message: (e as Error).message },
      { status: 502 }
    );
  }
}
