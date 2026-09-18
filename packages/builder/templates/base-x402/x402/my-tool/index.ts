// Inference goes through Virtuals — an OpenAI-compatible chat-completions
// endpoint. Send only these four body keys: Virtuals rejects unrecognised keys
// with a 400 rather than ignoring them.
const VIRTUALS_URL = "https://compute.virtuals.io/v1/chat/completions";
const MODEL = process.env.VIRTUALS_MODEL ?? "deepseek-deepseek-v4-flash";

/**
 * Pull a JSON object out of an LLM response.
 *
 * Never JSON.parse(raw) directly: models wrap JSON in ``` fences, add preamble,
 * and reasoning models may prefix a <think> block. Strip all of that, then slice
 * from the first { to the last }.
 */
function extractJsonObject<T>(raw: string): T {
  const text = raw
    .replace(/^\s*<think>[\s\S]*?<\/think>/i, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

async function callLLM(system: string, user: string): Promise<string> {
  const apiKey = process.env.VIRTUALS_API_KEY;
  if (!apiKey) throw new Error("VIRTUALS_API_KEY env var required");

  const res = await fetch(VIRTUALS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // The default model reasons before answering and that reasoning is billed
      // from this same budget without ever appearing in message.content. Below
      // ~1500 it can eat the whole allowance, leaving you with an empty — but
      // fully billed — response. Do not lower this.
      max_tokens: 2000,
      // Deterministic: this tool returns a structured verdict, and the same
      // input must not produce a different answer between runs.
      temperature: 0,
    }),
  });

  if (!res.ok) {
    // Verbatim upstream body — a generic "LLM error" hides a bad model id.
    throw new Error(`Virtuals ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error(
      `Virtuals returned no content (finish_reason=${data.choices?.[0]?.finish_reason ?? "none"}). ` +
        `If this says "length", raise max_tokens.`,
    );
  }
  return content;
}

export default async function handler(req: Request): Promise<Response> {
  let body: { query?: string } = {};
  try {
    const text = await req.text();
    if (text.trim().startsWith("{")) body = JSON.parse(text);
  } catch {}

  const { query } = body;
  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await callLLM(
      `You are a helpful AI tool. Answer the query and return JSON with { "result": string, "confidence": number (0-1) }.`,
      query,
    );
  } catch (err) {
    // The caller has paid. Say what failed — never return a fabricated result
    // to fill the gap.
    return Response.json(
      { error: "upstream_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  try {
    return Response.json(extractJsonObject(raw));
  } catch {
    // Parse failed but the model did answer — return the prose and say the
    // confidence is unknown rather than inventing a number for it.
    return Response.json({ result: raw, confidence: null, note: "unstructured response" });
  }
}
