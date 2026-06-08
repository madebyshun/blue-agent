/**
 * Blue Search — curated Base ecosystem corpus.
 *
 * Static seed of high-quality Base facts. Ships immediately without any
 * external infrastructure. The crawler (when wired) appends to this corpus
 * over time; the vector index (when Supabase + embeddings are configured)
 * augments lexical retrieval.
 *
 * Each entry is a self-contained answerable fact with citation.
 */

export interface Doc {
  id:        string;
  title:     string;
  url:       string;
  content:   string;
  source:    string;          // "docs.base.org" | "github" | "x.com" | "blog"
  topics:    string[];        // free-text tags for keyword boost
  updatedAt: string;          // ISO date
}

export const CORPUS: Doc[] = [

  // ── Base chain basics ──────────────────────────────────────────────────
  {
    id:       "base-chain-id",
    title:    "Base chain ID and RPC endpoints",
    url:      "https://docs.base.org/chain/network-information",
    content:  "Base mainnet chain ID is 8453. Sepolia testnet is 84532. Public RPC at https://mainnet.base.org. WebSocket at wss://mainnet.base.org. Block time is 2 seconds. Base is an Optimism-stack L2 secured by Ethereum mainnet.",
    source:   "docs.base.org",
    topics:   ["base", "chain", "rpc", "8453", "l2", "optimism"],
    updatedAt:"2026-05-15",
  },
  {
    id:       "base-usdc",
    title:    "Native USDC on Base",
    url:      "https://www.base.org/blog/native-usdc-on-base",
    content:  "Native USDC on Base is issued directly by Circle. Contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913. 6 decimals. Supports EIP-3009 TransferWithAuthorization for gasless transfers and x402 payments. Bridge from Ethereum via Coinbase or the official Base bridge.",
    source:   "base.org",
    topics:   ["usdc", "stablecoin", "circle", "eip-3009", "x402", "base"],
    updatedAt:"2026-05-15",
  },
  {
    id:       "base-bridge",
    title:    "Bridging assets to Base",
    url:      "https://bridge.base.org",
    content:  "Official Base bridge at bridge.base.org supports ETH, USDC, and most ERC-20 tokens from Ethereum mainnet. Deposits finalize in ~1 minute. Withdrawals take 7 days due to optimistic rollup challenge period. For faster withdrawals use third-party bridges like Across, Stargate, or Hop.",
    source:   "base.org",
    topics:   ["bridge", "deposit", "withdraw", "ethereum", "across", "stargate"],
    updatedAt:"2026-05-15",
  },

  // ── x402 protocol ──────────────────────────────────────────────────────
  {
    id:       "x402-overview",
    title:    "x402 protocol overview",
    url:      "https://x402.org",
    content:  "x402 is an open standard for pay-per-call HTTP APIs built on HTTP 402 Payment Required. Server returns 402 with USDC payment details, client signs an EIP-3009 TransferWithAuthorization, retries with X-Payment header, gets the result. Sub-second settlement on Base mainnet. No accounts, no API keys, no subscriptions.",
    source:   "x402.org",
    topics:   ["x402", "http-402", "eip-3009", "usdc", "pay-per-call", "ai-agents"],
    updatedAt:"2026-05-01",
  },
  {
    id:       "x402-facilitator",
    title:    "Coinbase CDP x402 facilitator",
    url:      "https://portal.cdp.coinbase.com/products/x402",
    content:  "Coinbase Developer Platform (CDP) hosts the reference x402 facilitator. Free to use. Verifies EIP-3009 signatures, settles USDC on Base or Solana, optionally Polygon and Arbitrum. SDK at @coinbase/x402 on npm. Bedrock AgentCore Payments uses this facilitator under the hood for autonomous agent transactions.",
    source:   "cdp.coinbase.com",
    topics:   ["coinbase", "cdp", "facilitator", "x402", "amazon", "bedrock"],
    updatedAt:"2026-05-20",
  },
  {
    id:       "x402-eip-3009",
    title:    "EIP-3009 TransferWithAuthorization for x402",
    url:      "https://eips.ethereum.org/EIPS/eip-3009",
    content:  "EIP-3009 enables gasless USDC transfers via off-chain signed authorizations. Sign typed data with domain (USD Coin/v2/8453/USDC), types (TransferWithAuthorization), and message (from/to/value/validAfter/validBefore/nonce). x402 servers verify the signature then submit on-chain. Authorizations expire ~5 minutes by convention.",
    source:   "eips.ethereum.org",
    topics:   ["eip-3009", "signature", "typed-data", "gasless", "usdc"],
    updatedAt:"2024-09-01",
  },

  // ── MCP / agent protocol ───────────────────────────────────────────────
  {
    id:       "mcp-overview",
    title:    "Model Context Protocol (MCP) for AI agents",
    url:      "https://modelcontextprotocol.io",
    content:  "MCP is an open protocol from Anthropic that lets AI clients (Claude Desktop, Cursor, Cline, Windsurf) discover and call external tools. JSON-RPC 2.0 over Streamable HTTP. Spec version 2025-03-26 is current. Servers expose tools/list and tools/call methods. Clients add one URL to config and instantly get every tool.",
    source:   "modelcontextprotocol.io",
    topics:   ["mcp", "claude", "cursor", "anthropic", "json-rpc"],
    updatedAt:"2026-04-15",
  },
  {
    id:       "blue-hub-mcp",
    title:    "Blue Hub MCP server",
    url:      "https://blueagent.dev/api/mcp",
    content:  "Blue Hub's MCP server is hosted at https://blueagent.dev/api/mcp. 60+ Base-native APIs callable as MCP tools. JSON-RPC 2.0 over Streamable HTTP, content-negotiated SSE on Accept: text/event-stream. Free tier for tools/list, x402 USDC for paid tools/call. 100 req/min/IP rate limit.",
    source:   "blueagent.dev",
    topics:   ["blue-hub", "mcp", "base", "tools", "api"],
    updatedAt:"2026-06-08",
  },

  // ── Major Base protocols ────────────────────────────────────────────────
  {
    id:       "aerodrome",
    title:    "Aerodrome — Base's largest DEX",
    url:      "https://aerodrome.finance",
    content:  "Aerodrome is a ve(3,3) DEX on Base, the largest by TVL. Fork of Velodrome V2. Supports concentrated liquidity (Slipstream pools), stable + volatile pools, and vote-escrowed AERO tokens. AERO contract: 0x940181a94A35A4569E4529A3CDfB74e38FD98631. Most Base token pairs route through Aerodrome for best liquidity.",
    source:   "aerodrome.finance",
    topics:   ["aerodrome", "dex", "ve33", "liquidity", "aero", "slipstream"],
    updatedAt:"2026-05-01",
  },
  {
    id:       "uniswap-v4-base",
    title:    "Uniswap v4 on Base",
    url:      "https://docs.uniswap.org/contracts/v4/overview",
    content:  "Uniswap v4 launched on Base with hooks support. Hooks allow custom pool logic (dynamic fees, on-chain limit orders, MEV protection). PoolManager singleton at 0x498581fF718922c3f8e6A244956aF099B2652b2b. Hook contracts plug into pool lifecycle (beforeSwap, afterSwap, etc).",
    source:   "uniswap.org",
    topics:   ["uniswap", "v4", "hooks", "poolmanager", "base"],
    updatedAt:"2026-04-10",
  },
  {
    id:       "morpho-base",
    title:    "Morpho on Base — lending markets",
    url:      "https://morpho.org",
    content:  "Morpho is a permissionless lending protocol live on Base. Each market is a 1-collateral-1-borrow pair with isolated risk. Top Base markets: WETH/USDC, cbBTC/USDC, AERO/USDC. Curators publish vault strategies (Steakhouse, Gauntlet, Re7) that auto-allocate across Morpho markets. APYs typically 3-8% on USDC vaults.",
    source:   "morpho.org",
    topics:   ["morpho", "lending", "vault", "yield", "curator"],
    updatedAt:"2026-05-12",
  },
  {
    id:       "extra-finance",
    title:    "Extra Finance — leveraged yield on Base",
    url:      "https://extrafi.io",
    content:  "Extra Finance offers leveraged farming on Base. Users deposit USDC/WETH, get up to 10x leveraged exposure to Aerodrome LPs. Built-in stop-loss + auto-rebalance. APY typically 20-80% on leveraged positions, risk of liquidation if collateral drops.",
    source:   "extrafi.io",
    topics:   ["extra", "leveraged", "yield", "farming", "aerodrome"],
    updatedAt:"2026-04-22",
  },

  // ── Smart Wallet / Coinbase products ────────────────────────────────────
  {
    id:       "coinbase-smart-wallet",
    title:    "Coinbase Smart Wallet",
    url:      "https://www.smartwallet.dev",
    content:  "Coinbase Smart Wallet is an ERC-4337 account abstraction wallet built into Base. No seed phrase — uses WebAuthn passkeys for signing. Supports gasless transactions via paymaster. Free to create. Integrates natively with Coinbase Onramp for fiat-to-crypto. Common choice for dApps targeting non-crypto users.",
    source:   "smartwallet.dev",
    topics:   ["smart-wallet", "coinbase", "erc-4337", "passkey", "gasless"],
    updatedAt:"2026-05-08",
  },
  {
    id:       "cdp-onchainkit",
    title:    "OnchainKit by Coinbase",
    url:      "https://onchainkit.xyz",
    content:  "OnchainKit is Coinbase's React component library for building Base apps. Provides plug-and-play components: <Wallet>, <Swap>, <Transaction>, <NFTMint>, <Fund>. Works with wagmi + viem. Free, open-source. Ships pre-styled with Coinbase design system but fully customizable.",
    source:   "onchainkit.xyz",
    topics:   ["onchainkit", "react", "components", "wallet", "swap"],
    updatedAt:"2026-05-15",
  },
  {
    id:       "basenames",
    title:    "Basenames — .base.eth subdomains",
    url:      "https://www.base.org/names",
    content:  "Basenames is Base's native ENS-compatible naming system. Register .base.eth names for $0.20-$5 depending on length. Resolves like normal ENS via reverse-records contract at 0x79EA96012eEa67A83431F1701B3dFf7e37F9E282. Use Basenames to identify wallets, agents, and apps with human-readable identifiers.",
    source:   "base.org",
    topics:   ["basenames", "ens", "naming", "domains"],
    updatedAt:"2026-04-01",
  },

  // ── Developer tools ─────────────────────────────────────────────────────
  {
    id:       "basescan",
    title:    "Basescan block explorer",
    url:      "https://basescan.org",
    content:  "Basescan is the canonical block explorer for Base mainnet, operated by the Etherscan team. Verify contracts, read transaction history, monitor token transfers. API at api.basescan.org requires free API key. Free tier: 5 req/sec, 100K req/day. Paid tiers from $200/mo for higher throughput.",
    source:   "basescan.org",
    topics:   ["basescan", "explorer", "etherscan", "api", "contract-verify"],
    updatedAt:"2026-05-20",
  },
  {
    id:       "foundry-base",
    title:    "Foundry for Base development",
    url:      "https://book.getfoundry.sh",
    content:  "Foundry is the recommended dev framework for Base smart contracts. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup. Deploy to Base: forge create --rpc-url https://mainnet.base.org --private-key $KEY src/Contract.sol:Contract. Verify: forge verify-contract <address> Contract --etherscan-api-key $KEY --chain 8453.",
    source:   "getfoundry.sh",
    topics:   ["foundry", "forge", "solidity", "deploy", "verify"],
    updatedAt:"2026-05-01",
  },
  {
    id:       "alchemy-base",
    title:    "Alchemy on Base",
    url:      "https://www.alchemy.com/base",
    content:  "Alchemy provides hosted Base RPC with enhanced APIs. Free tier: 300M compute units/month. Account abstraction bundler + paymaster service. Webhooks for address-activity, mined-tx, dropped-tx, NFT-activity. Used by most production Base apps for reliable RPC + analytics.",
    source:   "alchemy.com",
    topics:   ["alchemy", "rpc", "bundler", "paymaster", "webhook"],
    updatedAt:"2026-05-15",
  },

  // ── Token launches & memecoins ──────────────────────────────────────────
  {
    id:       "clanker",
    title:    "Clanker — Farcaster memecoin launcher",
    url:      "https://clanker.world",
    content:  "Clanker is a Base memecoin deployer triggered via Farcaster cast. Reply to @clanker with a token name + ticker + image and it auto-deploys on Base with Uniswap v4 LP. 1B fixed supply. No team allocation. Used for permissionless community memecoins. Top Clankers have done $10M+ market cap.",
    source:   "clanker.world",
    topics:   ["clanker", "memecoin", "farcaster", "launch", "uniswap-v4"],
    updatedAt:"2026-04-10",
  },
  {
    id:       "virtuals-base",
    title:    "Virtuals Protocol on Base",
    url:      "https://www.virtuals.io",
    content:  "Virtuals Protocol launches AI agent tokens on Base (and Solana). Each agent gets bonded curve, transitions to Uniswap LP at $300K market cap. Top Base agents: aixbt, luna, gameai. AI agents earn revenue from interactions, distributed to token holders. $VIRTUAL token captures protocol fees.",
    source:   "virtuals.io",
    topics:   ["virtuals", "ai-agents", "aixbt", "tokens", "bonded-curve"],
    updatedAt:"2026-05-08",
  },

  // ── $BLUEAGENT specific ─────────────────────────────────────────────────
  {
    id:       "blueagent-token",
    title:    "$BLUEAGENT token",
    url:      "https://basescan.org/token/0xf895783b2931c919955e18b5e3343e7c7c456ba3",
    content:  "$BLUEAGENT is the utility + governance token for Blue Agent and Blue Hub. Contract: 0xf895783b2931c919955e18b5e3343e7c7c456ba3 on Base mainnet. Uniswap v4 liquidity. Two utilities: (1) Blue Chat — staking grants daily AI credits + tool discounts (Starter 500K, Pro 2M, Max 10M tiers). (2) Blue Hub marketplace — stakers earn 10% of every paid API call's USDC revenue as fee-share.",
    source:   "blueagent.dev",
    topics:   ["blueagent", "token", "staking", "utility", "fee-share"],
    updatedAt:"2026-06-08",
  },
  {
    id:       "blue-hub-fees",
    title:    "Blue Hub fee structure",
    url:      "https://api.blueagent.dev/staking",
    content:  "Every paid API call on Blue Hub splits revenue 80/10/10. 80% goes to the API provider's wallet. 10% goes to $BLUEAGENT stakers (proportional fee-share). 10% goes to Blue Hub treasury (ops + ecosystem grants + insurance fund). Settled in USDC on Base via the splitter contract (shipping with Phase 4).",
    source:   "blueagent.dev",
    topics:   ["blue-hub", "fees", "revenue-split", "80-10-10", "stakers"],
    updatedAt:"2026-06-08",
  },

  // ── Common dev questions ────────────────────────────────────────────────
  {
    id:       "deploy-base-mainnet",
    title:    "Deploy a contract to Base mainnet",
    url:      "https://docs.base.org/quickstart/deploy-with-foundry",
    content:  "To deploy to Base mainnet with Foundry: 1) Fund a wallet with ETH on Base (bridge from Ethereum or buy on Coinbase). 2) forge create --rpc-url https://mainnet.base.org --private-key $KEY --constructor-args ... src/MyContract.sol:MyContract. 3) Verify: forge verify-contract $ADDR MyContract --etherscan-api-key $BASESCAN_KEY --chain 8453. Gas typically 0.0001-0.001 ETH per deploy.",
    source:   "docs.base.org",
    topics:   ["deploy", "foundry", "forge", "verify", "tutorial"],
    updatedAt:"2026-05-01",
  },
  {
    id:       "base-grants",
    title:    "Base ecosystem grants",
    url:      "https://www.base.org/ecosystem/grants",
    content:  "Base offers ecosystem grants for builders. Builder Rewards: weekly $1K-$5K ETH grants based on contract activity (track at builderscore.xyz). Optimism Foundation RPGF: retroactive grants $5K-$100K. Coinbase Ventures: equity rounds for serious teams. Apply via base.org/ecosystem or DM @jessepollak.",
    source:   "base.org",
    topics:   ["grants", "funding", "builder-rewards", "rpgf", "ventures"],
    updatedAt:"2026-05-15",
  },
];

/** Tokenize text for lexical matching — lowercase + split on non-word. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s.-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}
