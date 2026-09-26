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
 * All 110 catalog tools remain live at `/api/x402/<id>`. They are now reached
 * by DISCOVERY rather than by preloading:
 *
 *      blue_registry  →  search/filter all 116 tools (110 first-party + 6
 *                        community), with category, price and input shape
 *      blue_call      →  actually invoke any id the registry returned, over
 *                        x402 (402 + payment requirements → agent pays → 200)
 *
 * `blue_registry` already existed and already returned everything needed. What
 * was missing was the second half: its own `how_to_call.mcp` field said
 * "Connect the Blue Agent MCP server" — advice you can only read if you are
 * already connected, and which still did not tell you how to RUN anything. You
 * could discover 116 tools and invoke none of them. `blue_call` is the one
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
 * ── DO NOT ADD A 19th WITHOUT ANSWERING THIS ───────────────────────────────
 * "Would an agent fail to do the right thing if this were only discoverable?"
 * If the honest answer is no, it belongs behind `blue_registry`, not here. The
 * budget is the point — a manifest grows back to 85 one defensible tool at a
 * time, and every one of the 85 was defensible on its own.
 */
export const MCP_TOOLS = [
  // ══ A · The door: discover, then call ═════════════════════════════════════
  {
    name: "blue_registry",
    description:
      "Search the full Blue Hub catalog of 110+ callable x402 tools (on-chain data, security, DeFi, token intel, builder tooling) and get each one's id, price, category and input shape. Use when the user's request has no exact match among the tools loaded here, BEFORE telling them it cannot be done — most capabilities live in the catalog, not in this manifest. Pair it with blue_call: registry finds the id, blue_call runs it. Triggers — \"what tools do you have\", \"can you analyse X\", \"is there a tool for Y\", \"list your capabilities\", or any request you are about to decline. Covers Base 8453 and Robinhood Chain 4663; each result states its own chain. Free.",
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
      "Execute ANY tool from the Blue Hub catalog by its id — the paid counterpart to blue_registry. Use after blue_registry returns an id you want to run. PAYMENT: this is an x402 endpoint. The first call returns HTTP 402 with a `paymentRequirements` object (USDC on Base 8453, EIP-3009 transferWithAuthorization, payTo and exact amount included); sign that authorization with your own wallet and call again with the resulting header in `payment` to get the result. You hold your own keys — Blue Agent never sees them and never pulls funds. Triggers — any time you have a catalog id and need its output. Report the 402 to the user verbatim rather than inventing the tool's output.",
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

  // ══ B · Execution — non-custodial calldata the USER signs ═════════════════
  {
    name: "blue_swap_tx",
    description:
      "Build an unsigned swap transaction the user signs in their OWN wallet. Base 8453 routes through 0x AllowanceHolder across Base liquidity; Robinhood Chain 4663 routes through Blue Agent's deployed RobinhoodSwapRouter against Uniswap V3 pools. Returns { to, data, value, chainId } plus any ERC-20 approval needed first — never a broadcast, never a private key. Use when the user wants to trade a token and you have both token addresses. Triggers — \"swap X for Y\", \"buy TOKEN\", \"sell my TOKEN\", \"convert USDC to ETH\". Check hub_honeypot and hub_liquidity_depth before swapping an unfamiliar token. If no route exists the response says so — do NOT invent a price.",
    inputSchema: {
      type: "object",
      properties: {
        chain:       { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Which chain this swap executes on — Base 8453 or Robinhood Chain 4663. There is no default: the two chains share no state and the same ticker exists on both, so a swap built for the wrong one is unroutable at best. If the user did not say, ASK rather than guessing." },
        fromAddress: { type: "string", description: "The wallet that will sign and receive — 0x… . Also the swap recipient unless the chain's router says otherwise." },
        tokenIn:     { type: "string", description: "Token being sold: 0x… contract address on `chain`, or \"ETH\" for native. Never invent an address — resolve it first." },
        tokenOut:    { type: "string", description: "Token being bought: 0x… contract address on `chain`, or \"ETH\" for native." },
        amountIn:    { type: "string", description: "Amount of tokenIn in WHOLE units as a decimal string, e.g. \"25.5\" — NOT base units. Decimals are read from the token contract on its own chain; do not do the exponent math yourself." },
        slippageBps: { type: "number", description: "Max slippage in basis points (100 = 1%). Default 100." },
      },
      required: ["chain", "fromAddress", "tokenIn", "tokenOut", "amountIn"],
    },
  },
  {
    name: "blue_send_tx",
    description:
      "Build an unsigned ERC-20 or native-ETH transfer the user signs in their OWN wallet, on Base 8453 or Robinhood Chain 4663. Returns { to, data, value, chainId } with the resolved symbol, decimals and exact base-unit amount so the user can verify before signing. Non-custodial — the server encodes calldata and nothing else. Use when the user wants to move tokens to an address. Triggers — \"send 50 USDC to 0x…\", \"transfer TOKEN to\", \"pay this address\". Run hub_risk_gate on the recipient first when the user has not sent there before.",
    inputSchema: {
      type: "object",
      properties: {
        chain:       { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Which chain the transfer executes on — Base 8453 or Robinhood Chain 4663. No default: sending on the wrong chain of a dual-listed token loses the funds. If the user did not say, ASK." },
        fromAddress: { type: "string", description: "Sender wallet 0x… — the address that will sign." },
        toAddress:   { type: "string", description: "Recipient wallet 0x… on the SAME chain. Confirm it with the user before returning the tx." },
        token:       { type: "string", description: "Token contract 0x… on `chain`, or \"ETH\"/\"NATIVE\" for the native coin." },
        amount:      { type: "string", description: "Amount in WHOLE units as a decimal string, e.g. \"25.5\" — NOT base units. Token decimals are read on-chain; do not convert yourself." },
      },
      required: ["chain", "fromAddress", "toAddress", "token", "amount"],
    },
  },
  {
    name: "blue_bridge_tx",
    description:
      "Build an unsigned BIDIRECTIONAL bridge transaction between Base 8453 and Robinhood Chain 4663, backed by the Relay Protocol. Returns { to, data, value, chainId } plus a separate `approve` tx when the source token needs one — the user signs both in their own wallet. Use when a token or the user is on the wrong chain for what they want to do next, which is common because tokenized stocks list on both. Triggers — \"bridge USDC to Robinhood\", \"move my ETH to Base\", \"get funds onto chain 4663\", \"I'm on the wrong network\". fromChain and toChain must differ; the response carries a Relay tracker URL for the user to follow settlement.",
    inputSchema: {
      type: "object",
      properties: {
        fromChain:   { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Source chain — where the funds are now." },
        toChain:     { type: "string", enum: ["base", "robinhood"], description: "REQUIRED. Destination chain. Must differ from fromChain." },
        fromAddress: { type: "string", description: "Wallet 0x… holding the funds on fromChain — the signer." },
        recipient:   { type: "string", description: "Destination wallet 0x… on toChain. Defaults to fromAddress when omitted." },
        token:       { type: "string", description: "Token to bridge: 0x… address as it exists ON fromChain, or \"ETH\" for native. The destination address is resolved by Relay — do not supply it." },
        amount:      { type: "string", description: "Amount in WHOLE units as a decimal string, e.g. \"100\" — NOT base units." },
      },
      required: ["fromChain", "toChain", "fromAddress", "token", "amount"],
    },
  },
  {
    name: "b20_encode_payment",
    description:
      "Encode a B20 `transferWithMemo` call on Base 8453 — send a B20 token with an on-chain memo (order id, invoice ref) so the payment reconciles against off-chain books. Returns { to, data, value } for the sender to sign; pure calldata builder, no keys, no payment, no broadcast. Use when an agent or merchant needs a payment that carries its own reference. Triggers — \"pay invoice 1234 in USDC\", \"send payment with order id\", \"settle this with a memo\", \"reconcilable transfer\". Memo is capped at 32 UTF-8 bytes on-chain. B20 is Base-only — there is no B20 registry on Robinhood Chain 4663.",
    inputSchema: {
      type: "object",
      properties: {
        tokenAddress: { type: "string", description: "B20 token contract 0x… on Base 8453." },
        to:           { type: "string", description: "Recipient 0x… on Base 8453." },
        amount:       { type: "string", description: "Amount in WHOLE tokens as a decimal string (\"25.5\"). Never base units / wei — the scaling happens server-side." },
        // Advertising a default is how the caller was invited to guess in the
        // first place. Decimals are now read from the token, so the honest
        // schema says "omit this" and states what happens if you do not.
        decimals:     { type: "number", description: "OMIT THIS. Decimals are read from the token contract on-chain. If you pass a value it is treated as a claim and checked against the chain — a mismatch is rejected, never silently applied." },
        memo:         { type: "string", description: "On-chain memo / order id. Max 32 BYTES when UTF-8 encoded — not characters; an emoji costs 4. It fills one bytes32 slot." },
      },
      required: ["tokenAddress", "to", "amount", "memo"],
    },
  },

  // ══ C · Chain reads — live state, never model recall ══════════════════════
  {
    name: "hub_hood_arrow",
    description:
      "Open a Blue Hood signal (\"arrow\") — the desk's fired tokenized-stock signals with serial, ticker, direction, verdict note and the exact numbers captured at fire time. Use when the user asks WHY the desk took a view, or about a specific arrow. Triggers — \"why is Blue Hood shorting NVDA\", \"what was arrow #0007\", \"show me the AAPL arrow\", \"latest Hood signal\", \"explain the last drift on TSLA\".\n\n⚠️ CHAIN IS PART OF THE QUESTION. Blue Hood runs TWO desks — Robinhood Chain 4663 and Base 8453 — and NVDA / META / GOOGL / AAPL exist on BOTH. A bare ticker does NOT identify an arrow. If the user names a chain, you MUST pass `chain`; omitting it searches either desk and you will answer about the wrong one. If they named none, omit it and REPORT whichever chain the returned arrow says it is. On not_found, say so plainly — never substitute the other chain's arrow, and never invent numbers. Answer only from the returned verdict_note and facts_at_fire.",
    inputSchema: {
      type: "object",
      properties: {
        arrow_id: { type: "string", description: "Exact arrow UUID. Most precise — use when the user pastes one." },
        serial:   { type: "string", description: "Aesthetic serial like \"#0007\"; resolved to an id server-side." },
        ticker:   { type: "string", description: "Ticker such as AAPL or NVDA. Returns the NEWEST engine arrow for it. Pair with `chain` whenever the user named one — a ticker alone spans both desks." },
        chain:    { type: "string", enum: ["robinhood", "base"], description: "Which desk to search — Robinhood Chain 4663 or Base 8453. Pass it whenever the user named a chain. Omit ONLY when they did not; omitting means \"either desk\", never \"Robinhood\". Ignored for arrow_id/serial, which already identify one arrow." },
      },
    },
  },
  {
    name: "hub_token_price",
    description:
      "Live price, market cap, 24h volume, price change and pool liquidity for any token on Base 8453, read from DexScreener — never from model memory. Use whenever a price or market-cap number is about to appear in your answer; quoting one from training data is always wrong by now. Triggers — \"price of TOKEN\", \"what's X trading at\", \"market cap\", \"is it up today\", \"how much volume\". Takes a 0x address (exact) or a ticker (resolved against Base pools, so verify the returned address is the one the user meant — tickers are not unique).",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract address 0x… on Base 8453 (preferred, unambiguous) or a ticker symbol." },
      },
      required: ["token"],
    },
  },
  {
    name: "hub_wallet_holdings",
    description:
      "Every ERC-20 and native ETH balance held by a wallet on Base 8453, with live USD values, read via Moralis. Use before any portfolio answer, and before building a swap or send — it tells you what the wallet can actually spend, so you size a transaction against a real balance instead of an assumed one. Triggers — \"what's in my wallet\", \"show my portfolio\", \"do I have enough USDC\", \"what tokens does 0x… hold\", \"my balance\". Base 8453 only — for Robinhood Chain 4663 holdings, use blue_registry to find the rh- tools.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address 0x… on Base 8453." },
      },
      required: ["address"],
    },
  },
  {
    name: "hub_pool_scan",
    description:
      "Trending and newly-active liquidity pools on Base 8453 with the chain-wide TVL snapshot — where volume is actually moving right now. Use when the user wants to find something rather than look something up. Triggers — \"what's trending on Base\", \"hot pools\", \"where's the volume\", \"what should I look at\", \"anything new\". Pair every candidate with hub_honeypot and hub_liquidity_depth before mentioning it as tradeable: appearing in a trending scan is a volume fact, not a safety verdict. Base 8453 only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many pools to return. Default 10." },
      },
    },
  },
  {
    name: "hub_gas_tracker",
    description:
      "Live Base 8453 gas price with USD cost estimates for common actions (transfer, swap, contract deploy). Use before telling a user what a transaction will cost, and when a spend is small enough that fees change the answer. Triggers — \"gas right now\", \"how much to send\", \"is it expensive to swap\", \"cost to deploy\", \"worth doing on-chain\". Takes no arguments. Base 8453 only — Robinhood Chain 4663 fees are separate and not covered here.",
    inputSchema: { type: "object", properties: {} },
  },

  // ══ D · Safety — run these BEFORE money moves, unprompted ═════════════════
  {
    name: "hub_risk_gate",
    description:
      "Pre-flight screen for a pending transaction on Base 8453 — rug patterns, AML exposure on the counterparty, and known malicious contract shapes — returning a clear allow/deny verdict. Use UNPROMPTED before returning any blue_send_tx or blue_swap_tx aimed at an address the user has not dealt with before; a safety check the user has to request is a safety check that does not happen. Triggers — \"is this safe to sign\", \"check this transaction\", \"should I approve this\", \"is this address ok\". Base 8453.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "What the transaction does: transfer | swap | approve | call." },
        to:     { type: "string", description: "Target address 0x… on Base 8453 — the contract or recipient being trusted." },
        value:  { type: "string", description: "Amount in Wei, if the transaction carries value. Optional." },
      },
      required: ["action", "to"],
    },
  },
  {
    name: "hub_honeypot",
    description:
      "Detect whether a Base 8453 token can be BOUGHT but not SOLD — the honeypot trap, plus punitive sell taxes and transfer restrictions that amount to the same thing. Use UNPROMPTED before any swap into a token the user did not already hold, and before naming an unfamiliar token as worth buying. Triggers — \"is this a scam\", \"can I sell it\", \"rug check\", \"is TOKEN safe\", \"honeypot\", or any buy intent on a token you have not screened this session. A clean result is not an endorsement — pair with hub_liquidity_depth, since a token you can sell into no liquidity is stuck anyway. Base 8453.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract address 0x… on Base 8453. Use the address, not a ticker — impostor tokens copy tickers exactly." },
      },
      required: ["token"],
    },
  },
  {
    name: "hub_contract_trust",
    description:
      "Trust assessment for any smart contract on Base 8453 — source verification, upgradeability, ownership and admin powers, privileged functions, audit history. Use before the user grants an approval or interacts with a protocol they have not used, and when \"is this legit\" is about a CONTRACT rather than a token. Triggers — \"is this contract safe\", \"who controls this\", \"can they upgrade it\", \"should I approve\", \"is this protocol legit\". Report unknowns as unknown — an unverified contract means we cannot assess it, which is not the same as it being malicious. Base 8453.",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Contract address 0x… on Base 8453." },
      },
      required: ["contract"],
    },
  },
  {
    name: "hub_wallet_risk",
    description:
      "Risk and AML screen for a Base 8453 wallet from its real on-chain flow via Moralis — sanctions exposure, mixer proximity, and illicit-flow patterns in its transaction history. Use before sending funds TO an unknown address, and when a user asks whether a counterparty is safe to deal with. Triggers — \"is this wallet safe\", \"check this address\", \"who is 0x…\", \"is this counterparty clean\", \"AML check\". Distinct from hub_risk_gate, which screens a specific pending transaction; this screens the ADDRESS itself. Base 8453.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address 0x… on Base 8453." },
      },
      required: ["address"],
    },
  },
  {
    name: "hub_liquidity_depth",
    description:
      "Real liquidity depth, expected slippage at size, and exit risk for a token on Base 8453 — whether a position can actually be closed, and at what cost. Use before recommending a token and before sizing any swap above pocket change; hub_honeypot answers \"can I sell at all\", this answers \"can I sell THIS MUCH without destroying the price\". Triggers — \"can I exit\", \"how much slippage\", \"is there liquidity\", \"what if I buy $10k of this\", \"can I get out\". A thin pool is a real finding — report the numbers, never soften them. Base 8453.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract address 0x… on Base 8453 (preferred) or a ticker." },
      },
      required: ["token"],
    },
  },

  // ══ E · Build — the two console commands worth preloading ═════════════════
  {
    name: "blue_build",
    description:
      "Produce a concrete implementation plan for a project on Base 8453 — architecture, stack choice, folder structure, the integrations it needs, and a test plan. Use when the user has decided WHAT to build and needs the shape of it before writing code. Triggers — \"how should I build this\", \"architecture for\", \"what stack\", \"structure this project\", \"plan the implementation\". Advisory output: this is a framework for a builder to judge, not a set of measured facts. blue_idea / blue_ship / blue_raise are deliberately NOT loaded here — they ship as Claude Skills in the blue-agent plugin, where progressive disclosure costs no context.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to build — the brief, requirements, or concept, in the user's own words." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "blue_audit",
    description:
      "Security and product-risk review of code, a smart contract, or a system design — 500+ checks across 13 categories, returning critical issues, suggested fixes, and a go/no-go. Use before a user deploys or ships anything that holds funds or user data, and when they ask for a second opinion on safety. Triggers — \"audit this\", \"review my contract\", \"is this secure\", \"what could go wrong\", \"ready to deploy\". For an already-deployed address on Base 8453 use hub_contract_trust instead — that reads the chain; this reads what you give it.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The code, contract source, or system description to audit." },
      },
      required: ["prompt"],
    },
  },
];

export const MCP_TOOL_COUNT = MCP_TOOLS.length;
