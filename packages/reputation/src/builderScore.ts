import { BuilderScoreResult, BuilderTier, BuilderScoreDimensions } from "./types";
import { builderBadgeUrl } from "./badges";

function getBuilderTier(score: number): BuilderTier {
  if (score >= 91) return "Founder";
  if (score >= 76) return "Legend";
  if (score >= 61) return "Maker";
  if (score >= 41) return "Builder";
  return "Explorer";
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
      max_tokens: 1200,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bankr LLM error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  if (data.content?.[0]?.text) return data.content[0].text;
  const detail = data.error?.message ?? JSON.stringify(data).slice(0, 200);
  throw new Error(`Invalid Bankr LLM response: ${detail}`);
}

// ── X/Twitter API v2 ──────────────────────────────────────────────────────────

async function fetchXData(handle: string): Promise<string | null> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return null;

  const clean = handle.replace(/^@/, "");

  try {
    // Fetch user profile + pinned tweet in parallel
    const [userRes, tweetsRes] = await Promise.all([
      fetch(
        `https://api.twitter.com/2/users/by/username/${clean}` +
        `?user.fields=public_metrics,description,verified,verified_type,created_at,pinned_tweet_id,entities`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        }
      ),
      fetch(
        `https://api.twitter.com/2/users/by/username/${clean}` +
        `?user.fields=pinned_tweet_id&expansions=pinned_tweet_id` +
        `&tweet.fields=text,public_metrics,created_at`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        }
      ),
    ]);

    if (!userRes.ok) {
      if (userRes.status === 401) throw new Error("TWITTER_BEARER_TOKEN invalid or expired.");
      if (userRes.status === 404) return `X user @${clean}: not found`;
      return null;
    }

    const userData = await userRes.json() as any;
    const user = userData.data;
    if (!user) return `X user @${clean}: not found`;

    const metrics = user.public_metrics ?? {};

    // Pinned tweet
    let pinnedTweet: string | null = null;
    if (tweetsRes.ok) {
      const tweetsData = await tweetsRes.json() as any;
      const pinned = tweetsData.includes?.tweets?.[0];
      if (pinned) {
        pinnedTweet = pinned.text?.slice(0, 200) ?? null;
      }
    }

    // Fetch recent tweets (last 10) for activity + engagement signals
    let recentTweets: any[] = [];
    if (user.id) {
      try {
        const recentRes = await fetch(
          `https://api.twitter.com/2/users/${user.id}/tweets` +
          `?max_results=10&tweet.fields=public_metrics,created_at&exclude=retweets,replies`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (recentRes.ok) {
          const recentData = await recentRes.json() as any;
          recentTweets = recentData.data ?? [];
        }
      } catch {}
    }

    // Aggregate engagement from recent tweets
    const totalLikes    = recentTweets.reduce((s, t) => s + (t.public_metrics?.like_count ?? 0), 0);
    const totalRetweets = recentTweets.reduce((s, t) => s + (t.public_metrics?.retweet_count ?? 0), 0);
    const totalReplies  = recentTweets.reduce((s, t) => s + (t.public_metrics?.reply_count ?? 0), 0);
    const avgLikes      = recentTweets.length ? Math.round(totalLikes / recentTweets.length) : 0;

    // Days since last tweet
    let daysSinceLastTweet: number | null = null;
    if (recentTweets[0]?.created_at) {
      daysSinceLastTweet = Math.round(
        (Date.now() - new Date(recentTweets[0].created_at).getTime()) / 86400000
      );
    }

    // Account age in days
    const accountAgeDays = user.created_at
      ? Math.round((Date.now() - new Date(user.created_at).getTime()) / 86400000)
      : null;

    const summary = {
      handle: clean,
      name: user.name,
      bio: user.description?.slice(0, 200),
      verified: user.verified || user.verified_type === "blue",
      verified_type: user.verified_type ?? null,
      account_age_days: accountAgeDays,

      // Social metrics
      followers: metrics.followers_count ?? 0,
      following: metrics.following_count ?? 0,
      tweet_count: metrics.tweet_count ?? 0,
      listed_count: metrics.listed_count ?? 0,
      follower_following_ratio: metrics.following_count > 0
        ? Math.round((metrics.followers_count / metrics.following_count) * 10) / 10
        : null,

      // Activity signals
      recent_tweets_count: recentTweets.length,
      days_since_last_tweet: daysSinceLastTweet,
      avg_likes_per_tweet: avgLikes,
      total_likes_recent: totalLikes,
      total_retweets_recent: totalRetweets,
      total_replies_recent: totalReplies,

      // Content signals
      pinned_tweet: pinnedTweet,
      has_url_in_bio: !!(user.entities?.url?.urls?.length),
      bio_urls: user.entities?.description?.urls?.map((u: any) => u.expanded_url) ?? [],
    };

    return JSON.stringify(summary, null, 2);
  } catch (err) {
    if (err instanceof Error && err.message.includes("TWITTER_BEARER_TOKEN")) throw err;
    return null;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Blue Agent's Builder Score engine. Score builders based on real X/Twitter data.

Dimensions (max pts):
- activity (25): days_since_last_tweet (lower = better), tweet_count, recent_tweets_count, posting consistency
- social (25): followers count, follower_following_ratio, listed_count, verified status
- uniqueness (20): bio clarity, niche focus, differentiation from generic builders
- thesis (20): pinned_tweet content, bio_urls (do they ship?), clear builder direction
- community (10): total_replies_recent, total_retweets_recent, engagement signals

Scoring guide for social/followers:
- < 500 followers: 3-8 pts
- 500-2k: 8-13 pts
- 2k-10k: 13-18 pts
- 10k-50k: 18-22 pts
- 50k+: 22-25 pts

Scoring guide for activity:
- Last tweet > 30 days ago: 2-8 pts
- 7-30 days: 8-14 pts
- 1-7 days: 14-20 pts
- Today/yesterday: 20-25 pts

Return ONLY valid JSON (no markdown, no code blocks):
{
  "dimensions": {
    "activity": <0-25>,
    "social": <0-25>,
    "uniqueness": <0-20>,
    "thesis": <0-20>,
    "community": <0-10>
  },
  "summary": "<2-3 sentences citing specific data: followers, last tweet, bio, pinned tweet>"
}`;

// ── Export ────────────────────────────────────────────────────────────────────

export async function scoreBuilder(handle: string): Promise<BuilderScoreResult> {
  const clean = handle.replace(/^@/, "");

  // Fetch real X data if token available
  const xData = await fetchXData(clean);

  const userMessage = xData && !xData.includes("not found")
    ? `Score this builder based on real X/Twitter data.\n\nData:\n${xData}`
    : `Score this X/Twitter builder: @${clean}\nNo live data available — score conservatively based on handle alone.`;

  const raw = await callBankrLLM(SYSTEM_PROMPT, userMessage);

  let parsed: { dimensions: BuilderScoreDimensions; summary: string };
  try {
    parsed = extractJson(raw);
  } catch {
    throw new Error(`Failed to parse score response: ${raw.slice(0, 200)}`);
  }

  const dims: BuilderScoreDimensions = {
    activity:   Math.min(25, Math.max(0, Math.round(parsed.dimensions?.activity   ?? 10))),
    social:     Math.min(25, Math.max(0, Math.round(parsed.dimensions?.social     ?? 10))),
    uniqueness: Math.min(20, Math.max(0, Math.round(parsed.dimensions?.uniqueness ?? 8))),
    thesis:     Math.min(20, Math.max(0, Math.round(parsed.dimensions?.thesis     ?? 8))),
    community:  Math.min(10, Math.max(0, Math.round(parsed.dimensions?.community  ?? 4))),
  };

  const score = dims.activity + dims.social + dims.uniqueness + dims.thesis + dims.community;

  return {
    handle: clean,
    score,
    tier: getBuilderTier(score),
    dimensions: dims,
    summary: parsed.summary ?? "No summary available.",
    badge: builderBadgeUrl(clean),
  };
}
