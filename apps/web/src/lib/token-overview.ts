/**
 * One read of "what is token 0x… on Base / Robinhood Chain?" (2026-10-01).
 *
 * Chat could already check a BASE token (honeypot, contract trust, deep
 * analysis) but had nothing for a crypto token on Robinhood Chain — its RH
 * tools are all about stock tokens — and nothing anywhere that knew launchpads.
 * This brings four sources together, each labelled with where it came from:
 *
 *   on-chain   name / symbol / decimals / total supply (the token itself)
 *   registry   whether it is a stock token we have verified — RH registry or
 *              the Base B20 stock registry — matched by CONTRACT, never ticker
 *   launchpad  lib/launchpads/resolve.ts (on-chain reverse lookups)
 *   market     GeckoTerminal's keyless token-pools list: the deepest pools,
 *              their DEX, liquidity, 24h volume and price
 *
 * What it does NOT claim: a buy/sell tax on Robinhood Chain (nothing here
 * measures one — Base has hub_honeypot for that), or any verdict. Missing data
 * stays null and is said as "unknown"; absence from GeckoTerminal is not
 * evidence (a fresh launch 404s there).
 */
import { getAddress, isAddress, parseAbi, type Address } from "viem";
import { launchClient, resolveLaunchpad, type LaunchpadResolution } from "@/lib/launchpads/resolve";
import type { LaunchChain } from "@/lib/launchpads/registry";
import { findByContract as findRhToken } from "@/lib/robinhood/rwa-registry";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { gtJson } from "@/lib/launchpads/gt";

export interface TokenOverview {
  chain: LaunchChain;
  token: Address;
  onchain: { name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null; isContract: boolean | null };
  /** Set when the contract is a stock token in one of our verified registries. */
  stockToken: { ticker: string; name: string; venue: string } | null;
  launchpad: LaunchpadResolution | null;
  market: {
    priceUsd: number | null;
    pools: Array<{ name: string; dex: string; reserveUsd: number | null; volume24hUsd: number | null; change24hPct: number | null }>;
    /** "none listed" is not a negative — see the header. */
    status: "ok" | "none_listed" | "unread";
  };
}

const erc20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

function fmtSupply(raw: bigint, decimals: number): string {
  const whole = raw / 10n ** BigInt(decimals);
  return whole.toLocaleString("en-US");
}

async function readOnchain(chain: LaunchChain, token: Address): Promise<TokenOverview["onchain"]> {
  const c = launchClient(chain);
  // viem answers `undefined` for an address with NO code, so only a thrown
  // read is "unknown".
  let isContract: boolean | null;
  try { const code = await c.getCode({ address: token }); isContract = !!code && code !== "0x"; }
  catch { isContract = null; }
  if (isContract === false) return { name: null, symbol: null, decimals: null, totalSupply: null, isContract };
  const get = async <T,>(fn: "name" | "symbol" | "decimals" | "totalSupply"): Promise<T | null> => {
    try { return (await c.readContract({ address: token, abi: erc20, functionName: fn })) as T; } catch { return null; }
  };
  const name = await get<string>("name");
  const symbol = await get<string>("symbol");
  const decimals = await get<number>("decimals");
  const supply = await get<bigint>("totalSupply");
  return {
    name, symbol, decimals: decimals == null ? null : Number(decimals),
    totalSupply: supply != null && decimals != null ? fmtSupply(supply, Number(decimals)) : null,
    isContract,
  };
}

async function readMarket(chain: LaunchChain, token: Address): Promise<TokenOverview["market"]> {
  try {
    const { status, body: j } = await gtJson<{ data?: Array<{ attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } }> }> }>(
      `/networks/${chain}/tokens/${token}/pools?page=1`);
    if (status === 404) return { priceUsd: null, pools: [], status: "none_listed" };
    if (!j) return { priceUsd: null, pools: [], status: "unread" };
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const rows = (j.data ?? []).map((p) => {
      const a = p.attributes ?? {};
      const baseId = String(p.relationships?.base_token?.data?.id ?? "").toLowerCase();
      const ours = baseId.endsWith(token.toLowerCase());
      return {
        name: String(a.name ?? "?"),
        dex: String(p.relationships?.dex?.data?.id ?? "?"),
        reserveUsd: num(a.reserve_in_usd),
        volume24hUsd: num((a.volume_usd as Record<string, unknown> | undefined)?.h24),
        change24hPct: num((a.price_change_percentage as Record<string, unknown> | undefined)?.h24),
        price: num(ours ? a.base_token_price_usd : a.quote_token_price_usd),
      };
    }).sort((a, b) => (b.reserveUsd ?? 0) - (a.reserveUsd ?? 0));
    if (rows.length === 0) return { priceUsd: null, pools: [], status: "none_listed" };
    return {
      priceUsd: rows[0].price,
      pools: rows.slice(0, 3).map(({ price: _p, ...rest }) => rest),
      status: "ok",
    };
  } catch { return { priceUsd: null, pools: [], status: "unread" }; }
}

export async function tokenOverview(chain: LaunchChain, raw: string): Promise<TokenOverview> {
  if (!isAddress(raw)) throw new Error("not an address");
  const token = getAddress(raw);
  const onchain = await readOnchain(chain, token);

  let stockToken: TokenOverview["stockToken"] = null;
  if (chain === "robinhood") {
    const reg = findRhToken(token);
    if (reg && (reg.kind === "stock" || reg.kind === "etf")) {
      stockToken = { ticker: reg.ticker, name: reg.name, venue: "Robinhood Chain stock token (Robinhood Assets, Jersey)" };
    }
  } else {
    const s = BASE_STOCKS.find((x) => x.token.toLowerCase() === token.toLowerCase());
    if (s) stockToken = { ticker: s.ticker, name: s.name, venue: "Base B20 stock token (Coinbase)" };
  }

  const [launchpad, market] = await Promise.all([
    // A registered stock token was not launched on a launchpad; skip the probes.
    stockToken || onchain.isContract === false ? Promise.resolve(null) : resolveLaunchpad(chain, token).catch(() => null),
    onchain.isContract === false ? Promise.resolve({ priceUsd: null, pools: [], status: "none_listed" as const }) : readMarket(chain, token),
  ]);
  return { chain, token, onchain, stockToken, launchpad, market };
}
