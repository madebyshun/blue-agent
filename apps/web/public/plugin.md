# Blue Hub — Base MCP Custom Plugin

> Source of truth: https://blueagent.dev/plugin.md
> Hub UI: https://blueagent.dev/hub · Catalog (machine-readable): https://blueagent.dev/api/catalog

29 AI tools for onchain builders and autonomous agents — audits, token signals,
stock signals, liquidity depth, contract trust and pre-trade safety and
more. 22 are paid HTTP endpoints that speak **x402 v2** natively, so Base MCP
can call any of them and settle the USDC payment without extra wiring. The
other 10 are priced $0.00, never answer 402 and never ask for a signature.

- **Reads:** Base mainnet (8453) and Robinhood Chain (4663) — the `rh-*`
  tokenized-stock tools are the Robinhood Chain desk; bridging between the
  two is the MCP tool `bridge_prepare`. The two chains share no state, so a ticker alone never
  identifies a token
- **Network:** Base mainnet (`eip155:8453`) — payment only, every tool
  settles here regardless of which chain it reads
- **Asset:** USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Payment:** x402 v2 · pay-per-call · no API key · no subscription
- **Settlement:** Coinbase CDP facilitator (on-chain transferWithAuthorization)
- **Receives:** Blue Agent treasury `0x02950ad38ada1d599375bd447e080cd404809205`

---

## 1. STOP — COMPLETE ONBOARDING FIRST

> [!IMPORTANT]
> Before invoking a **paid** Blue Hub tool:
>
> 1. Call `get_wallets` and confirm a Base mainnet wallet is connected.
> 2. Confirm USDC balance ≥ the tool's price (most are $0.05–$1.00).
> 3. Surface the tool's description and price to the user; obtain explicit
>    approval for the spend before paying.
>
> A paid Blue Hub call charges USDC on-chain. Never auto-pay without consent.

> [!NOTE]
> **Seven tools are free and this gate does not apply to them.** They are priced
> `$0.00` in the catalog, never answer 402 and never ask for a signature:
> `blue-doctor` · `hood-live` · `weekend-scorecard` · `pre-trade-check` ·
> `sign-check` · `approval-audit` · `rh-rwa-verify`. POST them directly. Do not build an
> authorization — there is nothing to sign and no transfer to make.
>
> This paragraph is load-bearing, not a footnote. The gate above used to read
> "before invoking **any** Blue Hub tool", which made a connected wallet and a
> spend approval a precondition for running a diagnostic and four safety checks
> that cost nothing. An agent with no wallet would correctly conclude it could
> not verify a contract before trading it.

---

## 2. Read endpoints

### `GET https://blueagent.dev/api/catalog`

The single source of truth for the tool list — machine-readable, CORS-open,
no auth. Returns:

```json
{
  "name": "Blue Hub",
  "protocol": "x402",
  "x402Version": 2,
  "network": "eip155:8453",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payTo": "0x02950ad38ada1d599375bd447e080cd404809205",
  "count": 29,
  "tools": [
    {
      "id": "base-stock-quote",
      "name": "Base Stock Quote",
      "description": "Price, liquidity and oracle drift for a tokenized stock on Base … Use when an agent needs a share price it can check against Chainlink.",
      "price": "$0.02",
      "priceUsdcUnits": 20000,
      "endpoint": "https://blueagent.dev/api/x402/base-stock-quote",
      "method": "POST",
      "input": { "type": "object", "properties": { ... }, "required": [...] },
      "sample": {
        "provenance": "shape",
        "input":  { "ticker": "AAPL" },
        "output": { "ticker": "AAPL", "dex": { ... }, "oracle": { ... }, "..." : "..." }
      }
    }
    // … one entry per tool
  ]
}
```

Use this to enumerate tools, prices, categories and per-tool input schemas
on demand. No caching required by the client — the endpoint sets
`Cache-Control: s-maxage=3600`.

### Discovery alternatives

- **MCP server (remote, no install):** `https://blueagent.dev/api/mcp`
- **Manifest:** `https://blueagent.dev/.well-known/agent.json`
- **Agent crawler hint:** `https://blueagent.dev/llms.txt`

---

## 3. Prepare endpoints (tool invocation)

Blue Hub uses x402 v2 for payment, so the "prepare" and "execute" steps are
both performed by Base MCP's built-in x402 client. The pattern is identical
for every tool:

### `POST https://blueagent.dev/api/x402/{tool-id}`

Body: JSON matching the tool's input schema (see `/api/catalog`).

#### Without `X-Payment` header → HTTP 402

The endpoint is self-describing — the 402 response carries everything a
client needs to sign and retry:

```json
{
  "x402Version": 2,
  "error": "Payment Required",
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "asset":   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount":  "20000",
    "payTo":   "0x02950ad38ada1d599375bd447e080cd404809205",
    "maxTimeoutSeconds": 120,
    "extra":   { "name": "USD Coin", "version": "2" }
  }],
  "tool": {
    "id": "base-stock-quote",
    "name": "Base Stock Quote",
    "description": "…",
    "price": "$0.02",
    "input":   { "type": "object", "properties": { ... }, "required": ["ticker"] },
    "sample": {
      "provenance": "shape",
      "input":  { "ticker": "AAPL" },
      "output": { "ticker": "AAPL", "dex": { ... }, "oracle": { ... } }
    }
  }
}
```

#### With a valid `X-Payment` header → HTTP 200

Base MCP signs an EIP-3009 `TransferWithAuthorization` for the user's
wallet (after explicit approval) and retries the request with the
base64-encoded x402 payload in `X-Payment`. The server then:

1. **Verifies** the payment via the Coinbase CDP facilitator (no charge).
2. **Runs** the tool over live on-chain data — Base for most of the catalog,
   Robinhood Chain for the `rh-*` tools. Most tools make a single inference
   pass; a few (`rh-stock-agent-brief`, `safe-trending`) make several and weight
   the results. Every pass goes to the same endpoint, so extra passes buy
   extra reasoning over the same data, not an extra opinion from elsewhere.
3. **Settles** the USDC transfer on-chain via CDP (the user is charged
   only on success).

The 200 response carries the result and the settlement receipt:

```json
{
  "tool": "base-stock-quote",
  "ticker": "AAPL",
  "facts_only": true,
  "pick": {
    "token": "…", "price": "$…", "liquidity": "$…", "volume_24h": "$…",
    "score": 71, "signal_type": "building", "caution": []
  },
  "note": "Top Base token by an on-chain quality score — facts from live pools, not a recommendation to buy or sell.",
  "timestamp": "2026-10-01T…",
  "_settle": {
    "ok": true,
    "status": 200,
    "tx":  "0x… (Basescan link)"
  }
}
```

The Basescan transaction confirms USDC moved on-chain. No off-chain
ledger, no custodial credits — every call is a verifiable settlement.

### Failure semantics

The route is ordered **verify → run → settle**, so:

- **Verify fails** (signature / amount / expiry) → HTTP 402 with the CDP
  error in `detail`. User is **not charged**.
- **Tool fails after verify** (LLM error, timeout) → HTTP 502 with
  `"Tool failed — you were not charged"`. **Not charged.**
- **Verify + tool succeed** → settle runs. If settle errors on-chain after
  a successful tool run, the result is still returned with `_settle.ok =
  false` so the user can see what happened.

> A failed tool **never** results in a debited wallet. Surface this to the
> user.

---

## 4. send_calls mapping

Blue Hub tools execute fully via HTTP + x402; they do **not** return
unsigned EVM calldata to be relayed through `send_calls`. The payment is the
action, and Base MCP's native x402 support handles it end-to-end.

That said, Blue Hub composes cleanly with execution plugins:

- **Blue measures, the user decides, another plugin executes.** A typical
  pattern: the user names a token and a size → call `liquidity-depth`
  (Blue Hub) for the slippage estimate and exit risk at that size → show
  it, and only on the user's go-ahead prepare an Aerodrome / Uniswap swap
  via that plugin's `send_calls`. Blue Hub supplies the *facts*; the
  execution plugin supplies the *action*. No Blue Hub tool returns a
  buy/sell call to branch on — `base-stock-quote` reports facts only.
- **Audit-then-act.** Run `contract-trust` (Blue Hub) before any
  user-initiated `send_calls` against an unknown contract; abort if the
  verdict is `RED_FLAG`.
- **No send_calls is emitted by Blue Hub itself.** Anything Base MCP needs
  to sign for a Blue Hub call is the EIP-3009 USDC payment, which the
  built-in x402 client handles.

---

## Popular tools (excerpt — full list via `/api/catalog`)

Every row below is live and priced in USDC on Base. Each one also carries a
`sample` (a body that satisfies its schema, plus the shape of what it returns)
on its 402 response and in `/api/catalog`.

| Tool                      | Price  | What it answers                                             |
|---------------------------|--------|-------------------------------------------------------------|
| `token-price`             | $0.01  | Live price, mcap, volume and liquidity for a Base token      |
| `base-stock-quote`        | $0.02  | Tokenized-stock price, oracle share price and the drift      |
| `base-stock-movers`       | $0.03  | 24h gainers and losers among Base tokenized stocks           |
| `liquidity-depth`         | $0.03  | How much you can sell before the price moves                 |
| `wallet-risk`             | $0.05  | Known-theft, phishing and sanctions flags on a Base address  |
| `rh-stock-agent-brief`    | $0.20  | A Robinhood Chain stock's whole picture in one call          |
| `honeypot-check`          | $0.10  | Buy-but-cannot-sell detection with measured transfer tax     |
| `contract-trust`          | $0.15  | SAFE / CAUTION / RED_FLAG verdict before swapping            |
| `risk-gate`               | $0.20  | One pre-transaction verdict instead of five signals          |
| `safe-trending`           | $0.15  | Trending Base tokens, tax-checked, with exit depth           |
| `blue-registry`           | $0.05  | The catalog itself: every tool, its price and its endpoint   |
| `blue-doctor`             | free   | Is the upstream down, or is your request wrong?              |

## Workflow examples

**Pre-trade audit**
> User: *"Before I swap into $TOKEN, audit the contract."*
>
> 1. `POST /api/x402/pre-trade-check` with `{ "token": "0x…", "chain": "base", "kind": "swap", "sender": "0x…", "recipient": "0x…" }` — free.
> 2. If it is not `PASS`, `POST /api/x402/contract-trust` with `{ "address": "0x…" }`.
> 3. If either verdict is `RED_FLAG`, surface it and *do not* prepare the swap.

**Is this token safe to buy?**
> User: *"Is $TOKEN a honeypot?"*
>
> 1. `POST /api/x402/honeypot-check` with `{ "token": "0x…" }` — $0.10.
> 2. Then `POST /api/x402/liquidity-depth` with `{ "token": "0x…", "trade_size_usd": 500 }`
>    for the exit: how much the price moves if the user sells.

**Daily stock screen**
> User: *"Which tokenized stocks moved today?"*
>
> 1. `POST /api/x402/base-stock-movers` with `{ "limit": 5 }` — $0.03.
> 2. For any name worth a closer look, `POST /api/x402/base-stock-quote` with
>    `{ "ticker": "AAPL" }` — price, oracle share price and the drift between them.

**What am I about to sign?**
> User: *"What does this transaction do?"*
>
> 1. `POST /api/x402/sign-check` with `{ "chain": "base", "from": "0x…", "tx": { "to": "0x…", "data": "0x…", "value": "0" } }` — free.
> 2. `BLOCK` = do not sign. `WARN` = show the summary and reasons, sign only on an explicit yes. `PASS` = every effect was read and nothing measured against it (not a recommendation).

## Authentication

There is no API key, no signup, no per-user account. The only auth Blue Hub
requires is the EIP-3009 USDC payment for each call. Any Base mainnet wallet
with sufficient USDC balance works.

For Base App / Base Account users: pay flows are presented as normal
approval prompts via Base MCP's built-in x402 handler.

---

## Mode of failure & error codes

| HTTP | Meaning                                | Charged? |
|------|----------------------------------------|----------|
| 200  | Tool ran, USDC settled                 | Yes      |
| 402  | Missing or invalid payment             | No       |
| 400  | Malformed body (input did not validate)| No       |
| 502  | Tool failed after successful verify    | **No**   |
| 503  | Tool not in handler registry yet       | No       |

`_settle.tx` on a 200 response is the on-chain proof (Basescan).

---

## License & ownership

Open for any Base MCP integration. Wallet `0x02950ad38ada1d599375bd447e080cd404809205`
receives all settlements. Built by Blocky Studio. Powered by `$BLUEAGENT`.

For questions, manifest details, or to suggest tools:
[blueagent.dev](https://blueagent.dev) · [github.com/madebyshun/blue-agent](https://github.com/madebyshun/blue-agent) · [@blueagent_](https://x.com/blueagent_)
