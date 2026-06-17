// x402/founder-check — trust score for a Base founder/builder from their public GitHub
// Price: $0.10 — All metrics computed in CODE from the real GitHub API (no LLM, no fabrication)

type GithubUser = {
  login?: string;
  public_repos?: number;
  followers?: number;
  created_at?: string;
};

type GithubRepo = {
  name?: string;
  stargazers_count?: number;
  language?: string | null;
  fork?: boolean;
};

const GH_HEADERS = { "User-Agent": "blue-agent", Accept: "application/vnd.github+json" };

async function getGithubUser(handle: string): Promise<GithubUser | null> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, {
    headers: GH_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub user error: ${res.status}`);
  return (await res.json()) as GithubUser;
}

async function getGithubRepos(handle: string): Promise<GithubRepo[]> {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(handle)}/repos?per_page=100&sort=updated`,
    { headers: GH_HEADERS, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`GitHub repos error: ${res.status}`);
  return ((await res.json()) as GithubRepo[]) ?? [];
}

function accountAgeYears(createdAt?: string): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return (Date.now() - created) / (365.25 * 24 * 60 * 60 * 1000);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { handle?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.handle) body.handle = url.searchParams.get("handle") || url.searchParams.get("user") || undefined;

    const handle = body.handle?.trim().replace(/^@/, "");
    if (!handle) return Response.json({ error: "Provide a GitHub handle" }, { status: 400 });

    console.log(`[FounderCheck] Checking GitHub handle: ${handle}`);

    let user: GithubUser | null = null;
    try {
      user = await getGithubUser(handle);
    } catch (e) {
      console.warn("[FounderCheck] GitHub user fetch failed:", (e as Error).message);
    }

    // User not found → cannot assess; flag as risky rather than fabricate.
    if (user === null) {
      return Response.json({
        tool: "founder-check",
        handle,
        github: null,
        trust_score: null,
        tier: "Unknown",
        red_flags: ["GitHub user not found"],
        green_flags: [],
        verdict: "RISKY",
        timestamp: new Date().toISOString(),
      });
    }

    let repos: GithubRepo[] = [];
    try {
      repos = await getGithubRepos(handle);
    } catch (e) {
      console.warn("[FounderCheck] GitHub repos fetch failed:", (e as Error).message);
    }

    const ownedRepos = repos.filter((r) => !r.fork);
    const starsTotal = ownedRepos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);
    const topRepos = [...ownedRepos]
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, 5)
      .map((r) => ({ name: r.name ?? "", stars: r.stargazers_count ?? 0, language: r.language ?? null }));
    const languages = Array.from(
      new Set(ownedRepos.map((r) => r.language).filter((l): l is string => !!l))
    );

    const followers = user.followers ?? 0;
    const publicRepos = user.public_repos ?? 0;
    const ageYears = accountAgeYears(user.created_at);
    // Rough commit estimate proxy: repos × ~30. Heuristic only; null if no repos.
    const commitsEstimate = publicRepos > 0 ? publicRepos * 30 : null;

    // Trust score 0-100 from followers + stars + account age + repos (code, deterministic).
    const followerPts = Math.min(30, followers / 5); // 150 followers → 30
    const starPts = Math.min(35, starsTotal / 10); // 350 stars → 35
    const agePts = Math.min(20, ageYears * 4); // 5y → 20
    const repoPts = Math.min(15, publicRepos / 2); // 30 repos → 15
    const trustScore = Math.round(
      Math.max(0, Math.min(100, followerPts + starPts + agePts + repoPts))
    );

    let tier = "Unknown";
    if (trustScore >= 80) tier = "Veteran";
    else if (trustScore >= 60) tier = "Established";
    else if (trustScore >= 40) tier = "Active";
    else tier = "Emerging";

    const redFlags: string[] = [];
    const greenFlags: string[] = [];
    if (ageYears < 0.5) redFlags.push("Account is less than 6 months old");
    if (publicRepos === 0) redFlags.push("No public repositories");
    if (starsTotal === 0) redFlags.push("No stars across owned repositories");
    if (followers < 5) redFlags.push("Very few followers");
    if (ageYears >= 3) greenFlags.push(`Account is ${ageYears.toFixed(1)} years old`);
    if (starsTotal >= 100) greenFlags.push(`${starsTotal} total stars across owned repos`);
    if (followers >= 50) greenFlags.push(`${followers} followers`);
    if (publicRepos >= 10) greenFlags.push(`${publicRepos} public repositories`);
    if (languages.length >= 3) greenFlags.push(`Active across ${languages.length} languages`);

    const verdict = trustScore >= 70 ? "TRUSTED" : trustScore >= 40 ? "NEUTRAL" : "RISKY";

    return Response.json({
      tool: "founder-check",
      handle,
      github: {
        repos: publicRepos,
        followers,
        stars_total: starsTotal,
        commits_estimate: commitsEstimate,
        languages,
        top_repos: topRepos,
      },
      trust_score: trustScore,
      tier,
      red_flags: redFlags,
      green_flags: greenFlags,
      verdict,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[FounderCheck] Error:", error);
    return Response.json(
      { error: "Founder check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
