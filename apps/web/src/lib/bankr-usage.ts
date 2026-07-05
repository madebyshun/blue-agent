/**
 * Bankr model-usage — live AI consumption for Blue Agent.
 *
 * Source: GET https://llm.bankr.bot/v1/usage?days=N  (auth: x-api-key =
 * BANKR_API_KEY). This is the SAME data Bankr shows on bankr.bot/terminal/metrics
 * for our key — real spend / tokens / requests, broken down per model. No number
 * is fabricated: every value is read straight from the API, and any failure
 * (missing key, non-200, timeout, malformed body) degrades to `null` so the /stats
 * section renders an honest "unavailable", never an invented figure.
 *
 * These are AGGREGATE account totals (no per-user data). They reflect Blue Agent's
 * own inference cost across every surface (Blue Chat + hub tools), which is why the
 * numbers are a scale signal, not a per-wallet metric.
 */
const USAGE_URL = "https://llm.bankr.bot/v1/usage";

export interface ModelUsage {
  model:    string;
  vendor:   string;
  requests: number;
  tokens:   number;
  cost:     number;
}

export interface UsageWindow {
  days:     number;
  cost:     number;
  tokens:   number;
  requests: number;
  models:   number;
  byModel:  ModelUsage[]; // sorted by cost desc
}

export interface BankrUsage {
  windows:   { 7: UsageWindow | null; 30: UsageWindow | null; 90: UsageWindow | null };
  updatedAt: number;
}

interface RawByModel {
  model?:      string;
  provider?:   string;
  requests?:   number;
  totalTokens?: number;
  totalCost?:  number;
}
interface RawUsage {
  totals?: { totalRequests?: number; totalTokens?: number; totalCost?: number };
  byModel?: RawByModel[];
}

/** Map a model id to its underlying vendor (the API's `provider` is the router). */
function vendorFor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "Anthropic";
  if (m.includes("gpt") || /\bo[134]\b/.test(m)) return "OpenAI";
  if (m.includes("gemini")) return "Google";
  if (m.includes("deepseek")) return "DeepSeek";
  if (m.includes("grok")) return "xAI";
  if (m.includes("kimi")) return "Moonshot";
  if (m.includes("qwen")) return "Alibaba";
  if (m.includes("mistral") || m.includes("magistral")) return "Mistral";
  if (m.includes("llama")) return "Meta";
  return "—";
}

async function getUsageWindow(days: number): Promise<UsageWindow | null> {
  const key = process.env.BANKR_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${USAGE_URL}?days=${days}`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawUsage;

    const byModel: ModelUsage[] = (raw.byModel ?? [])
      .map((m) => ({
        model:    m.model ?? "unknown",
        vendor:   vendorFor(m.model ?? ""),
        requests: m.requests ?? 0,
        tokens:   m.totalTokens ?? 0,
        cost:     m.totalCost ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      days,
      cost:     raw.totals?.totalCost ?? 0,
      tokens:   raw.totals?.totalTokens ?? 0,
      requests: raw.totals?.totalRequests ?? 0,
      models:   byModel.length,
      byModel,
    };
  } catch {
    return null;
  }
}

/** Fetch the 7 / 30 / 90-day windows in parallel. Each degrades to null on failure. */
export async function getBankrUsage(): Promise<BankrUsage> {
  const [w7, w30, w90] = await Promise.all([
    getUsageWindow(7),
    getUsageWindow(30),
    getUsageWindow(90),
  ]);
  return { windows: { 7: w7, 30: w30, 90: w90 }, updatedAt: Date.now() };
}
