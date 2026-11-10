# AI hedge fund on Base

An agent that runs like a tiny fund on Base: it **pays for its own market data per call** in USDC over x402, from **two independent sellers**, **checks that the pool can take the order** and **that the token isn't priced above the real share**, then **prepares the trade for you to sign**. It never signs or sends a trade.

```
1. stock_movers      $0.03   Blue Agent: today's stock-token gainers on Base 8453, then a watchlist
2. stock_quote       $0.02   Blue Agent: verified contract, pool price, and what a
                             $1k / $10k USDC buy would move the price
3. depth check               refuse any order above MAX_IMPACT_PCT
4. /prices/snapshot  $0.02   Financial Datasets: the real share price. Fair token
                             price = share x the token's multiplier() (dividends
                             raise it); refuse a premium above MAX_PREMIUM_PCT
5. swap_prepare      $0.01   Blue Agent: an UNSIGNED USDC -> stock swap
```

A round costs about $0.16 in USDC on Base, paid to two sellers. Each seller's spend is capped before anything is signed by [`@blueagent/x402`](https://www.npmjs.com/package/@blueagent/x402) (0.3.2+): Blue Agent at $0.05 a call and $0.50 a run, Financial Datasets at $0.05 a call and `PREMIUM_CHECKS` calls a run.

## Why the depth check is the point

Pool TVL is a poor guide to what you can trade on Base stock tokens. Measured on 2026-11-05 with the Aerodrome Quoter, buying on each token's deepest USDC pool:

| Token | $1k buy | $10k buy |
|---|---|---|
| NVDAc | +0.03% | +0.32% |
| MSTRc | +0.21% | +2.37% |
| AAPLc (about $0.5M TVL) | +0.62% | +380% |
| MSFTc | +31% | +1,210% |

Most of the concentrated liquidity sits out of range. A fund that sizes orders by TVL overpays; this one reads the quote and refuses instead. These numbers move every block, so the script reads them live.

## Run it

```bash
cd examples/ai-hedge-fund-base
npm install
npx tsx fund.ts                                   # read-only: shows the first price, pays nothing
BUYER_PRIVATE_KEY=0x... npx tsx fund.ts           # pays for data, prints an unsigned swap
```

Use a wallet funded with a few dollars of USDC on Base for this only. It pays for the data and is the `fromAddress` of the swap it prepares.

| Variable | Default | |
|---|---|---|
| `ORDER_USD` | `1000` | Order size in USDC. Up to $1k uses the $1k impact, above it the $10k one |
| `MAX_IMPACT_PCT` | `1` | Refuse orders that would move the price more than this |
| `CANDIDATES` | `3` | How many of today's gainers to check |
| `WATCHLIST` | `NVDA,MSTR` | Checked after the gainers |
| `BUDGET_USD` | `0.5` | Most this run may spend on Blue Agent data |
| `MAX_PREMIUM_PCT` | `2` | Refuse a token trading more than this above share x multiplier |
| `PREMIUM_CHECKS` | `2` | How many passing candidates get a share-price check ($0.02 each) |

## What it is not

- **Not investment advice, and not a strategy.** "Buy today's top gainer that the pool can absorb" only exists to show the plumbing.
- **No custody.** The trade is printed unsigned. You review it and sign it in your own wallet.
- **One pool per quote.** The depth check quotes the deepest single Aerodrome pool. A router splitting across pools may do better, so the check is conservative.

Every tool here is also on the Blue Agent MCP server (`https://blueagent.dev/api/mcp`) and in the Coinbase x402 Bazaar.
