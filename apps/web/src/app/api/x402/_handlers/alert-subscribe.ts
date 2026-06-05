// x402/alert-subscribe — Subscribe to real-time alerts via webhook
// Price: $0.50 — Fully self-contained, no external workspace imports

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

// In-memory store (ephemeral — replace with DB in production)
const subscriptions = new Map<string, {
  id: string; webhookUrl: string; topics: string[]; addresses: string[]; createdAt: string;
}>();

const VALID_TOPICS = [
  "whale_movement", "circuit_breaker", "quantum_exposure", "honeypot_detected", "rug_risk",
];

const SYSTEM = `You are a blockchain alert advisor. Given subscription details, generate a confirmation summary and setup tips.

Return ONLY valid JSON:
{
  "message": "string (confirmation message)",
  "activeTopics": ["topic1", "topic2"],
  "estimatedAlertsPerDay": "string (e.g. '3-5 alerts/day')",
  "tips": ["tip1", "tip2"],
  "webhookFormat": {
    "topic": "whale_movement",
    "severity": "HIGH",
    "message": "example alert message",
    "data": {},
    "timestamp": "ISO string"
  }
}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return Response.json({
      service: "alert-subscribe",
      description: "Subscribe to real-time BlueAgent alerts via webhook",
      availableTopics: VALID_TOPICS,
      pricing: "$0.50/month per topic",
    });
  }

  try {
    let body: {
      webhookUrl?: string;
      topics?: string[];
      addresses?: string[];
    } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { webhookUrl, topics = [], addresses = [] } = body;

    if (!webhookUrl) return Response.json({ error: "webhookUrl is required" }, { status: 400 });
    if (topics.length === 0) return Response.json({ error: "At least one topic required" }, { status: 400 });

    const invalidTopics = topics.filter(t => !VALID_TOPICS.includes(t));
    if (invalidTopics.length > 0) {
      return Response.json({ error: `Invalid topics: ${invalidTopics.join(", ")}`, validTopics: VALID_TOPICS }, { status: 400 });
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sub = { id, webhookUrl, topics, addresses, createdAt: new Date().toISOString() };
    subscriptions.set(id, sub);

    console.log(`[AlertSubscribe] New subscription ${id}: topics=${topics.join(",")} webhook=${webhookUrl}`);

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Subscription created:
- ID: ${id}
- Topics: ${topics.join(", ")}
- Watched addresses: ${addresses.length > 0 ? addresses.join(", ") : "none (global alerts)"}
- Webhook: ${webhookUrl}

Generate confirmation summary and setup tips.` }],
      temperature: 0.3,
      maxTokens: 600,
    });

    const result = extractJsonObject(llmResponse) as Record<string, unknown> | null;
    return Response.json({
      subscriptionId: id,
      status: "active",
      topics,
      addresses,
      webhookUrl,
      createdAt: sub.createdAt,
      ...(result ?? {}),
    });
  } catch (error) {
    console.error("[AlertSubscribe] Error:", error);
    return Response.json({ error: "Subscription failed", message: (error as Error).message }, { status: 500 });
  }
}
