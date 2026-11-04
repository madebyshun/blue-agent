// Logos and USD prices for the launch page's pair picker. Only the stocks the
// Quadra v3 factory has ENABLED as a quote (11 on 2026-11-04) are read: one
// multicall on Base 8453 for `quotes(stock).enabled`, then one GeckoTerminal
// multi-token call for those few. Reading every Base stock (readStockMarkets)
// took ~60s in production and the picker's 4s cap always lost, so every pair
// showed a monogram. Cached 5 min when complete. A read that fails leaves the
// picker on monograms; it never blocks a launch.
import { unstable_cache } from "next/cache";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { ETH_QUOTE, QUADRA_FACTORY_V3, QUADRA_V3_ABI } from "@/lib/agent-coin";
import { gtJson } from "@/lib/launchpads/gt";
import type { AssetInfo } from "./TokenizeClient";

const WETH = "0x4200000000000000000000000000000000000006";

type GtTok = { attributes?: { address?: string; image_url?: string | null; price_usd?: string | null } };

const logoOf = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u) && !/missing/.test(u) ? u : null);

async function readEnabledAssets(): Promise<AssetInfo> {
  const pub = createPublicClient({ chain: base, transport: http() });
  const res = await pub.multicall({
    contracts: COINBASE_BASE_STOCKS.map((s) => ({ address: QUADRA_FACTORY_V3, abi: QUADRA_V3_ABI, functionName: "quotes", args: [s.token] } as const)),
  });
  const enabled = COINBASE_BASE_STOCKS.filter((_, i) => res[i]?.status === "success" && (res[i].result as readonly [boolean, number])[0])
    .map((s) => s.token.toLowerCase());
  const addrs = [WETH, ...enabled].slice(0, 30);
  const { body } = await gtJson<{ data?: GtTok[] }>(`/networks/base/tokens/multi/${addrs.join(",")}`, 2);
  if (!body) throw new Error("unread"); // never cache a miss
  const out: AssetInfo = {};
  for (const t of body.data ?? []) {
    const a = t.attributes ?? {};
    const addr = String(a.address ?? "").toLowerCase();
    const p = Number(a.price_usd);
    // The picker keys ETH by the zero address (the factory's native quote).
    out[addr === WETH ? ETH_QUOTE : addr] = { logo: logoOf(a.image_url), priceUsd: Number.isFinite(p) && p > 0 ? p : null };
  }
  return out;
}

const cached = unstable_cache(readEnabledAssets, ["launch:assets:v2"], { revalidate: 300 });

export async function launchAssets(): Promise<AssetInfo> {
  try {
    return await Promise.race([
      cached(),
      new Promise<AssetInfo>((r) => setTimeout(() => r({}), 8000)),
    ]);
  } catch {
    return {};
  }
}
