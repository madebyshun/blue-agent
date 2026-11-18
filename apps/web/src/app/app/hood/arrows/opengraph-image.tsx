import { renderCard, OG_SIZE } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Hood track record";

export default function Image() {
  return renderCard({
    kicker: "BLUE HOOD · TRACK RECORD",
    a: "Every graded arrow,", b: "with its receipt.",
    sub: "Chainlink vs DEX signals on stock tokens, each kept with its brief, its outcome and the facts at fire.",
    pills: ["Graded", "Receipts", "Misses kept"],
  });
}
