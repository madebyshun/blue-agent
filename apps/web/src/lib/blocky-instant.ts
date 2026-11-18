/**
 * Instant hire of a BaseCity Blocky over x402 (agreed with BaseCity and
 * decided under ShunTr's delegation, 2026-11-18).
 *
 * Each Blocky knows its own skills and sets its own price (BaseCity
 * specializations, 2026-11-18: guild from Role, how many skills from Rarity,
 * price multiplier capped by level). Blue reads both from BaseCity at quote
 * time instead of hardcoding them. The buyer's wallet pays the Blocky OWNER
 * directly through /api/hire; BaseCity settles only after a successful answer
 * (their promise, not Blue's). Blue never signs, settles or holds anything.
 *
 * Rules Blue enforces itself, whatever BaseCity says:
 *  - only per-Blocky URLs, exactly
 *    https://www.basecity.space/api/x402?tool=<id>&blocky=<n>
 *    with <id> a tool in BaseCity's catalog and a known skill of THIS Blocky
 *    (Blue never relays blocky=any);
 *  - the payTo the buyer signs to must equal ownerOf(n) on the Blockies NFT,
 *    read on chain at quote time (/api/hire); the browser refuses a quote to
 *    any other payTo or above the price listed for this Blocky;
 *  - a hard ceiling of MAX_PRICE_USD per call, so a misreported price can
 *    never be shown as acceptable;
 *  - output is third-party data (BaseCity), labelled as such;
 *  - a paid call counts in the agent record only after Blue re-reads the
 *    settlement receipt, tagged "instant", kept apart from job deliveries.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASECITY_BLOCKIES } from "@/lib/agent-ledger";
import type { ResourceSample } from "@/lib/hub/exchange";

export const BLOCKY_X402 = "https://www.basecity.space/api/x402";
/** Highest base price is $0.02 and the top multiplier ×2.25; anything above this is refused. */
export const MAX_PRICE_USD = 0.1;

/** The three stock tools that stand in for job-board skills (job form "Get it now", /api/catalog). Base prices. */
export const BLOCKY_TOOLS = [
  { id: "nav-premium", skill: "stock-nav-premium", priceUsd: 0.02, description: "How far a tokenized stock on Base trades from its Chainlink NAV, pool and oracle read at one block. Answered by a BaseCity Blocky (third-party data)." },
  // weekend-gap (BaseCity, 2026-11-18): built on Blue Agent's FREE weekend
  // scorecard; answers 422 insufficient_data on weekdays and charges nothing.
  { id: "weekend-gap", skill: "stock-weekend-gap", priceUsd: 0.01, description: "A stock token's weekend gap on Base: Friday close vs the weekend pool price. Answered by a BaseCity Blocky from Blue Agent's free weekend scorecard (third-party; weekdays return insufficient data, uncharged)." },
  { id: "after-hours-volume", skill: "stock-after-hours-volume", priceUsd: 0.01, description: "A tokenized stock's on-chain volume on Base over 24h and 7d, and how much ran while NYSE was shut. Answered by a BaseCity Blocky (third-party data)." },
] as const;

export const instantToolForSkill = (skill: string | null | undefined) => BLOCKY_TOOLS.find((t) => t.skill === skill) ?? null;
/** The job skill an instant tool stands for, else the tool id itself (for the agent record). */
export const skillForTool = (tool: string) => BLOCKY_TOOLS.find((t) => t.id === tool)?.skill ?? tool;
export const blockyUrl = (tool: string, n: string) => `${BLOCKY_X402}?tool=${tool}&blocky=${n}`;

const TOOL_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;

/** Pure: the {tool, n} of an exact per-Blocky URL, or null (incl. blocky=any). The tool must still be checked against the catalog. */
export function parseBlockyUrl(raw: string): { tool: string; n: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.origin !== "https://www.basecity.space" || u.pathname !== "/api/x402" || u.hash || u.username || u.password) return null;
  const keys = [...u.searchParams.keys()];
  if (keys.length !== 2 || !keys.includes("tool") || !keys.includes("blocky")) return null;
  const tool = u.searchParams.get("tool") ?? "", n = u.searchParams.get("blocky") ?? "";
  if (!TOOL_ID.test(tool) || !/^\d{1,6}$/.test(n)) return null;
  return raw === blockyUrl(tool, n) ? { tool, n } : null;
}

const OWNER_OF = [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] }] as const;

/** ownerOf(n) on the Blockies NFT, lowercased; null if unreadable or no such token. */
export async function blockyOwner(n: string): Promise<string | null> {
  if (!/^\d{1,6}$/.test(n)) return null;
  try {
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    return (await c.readContract({ address: BASECITY_BLOCKIES, abi: OWNER_OF, functionName: "ownerOf", args: [BigInt(n)] })).toLowerCase();
  } catch { return null; }
}

export interface CatalogTool { id: string; guild?: string; task?: string; priceUsd?: number; input?: { properties?: Record<string, { description?: string }>; required?: string[] }; contentType?: string }
interface BlockyInfo { guild?: string; role?: string; rarity?: string; level?: number; skills?: string[]; prices?: Record<string, number> }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 120 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** Example inputs for the Hire modal. Real values only where one is unambiguous; otherwise blank for the buyer to fill. */
function exampleFor(field: string, n: string): string {
  if (field === "ticker") return "NVDA";
  if (field === "blocky") return n;
  if (field === "query") return "token safety check on Base";
  return "";
}

/** Pure: build this Blocky's services from BaseCity's catalog and its own skill/price list. */
export function servicesFrom(n: string, catalog: CatalogTool[], info: BlockyInfo): ResourceSample[] {
  const byId = new Map(catalog.filter((t) => TOOL_ID.test(t.id)).map((t) => [t.id, t]));
  const out: ResourceSample[] = [];
  for (const id of info.skills ?? []) {
    const t = byId.get(id);
    const price = info.prices?.[id];
    if (!t || typeof price !== "number" || !(price > 0) || price > MAX_PRICE_USD) continue;
    const fields = Object.keys(t.input?.properties ?? {});
    out.push({
      url: blockyUrl(id, n), priceUsd: price, method: "POST", bodyType: "json", exampleIn: "body",
      name: `${id} · Blocky #${n}`,
      description: `${t.task ?? id}. Answered by BaseCity Blocky #${n} (${info.guild ?? "guild"} guild, level ${info.level ?? 1}); third-party data.`,
      example: Object.fromEntries(fields.map((f) => [f, exampleFor(f, n)])),
    });
  }
  return out;
}

/** The services Blocky n sells right now, priced for that Blocky (BaseCity catalog + /api/x402?blocky=n). */
export async function blockyServices(n: string): Promise<ResourceSample[]> {
  if (!/^\d{1,6}$/.test(n)) return [];
  const [cat, info] = await Promise.all([getJson<{ tools?: CatalogTool[] }>(BLOCKY_X402), getJson<BlockyInfo>(`${BLOCKY_X402}?blocky=${n}`)]);
  return cat?.tools && info ? servicesFrom(n, cat.tools, info) : [];
}
