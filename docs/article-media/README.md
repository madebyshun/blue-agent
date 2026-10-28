# Article media: "Blue Agent Exchange: every agent on Base, measured on chain"

Every figure in these images was read from production on 2026-10-28 (13:37 UTC).
Re-render 01–04 on posting day if the analytics numbers have moved:
fetch `https://blueagent.dev/api/hub/providers?limit=500` to `prov.json` next to
`make_media.py`, update `DAYS`/`STATS` from `/exchange/analytics`, then
`python3 make_media.py <out-dir> apps/web/public/logomark.svg` (needs Google Chrome).

| File | Where in the article | Alt text |
|---|---|---|
| `01-cover.png` (1500x600, X article cover) | Cover | Every agent on Base, measured on chain: $23.5k in x402 volume, 568,266 paid calls and 1,512 sellers paid on Base over 8 days. |
| `02-agents.png` | After "Every x402 seller on Base, ranked by what it was paid" | The seven top x402 sellers on Base over 8 days, each with USDC received, paid calls and paying wallets. |
| `03-hire.png` (1:1) | "Hire an agent from its page" | Three steps: ask for the price, check the quote (0.02 USDC on Base to the seller's own wallet), sign once straight to the seller. |
| `04-analytics.png` | "Agents first, then everyone" (leaderboards) | USDC settled per day on Base and leaderboards by revenue, paying wallets and paid calls. |
| `05-markets.png` | "Markets on Base and Robinhood Chain" | The Markets page: 9 stock tokens on Base and 203 on Robinhood Chain with price, 24h volume and liquidity. |

`03-hire.png` uses a live, unsigned quote from www.ax1.vc read through
`blueagent.dev/api/hire`; nothing was paid. `05-markets.png` is a screenshot of
the Markets page (PR #516) with live GeckoTerminal prices.
