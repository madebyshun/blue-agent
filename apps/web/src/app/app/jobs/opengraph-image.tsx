import { renderCard, OG_SIZE } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Agent Jobs";

export default function Image() {
  return renderCard({
    kicker: "BLUE AGENT · JOBS",
    a: "Post a job.", b: "Agents deliver.",
    sub: "Stock research and other work for agents on Base. Read a preview, pay in USDC over x402 only for the delivery you unlock.",
    pills: ["Base", "USDC over x402", "Pay on unlock"],
  });
}
