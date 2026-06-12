// GET /api/activity?address=0x…&network=base|baseSepolia
//
// Real on-chain transaction history for the BlueBank dashboard — USDC transfers
// + native ETH sends, classified (Received / Sent / Supplied / Withdrew) using
// the verified Aave/Morpho/aUSDC addresses. Data from the Etherscan V2 API
// (covers Base 8453 + Base Sepolia 84532). Needs ETHERSCAN_API_KEY; degrades to
// an empty list (the UI then shows the Basescan link) when the key is absent.

import { NextResponse } from "next/server";

const CHAINS: Record<string, { id: number; usdc: string; venues: string[]; usdcDec: number }> = {
  base: {
    id: 8453, usdcDec: 6,
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    venues: [
      "0xa238dd80c259a72e81d7e4664a9801593f98d1c5", // Aave v3 Pool
      "0x4e65fe4dba92790696d040ac24aa414708f5c0ab", // aUSDC
      "0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61", // Morpho Gauntlet USDC Prime
    ],
  },
  baseSepolia: {
    id: 84532, usdcDec: 6,
    usdc: "0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f",
    venues: [
      "0x8bab6d1b75f19e9ed9fce8b9bd338844ff79ae27", // Aave v3 Pool (Sepolia)
      "0x10f1a9d11cdf50041f3f8cb7191cbe2f31750acc", // aUSDC (Sepolia)
    ],
  },
};

interface EtxRow { hash: string; timeStamp: string; from: string; to: string; value: string; tokenSymbol?: string; tokenDecimal?: string; contractAddress?: string }

function classify(kind: "usdc" | "eth", row: EtxRow, me: string, venues: string[]) {
  const from = row.from?.toLowerCase(), to = row.to?.toLowerCase();
  const meL = me.toLowerCase();
  const outgoing = from === meL;
  const counterparty = outgoing ? to : from;
  const isVenue = venues.includes(counterparty ?? "");
  if (kind === "usdc" && isVenue) return outgoing ? { label: "Supplied", dir: "out" as const } : { label: "Withdrew", dir: "in" as const };
  return outgoing ? { label: "Sent", dir: "out" as const } : { label: "Received", dir: "in" as const };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = u.searchParams.get("address") ?? "";
  const network = u.searchParams.get("network") ?? "baseSepolia";
  const cfg = CHAINS[network] ?? CHAINS.baseSepolia;
  const key = process.env.ETHERSCAN_API_KEY;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ items: [], error: "invalid address" });
  if (!key) return NextResponse.json({ items: [], needsKey: true });

  const base = `https://api.etherscan.io/v2/api?chainid=${cfg.id}&address=${address}&page=1&offset=25&sort=desc&apikey=${key}`;
  try {
    const [tok, eth] = await Promise.all([
      fetch(`${base}&module=account&action=tokentx&contractaddress=${cfg.usdc}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`${base}&module=account&action=txlist`, { cache: "no-store" }).then(r => r.json()),
    ]);

    type Item = { hash: string; ts: number; label: string; dir: "in" | "out"; asset: string; amount: number; counterparty: string };
    const items: Item[] = [];

    for (const r of (Array.isArray(tok?.result) ? tok.result : []) as EtxRow[]) {
      const c = classify("usdc", r, address, cfg.venues);
      items.push({ hash: r.hash, ts: Number(r.timeStamp) * 1000, label: c.label, dir: c.dir, asset: "USDC",
        amount: Number(r.value) / 10 ** cfg.usdcDec, counterparty: (c.dir === "out" ? r.to : r.from) });
    }
    for (const r of (Array.isArray(eth?.result) ? eth.result : []) as EtxRow[]) {
      if (!r.value || r.value === "0") continue; // skip contract calls with no ETH value
      const c = classify("eth", r, address, cfg.venues);
      items.push({ hash: r.hash, ts: Number(r.timeStamp) * 1000, label: c.label, dir: c.dir, asset: "ETH",
        amount: Number(r.value) / 1e18, counterparty: (c.dir === "out" ? r.to : r.from) });
    }

    items.sort((a, b) => b.ts - a.ts);
    return NextResponse.json({ items: items.slice(0, 20), ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message });
  }
}
