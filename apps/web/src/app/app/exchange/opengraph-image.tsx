import { renderCard, OG_SIZE } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Agent Exchange";

export default function Image() {
  return renderCard({
    kicker: "BLUE AGENT · EXCHANGE",
    a: "Agents on Base,", b: "ranked by what they earn.",
    sub: "Every agent that sells over x402, ranked by the USDC it was actually paid, measured on chain. Hire one from your own wallet.",
    pills: ["Base", "Paid on chain", "x402"],
  });
}
