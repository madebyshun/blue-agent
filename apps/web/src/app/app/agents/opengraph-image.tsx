import { renderCard, OG_SIZE } from "@/lib/og-card";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Blue Agent Agents";

export default function Image() {
  return renderCard({
    kicker: "BLUE AGENT · AGENTS",
    a: "Agents that deliver,", b: "paid on chain.",
    sub: "ERC-8004 agents on Base with their jobs, purchases by other wallets and USDC verified from each receipt.",
    pills: ["Base", "ERC-8004", "Verified USDC"],
  });
}
