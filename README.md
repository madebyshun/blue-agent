# 🟦 Blue Agent Bot

AI-powered Telegram community bot for Base builders. Built by [Blocky Studio](https://blocky.studio).

- **Bot:** [**@Blockyagent_beta_bot** (beta)
- **Community:** [t.me/blueagent_hub](https://t.me/blueagent_hub)
- **Token:** [$BLUEAGENT](https://dexscreener.com/base/0xf895783b2931c919955e18b5e3343e7c7c456ba3)

---

## Features

### 👤 User
| Command | Description |
|---|---|
| `/start` | Onboarding — create wallet, join community |
| `/menu` | Main menu |
| `/profile` | Your profile — tier, points, streak, wallet |
| `/wallet` | Wallet address + balance |
| `/points` | Points balance + rank |
| `/leaderboard` | Top builders this week |
| `/refer` | Referral link — earn 50 pts per referral |
| `/rewards` | Claim $BLUEAGENT from your points |

### 🏗️ Builder
| Command | Description |
|---|---|
| `/score @handle` | AI Builder Score (0-100) for any X/Twitter handle |
| `/submit` | Submit your project to the directory |
| `/projects` | Browse submitted projects |
| `/quests` | Active quests — earn bonus points |

### 📊 Trading & Token
| Command | Description |
|---|---|
| `/portfolio` | View your onchain portfolio |
| `/alert` | Set price alerts for $BLUEAGENT |
| `/pricing` | Current $BLUEAGENT price + stats |
| `/news` | Latest from top Base builders on X |

### 🎮 Community
| Command | Description |
|---|---|
| `/predict` | Prediction market — vote on outcomes |
| `/raffle` | Participate in active raffles |
| `/propose` | Submit a community proposal |
| `/stats` | Community stats |
| `/agents` | Agent marketplace |

### 🛠️ Admin Only
| Command | Description |
|---|---|
| `/admin` | Admin panel |
| `/broadcast` | DM blast to all users |
| `/schedule` | Schedule an announcement |
| `/unschedule` | Cancel a scheduled post |
| `/raffle` | Create/manage raffles |
| `/propose` | Manage proposals |
| `/launch` | Token launch wizard (deploy ERC-20 on Base) |
| `/subscribe` | Manage project subscriptions |
| `/subs` | List all subscriptions |

---

## Points System

| Action | Points |
|---|---|
| Daily check-in | +5 pts |
| Streak bonus (3+ days) | +3 pts |
| Refer a builder | +50 pts |
| Being referred | +10 pts |
| Submit a project | +20 pts |
| Complete a quest | varies |

**Claim:** Min 100 pts · Cooldown 7 days · 1 pt = 1,000 $BLUEAGENT

**Activity Tiers:**
| Tier | Requirement | Multiplier |
|---|---|---|
| Builder | Default | 1.0x |
| Shipper | 30 days + 500 pts | 1.3x |
| Founder | 60 days + 1,500 pts | 1.5x |
| Legend | 90 days + 3,000 pts | 2.0x |

---

## Auto Features

- **Trade tracker** — alerts on significant $BLUEAGENT buys/sells
- **Whale alert** — large transaction notifications
- **Gem signals** — trending tokens on Base
- **AI community manager** — auto-moderation + engagement
- **Anti-spam** — automatic spam detection
- **Scheduled posts** — timed announcements to group threads

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Bot:** node-telegram-bot-api
- **LLM:** Bankr LLM Gateway — multi-model with smart routing
  - Light: Gemini Flash Lite, GPT-5 Nano, Qwen Flash
  - Mid: Gemini Flash, Claude Haiku, Grok Fast
  - Full: Claude Sonnet 4.6, Gemini Pro, GPT-5
- **Agent:** Bankr Agent — real-time onchain + X data
- **Chain:** Base (EVM)
- **Wallet:** ethers.js — auto-generated per user
- **Process manager:** PM2

---

## Setup

```bash
npm install
npm run build
npm start
```

### Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_token
BANKR_API_KEY=your_bankr_key
BANKR_LLM_KEY=your_bankr_key
BASESCAN_API_KEY=your_basescan_key   # optional
NEYNAR_API_KEY=your_neynar_key       # optional, for Farcaster data
```

### Config (`config.json`)

```json
{
  "token": {
    "symbol": "YOURTOKEN",
    "contract": "0x...",
    "pool": "0x...",
    "tokens_per_point": 1000
  },
  "telegram": {
    "group_id": -100xxxxxxxxx,
    "bot_username": "your_bot",
    "threads": {
      "alpha": 15,
      "trades": 60,
      "feed": 18,
      "meme": 9,
      "builders": 5
    }
  }
}
```

---

## Blocky Ecosystem

| | |
|---|---|
| **$BLUEAGENT** | `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base) |
| **$BLOCKY** | `0x1E11dC42b7916621EEE1874da5664d75A0D74b07` (Base) |
| **Treasury** | `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5` |

---

## Links

- Bot: [**@Blockyagent_beta_bot** (beta)
- Beta: [@Blockyagent_beta_bot](https://t.me/Blockyagent_beta_bot)
- Twitter: [@blocky_agent](https://x.com/blocky_agent)
- Community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Website: [blueagent.xyz](https://blueagent.xyz)
- Bankr: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)
