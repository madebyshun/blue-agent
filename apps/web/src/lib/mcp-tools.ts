/**
 * The MCP tool manifest — the single array behind BOTH surfaces that publish it.
 *
 * WHY THIS IS A LIB AND NOT A CONST INSIDE THE ROUTE
 * -------------------------------------------------
 * It used to live in `app/api/mcp/route.ts`, and `/docs/mcp` kept a hand-copied
 * snapshot of it in `app/docs/_data.ts`. The snapshot drifted, as hand-copied
 * lists do. MEASURED 2026-09-18: the route served 86 tools; the docs snapshot
 * held 63, of which **7 were served by nothing at all** —
 *
 *   hub_builder_score · hub_brand_score · hub_wallet_pnl · hub_wallet_strategy
 *   hub_portfolio · hub_agent_revenue · hub_agent_token
 *
 * — names present in neither this manifest nor AGENT_TOOLS, published on a page
 * headed "Available tools", and 30 real tools were missing from that page
 * entirely. (The same 7 ids were simultaneously shipping in @blueagent/skill on
 * npm, which is how we know both were copying one imaginary source rather than
 * drifting independently.)
 *
 * A CI check comparing the two copies would have caught that. One array cannot
 * have it: `/docs/mcp` now renders exactly what `/api/mcp` serves, because it is
 * the same object. A derivation keeps being true; a pinned copy only keeps being
 * checked, and only for as long as someone maintains the check.
 *
 * Every consumer here is a SERVER module (`app/api/mcp/route.ts`,
 * `app/docs/_data.ts` and its nine server-rendered docs pages), so importing the
 * whole manifest costs no client bundle. Do NOT import this into a "use client"
 * tree — measured precedent: pulling `agent-tools.ts` into one added 16 kB
 * gzipped to First Load. A client page that needs the number gets a pinned
 * literal and a CI check instead (see scripts/docs-truth-check.ts, group 10).
 *
 * Shape is the MCP `tools/list` wire format — name, description, inputSchema —
 * so the route can return the array verbatim. Do NOT add fields outside that
 * shape; `/docs/mcp` derives its grouping from the name prefix precisely so the
 * wire payload stays clean.
 *
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-26 — CUT FROM 85 TOOLS TO 18. READ THIS BEFORE ADDING ONE BACK.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This array held 85 tools (15 blue_ + 63 hub_ + 7 b20_). MEASURED against a
 * live `tools/list` on production: **32,160 bytes ≈ 8,040 tokens**, loaded into
 * the context window of every connected agent on every single turn, before the
 * user has said anything.
 *
 * That is not a size problem. It is an ACCURACY problem, and it is measured:
 *
 *   • Tool-selection accuracy falls off a cliff between 40 and 50 always-loaded
 *     tools and collapses near 120. RAG-MCP measured selection accuracy going
 *     from ~43% to under 14% as a catalog grew; a separate eval measured ~95%
 *     correct at 4 tools against ~71% at 46.
 *   • So at 85 tools we were not offering an agent 85 capabilities. We were
 *     offering it ~18 capabilities plus a reliable way to pick the wrong one.
 *
 * Two more things were true of the old manifest, both measured the same day:
 *   🔴 **0 of 85 descriptions contained "Use when" or any trigger phrase.** The
 *      median description was 95 characters of what-it-is, with nothing telling
 *      a model WHEN to reach for it. A catalog that cannot be selected from is
 *      a catalog that gets guessed at.
 *   🔴 **36 of 85 named no chain at all** — including `hub_honeypot`,
 *      `hub_risk_gate` and `hub_token_pick`, which each take a bare token
 *      address. Base 8453 and Robinhood Chain 4663 share no state and
 *      NVDA / META / GOOGL exist on BOTH, so "token address" without a chain is
 *      an under-specified question that gets a confidently wrong answer. That
 *      is Hard Rule #1 violated 36 times in the one file an agent reads first.
 *
 * ── WHAT DID NOT HAPPEN: capability was not removed ────────────────────────
 * Every catalog tool remains live at `/api/x402/<id>`. They are now reached
 * by DISCOVERY rather than by preloading:
 *
 *      blue_registry  →  search/filter the whole catalog (first-party +
 *                        community), with category, price and input shape
 *      blue_call      →  actually invoke any id the registry returned; paid
 *                        ids go 402 → agent signs → 200, the $0.00 ids go
 *                        straight to 200
 *
 * Counts are deliberately absent from this comment. It carried "110 catalog
 * tools" and "all 116 tools (110 first-party + 6 community)" until 2026-09-27,
 * by which point the catalog was 115 and the community half was read live from
 * a registry that can be unreachable — so one of those numbers was wrong and
 * the other was never knowable at authoring time. The two counts that ARE
 * load-bearing live in the tool descriptions below and are pinned against
 * AGENT_TOOLS by docs-truth-check.ts. A number in a comment has no pin and no
 * reader who would notice.
 *
 * `blue_registry` already existed and already returned everything needed. What
 * was missing was the second half: its own `how_to_call.mcp` field said
 * "Connect the Blue Agent MCP server" — advice you can only read if you are
 * already connected, and which still did not tell you how to RUN anything. You
 * could discover the whole catalog and invoke none of it. `blue_call` is the one
 * genuinely new capability in this cut; everything else here is subtraction.
 *
 * ── WHAT STAYED, AND THE RULE FOR IT ───────────────────────────────────────
 * A tool earns a permanent slot only if preloading it beats discovering it.
 * That is true in exactly two cases:
 *   (a) it is the door (`blue_registry`, `blue_call`), or
 *   (b) an agent must reach for it WITHOUT being asked — pre-transaction safety
 *       checks and the execution primitives themselves. An agent that has to
 *       first search a registry to learn that honeypot checks exist will skip
 *       the check. Safety tools that need discovering do not get used.
 * Everything advisory (GTM, roadmap, pitch, launch simulators, sentiment) fails
 * both tests: the user always asks for those by name, so discovery is free.
 *
 * ── DO NOT ADD ANOTHER WITHOUT ANSWERING THIS ─────────────────────────────
 * "Would an agent fail to do the right thing if this were only discoverable?"
 * If the honest answer is no, it belongs behind `blue_registry`, not here. The
 * budget is the point — a manifest grows back to 85 one defensible tool at a
 * time, and every one of the 85 was defensible on its own.
 */
/**
 * ── v2 (2026-10-22): RENAMED, AND FIVE TOOLS NOW COST MONEY ───────────────
 * ShunTr relaunched the MCP as a product, so the 2026-09-27 rule "no tool gets
 * renamed to save context" was revisited on purpose, not drifted past: the
 * reason this time is a new product, not bytes. Names follow the ACP offerings
 * (`swap_prepare`, `stock_signal`…), underscore only — the Claude API rejects
 * tool names with dots, so `token.verdict` would break real clients.
 *
 * The set is what the market measured as bought (docs/mcp-tools-2026-10-22.md):
 * swap building, cheap market facts, trending discovery and a token verdict
 * sold at $0.01–$0.05 over the x402 MCP transport (lib/mcp-paid.ts); safety
 * and transaction building that nobody pays for stay free as the way in.
 * `blue_registry` + `blue_call` stay: they are how the Claude plugin's skills
 * reach the rest of the x402 catalog, which this cut does not remove.
 *
 * Old names keep answering, unlisted, until MCP_LEGACY_UNTIL with a note naming
 * their replacement (route.ts LEGACY) — MCP clients cache tool names, and a
 * silent break is worse than a month of aliases.
 */
export const MCP_TOOLS = [
  // ══ A · Paid — what agents measurably buy ═════════════════════════════════
  {
    name: "swap_prepare",
    description:
      "Build an unsigned swap the user signs in their OWN wallet, with the token checked first (honeypot, tax, impostor of a registered token, liquidity). Base 8453 routes through 0x AllowanceHolder (Aerodrome for stock tokens); Robinhood Chain 4663 through Blue Agent's RobinhoodSwapRouter on Uniswap V3, floored from the pool's own price. Returns { tx: { to, data, value, chainId }, approve, check } — never a broadcast, never a key. A token that fails the check is refused and not charged. Triggers — \"swap X for Y\", \"buy TOKEN\", \"sell my TOKEN\", \"convert USDC to ETH\". If no route exists the response says so — do NOT invent a price. PAID: $0.01 USDC on Base 8453 over the x402 MCP transport — the first call returns PaymentRequired (isError with structuredContent); an x402 MCP client (e.g. @x402/mcp) pays and retries with _meta[\"x402/payment\"]. Bad input is refused before any price, and a failed run is not charged.",
    inputSchema: {
      type: "object",
      properties: {
        chain:       { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Base 8453 or Robinhood Chain 4663. No default: the two share no state and the same ticker exists on both. If the user did not say, ASK." },
        fromAddress: { type: "string", description: "The wallet that will sign and receive — 0x… ." },
        tokenIn:     { type: "string", description: "Token being sold: 0x… address on `chain`, or \"ETH\". A ticker is refused — impostors copy tickers." },
        tokenOut:    { type: "string", description: "Token being bought: 0x… address on `chain`, or \"ETH\"." },
        amountIn:    { type: "string", description: "Amount of tokenIn in WHOLE units, e.g. \"25.5\" — NOT base units." },
        slippageBps: { type: "number", description: "Max slippage in basis points, whole number 0-10000 (100 = 1%). Base 8453: default 100, enforced by 0x in the quote's minBuyAmount. Robinhood Chain 4663: default 300, applied to the pool's price as the on-chain amountOutMinimum; with no price for the pair the build is refused (NO_QUOTE), never built unbounded." },
      },
      required: ["chain", "fromAddress", "tokenIn", "tokenOut", "amountIn"],
    },
  },
  {
    name: "token_verdict",
    description:
      "Should I touch this token? One call: honeypot and tax read from the contract, impostor check against registered tokens, owner powers, and — for tokenized stocks — the DEX vs Chainlink gap, plus the live price and liquidity on Base. Verdict picked in code, never by a model: no_issues_found / caution / avoid, each with its reasons. no_issues_found means nothing was found by the checks listed, not a guarantee. Use UNPROMPTED before naming an unfamiliar token as worth buying. Triggers — \"is TOKEN safe\", \"is this a scam\", \"rug check\", \"can I sell it\". Base 8453 or Robinhood Chain 4663. PAID: $0.01 USDC on Base 8453 over the x402 MCP transport — the first call returns PaymentRequired (isError with structuredContent); an x402 MCP client (e.g. @x402/mcp) pays and retries with _meta[\"x402/payment\"]. Bad input is refused before any price, and a failed run is not charged.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract 0x… on `chain`. Not a ticker — impostors copy tickers exactly." },
        chain: { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Base 8453 or Robinhood Chain 4663." },
      },
      required: ["token", "chain"],
    },
  },
  {
    name: "stock_signal",
    description:
      "Is a tokenized stock priced above or below the real stock right now? For one chain: the DEX price against the stock's Chainlink feed (drift_pct), whether the US market is open, and pool depth. With chain \"both\" (default): the gap between the same stock on Base 8453 and Robinhood Chain 4663 (spread_pct). Read from Blue Agent's live desk, never recomputed; a stale or missing reading is refused, not sold. Facts, not a buy or sell signal. Triggers — \"is NVDA cheaper on Base\", \"AAPL token vs the stock\", \"premium on TSLA\", \"weekend gap\". PAID: $0.01 USDC on Base 8453 over the x402 MCP transport — the first call returns PaymentRequired (isError with structuredContent); an x402 MCP client (e.g. @x402/mcp) pays and retries with _meta[\"x402/payment\"]. Bad input is refused before any price, and a failed run is not charged.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Stock ticker, e.g. \"NVDA\" (the Base B20 symbol \"NVDAc\" works too)." },
        chain:  { type: "string", enum: ["base", "robinhood", "both"], description: "One venue, or \"both\" (default) for the cross-chain spread." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "trending_safe",
    description:
      "Trending tokens on Base 8453, each with its buy/sell tax read from the contract and its exit liquidity depth — what is moving that you could also get out of. SAFE here = tradeable with a verified tax; it is not a buy signal. Triggers — \"what's trending on Base\", \"hot tokens\", \"where's the volume\", \"anything new worth a look\". PAID: $0.05 USDC on Base 8453 over the x402 MCP transport — the first call returns PaymentRequired (isError with structuredContent); an x402 MCP client (e.g. @x402/mcp) pays and retries with _meta[\"x402/payment\"]. Bad input is refused before any price, and a failed run is not charged.",
    inputSchema: {
      type: "object",
      properties: {
        limit:             { type: "number", description: "1–20. Default 10." },
        min_liquidity_usd: { type: "number", description: "Minimum pool liquidity. Default 500000." },
      },
    },
  },
  {
    name: "wallet_risk",
    description:
      "Is this ADDRESS known to be dangerous? Named flags from GoPlus (theft, phishing, sanctions, laundering, mixer) and the explorer's scam mark, plus chain facts (wallet, contract or EIP-7702 account; nonce). Verdict in code: FLAGGED / CAUTION / NO_KNOWN_FLAGS — never \"clean\". Use before sending funds TO an unknown address. Triggers — \"is this wallet safe\", \"check this address\", \"who is 0x…\", \"AML check\". Base 8453 or Robinhood Chain 4663. PAID: $0.01 USDC on Base 8453 over the x402 MCP transport — the first call returns PaymentRequired (isError with structuredContent); an x402 MCP client (e.g. @x402/mcp) pays and retries with _meta[\"x402/payment\"]. Bad input is refused before any price, and a failed run is not charged.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address 0x…." },
        chain:   { type: "string", enum: ["base", "robinhood"], description: "Default base." },
      },
      required: ["address"],
    },
  },

  // ══ B · Free — the way in, and what nobody pays for ═══════════════════════
  {
    name: "token_price",
    description:
      "Live price, market cap, 24h volume, price change and pool liquidity for a token on Base 8453, read from DexScreener — never from model memory. Use whenever a price is about to appear in your answer. Triggers — \"price of TOKEN\", \"what's X trading at\", \"market cap\", \"is it up today\". Takes a 0x address (exact) or a ticker (verify the returned address — tickers are not unique). Free.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract 0x… on Base 8453 (preferred) or a ticker." },
      },
      required: ["token"],
    },
  },
  {
    name: "send_prepare",
    description:
      "Build an unsigned ERC-20 or native-ETH transfer the user signs in their OWN wallet, on Base 8453 or Robinhood Chain 4663, with the resolved symbol, decimals and exact base-unit amount to verify before signing. The recipient is checked too: look-alike of a past payee, flagged, a contract, or the token itself. Triggers — \"send 50 USDC to 0x…\", \"transfer TOKEN to\", \"pay this address\". Free.",
    inputSchema: {
      type: "object",
      properties: {
        chain:       { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. No default — sending on the wrong chain of a dual-listed token loses the funds. If the user did not say, ASK." },
        fromAddress: { type: "string", description: "Sender wallet 0x… — the address that will sign." },
        toAddress:   { type: "string", description: "Recipient 0x… on the SAME chain. Confirm it with the user." },
        token:       { type: "string", description: "Token contract 0x… on `chain`, or \"ETH\" for the native coin." },
        amount:      { type: "string", description: "Amount in WHOLE units, e.g. \"25.5\" — NOT base units." },
      },
      required: ["chain", "fromAddress", "toAddress", "token", "amount"],
    },
  },
  {
    name: "bridge_prepare",
    description:
      "Build an unsigned bridge between Base 8453 and Robinhood Chain 4663 (either direction), backed by Relay, plus a separate approve tx when needed — the user signs both. Refused when the bridge would cost more than the limit. Triggers — \"bridge USDC to Robinhood\", \"move my ETH to Base\", \"I'm on the wrong network\". fromChain and toChain must differ; the response carries a Relay tracker URL. Free.",
    inputSchema: {
      type: "object",
      properties: {
        fromChain:   { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Where the funds are now." },
        toChain:     { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Destination; must differ from fromChain." },
        fromAddress: { type: "string", description: "Wallet 0x… holding the funds on fromChain — the signer." },
        recipient:   { type: "string", description: "Destination wallet 0x… on toChain. Defaults to fromAddress." },
        token:       { type: "string", description: "Token 0x… as it exists ON fromChain, or \"ETH\"." },
        amount:      { type: "string", description: "Amount in WHOLE units, e.g. \"100\"." },
      },
      required: ["fromChain", "toChain", "fromAddress", "token", "amount"],
    },
  },
  {
    name: "sign_check",
    description:
      "What will signing this do? Call UNPROMPTED before a wallet signs anything it did not build itself: a transaction (decoded and simulated), an EIP-712 signature (permits, Permit2, Seaport orders — decoded, since an off-chain signature moves nothing until used), or an EIP-7702 authorization. Returns PASS / WARN / BLOCK with plain summary lines, picked in code. BLOCK: do not sign. WARN: show the summary and get an explicit yes. Triggers — \"sign this\", \"what does this approve\", a dapp asking for a permit. Base 8453 or Robinhood Chain 4663. Free.",
    inputSchema: {
      type: "object",
      properties: {
        chain:         { type: "string", enum: ["base", "robinhood"], description: "Chain the signature is for. Default base." },
        from:          { type: "string", description: "The signing wallet 0x… — needed to simulate a transaction." },
        tx:            { type: "object", description: "A transaction: { to, data?, value? } (value in wei)." },
        typed_data:    { type: "object", description: "The EIP-712 payload exactly as passed to eth_signTypedData_v4." },
        authorization: { type: "object", description: "An EIP-7702 authorization: { address, chainId }." },
      },
    },
  },
  {
    name: "approvals_audit",
    description:
      "Every token approval a wallet has open — who can spend what, unlimited or not — with the risky ones marked so the user can revoke them. Triggers — \"check my approvals\", \"who can spend my tokens\", \"revoke\", \"am I exposed\". Base 8453 or Robinhood Chain 4663. Free.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Wallet 0x…." },
        chain:  { type: "string", enum: ["base", "robinhood"], description: "Default base." },
      },
      required: ["wallet"],
    },
  },

  // ══ D · The rest of the catalog — discover, then call ═══════════════════
  {
    name: "blue_registry",
    description:
      "Search the full Blue Hub catalog of 65 callable tools — 57 x402-paid and 8 free — covering on-chain data, security, DeFi, token intel and builder tooling, and get each one's id, price, category and input shape. Use when the user's request has no exact match among the tools loaded here, BEFORE telling them it cannot be done — most capabilities live in the catalog, not in this manifest. Pair it with blue_call: registry finds the id, blue_call runs it. Triggers — \"what tools do you have\", \"can you analyse X\", \"is there a tool for Y\", \"list your capabilities\", or any request you are about to decline. Covers Base 8453 and Robinhood Chain 4663; each result states its own chain. Free.",
    inputSchema: {
      type: "object",
      properties: {
        query:    { type: "string", description: "Free-text search over tool name and description, e.g. \"airdrop\", \"whale\", \"yield\"." },
        category: { type: "string", description: "Exact category filter. One of: on-chain, builder, security, intelligence, signal, trading, portfolio, content, base-ecosystem, earn, agent-economy." },
      },
    },
  },
  {
    name: "blue_call",
    description:
      "Execute ANY tool from the Blue Hub catalog by its id — the execution counterpart to blue_registry. Use after blue_registry returns an id you want to run. PAYMENT depends on the id, so read the price blue_registry gave you before deciding: 57 ids are x402-paid and the first call returns HTTP 402 with a `paymentRequirements` object (USDC on Base 8453, EIP-3009 transferWithAuthorization, payTo and exact amount included) — sign that authorization with your own wallet and call again with the resulting header in `payment` to get the result. The other 8 are priced $0.00 and NEVER answer 402: call them with no `payment`, no wallet and no signature, and do not wait for requirements that will not arrive. You hold your own keys — Blue Agent never sees them and never pulls funds. Triggers — any time you have a catalog id and need its output. Report a 402 to the user verbatim rather than inventing the tool's output.",
    inputSchema: {
      type: "object",
      properties: {
        tool:    { type: "string", description: "Catalog tool id exactly as returned by blue_registry, e.g. \"honeypot-check\", \"token-pick-signal\". Not the MCP name — ids use hyphens and carry no hub_ prefix." },
        input:   { type: "object", description: "The tool's own input object, matching the `input` shape blue_registry returned for it. Passed through untouched." },
        payment: { type: "string", description: "The X-PAYMENT header value (base64 EIP-3009 authorization) obtained by signing the paymentRequirements from a prior 402. Omit on the first call to receive those requirements." },
      },
      required: ["tool"],
    },
  },

  // ══ C · Ops — the one tool you reach for after something else broke ═══════
  {
    name: "blue_doctor",
    description:
      "Check whether the data sources behind these tools are reachable — Base 8453 and Robinhood Chain 4663 RPC, DexScreener, GeckoTerminal, DefiLlama, GitHub — and get a one-line verdict on whether a failure you just hit is an outage or your own input. Use IMMEDIATELY after any tool here returns an error or empty data, BEFORE retrying. Triggers — any 5xx, any timeout, any unexpected \"no data\", \"is it down\", \"is this broken or is it me\". Reports `down` ONLY where a request was sent and failed; unreachable-without-credential upstreams are `unknown`. Free, no input.",
    inputSchema: { type: "object", properties: {} },
  },
];

export const MCP_TOOL_COUNT = MCP_TOOLS.length;

/** Old names answer, unlisted, until this instant (route.ts LEGACY), then refuse with their replacement. */
export const MCP_LEGACY_UNTIL = "2026-11-22T00:00:00Z";

/**
 * v1 names → their v2 replacement (null = retired, nothing replaces it). They
 * still answer until MCP_LEGACY_UNTIL, unlisted, with a note naming the new
 * tool: MCP clients cache tool names, so a rename that breaks silently strands
 * whoever wired the old one in. After the date they refuse with the same note.
 * `hub_hood_arrow` answers with the note alone — its desk stopped firing on
 * 2026-09-30, and usage-daily shows a caller hitting it daily and getting errors.
 */
export const MCP_LEGACY: Readonly<Record<string, string | null>> = {
  blue_swap_tx: "swap_prepare",
  blue_send_tx: "send_prepare",
  blue_bridge_tx: "bridge_prepare",
  hub_token_price: "token_price",
  hub_sign_check: "sign_check",
  hub_wallet_risk: "wallet_risk",
  hub_honeypot: "token_verdict",
  hub_risk_gate: "token_verdict",
  hub_contract_trust: "token_verdict",
  hub_liquidity_depth: "token_verdict",
  hub_hood_arrow: "stock_signal",
  hub_pool_scan: "trending_safe",
  hub_wallet_holdings: null,
  hub_gas_tracker: null,
  b20_encode_payment: null,
  blue_build: null,
  blue_audit: null,
};
