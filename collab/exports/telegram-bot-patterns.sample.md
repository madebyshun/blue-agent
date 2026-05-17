# telegram-bot-patterns — sample export

## What it covers

Telegram bot architecture, webhook vs polling, command handlers, wallet integration, and production patterns for Base-native bots.

## When to use it

Use this skill when building or monitoring Telegram bots that interact with Blue Agent, send alerts, or handle community actions on Base.

## Core concepts

- Webhook (production): Telegram POSTs to your HTTPS endpoint — instant delivery.
- Polling (dev): bot pulls updates — simple, no public URL needed.
- Alert target for Blue Agent collab: `blueagent_hub` Telegram group.
- All wallet actions triggered via bot must go through wallet guardrails.

## Patterns

- Use webhook in production — never polling in a deployed environment.
- Respond to Telegram within 30 seconds or the request times out and retries.
- Rate limit bot commands per user — prevent spam and abuse.
- Never expose private keys or BANKR_API_KEY in bot messages or logs.
- Use `sendMessage` with `parse_mode: "Markdown"` for formatted alerts.
- For onchain actions triggered by bot commands, require explicit user confirmation before executing.

## Alert format for Blue Agent

```
🔵 Blue Agent Alert
Signal: {type}
Confidence: {score}
Action: {recommendation}
→ blueagent.dev/code
```
