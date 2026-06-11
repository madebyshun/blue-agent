// Shared GitHub data layer — real repo metrics + a deterministic activity score.
// Numbers come from the live GitHub API (free, optional GITHUB_TOKEN raises the
// rate limit). Used to ground repo/agent tools instead of letting the LLM guess.

const GH = "https://api.github.com";

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "blue-agent" };
  if (process.env.GITHUB_TOKEN) h["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export function slugifyRepo(repo: string): string {
  return repo.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "").trim();
}

export interface RepoData {
  fullName: string; description: string; stars: number; forks: number;
  openIssues: number; watchers: number; daysSincePush: number | null;
  language: string; license: string; archived: boolean; topics: string[];
  commitCount: number; commitDays: number | null; rootFiles: string[];
}

export async function fetchRepo(slug: string): Promise<RepoData | null> {
  const res = await fetch(`${GH}/repos/${slug}`, { headers: ghHeaders(), signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const d = (await res.json()) as Record<string, unknown>;
  const pushedAt = (d.pushed_at as string) ?? "";
  const daysSincePush = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86_400_000) : null;

  const [commitsRes, contentsRes] = await Promise.all([
    fetch(`${GH}/repos/${slug}/commits?per_page=30`, { headers: ghHeaders(), signal: AbortSignal.timeout(6000) }).catch(() => null),
    fetch(`${GH}/repos/${slug}/contents`, { headers: ghHeaders(), signal: AbortSignal.timeout(6000) }).catch(() => null),
  ]);
  let commitCount = 0, commitDays: number | null = null;
  if (commitsRes?.ok) {
    const commits = (await commitsRes.json()) as Record<string, unknown>[];
    commitCount = commits.length;
    const last = ((commits[0]?.commit as Record<string, unknown>)?.author as Record<string, string>)?.date;
    const first = ((commits[commits.length - 1]?.commit as Record<string, unknown>)?.author as Record<string, string>)?.date;
    if (last && first) commitDays = Math.max(1, Math.floor((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000));
  }
  let rootFiles: string[] = [];
  if (contentsRes?.ok) {
    const items = (await contentsRes.json()) as Record<string, unknown>[];
    if (Array.isArray(items)) rootFiles = items.map((i) => (i.name as string) ?? "").filter(Boolean);
  }

  return {
    fullName: (d.full_name as string) ?? slug,
    description: (d.description as string) ?? "",
    stars: (d.stargazers_count as number) ?? 0,
    forks: (d.forks_count as number) ?? 0,
    openIssues: (d.open_issues_count as number) ?? 0,
    watchers: (d.subscribers_count as number) ?? 0,
    daysSincePush,
    language: (d.language as string) ?? "unknown",
    license: (d.license as Record<string, string>)?.spdx_id ?? "none",
    archived: (d.archived as boolean) ?? false,
    topics: (d.topics as string[]) ?? [],
    commitCount, commitDays, rootFiles,
  };
}

const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

// Deterministic activity/shipping score from real metrics (0-10 dims + 0-100).
export function scoreRepoActivity(r: RepoData) {
  const recency = r.daysSincePush === null ? 3
    : r.daysSincePush <= 7 ? 10 : r.daysSincePush <= 30 ? 8 : r.daysSincePush <= 90 ? 5 : r.daysSincePush <= 180 ? 3 : 1;
  const velocity = r.commitDays ? Math.min(10, (r.commitCount / r.commitDays) * 7) : Math.min(10, r.commitCount / 3);
  const activity = r.archived ? 0 : clamp10(recency * 0.6 + velocity * 0.4);
  const community = clamp10(Math.log10(r.stars + 1) * 3 + Math.log10(r.forks + 1) * 2 + Math.log10(r.watchers + 1));
  const lf = r.rootFiles.map((f) => f.toLowerCase());
  const hasTests = lf.some((f) => /^tests?$|\.test\.|spec/.test(f) || f === "__tests__");
  const hasCI = lf.includes(".github");
  const hygiene = clamp10((hasTests ? 4 : 0) + (hasCI ? 3 : 0) + (lf.some((f) => f.startsWith("readme")) ? 2 : 0) + (r.license !== "none" ? 1 : 0));
  const score = Math.round(activity * 4 + community * 3.5 + hygiene * 2.5);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade, dimensions: { activity, community, hygiene }, signals: { hasTests, hasCI, archived: r.archived } };
}

export function repoFactsPrompt(r: RepoData, scored: ReturnType<typeof scoreRepoActivity>): string {
  return [
    `Repo: ${r.fullName}`,
    `Description: ${r.description || "none"}`,
    `Language: ${r.language} | License: ${r.license}${r.archived ? " | ARCHIVED" : ""}`,
    `Stars ${r.stars} | Forks ${r.forks} | Watchers ${r.watchers} | Open issues ${r.openIssues}`,
    `Last push: ${r.daysSincePush === null ? "unknown" : `${r.daysSincePush}d ago`} | Recent commits ${r.commitCount}${r.commitDays ? ` over ${r.commitDays}d` : ""}`,
    `Computed (0-10): activity ${scored.dimensions.activity}, community ${scored.dimensions.community}, hygiene ${scored.dimensions.hygiene}`,
  ].join("\n");
}
