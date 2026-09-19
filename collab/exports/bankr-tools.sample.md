# bankr-tools — sample export

> # ☠️ DEAD — do not follow this sample.
>
> It is a snapshot of the `bankr-tools` skill, which was removed 2026-09-18. Three of its
> instructions are now actively wrong:
>
> - **"Import `callBankrLLM` from `@blue-agent/bankr`"** — that scope never existed on npm,
>   and the local `packages/bankr` was deleted. Call `callLLM` from
>   `apps/web/src/app/api/_lib/llm.ts` instead; it routes to Virtuals.
> - **`llm.bankr.bot` + `BANKR_API_KEY`** — 403 for this project, account-level suspension
>   (measured 2026-09-06). The gateway is `https://compute.virtuals.io/v1` with
>   `VIRTUALS_API_KEY`.
> - **The model table below** — `claude-haiku-4-5` / `claude-sonnet-4-6` / `claude-opus-4-6`
>   are Bankr-era ids the Virtuals catalog does not serve. Never hardcode a model id; let it
>   resolve from `$VIRTUALS_MODEL`, else the `@blueagent/core` default.
>
> Only the x402 section is still accurate — payments were never a Bankr path. Blue Agent
> self-hosts x402 and settles USDC on Base through the Coinbase CDP facilitator.

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
