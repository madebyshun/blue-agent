import type { Metadata } from "next";
import Marketplace from "./Marketplace";

export const metadata: Metadata = {
  title: "Marketplace — Discover APIs · Blue Hub",
  description: "Browse 50+ pay-per-call AI APIs for Base. Verified, AI-ready, USDC settlement on Base.",
};

export default function MarketplacePage() {
  return <Marketplace />;
}
