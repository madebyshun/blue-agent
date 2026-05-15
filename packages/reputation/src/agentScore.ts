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
      model: "claude-sonnet-4-6",
      system,
      messages: [{ role: "user", content: user }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bankr LLM error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  if (data.content?.[0]?.text) return data.content[0].text;
  // Surface the actual API error for debugging
  const detail = data.error?.message ?? data.type ?? JSON.stringify(data).slice(0, 200);
  throw new Error(`Invalid Bankr LLM response: ${detail}`);
}

// ── GitHub deep fetch ─────────────────────────────────────────────────────────

async function ghGet(path: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { "Accept": "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function ghRaw(owner: string, repo: string, file: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/main/${file}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      // try master branch
      const res2 = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/master/${file}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res2.ok) return null;
      return await res2.text();
    }
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchGitHubData(repoPath: string): Promise<string> {
  const clean = repoPath.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
  const [owner, repo] = clean.split("/");
  if (!owner || !repo) return `invalid GitHub path: ${repoPath}`;

  // Fetch all in parallel — round 1
  const [repoData, contents, commitActivity, releases, rootPkgJson, claudeMd, skillMd, readme, packagesDir] =
    await Promise.all([
      ghGet(`/repos/${clean}`),
      ghGet(`/repos/${clean}/contents`),
      ghGet(`/repos/${clean}/stats/commit_activity`),
      ghGet(`/repos/${clean}/releases?per_page=5`),
      ghRaw(owner, repo, "package.json"),
      ghRaw(owner, repo, "CLAUDE.md"),
      ghRaw(owner, repo, "SKILL.md"),
      ghRaw(owner, repo, "README.md"),
      ghGet(`/repos/${clean}/contents/packages`),
    ]);

  if (!repoData) return `GitHub repo ${clean}: not found`;

  // Root file/folder names
  const rootEntries: string[] = Array.isArray(contents)
    ? contents.map((f: any) => f.name)
    : [];

  // Commits in last 30 days — GitHub stats API can lag up to 1h after pushes
  let recentCommits = 0;
  if (Array.isArray(commitActivity)) {
    recentCommits = commitActivity
      .slice(-4)
      .reduce((sum: number, w: any) => sum + (w.total ?? 0), 0);
  }
  // Fallback: if stats API returned empty but repo was updated recently, estimate from updated_at
  const updatedRecently = repoData.updated_at
    ? (Date.now() - new Date(repoData.updated_at).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false;

  // Fetch sub-package package.json files (monorepo support)
  const subPackageNames: string[] = Array.isArray(packagesDir)
    ? packagesDir.filter((f: any) => f.type === "dir").map((f: any) => f.name)
    : [];

  // Fetch package.json from each sub-package (up to 6) in parallel
  const subPkgJsons = await Promise.all(
    subPackageNames.slice(0, 6).map(name => ghRaw(owner, repo, `packages/${name}/package.json`))
  );

  // Parse all package.jsons — root + sub-packages
  const allPkgs: any[] = [];
  try { if (rootPkgJson) allPkgs.push(JSON.parse(rootPkgJson)); } catch {}
  for (const raw of subPkgJsons) {
    try { if (raw) allPkgs.push(JSON.parse(raw)); } catch {}
  }

  // Aggregate deps across all packages
  const allDeps = allPkgs.flatMap(p =>
    Object.keys({ ...(p.dependencies ?? {}), ...(p.devDependencies ?? {}) })
  );

  // Detect onchain signals from deps
  const onchainDeps = [...new Set(allDeps.filter((d: string) =>
    ["viem", "wagmi", "ethers", "web3", "@coinbase/agentkit", "x402", "ox"].some(k => d.includes(k))
  ))];

  // Collect all npm package names + bin commands across monorepo
  const publishedPackages = allPkgs
    .filter(p => p.name && !p.private)
    .map(p => ({ name: p.name, version: p.version, bin: p.bin ? Object.keys(p.bin) : [] }));

  const allBinCommands = publishedPackages.flatMap(p => p.bin);

  // Detect interoperability signals
  const hasMcpConfig = rootEntries.some(f => f.includes("mcp") || f === "skill.json");
  const hasAgentJson = rootEntries.some(f => f === "agent.json");
  const hasGithubActions = rootEntries.includes(".github");
  const hasSkillsFolder = rootEntries.includes("skills") || rootEntries.includes("skill");
  const hasCommandsFolder = rootEntries.includes("commands");
  const isMonorepo = rootEntries.includes("packages") && subPackageNames.length > 0;

  // npm downloads for all published packages
  const npmDownloadResults = await Promise.all(
    publishedPackages.slice(0, 5).map(async (pkg) => {
      try {
        const res = await fetch(
          `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg.name)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return 0;
        const data = await res.json() as any;
        return data.downloads ?? 0;
      } catch { return 0; }
    })
  );
  const totalNpmDownloads = npmDownloadResults.reduce((a, b) => a + b, 0);

  // README excerpt (first 400 chars)
  const readmeExcerpt = readme ? readme.slice(0, 400).replace(/\n+/g, " ") : null;

  // CLAUDE.md excerpt (first 300 chars) — strong skill signal
  const claudeExcerpt = claudeMd ? claudeMd.slice(0, 300).replace(/\n+/g, " ") : null;

  const summary = {
    // Identity
    repo: repoData.full_name,
    description: repoData.description,
    language: repoData.language,
    topics: repoData.topics ?? [],
    is_monorepo: isMonorepo,
    sub_packages: subPackageNames,

    // Reputation
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    watchers: repoData.watchers_count,
    open_issues: repoData.open_issues_count,
    releases: Array.isArray(releases) ? releases.length : 0,

    // Activity
    created_at: repoData.created_at,
    updated_at: repoData.updated_at,
    updated_recently_7d: updatedRecently,
    recent_commits_30d: recentCommits,
    note_commit_stats: recentCommits === 0 && updatedRecently
      ? "GitHub stats API may be delayed (up to 1h after pushes) — repo was updated recently"
      : null,
    has_github_actions: hasGithubActions,

    // Skill depth signals
    has_claude_md: !!claudeMd,
    has_skill_md: !!skillMd,
    has_skills_folder: hasSkillsFolder,
    has_commands_folder: hasCommandsFolder,
    claude_md_excerpt: claudeExcerpt,
    readme_excerpt: readmeExcerpt,

    // Onchain signals
    onchain_deps: onchainDeps,
    onchain_topics: (repoData.topics ?? []).filter((t: string) =>
      ["base", "onchain", "x402", "defi", "web3", "ethereum", "solidity"].some(k => t.includes(k))
    ),

    // Interoperability
    published_packages: publishedPackages,
    npm_weekly_downloads_total: totalNpmDownloads,
    bin_commands: allBinCommands,
    has_mcp_config: hasMcpConfig,
    has_agent_json: hasAgentJson,
    all_package_keywords: [...new Set(allPkgs.flatMap(p => p.keywords ?? []))],

    // Root structure
    root_files: rootEntries.slice(0, 30),
  };

  return JSON.stringify(summary, null, 2);
}

// ── npm standalone fetch ──────────────────────────────────────────────────────

async function fetchNpmData(packageName: string): Promise<string> {
  try {
    const [meta, downloads] = await Promise.all([
      fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`),
    ]);
    if (!meta.ok) return `npm package ${packageName}: not found`;
    const data = await meta.json() as any;
    const latest = data["dist-tags"]?.latest ?? "unknown";
    const info = data.versions?.[latest] ?? {};
    const dlData = downloads.ok ? await downloads.json() as any : null;

    return JSON.stringify({
      name: data.name,
      description: data.description,
      version: latest,
      keywords: info.keywords ?? [],
      dependencies: Object.keys(info.dependencies ?? {}),
      bin: info.bin ? Object.keys(info.bin) : [],
      weekly_downloads: dlData?.downloads ?? 0,
      total_versions: Object.keys(data.versions ?? {}).length,
    });
  } catch {
    return `npm package ${packageName}: fetch failed`;
  }
}

// ── endpoint ping ─────────────────────────────────────────────────────────────

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

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Blue Agent's Agent Score engine. You score AI agents on 5 dimensions using real data provided.

Dimensions (max pts shown):
- skillDepth (25): Has CLAUDE.md/SKILL.md? Skills folder? Commands folder? README describes clear domain expertise and toolset? More detail = higher score.
- onchainActivity (25): Uses onchain deps (viem, wagmi, x402, agentkit)? Base/onchain topics? Wallet/contract mentions in README? Deployed contracts or x402 revenue?
- reliability (20): Recent commits in last 30 days? GitHub Actions CI? Open issues low? Regular releases? Active maintenance signals.
- interoperability (20): npm package published with downloads? CLI bin commands? MCP config? agent.json? Keywords signal ecosystem compatibility (mcp, agentkit, x402, vercel-ai)?
- reputation (10): Stars, forks, watchers, releases, npm weekly downloads. Community traction.

Scoring guide:
- 0-20: Minimal signal, new or incomplete
- 21-40: Early stage, some structure but gaps
- 41-60: Solid agent, clear purpose, some traction
- 61-75: Strong agent, good ecosystem fit, active
- 76-90: Elite, high interop + onchain + community
- 91-100: Sovereign, top of ecosystem

Use the data provided to score precisely. Do NOT guess — if data says 0 stars, score reputation low.

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "dimensions": {
    "skillDepth": <0-25>,
    "onchainActivity": <0-25>,
    "reliability": <0-20>,
    "interoperability": <0-20>,
    "reputation": <0-10>
  },
  "strengths": ["<max 80 chars>", "<max 80 chars>"],
  "gaps": ["<max 80 chars>", "<max 80 chars>"]
}`;

// ── Exports ───────────────────────────────────────────────────────────────────

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

  // Clean display handle: github URL → owner/repo, npm: → pkg name, else strip @
  let displayHandle: string;
  if (input.type === "github") {
    displayHandle = rawInput.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
  } else if (input.type === "npm") {
    displayHandle = input.value;
  } else {
    displayHandle = rawInput.replace(/^@/, "");
  }

  let contextData = "";
  if (input.type === "npm") {
    contextData = await fetchNpmData(input.value);
  } else if (input.type === "github") {
    contextData = await fetchGitHubData(input.value);
  } else if (input.type === "endpoint") {
    contextData = await pingEndpoint(input.value);
  }

  // Truncate context to ~6000 chars to stay within Bankr LLM limits
  const truncated = contextData && contextData.length > 6000
    ? contextData.slice(0, 6000) + "\n... [truncated]"
    : contextData;

  const userMessage = truncated
    ? `Score this AI agent based on the data below.\nInput: ${rawInput}\n\nData:\n${truncated}`
    : `Score this AI agent by X/Twitter handle: @${displayHandle}. Limited data available — score conservatively.`;

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
