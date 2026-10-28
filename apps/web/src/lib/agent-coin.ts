/**
 * An agent's coin, launched on Quadra's launchpad (v3) on Base 8453 — the
 * /exchange/tokenize page. Quadra is a separate product (~/projects/quadra,
 * read-only from here); this module only BUILDS the calls its deployed factory
 * already accepts, the way the factory was designed to be used by Blue Agent
 * (contracts/README.md, "Referrals", owner 2026-10-22). The user's wallet signs.
 *
 * What one launch is (all enforced by the factory, read 2026-10-28):
 *   - a B20 token with NO admin: 1,000,000,000 supply minted once, no mint,
 *     pause, seize or rename, ever;
 *   - a Uniswap v4 pool against ETH holding the whole supply as liquidity no
 *     function can remove; the launcher may buy first in the same tx;
 *   - the pool's fee (1% or 3%, chosen) split by `collect`: 80% to the
 *     launcher's recipient, 5% to an APPROVED referrer, the rest to Quadra.
 *     Blue Agent's referrer 0x884f…7a9b read `approvedReferrers == true`.
 *   - Quadra v3 is NOT audited (its README says so) — the page says it too.
 *
 * Revenue share to HOLDERS: the factory has none. Fees go to one recipient,
 * which the launcher can point at the agent's wallet (`setCreatorRecipient`).
 * Paying holders would need a new contract; none is built, none is implied.
 */
import { parseAbi, toHex } from "viem";

export const QUADRA_FACTORY_V3 = "0x006Da367654a487bb277fe25ff54f0fE0f741377" as const;
/** Blue Agent's approved referrer on the factory (the ACP seller wallet). */
export const BLUE_REFERRER = "0x884fbdd5cf193e7f87cba76419e526d8f4df7a9b" as const;
export const ETH_QUOTE = "0x0000000000000000000000000000000000000000" as const;

/** Mirrors ~/projects/quadra/src/config/launchpad.ts LAUNCHPAD_V3_ABI (the subset used here). */
export const QUADRA_V3_ABI = parseAbi([
  "function launch(string name, string symbol, string contractURI, bytes32 salt, address quote, uint256 quoteIn, uint24 fee, address referrer) payable returns (address token)",
  "function predictToken(address caller, bytes32 salt) view returns (address)",
  "function setCreatorRecipient(address token, address recipient)",
  "function collect(address token) returns (uint256 amount0, uint256 amount1)",
  "function FEE_LOW() view returns (uint24)",
  "function FEE_HIGH() view returns (uint24)",
  "function CREATOR_SHARE_BPS() view returns (uint16)",
  "function REFERRER_SHARE_BPS() view returns (uint16)",
  "function approvedReferrers(address referrer) view returns (bool)",
  "function quotes(address quote) view returns (bool enabled, int24 startTick)",
  "function launches(address token) view returns ((address creator, address creatorRecipient, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key))",
  "event Launched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 devBuyIn, uint256 devBuyTokens)",
]);

/** What the deployed factory must answer before the page lets anyone sign (Quadra's LAUNCHPAD_V3_EXPECTS). */
export const QUADRA_V3_EXPECTS = { feeLow: 10_000, feeHigh: 30_000, creatorShareBps: 8_000, referrerShareBps: 500 } as const;

export interface CoinDraft {
  name: string;
  symbol: string;
  description: string;
  image: string;
  agentId: string;      // ERC-8004 id on Base, "" = none
}

const HTTPS = /^https:\/\/[^\s]+$/;

/** Why a draft cannot launch, or null. Limits follow Quadra's own form. */
export function coinProblem(d: CoinDraft): string | null {
  if (!d.name.trim() || d.name.trim().length > 32) return "Name: 1 to 32 characters.";
  if (!/^[A-Za-z0-9$]{1,11}$/.test(d.symbol.trim())) return "Symbol: 1 to 11 letters or digits, no spaces.";
  if (d.description.trim().length > 280) return "Description: 280 characters at most.";
  if (d.image.trim() && !HTTPS.test(d.image.trim())) return "Image must be an https:// link.";
  if (d.agentId.trim() && !/^\d{1,12}$/.test(d.agentId.trim())) return "Agent id is a number.";
  return null;
}

/**
 * ERC-7572 metadata as a data: URI, stored by the token itself (Quadra's shape),
 * plus the agent it belongs to: `external_link` → its Exchange page and an
 * `erc8004` pointer, so a reader can go from the coin to the agent.
 */
export function coinContractUri(d: CoinDraft): string {
  const json: Record<string, unknown> = { name: d.name.trim(), symbol: d.symbol.trim() };
  if (d.description.trim()) json.description = d.description.trim();
  if (d.image.trim()) json.image = d.image.trim();
  const id = d.agentId.trim();
  if (id) {
    json.external_link = `https://erc-8004.quicknode.com/agents/base-mainnet/${id}`;
    json.erc8004 = { agentRegistry: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", agentId: Number(id) };
  }
  const utf8 = new TextEncoder().encode(JSON.stringify(json));
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return `data:application/json;base64,${btoa(bin)}`;
}

export function newSalt(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

// ── Sharing the launcher's fees with stakers (Quadra RevenueShare) ───────────
//
// Deployed by ShunTr 2026-10-28 at the address below (tx 0x7a533a21…0d49,
// Base block 53,193,024), Sourcify
// exact_match, read back the same day: launchpad() == QUADRA_FACTORY_V3.
// One RevenueShare per (coin, agent, agentBps): the agent gets agentBps of what
// arrives, the rest streams over 7 days to whoever STAKES the coin. No owner,
// no upgrade. Pointing a coin's creator recipient at it CANNOT be undone.
// Wording below is Quadra's integration note, verbatim in substance: never
// yield, APY, dividends or a projected figure. Not audited.

export const REVENUE_SHARE_DEPLOYER = "0xfBd49864EaE71C3Db22265C46A98e0768EA08141" as const;
export const REVENUE_SHARE_DEPLOY_BLOCK = 53_193_024n;   // the deploy tx; Created logs start here

export const REVENUE_SHARE_DEPLOYER_ABI = parseAbi([
  "function launchpad() view returns (address)",
  "function create(address token, address agent, uint16 agentBps) returns (address share)",
  "function predict(address token, address agent, uint16 agentBps) view returns (address)",
  "event Created(address indexed token, address indexed share, address indexed agent, uint16 agentBps)",
]);

export const REVENUE_SHARE_ABI = parseAbi([
  "function launchpad() view returns (address)",
  "function token() view returns (address)",
  "function currency0() view returns (address)",
  "function currency1() view returns (address)",
  "function agent() view returns (address)",
  "function agentBps() view returns (uint16)",
  "function isActive() view returns (bool)",
  "function totalStaked() view returns (uint256)",
  "function stakedOf(address staker) view returns (uint256)",
  "function claimable(address staker) view returns (uint256 amount0, uint256 amount1)",
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function claim(address to) returns (uint256 paid0, uint256 paid1)",
  "function payAgent()",
  "function harvest()",
]);

export const ERC20_MIN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export const MAX_AGENT_BPS = 9_000;

/** The approved user-facing sentence (Quadra REVENUE_SHARE_INTEGRATION.md, "Wording"). */
export function stakerWording(symbol: string, quote: string): string {
  return `Stakers of $${symbol} receive a share of the trading fees this coin's pool collects, while staked. ` +
    `Fees depend on trading and may be zero. They are paid in $${symbol} and ${quote}, whose prices change. ` +
    `Not an investment product; no return is promised. Unstake at any time.`;
}
