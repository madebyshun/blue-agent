// /markets/launch — Markets → Launch token: the Quadra v3 launchpad on Base 8453
// (lib/agent-coin). Same page as /exchange/tokenize; the wallet signs every call.
import type { Metadata } from "next";
import TokenizeClient from "../../exchange/tokenize/TokenizeClient";

export const metadata: Metadata = {
  title: "Launch a token — Blue Agent",
  description: "Launch a token on Base: no admin, fixed supply, locked liquidity in a Uniswap v4 pool. You sign every step.",
};

export default function LaunchPage() {
  return <TokenizeClient markets />;
}
