import { NextResponse } from "next/server";
import {
  buildRouterDeployData,
  ROBINHOOD_MAINNET_VERIFIED_FACTORY,
  ROBINHOOD_MAINNET_VERIFIED_WETH9,
} from "@/lib/robinhood/swap";

// One-time infra deploy: prepares the raw contract-creation tx for
// RobinhoodSwapRouter on Robinhood Chain mainnet (4663). Only the
// on-chain-verified factory/WETH pair is ever used here (see swap.ts header
// comment for how those two addresses were confirmed) — never a guess.
//
// This is NOT a per-user action. It's meant to be broadcast once by whoever
// deploys the shared router; the resulting address then gets hardcoded into
// ROBINHOOD_SWAP_ROUTER_ADDRESS for the app to use going forward.
export async function GET() {
  const data = buildRouterDeployData(ROBINHOOD_MAINNET_VERIFIED_FACTORY, ROBINHOOD_MAINNET_VERIFIED_WETH9);
  return NextResponse.json({
    ok: true,
    chainId: 4663,
    factory: ROBINHOOD_MAINNET_VERIFIED_FACTORY,
    weth9: ROBINHOOD_MAINNET_VERIFIED_WETH9,
    tx: { data, value: "0x0", chainId: 4663 },
  });
}
