import { NextRequest, NextResponse } from "next/server";
import {
  getTokenInfo,
  getTokenHolders,
  getTokenTransfers,
  explorerBase,
  type RobinhoodNetwork,
} from "@/lib/robinhood/blockscout";

// Read-only "Explore" data for a Robinhood Chain token — real data pulled
// live from Blockscout (robinhoodchain.blockscout.com / explorer.testnet.…),
// never fabricated. No wallet interaction, no fund risk.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const network = (searchParams.get("network") === "testnet" ? "testnet" : "mainnet") as RobinhoodNetwork;

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const [info, holders, transfers] = await Promise.all([
    getTokenInfo(network, address),
    getTokenHolders(network, address),
    getTokenTransfers(network, address),
  ]);

  if (!info) {
    return NextResponse.json({ ok: false, error: "Token not found on Blockscout yet — it may still be indexing." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    network,
    explorerUrl: `${explorerBase(network)}/token/${address}`,
    info,
    holders: holders.slice(0, 10),
    holdersCount: Number(info.holders_count ?? holders.length),
    transfers: transfers.slice(0, 10),
  });
}
