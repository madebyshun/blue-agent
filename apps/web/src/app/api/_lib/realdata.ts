// Real data fetchers — inject live market data before LLM calls
// Sources: DexScreener (free, no auth), GitHub public API

const DEXSCREENER = "https://api.dexscreener.com";
const GITHUB_API  = "https://api.github.com";

// ─── DexScreener ──────────────────────────────────────────────────────────────

export interface DexToken {
  symbol:        string;
  name:          string;
  address:       string;
  priceUsd:      string;
  priceChange24h: number;
  volume24h:     number;
  liquidity:     number;
  fdv:           number;
  txns24h:       number;
  pairAddress:   string;
}

function parsePair(p: Record<string, unknown>): DexToken {
  const base = p.baseToken as Record<string, string>;
  const vol   = (p.volume as Record<string, number>) ?? {};
  const pc    = (p.priceChange as Record<string, number>) ?? {};
  const liq   = (p.liquidity as Record<string, number>) ?? {};
  const txns  = (p.txns as Record<string, Record<string, number>>) ?? {};
  const t24   = txns.h24 ?? {};
  return {
    symbol:         base.symbol ?? "",
    name:           base.name ?? "",
    address:        base.address ?? "",
    priceUsd:       (p.priceUsd as string) ?? "0",
    priceChange24h: pc.h24 ?? 0,
    volume24h:      vol.h24 ?? 0,
    liquidity:      liq.usd ?? 0,
    fdv:            (p.fdv as number) ?? 0,
    txns24h:        (t24.buys ?? 0) + (t24.sells ?? 0),
    pairAddress:    (p.pairAddress as string) ?? "",
  };
}

/** CoinGecko: top Base ecosystem tokens by volume */
async function fetchCoinGeckoBase(limit = 30): Promise<DexToken[]> {
  try {
    const apiKey = process.env.COINGECKO_API_KEY ?? "";
    const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
    // Try base-ecosystem category first, then base-meme-coins as fallback
    for (const category of ["base-ecosystem", "base-meme-coins"]) {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category}&order=volume_desc&per_page=${limit}&sparkline=false&price_change_percentage=24h,7d`,
        { headers, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) continue;
      const coins = await res.json() as Array<Record<string, unknown>>;
      if (!coins.length) continue;
      return coins.map(c => ({
        symbol:         (c.symbol as string ?? "").toUpperCase(),
        name:           c.name as string ?? "",
        address:        (c.platforms as Record<string,string> ?? {})["base"] ?? "",
        priceUsd:       String(c.current_price ?? 0),
        priceChange24h: (c.price_change_percentage_24h as number) ?? 0,
        volume24h:      (c.total_volume as number) ?? 0,
        liquidity:      0,
        fdv:            (c.fully_diluted_valuation as number) ?? (c.market_cap as number) ?? 0,
        txns24h:        0,
        pairAddress:    "",
      }));
    }
    return [];
  } catch { return []; }
}

/** DexScreener boosted tokens on Base */
async function fetchDexScreenerBoosted(limit = 20): Promise<DexToken[]> {
  try {
    const res = await fetch(
      `${DEXSCREENER}/token-boosts/top/v1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const boosts = await res.json() as Array<{ chainId: string; tokenAddress: string }>;
    const baseAddrs = boosts
      .filter(b => b.chainId === "base")
      .slice(0, limit)
      .map(b => b.tokenAddress);
    if (!baseAddrs.length) return [];
    // Batch fetch in groups of 5
    const results: DexToken[] = [];
    for (let i = 0; i < baseAddrs.length; i += 5) {
      const batch = baseAddrs.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(addr => fetchTokenByAddress(addr).catch(() => null)));
      results.push(...batchResults.filter((t): t is DexToken => t !== null));
    }
    return results;
  } catch { return []; }
}

/** Top movers on Base — CoinGecko primary, DexScreener boosted fallback, excludes WETH */
export async function fetchBaseTopMovers(limit = 20): Promise<DexToken[]> {
  const WETH = "0x4200000000000000000000000000000000000006";
  const [cgTokens, boosted] = await Promise.all([
    fetchCoinGeckoBase(30),
    fetchDexScreenerBoosted(20),
  ]);

  // Merge: CoinGecko primary, boosted fills gaps
  const seen = new Set<string>();
  const merged: DexToken[] = [];
  for (const t of [...cgTokens, ...boosted]) {
    const key = t.symbol.toUpperCase();
    if (key === "WETH" || key === "USDC" || key === "USDT" || t.address === WETH) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }

  // Sort by volume desc
  return merged
    .filter(t => t.volume24h > 5_000)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit);
}

/** Search Base tokens by keyword / ticker */
export async function searchBaseToken(query: string): Promise<DexToken[]> {
  try {
    const res = await fetch(
      `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const d = await res.json() as { pairs?: Record<string, unknown>[] };
    return (d.pairs ?? [])
      .filter(p => (p.chainId as string) === "base")
      .slice(0, 10)
      .map(parsePair);
  } catch { return []; }
}

/** Token data by contract address on Base */
export async function fetchTokenByAddress(address: string): Promise<DexToken | null> {
  try {
    const res = await fetch(
      `${DEXSCREENER}/latest/dex/tokens/${address}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { pairs?: Record<string, unknown>[] };
    const basePairs = (d.pairs ?? []).filter(p => (p.chainId as string) === "base");
    if (!basePairs.length) return null;
    return parsePair(basePairs[0]);
  } catch { return null; }
}

/** Format token list as readable context string for LLM */
export function formatTokensForLLM(tokens: DexToken[]): string {
  if (!tokens.length) return "No token data available.";
  return tokens.map(t =>
    `${t.symbol} (${t.name}): $${Number(t.priceUsd).toFixed(6)} | 24h: ${t.priceChange24h > 0 ? "+" : ""}${t.priceChange24h.toFixed(1)}% | vol $${(t.volume24h / 1000).toFixed(0)}k | liq $${(t.liquidity / 1000).toFixed(0)}k | fdv $${(t.fdv / 1000).toFixed(0)}k`
  ).join("\n");
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  name:           string;
  fullName:       string;
  description:    string;
  stars:          number;
  forks:          number;
  openIssues:     number;
  lastPushed:     string;
  language:       string;
  topics:         string[];
  license:        string;
  hasReadme:      boolean;
  defaultBranch:  string;
}

export interface GitHubCommitSummary {
  count:      number;
  lastCommit: string;
  authors:    string[];
}

export async function fetchGitHubRepo(ownerRepo: string): Promise<GitHubRepo | null> {
  try {
    // normalize: strip github.com prefix if present
    const slug = ownerRepo
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .trim();
    const res = await fetch(`${GITHUB_API}/repos/${slug}`, {
      headers: { "Accept": "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const d = await res.json() as Record<string, unknown>;
    return {
      name:          d.name as string,
      fullName:      d.full_name as string,
      description:   (d.description as string) ?? "",
      stars:         (d.stargazers_count as number) ?? 0,
      forks:         (d.forks_count as number) ?? 0,
      openIssues:    (d.open_issues_count as number) ?? 0,
      lastPushed:    (d.pushed_at as string) ?? "",
      language:      (d.language as string) ?? "unknown",
      topics:        (d.topics as string[]) ?? [],
      license:       (d.license as Record<string,string>)?.spdx_id ?? "none",
      hasReadme:     true,
      defaultBranch: (d.default_branch as string) ?? "main",
    };
  } catch { return null; }
}

export async function fetchGitHubCommits(ownerRepo: string): Promise<GitHubCommitSummary> {
  try {
    const slug = ownerRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
    const res = await fetch(`${GITHUB_API}/repos/${slug}/commits?per_page=20`, {
      headers: { "Accept": "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { count: 0, lastCommit: "unknown", authors: [] };
    const commits = await res.json() as Record<string, unknown>[];
    const authors = [...new Set(
      commits.map(c => ((c.commit as Record<string,unknown>)?.author as Record<string,string>)?.name ?? "unknown")
    )].slice(0, 5);
    const lastCommit = ((commits[0]?.commit as Record<string,unknown>)?.author as Record<string,string>)?.date ?? "unknown";
    return { count: commits.length, lastCommit, authors };
  } catch { return { count: 0, lastCommit: "unknown", authors: [] }; }
}

export async function fetchGitHubContents(ownerRepo: string, path = ""): Promise<string[]> {
  try {
    const slug = ownerRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
    const res = await fetch(`${GITHUB_API}/repos/${slug}/contents/${path}`, {
      headers: { "Accept": "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const items = await res.json() as Record<string, unknown>[];
    return items.map(i => i.name as string);
  } catch { return []; }
}

export function formatRepoForLLM(repo: GitHubRepo, commits: GitHubCommitSummary, files: string[]): string {
  const daysSinceLastPush = repo.lastPushed
    ? Math.floor((Date.now() - new Date(repo.lastPushed).getTime()) / 86_400_000)
    : null;
  return [
    `Repo: ${repo.fullName}`,
    `Description: ${repo.description || "none"}`,
    `Language: ${repo.language} | Stars: ${repo.stars} | Forks: ${repo.forks} | Open issues: ${repo.openIssues}`,
    `Last push: ${daysSinceLastPush !== null ? `${daysSinceLastPush} days ago` : "unknown"} | License: ${repo.license}`,
    `Topics: ${repo.topics.join(", ") || "none"}`,
    `Recent commits (last 20): ${commits.count} | Last commit: ${commits.lastCommit}`,
    `Contributors: ${commits.authors.join(", ") || "unknown"}`,
    `Root files: ${files.slice(0, 20).join(", ")}`,
  ].join("\n");
}
