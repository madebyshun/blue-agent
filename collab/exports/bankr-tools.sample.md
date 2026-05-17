# bankr-tools — sample export

## What it covers

The Bankr LLM client, available models, and x402 payment patterns used across Blue Agent.

## When to use it

Use this skill when any agent needs to call Bankr LLM, understand model tiers, or handle x402 micropayments in the Blue Agent ecosystem.

## Core concepts

- Endpoint: `POST https://llm.bankr.bot/v1/messages`
- Auth: `x-api-key: $BANKR_API_KEY`
- Never call OpenAI or Anthropic directly — always use `callBankrLLM()`
- API key never hardcoded — always `process.env.BANKR_API_KEY`

## Models

| Model | Use case |
|---|---|
| `claude-haiku-4-5` | Fast, cheap — default for most commands |
| `claude-sonnet-4-6` | Higher quality — use for audit, raise |
| `claude-opus-4-6` | Max quality — reserved for premium compute |

## Patterns

- Import `callBankrLLM` from `@blue-agent/bankr` — never reimplement the client.
- Use `extractJsonObject()` to safely parse JSON from LLM output.
- All x402 paid endpoints on Blue Agent use USDC on Base (chain ID 8453).
- Payment header: `X-Payment` — base64-encoded x402 payment payload.
