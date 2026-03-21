# 🟦 Blue Agent Bot

AI-powered Telegram bot for Base builders. Built by [Blocky Studio](https://t.me/+1baBZgX7jd4wMGU1).

## What it does

- **Builder Score** — AI scores any X/Twitter handle as a Base builder (0-100)
- **Live news** — Real-time updates from top Base builders on X
- **Token data** — Prices, volume, trending on Base via Bankr Agent
- **Token launch** — Deploy ERC-20 on Base via `/launch` wizard
- **AI chat** — Ask anything about Base ecosystem, DeFi, NFTs, onchain

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/help` | Full feature list |
| `/score @handle` | Get Builder Score for any X handle |
| `/news` | Latest from Base builders on X |
| `/launch` | Deploy a new token on Base |

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Bot:** node-telegram-bot-api
- **LLM:** Bankr LLM Gateway (`llm.bankr.bot`) — 7 models with auto-fallback
  - Claude Sonnet 4.5/4.6, Haiku 4.5
  - Gemini 2.5 Flash, 3 Flash
  - GPT-5 Mini, Nano
- **Agent:** Bankr Agent (`api.bankr.bot`) — real-time onchain + X data
- **Process manager:** PM2

## LLM Fallback Chain

```
claude-sonnet-4-5 → claude-sonnet-4.6 → claude-haiku-4.5
→ gemini-2.5-flash → gemini-3-flash
→ gpt-5-mini → gpt-5-nano
```

Auto-fallback on 429/503/529. Zero downtime.

## Routing Logic

```
User message
    ↓
Command? → handle directly
    ↓
/launch wizard? → step-by-step token deploy
    ↓
Needs live data? (price/swap/X/Bankr) → Bankr Agent
    ↓
Else → Bankr LLM (fast, ~3s)
```

## X Accounts Tracked

`@jessepollak` `@base` `@baseapp` `@buildonbase` `@coinbase` `@brian_armstrong`
`@bankrbot` `@0xDeployer` `@synthesis_md` `@devfolio` `@TalentProtocol`
`@faircaster` `@virtuals_io`

## Blocky Ecosystem

- **$BLUEAGENT** — AI utility token — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base)
- **$BLOCKY** — Studio ecosystem token — `0x1E11dC42b7916621EEE1874da5664d75A0D74b07` (Base)
- **Treasury** — `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5`

## Setup

```bash
npm install
npm run build
npm start
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_token
BANKR_API_KEY=your_bankr_key
BANKR_LLM_KEY=your_bankr_key
```

## Links

- Bot: [@blockyagent_bot](https://t.me/blockyagent_bot)
- Twitter: [@blocky_agent](https://x.com/blocky_agent)
- Telegram community: [Blocky Studio](https://t.me/+1baBZgX7jd4wMGU1)
- Bankr profile: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)
