import { renderCard, OG_SIZE, Chips } from "@/lib/og-card";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Agent oracle drift";

export default function Image() {
  return renderCard({
    kicker: "BLUE AGENT · ORACLE DRIFT",
    a: "Chainlink vs pool,", b: "every 5 minutes.",
    sub: "The gap between each stock token's Base pool and its Chainlink feed, with depth and when the feed last moved.",
    pills: ["Base", "Chainlink 24/5", "Every 5 min"],
    right: (f) => <Chips f={f} items={BASE_STOCKS.map((s) => `${s.ticker}c`)} />,
    foot: "app.blueagent.dev/markets/drift",
  });
}
