import { AgentScoreResult, AgentTier, AgentScoreDimensions } from "./types";
import { agentBadgeUrl } from "./badges";

function getAgentTier(score: number): AgentTier {
  if (score >= 91) return "Sovereign";
  if (score >= 76) return "Elite Agent";
  if (score >= 61) return "Pro Agent";
  if (score >= 41) return "Agent";
  return "Bot";
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("No JSON found in response");
}

async function callBankrLLM(system: string, user: string): Promise<string> {
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
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM error: ${res.status}`);
  const data = await res.json() as any;
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error("Invalid Bankr LLM response");
}

// Fetch npm package metadata if input starts with "npm:"
async function fetchNpmData(packageName: string): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (!res.ok) return `npm package ${packageName}: not found`;
    const data = await res.json() as any;
    const latest = data["dist-tags"]?.latest ?? "unknown";
    const info = data.versions?.[latest] ?? {};
    return JSON.stringify({
      name: data.name,
      description: data.description,
      version: latest,
      keywords: info.keywords,
      dependencies: Object.keys(info.dependencies ?? {}),
      weeklyDownloads: "unknown", // would need separate API call
    });
  } catch {
    return `npm package ${packageName}: fetch failed`;
  }
}

// Fetch GitHub repo metadata if input looks like a GitHub URL
async function fetchGitHubData(repoPath: string): Promise<string> {
  try {
    // repoPath like "github.com/user/repo" → "user/repo"
    const clean = repoPath.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
    const res = await fetch(`https://api.github.com/repos/${clean}`, {
      headers: { "Accept": "application/vnd.github.v3+json" },
    });
    if (!res.ok) return `GitHub repo ${clean}: not found`;
    const data = await res.json() as any;
    return JSON.stringify({
      name: data.full_name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language,
      updated_at: data.updated_at,
      has_readme: true,
      topics: data.topics,
    });
  } catch {
    return `GitHub repo ${repoPath}: fetch failed`;
  }
}

// Ping an x402 endpoint to check responsiveness
async function pingEndpoint(url: string): Promise<string> {
  try {
    const start = Date.now();
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    const ms = Date.now() - start;
    return JSON.stringify({
      url,
      status: res.status,
      responseTimeMs: ms,
      is402: res.status === 402,
      isUp: res.status < 500,
    });
  } catch (err) {
    return JSON.stringify({ url, error: String(err), isUp: false });
  }
}

const SYSTEM_PROMPT = `You are Blue Agent's Agent Score engine. You score AI agents on 5 dimensions.

Dimensions (max pts shown):
- skillDepth (25): has SKILL.md/CLAUDE.md, grounded knowledge, domain expertise, number of tools
- onchainActivity (25): wallet txs, x402 revenue, staking, Base deployments
- reliability (20): uptime, response rate, error rate, process management
- interoperability (20): MCP server, npm package, API endpoints, AgentKit/Vercel AI compatible
- reputation (10): npm downloads, GitHub stars, community mentions, agent integrations

Return ONLY valid JSON:
{
  "dimensions": {
    "skillDepth": <0-25>,
    "onchainActivity": <0-25>,
    "reliability": <0-20>,
    "interoperability": <0-20>,
    "reputation": <0-10>
  },
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"]
}

Be realistic. New/unknown agents score 20-40. Established agents 50-75. Elite 76+.`;

export type AgentInput =
  | { type: "handle"; value: string }
  | { type: "npm"; value: string }
  | { type: "github"; value: string }
  | { type: "endpoint"; value: string };

export function parseAgentInput(raw: string): AgentInput {
  if (raw.startsWith("npm:")) return { type: "npm", value: raw.slice(4) };
  if (raw.includes("github.com/")) return { type: "github", value: raw };
  if (raw.startsWith("http://") || raw.startsWith("https://")) return { type: "endpoint", value: raw };
  return { type: "handle", value: raw.replace(/^@/, "") };
}

export async function scoreAgent(rawInput: string): Promise<AgentScoreResult> {
  const input = parseAgentInput(rawInput);
  const displayHandle = rawInput.replace(/^@/, "");

  let contextData = "";
  if (input.type === "npm") {
    contextData = await fetchNpmData(input.value);
  } else if (input.type === "github") {
    contextData = await fetchGitHubData(input.value);
  } else if (input.type === "endpoint") {
    contextData = await pingEndpoint(input.value);
  }

  const userMessage = contextData
    ? `Score this AI agent.\nInput: ${rawInput}\nData collected:\n${contextData}`
    : `Score this AI agent by X/Twitter handle: @${displayHandle}`;

  const raw = await callBankrLLM(SYSTEM_PROMPT, userMessage);

  let parsed: { dimensions: AgentScoreDimensions; strengths: string[]; gaps: string[] };
  try {
    parsed = extractJson(raw);
  } catch {
    throw new Error(`Failed to parse agent score response: ${raw.slice(0, 200)}`);
  }

  const dims: AgentScoreDimensions = {
    skillDepth:        Math.min(25, Math.max(0, Math.round(parsed.dimensions?.skillDepth ?? 10))),
    onchainActivity:   Math.min(25, Math.max(0, Math.round(parsed.dimensions?.onchainActivity ?? 8))),
    reliability:       Math.min(20, Math.max(0, Math.round(parsed.dimensions?.reliability ?? 8))),
    interoperability:  Math.min(20, Math.max(0, Math.round(parsed.dimensions?.interoperability ?? 8))),
    reputation:        Math.min(10, Math.max(0, Math.round(parsed.dimensions?.reputation ?? 4))),
  };

  const score = dims.skillDepth + dims.onchainActivity + dims.reliability + dims.interoperability + dims.reputation;

  return {
    handle: displayHandle,
    score,
    tier: getAgentTier(score),
    dimensions: dims,
    strengths: parsed.strengths ?? [],
    gaps: parsed.gaps ?? [],
    badge: agentBadgeUrl(displayHandle),
  };
}
