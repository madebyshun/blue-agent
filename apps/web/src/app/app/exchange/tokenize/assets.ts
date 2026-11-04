// Logos and USD prices for the launch page's pair picker: the Base stock rows
// /markets already reads (GeckoTerminal via lib/markets, cached 5 min). A read
// that fails leaves the picker on monograms; it never blocks a launch.
import { readStockMarkets } from "@/lib/markets";
import type { AssetInfo } from "./TokenizeClient";

export async function launchAssets(): Promise<AssetInfo> {
  try {
    const { rows } = await readStockMarkets();
    return Object.fromEntries(rows.filter((r) => r.chain === "base").map((r) => [r.contract.toLowerCase(), { logo: r.logo, priceUsd: r.priceUsd }]));
  } catch {
    return {};
  }
}
