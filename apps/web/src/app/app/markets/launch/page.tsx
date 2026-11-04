// /markets/launch — Markets → Launch token: the Quadra v3 launchpad on Base 8453
// (lib/agent-coin). Same page as /exchange/tokenize; the wallet signs every call.
import type { Metadata } from "next";
import { launchAssets } from "@/app/app/exchange/tokenize/assets";
import TokenizeClient from "../../exchange/tokenize/TokenizeClient";

// Dynamic, like /markets: a static prerender would read 268 stock pools at
// BUILD time and time the Vercel build out (0fe60625 failed that way).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Launch a token — Blue Agent",
  description: "Launch a token on Base: no admin, fixed supply, locked liquidity in a Uniswap v4 pool. You sign every step.",
};

export default async function LaunchPage() {
  return <TokenizeClient markets assets={await launchAssets()} />;
}
