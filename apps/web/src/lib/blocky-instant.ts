/**
 * Instant hire of a BaseCity Blocky over x402 (agreed with BaseCity and
 * decided under ShunTr's delegation, 2026-11-18).
 *
 * For deterministic stock skills a Blocky answers at once: the buyer's wallet
 * pays the Blocky OWNER directly through /api/hire, and BaseCity settles only
 * after a successful answer (their promise, not Blue's). Blue never signs,
 * settles or holds anything.
 *
 * Rules Blue enforces itself:
 *  - only per-Blocky URLs, exactly
 *    https://www.basecity.space/api/x402?tool=<nav-premium|after-hours-volume|weekend-gap>&blocky=<n>
 *    (BaseCity resolves "any" to an <n> before quoting; Blue never relays "any");
 *  - the payTo the buyer signs to must equal ownerOf(n) on the Blockies NFT,
 *    read on chain at quote time (/api/hire), and the browser's quote check
 *    (HireAgent quoteProblem) refuses a quote to any other payTo;
 *  - output is third-party data (BaseCity), labelled as such;
 *  - a paid call counts in the agent record only after Blue re-reads the
 *    settlement receipt, tagged "instant", kept apart from job deliveries.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASECITY_BLOCKIES } from "@/lib/agent-ledger";
import type { ResourceSample } from "@/lib/hub/exchange";

export const BLOCKY_X402 = "https://www.basecity.space/api/x402";
/** Instant tools and the job skill each one replaces. Prices as BaseCity's catalog lists them (2026-11-18). */
export const BLOCKY_TOOLS = [
  { id: "nav-premium", skill: "stock-nav-premium", priceUsd: 0.02, description: "How far a tokenized stock on Base trades from its Chainlink NAV, pool and oracle read at one block. Answered by a BaseCity Blocky (third-party data)." },
  // weekend-gap (BaseCity, 2026-11-18): built on Blue Agent's FREE weekend
  // scorecard; answers 422 insufficient_data on weekdays and charges nothing.
  { id: "weekend-gap", skill: "stock-weekend-gap", priceUsd: 0.01, description: "A stock token's weekend gap on Base: Friday close vs the weekend pool price. Answered by a BaseCity Blocky from Blue Agent's free weekend scorecard (third-party; weekdays return insufficient data, uncharged)." },
  { id: "after-hours-volume", skill: "stock-after-hours-volume", priceUsd: 0.01, description: "A tokenized stock's on-chain volume on Base over 24h and 7d, and how much ran while NYSE was shut. Answered by a BaseCity Blocky (third-party data)." },
] as const;

export const instantToolForSkill = (skill: string | null | undefined) => BLOCKY_TOOLS.find((t) => t.skill === skill) ?? null;
export const blockyUrl = (tool: string, n: string) => `${BLOCKY_X402}?tool=${tool}&blocky=${n}`;

/** Pure: the {tool, n} of an exact per-Blocky URL, or null for anything else (including blocky=any). */
export function parseBlockyUrl(raw: string): { tool: string; n: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.origin !== "https://www.basecity.space" || u.pathname !== "/api/x402" || u.hash || u.username || u.password) return null;
  const keys = [...u.searchParams.keys()];
  if (keys.length !== 2 || !keys.includes("tool") || !keys.includes("blocky")) return null;
  const tool = u.searchParams.get("tool") ?? "", n = u.searchParams.get("blocky") ?? "";
  if (!BLOCKY_TOOLS.some((t) => t.id === tool) || !/^\d{1,6}$/.test(n)) return null;
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

/** The services a Blocky sells, in the shape the Hire Agent modal takes. */
export function blockyServices(n: string): ResourceSample[] {
  return BLOCKY_TOOLS.map((t) => ({ url: blockyUrl(t.id, n), priceUsd: t.priceUsd, description: t.description, name: `${t.id} · Blocky #${n}`, method: "POST", bodyType: "json", example: { ticker: "NVDA" }, exampleIn: "body" as const }));
}
