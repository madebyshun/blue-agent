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
  const clean = handle.replace(/^@/, "");

  // Try official API first if token available
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (token) {
    try {
      const res = await fetch(
        `https://api.twitter.com/2/users/by/username/${clean}` +
        `?user.fields=public_metrics,description,verified,verified_type,created_at,pinned_tweet_id,entities`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (res.status === 401) throw new Error("TWITTER_BEARER_TOKEN invalid or expired.");
      if (res.status === 402 || res.status === 429) {
        // Credits depleted or rate limited — fall through to public scrape
        console.error(`X API ${res.status} — falling back to public scrape`);
      } else if (res.ok) {
        const userData = await res.json() as any;
        const user = userData.data;
        if (!user) return null;
        const metrics = user.public_metrics ?? {};

        // Fetch recent tweets
        let recentTweets: any[] = [];
        try {
          const recentRes = await fetch(
            `https://api.twitter.com/2/users/${user.id}/tweets` +
            `?max_results=10&tweet.fields=public_metrics,created_at&exclude=retweets,replies`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
          );
          if (recentRes.ok) {
            recentTweets = (await recentRes.json() as any).data ?? [];
          }
        } catch {}

        const totalLikes    = recentTweets.reduce((s, t) => s + (t.public_metrics?.like_count ?? 0), 0);
        const totalRetweets = recentTweets.reduce((s, t) => s + (t.public_metrics?.retweet_count ?? 0), 0);
        const totalReplies  = recentTweets.reduce((s, t) => s + (t.public_metrics?.reply_count ?? 0), 0);
        const avgLikes      = recentTweets.length ? Math.round(totalLikes / recentTweets.length) : 0;
        const daysSinceLast = recentTweets[0]?.created_at
          ? Math.round((Date.now() - new Date(recentTweets[0].created_at).getTime()) / 86400000)
          : null;

        return JSON.stringify({
          source: "x_api_v2",
          handle: clean,
          name: user.name,
          bio: user.description?.slice(0, 200),
          verified: user.verified || user.verified_type === "blue",
          account_age_days: user.created_at
            ? Math.round((Date.now() - new Date(user.created_at).getTime()) / 86400000)
            : null,
          followers: metrics.followers_count ?? 0,
          following: metrics.following_count ?? 0,
          tweet_count: metrics.tweet_count ?? 0,
          listed_count: metrics.listed_count ?? 0,
          recent_tweets_count: recentTweets.length,
          days_since_last_tweet: daysSinceLast,
          avg_likes_per_tweet: avgLikes,
          total_likes_recent: totalLikes,
          total_retweets_recent: totalRetweets,
          total_replies_recent: totalReplies,
          has_url_in_bio: !!(user.entities?.url?.urls?.length),
        }, null, 2);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("TWITTER_BEARER_TOKEN")) throw err;
    }
  }

  // ── Fallback: X syndication API (public, no auth needed) ──────────────────
  try {
    // Twitter syndication endpoint — public, no credentials required
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${clean}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BlueAgent/1.0)",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) return null;

    const html = await res.text();

    // Extract JSON embedded in the page
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!match) return null;

    const nextData = JSON.parse(match[1]);
    const timeline = nextData?.props?.pageProps?.timeline;
    const entries  = timeline?.entries ?? [];

    // Pull tweets from entries
    const tweets = entries
      .filter((e: any) => e?.content?.tweet)
      .map((e: any) => e.content.tweet)
      .slice(0, 10);

    if (tweets.length === 0) return null;

    const user = tweets[0]?.user ?? {};
    const totalLikes    = tweets.reduce((s: number, t: any) => s + (t.favorite_count ?? 0), 0);
    const totalRetweets = tweets.reduce((s: number, t: any) => s + (t.retweet_count ?? 0), 0);
    const avgLikes      = tweets.length ? Math.round(totalLikes / tweets.length) : 0;

    const lastTweetDate = tweets[0]?.created_at
      ? new Date(tweets[0].created_at)
      : null;
    const daysSinceLast = lastTweetDate
      ? Math.round((Date.now() - lastTweetDate.getTime()) / 86400000)
      : null;

    return JSON.stringify({
      source: "x_public_syndication",
      handle: clean,
      name: user.name,
      bio: user.description?.slice(0, 200),
      verified: user.verified ?? false,
      followers: user.followers_count ?? 0,
      following: user.friends_count ?? 0,
      tweet_count: user.statuses_count ?? 0,
      listed_count: user.listed_count ?? 0,
      recent_tweets_count: tweets.length,
      days_since_last_tweet: daysSinceLast,
      avg_likes_per_tweet: avgLikes,
      total_likes_recent: totalLikes,
      total_retweets_recent: totalRetweets,
      has_url_in_bio: !!(user.url),
      pinned_tweet: tweets.find((t: any) => t.pinned)?.full_text?.slice(0, 200) ?? null,
      sample_tweets: tweets.slice(0, 3).map((t: any) => t.full_text?.slice(0, 100)),
    }, null, 2);
  } catch {
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
