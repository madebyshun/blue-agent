import { renderCard, OG_SIZE, Chips } from "@/lib/og-card";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Agent weekend lab";

// Fixed facts only: the record moves every Monday, a cached card would not.
export default function Image() {
  return renderCard({
    kicker: "BLUE AGENT · WEEKEND LAB",
    a: "A Sunday call,", b: "graded at the open.",
    sub: "Stock tokens on Base trade all weekend. Monday's first Chainlink round grades the Sunday pools. Misses stay on the record.",
    pills: ["Sunday 22:00 UTC", "Monday open", "Graded in public"],
    right: (f) => <Chips f={f} items={BASE_STOCKS.map((s) => `${s.ticker}c`)} />,
    foot: "app.blueagent.dev/markets/weekend",
  });
}
