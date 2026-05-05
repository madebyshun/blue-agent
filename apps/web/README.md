# Blue Agent — Landing Page

> Your AI co-pilot on Base 🔵

A clean, modern Next.js 15 landing page for [Blue Agent](https://t.me/blockyagent_bot) — the AI bot for Base builders.

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS v3**
- **Inter** (Google Fonts)
- No external UI libraries

## Design

- White background with radial dot-grid (`#c8d8e8`, 28px spacing)
- Primary blue: `#4a90d9`
- Cards: white, `border: 1.5px solid #c8d8e8`, `border-radius: 16px`
- Live data from **GeckoTerminal API** + **Base RPC**
- Phone mockup showing Telegram chat UI in Hero

## Sections

1. **Hero** — Tagline + phone mockup with live price strip
2. **Features** — 6 feature cards (Builder Score, Trade, Earn, DexPay, Launch, AI Chat)
3. **How It Works** — 3-step flow: /start → build → /rewards
4. **Live Stats** — Token stats, Treasury breakdown, Revenue roadmap
5. **Footer CTA** — Start building CTA
6. **Footer** — Social links

## Live Data

| Source | Data |
|---|---|
| GeckoTerminal | $BLUEAGENT price, market cap, FDV, 24h change |
| GeckoTerminal (pools) | Liquidity |
| Base RPC | Treasury ETH + WETH balance |
| GeckoTerminal | ETH price for treasury calc |

Auto-refreshes every **30s** (price) and **60s** (treasury).

## Token

- **$BLUEAGENT**: `0xf895783b2931c919955e18b5e3343e7c7c456ba3`
- **Chain**: Base · Uniswap v4
- **Treasury**: `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5`

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or link to GitHub repo and auto-deploy on push
```

### Environment Variables

No environment variables required — all APIs are public.

## Deploy to Netlify

1. Push to GitHub
2. Connect repo on [netlify.com](https://netlify.com)
3. Build command: `npm run build`
4. Publish directory: `.next`
5. Add Netlify Next.js plugin (auto-detected)

## Build

```bash
npm run build
npm run start
```

## Lint

```bash
npm run lint
```

---

Built by [Blocky Studio](https://x.com/blockyonbase) · Powered by Bankr · Base 🔵
