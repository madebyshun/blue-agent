import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchGitHubRepo, fetchGitHubCommits, fetchGitHubContents, formatRepoForLLM } from "@/app/api/_lib/realdata";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/repo-health";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const repoInput = (body.repo as string) ?? "";
  if (!repoInput) return NextResponse.json({ error: "repo is required" }, { status: 400 });

  // Fetch real GitHub data
  const [repo, commits, rootFiles] = await Promise.all([
    fetchGitHubRepo(repoInput),
    fetchGitHubCommits(repoInput),
    fetchGitHubContents(repoInput),
  ]);

  if (!repo) {
    return NextResponse.json({ error: "Could not fetch repo. Check the URL/name is correct and repo is public." }, { status: 404 });
  }

  // Also check for skills/ or docs/ directory
  const [skillFiles, docsFiles] = await Promise.all([
    fetchGitHubContents(repoInput, "skills"),
    fetchGitHubContents(repoInput, "docs"),
  ]);

  const realData = [
    formatRepoForLLM(repo, commits, rootFiles),
    skillFiles.length ? `\nSkill files: ${skillFiles.join(", ")}` : "\nNo skills/ directory found",
    docsFiles.length  ? `\nDocs files: ${docsFiles.join(", ")}`  : "\nNo docs/ directory found",
    `\nKey files present: ${["README.md","CLAUDE.md","package.json","agent.json",".github"].filter(f => rootFiles.includes(f)).join(", ") || "none detected"}`,
  ].join("\n");

  // Aeon — project health signals
  const aeonRaw = await runAeonSkill("token-movers",
    `Evaluate this GitHub repo health. Focus on activity, maintenance, and builder credibility:\n${realData}`
  );

  // MiroShark — community and developer perception
  const msRaw = await runMiroSharkSkill({
    scenario: `GitHub repo health audit: ${repo.fullName}`,
    context: { repo_data: realData.slice(0, 600), aeon_analysis: aeonRaw ?? "" },
    persona: "analyst — evaluates code quality, documentation, maintenance signals",
    outputSchema: `{"impression":"strong|moderate|weak","strengths":["<real strength from data>"],"concerns":["<real concern from data>"],"developer_trust":"high|medium|low"}`,
    maxTokens: 500,
  });

  const perception = extractJsonObject(msRaw ?? "") ?? {};

  // Blue — final health report
  const reportRaw = await runBlueSkill({
    task: `Audit this GitHub repo for health, quality, and maintenance. Base ALL findings on the real data provided.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "health_score": <0-100>,
  "grade": "A|B|C|D|F",
  "verdict": "HEALTHY|NEEDS_WORK|AT_RISK|INACTIVE",
  "repo": {"name":"<real>","stars":<real>,"language":"<real>","last_active":"<real>"},
  "strengths": ["<real strength from actual data>"],
  "issues": [{"severity":"critical|warning|info","issue":"<real issue>","fix":"<specific fix>"}],
  "docs_quality": "good|basic|missing",
  "activity": "active|sporadic|inactive",
  "recommendation": "<specific next step based on real findings>"
}`,
    skillFiles: ["base-ecosystem.md"],
    input: `${realData}\n\nAeon:\n${aeonRaw ?? ""}\n\nPerception:\n${JSON.stringify(perception)}`,
    maxTokens: 900,
  });

  const report = extractJsonObject(reportRaw ?? "");
  if (!report) throw new Error("Failed to parse report");

  return NextResponse.json({
    tool: "repo-health", timestamp: new Date().toISOString(),
    data_source: `GitHub API — ${repo.fullName}`,
    ...report,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
