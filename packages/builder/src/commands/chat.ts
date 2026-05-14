import { printError } from "../print";

// Pricing per 1M tokens (approximate Bankr rates, informational only)
const MODEL_COST_PER_1K: Record<string, { input: number; output: number; label: string }> = {
  "claude-haiku-4-5":  { input: 0.00025, output: 0.00125, label: "Haiku (fast, cheap)" },
  "claude-sonnet-4-6": { input: 0.003,   output: 0.015,   label: "Sonnet (balanced)" },
  "claude-opus-4-6":   { input: 0.015,   output: 0.075,   label: "Opus (deep thinking)" },
};

const SYSTEM_PROMPT = `You are Blue Agent — the AI-native founder console for Base builders.
You help founders think through ideas, strategy, architecture, and execution on Base.
Be direct, specific, and builder-first. No filler. Focus on actionable insight.
Base chain only (chain ID 8453). Use Bankr LLM. Never suggest Ethereum mainnet.`;

interface ChatMessage { role: "user" | "assistant"; content: string }

async function callBankrStream(
  model: string,
  messages: ChatMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
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
      "x-api-key": process.env.BANKR_API_KEY,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages,
      max_tokens: 2000,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bankr LLM error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content?: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const text = data.content?.[0]?.text ?? "";
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): string {
  const rates = MODEL_COST_PER_1K[model];
  if (!rates) return "unknown";
  const cost = (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
  if (cost < 0.001) return "<$0.001 USDC";
  return `~$${cost.toFixed(4)} USDC`;
}

// Stream text to stdout word-by-word (Bankr returns full response, not SSE)
async function streamToStdout(text: string): Promise<void> {
  const words = text.split(/(\s+)/);
  for (const chunk of words) {
    process.stdout.write(chunk);
    if (chunk.trim()) {
      await new Promise((r) => setTimeout(r, 6));
    }
  }
}

export async function runChat(
  prompt: string | undefined,
  opts: { model?: string; sonnet?: boolean; opus?: boolean } = {}
) {
  let model = "claude-haiku-4-5";
  if (opts.opus)   model = "claude-opus-4-6";
  else if (opts.sonnet) model = "claude-sonnet-4-6";
  else if (opts.model) model = opts.model;

  const modelInfo = MODEL_COST_PER_1K[model] ?? { label: model };

  const line = "─".repeat(52);

  // Single-prompt mode: blue chat "your question"
  if (prompt?.trim()) {
    process.stdout.write(`\n${line}\n  💬 blue chat  (${modelInfo.label})\n${line}\n\n`);

    try {
      const { text, inputTokens, outputTokens } = await callBankrStream(model, [
        { role: "user", content: prompt.trim() },
      ]);

      await streamToStdout(text);
      process.stdout.write("\n");

      const cost = estimateCost(model, inputTokens, outputTokens);
      process.stdout.write(`\n${line}\n`);
      process.stdout.write(`  Model: ${model}  ·  Cost: ${cost}\n\n`);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // Interactive REPL mode
  if (!process.stdin.isTTY) {
    // piped input: read all, send as single message
    const chunks: string[] = [];
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) chunks.push(chunk as string);
    const piped = chunks.join("").trim();
    if (piped) {
      await runChat(piped, opts);
      return;
    }
  }

  // Full interactive REPL
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const history: ChatMessage[] = [];

  process.stdout.write(`\n${line}\n  💬 blue chat  (${modelInfo.label})\n${line}\n`);
  process.stdout.write(`  Type your message. Ctrl+C or empty line to exit.\n${line}\n\n`);

  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question("  >> ", (ans) => resolve(ans)));

  try {
    while (true) {
      const input = await ask();
      if (!input.trim()) break;

      history.push({ role: "user", content: input.trim() });

      process.stdout.write("\n");

      try {
        const { text, inputTokens, outputTokens } = await callBankrStream(model, history);

        await streamToStdout(text);
        process.stdout.write("\n\n");

        const cost = estimateCost(model, inputTokens, outputTokens);
        process.stdout.write(`  ${line.slice(0, 40)}\n`);
        process.stdout.write(`  Cost: ${cost}\n\n`);

        history.push({ role: "assistant", content: text });
      } catch (err) {
        process.stderr.write(`\n  [blue] Error: ${err instanceof Error ? err.message : String(err)}\n\n`);
        history.pop(); // remove the failed user message so context stays clean
      }
    }
  } finally {
    rl.close();
    process.stdout.write(`\n${line}\n  Session ended.\n${line}\n\n`);
  }
}
