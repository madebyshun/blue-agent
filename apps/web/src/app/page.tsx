// Landing (rebuilt 2026-11-12): three modes, Chat · Agents · Markets, then the
// builder hook and the limits. Every figure on the page is read here, on the
// server, from the same sources the app pages read; a source that cannot be
// read hides its figure instead of showing a stale or invented one. The
// client half (motion, copy buttons) lives in ./_landing/Landing.tsx.
import { unstable_cache } from "next/cache";
import Landing, { type LandingData } from "./_landing/Landing";
import { TOOL_COUNT, FREE_TOOL_COUNT } from "@/lib/agent-tools";
import { MCP_TOOL_COUNT } from "@/lib/mcp-tools";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { scorecardView } from "@/lib/weekend/view";
import { readSessionVolume } from "@/lib/weekend/sessions";
import { readExchange } from "@/lib/hub/exchange";

export const revalidate = 600;

const live = unstable_cache(async (): Promise<Pick<LandingData, "scorecard" | "sessions" | "exchange">> => {
  const [card, sess, ex] = await Promise.all([
    scorecardView({ limit: 1 }).catch(() => "error" as const),
    readSessionVolume().catch(() => null),
    readExchange(30).catch(() => null),
  ]);
  let scorecard: LandingData["scorecard"] = null;
  if (card !== "error" && card.summary.calls > 0) {
    const s = card.summary;
    const big = s.by_size.filter((b) => b.bucket !== "0.5–1%");
    const w = card.weekends[0];
    const top = w ? [...w.rows].sort((a, b) => Math.abs(b.weekend_move_pct) - Math.abs(a.weekend_move_pct))[0] : undefined;
    scorecard = {
      calls: s.calls, hits: s.hits, ready: s.ready, hitRate: s.hit_rate,
      bigCalls: big.reduce((a, b) => a + b.calls, 0), bigHits: big.reduce((a, b) => a + b.hits, 0),
      weekends: s.weekends,
      latest: w && top ? { friday: w.friday, ticker: top.ticker, move: top.weekend_move_pct, gap: top.open_gap_pct } : null,
    };
  }
  // Until the weekly record exists, show the dated measurement it replaces
  // (8 stock tokens, 2026-10-12 to 2026-11-08, measured 2026-11-12 with the
  // same buckets), labelled with its window — never as a live figure.
  const sessions: LandingData["sessions"] = sess
    ? { open: sess.share.open, nights: sess.share.nights, weekend: sess.share.weekend, totalUsd: sess.total_usd, weeks: sess.window.weeks, tickers: sess.tickers.length, window: null }
    : { open: 20.3, nights: 55.8, weekend: 23.9, totalUsd: 1_510_119_512, weeks: 4, tickers: 8, window: "Oct 12 to Nov 8" };
  const exchange: LandingData["exchange"] = ex && ex.readable && ex.daysCovered > 0
    ? {
        days: ex.daysCovered,
        revenueUsd: ex.daily.reduce((a, d) => a + d.usd, 0),
        sellersListed: ex.providersListed,
        payers: ex.payersDistinct,
        payersFloor: ex.payersSaturated,
      }
    : null;
  return { scorecard, sessions, exchange };
}, ["landing:live:v1"], { revalidate: 600 });

export default async function Home() {
  const l = await live().catch(() => ({ scorecard: null, sessions: null, exchange: null }));
  return (
    <Landing data={{
      toolCount: TOOL_COUNT,
      freeCount: FREE_TOOL_COUNT,
      mcpCount: MCP_TOOL_COUNT,
      stockCount: COINBASE_BASE_STOCKS.length,
      ...l,
    }} />
  );
}
