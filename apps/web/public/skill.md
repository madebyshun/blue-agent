---
name: blue-agent
description: Non-custodial on-chain intelligence, tokenized-stock pricing (Base B20 & Robinhood Chain), pre-trade safety verdicts, and unsigned swap/send/bridge calldata over MCP and x402.
url: https://blueagent.dev/api/mcp
---

# Blue Agent Skill

Use Blue Agent whenever you need **verified on-chain data**, **pre-trade safety verdicts**, **tokenized stock pricing**, or **unsigned transaction calldata** on **Base (8453)** and **Robinhood Chain (4663)**.

Blue Agent is **non-custodial by construction**: it never holds private keys or broadcasts transactions. Every execution tool returns unsigned `{ to, data, value, chainId }` calldata for the user's own wallet or agent wallet to sign.

## 1. Quick Connect (MCP)

- **Claude Code:**
  ```bash
  claude mcp add blue-agent --transport http https://blueagent.dev/api/mcp
  ```
- **Claude Desktop / Cursor / MCP JSON:**
  ```json
  {
    "mcpServers": {
      "blue-agent": {
        "url": "https://blueagent.dev/api/mcp"
      }
    }
  }
  ```

## 2. Core Tools & When to Use Them

### Safety & Pre-Trade Intelligence
- **`token_verdict`** *(Paid $0.01 via x402 MCP)* — Run before recommending or buying any unfamiliar token. Combines live `eth_simulateV1` buy → transfer → sell round-trip simulation, contract/GoPlus checks, Top 10 holder concentration (excluding pools & burns), launcher history, impostor detection, and tokenized-stock oracle drift.
- **`sign_check`** *(Free)* — Run before signing any external transaction, EIP-712 permit/order, or EIP-7702 authorization. Returns `PASS`, `WARN`, or `BLOCK`.
- **`wallet_risk`** *(Paid $0.01 via x402 MCP)* — AML/phishing/scam check for any address on Base or Robinhood Chain before sending funds.
- **`approvals_audit`** *(Free)* — Lists open ERC-20 token allowances for a wallet.
- **`b20-policy-check`** *(Free via `blue_call` or `/api/x402/b20-policy-check`)* — Verifies whether a wallet is authorized under a Coinbase B20 tokenized stock's on-chain `PolicyRegistry` (`isAuthorized`) before building a swap.
- **`tx-simulate`** *(Free via `blue_call` or `/api/x402/tx-simulate`)* — Dry-runs any unsigned `{ from, to, data, value }` transaction via `eth_simulateV1` before signing.

### Tokenized Stocks & Market Data (Base 8453 + Robinhood Chain 4663)
- **`stock_quote`** *(Paid $0.02)* — Live quote for any tokenized stock across Base B20 and Robinhood Chain, including verified contracts, Chainlink share price, and `$1k`/`$10k` slippage impact on Base.
- **`stock_signal`** *(Paid $0.01)* — Real-time DEX vs. Chainlink oracle drift (`drift_pct`) and cross-chain spread (`spread_pct`).
- **`cross-venue-stock-quote`** *(Paid $0.02 via `blue_call` or `/api/x402/cross-venue-stock-quote`)* — Unified snapshot comparing Base B20, Robinhood Chain, and US market session status in a single call.
- **`stock_movers`** *(Paid $0.03)* & **`stock-screen`** *(via `blue_call`)* — Filter and rank tokenized stocks by oracle drift, liquidity, and staleness.
- **`token_price`** *(Free)* — Live DexScreener price, volume, and liquidity on Base 8453.

### Unsigned Execution Builders (Preview -> Prepare -> Execute)
- **`swap_prepare`** *(Paid $0.01)* — Runs `preTradeCheck` first; builds unsigned 0x/Aerodrome (Base) or Uniswap V3 (Robinhood Chain) calldata. Requires explicit `chain` (`"base"` or `"robinhood"`).
- **`send_prepare`** *(Free)* & **`bridge_prepare`** *(Free)* — Unsigned ERC-20/ETH transfers and Relay cross-chain bridges.

### Discovery & Diagnostics
- **`blue_registry`** *(Free)* — Search the full x402 catalog.
- **`blue_call`** *(x402 or $0.00)* — Invoke any catalog tool by id.
- **`blue_doctor`** *(Free)* — Check upstream RPC, DexScreener, and indexer health immediately after any error before retrying.

## 3. x402 Payment Protocol
- HTTP endpoint: `POST https://blueagent.dev/api/x402/<tool-id>`
- Unpaid call returns HTTP `402` with base64 `PAYMENT-REQUIRED` header (and JSON body mirror), supporting **EIP-3009** and **Permit2** on Base (8453) USDC.
- Paid retry accepts `PAYMENT-SIGNATURE` (or `X-PAYMENT`) and returns `PAYMENT-RESPONSE` (and `X-PAYMENT-RESPONSE`) upon settlement.
- Bad inputs return `400` before quoting a price, and failed tool runs never settle.
