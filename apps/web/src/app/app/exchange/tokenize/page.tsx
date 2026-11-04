// /exchange/tokenize — give an agent a coin on Quadra's launchpad (v3) on Base
// 8453. The page builds the factory's own calls; the connected wallet signs.
import type { Metadata } from "next";
import { launchAssets } from "@/app/app/exchange/tokenize/assets";
import TokenizeClient from "./TokenizeClient";

// Dynamic, like /markets: a static prerender would read 268 stock pools at
// BUILD time and time the Vercel build out (0fe60625 failed that way).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tokenize an agent — Blue Agent",
  description: "Launch a coin for your agent on Base: no admin, locked liquidity, trading fees to the agent's wallet.",
};

export default async function TokenizePage() {
  return <TokenizeClient assets={await launchAssets()} />;
}
