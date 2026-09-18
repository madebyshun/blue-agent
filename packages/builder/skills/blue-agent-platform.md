# Blue Agent Platform

How Blue Agent's own two pieces of infrastructure work: the **inference gateway** you call to
generate text, and the **x402 endpoints** you call (or publish) to charge for compute.

> Replaces `bankr-tools.md`, deleted 2026-09-18. That file described a Bankr LLM endpoint, a
> Bankr Agent action rail, and two npm packages — none of which are reachable. It was loaded
> into the system prompt for `blue build`, so it did not merely sit there being wrong: it
> taught the model to emit code against a banned host with a dead env var and a 404 dependency.
> The renaming is deliberate. Skills resolve `BLUE_AGENT_SKILLS_DIR` → `~/.blue-agent/skills/`
> → the package copy, first hit wins, so a stale `bankr-tools.md` left on disk by an earlier
> `blue init` would have shadowed any in-place rewrite. A new filename cannot be shadowed.

---

## 1. Inference — Virtuals, and only Virtuals

### Endpoint

```
POST https://compute.virtuals.io/v1/chat/completions
Authorization: Bearer $VIRTUALS_API_KEY
Content-Type: application/json
```

OpenAI-compatible chat-completions shape. The system prompt is `messages[0]` with
`role: "system"` — there is no top-level `system` field.

```jsonc
{
  "model": "deepseek-deepseek-v4-flash",
  "messages": [
    { "role": "system", "content": "…" },
    { "role": "user",   "content": "…" }
  ],
  "max_tokens": 2000,
  "temperature": 0.6
}
```

**Send those four keys and nothing else.** Virtuals rejects unrecognised body keys with a 400
rather than ignoring them. `disable_thinking` and `reasoning_effort` each cost this repo a
round of red CI before that was understood.

### Model ids

`VIRTUALS_MODEL` overrides the default; absent that, `deepseek-deepseek-v4-flash`. Any id you
pass must exist in the live Virtuals catalog — an unknown id returns **400, not a fallback**.
Do not write Anthropic or OpenAI model ids (`claude-*`, `gpt-*`): they are not in the catalog.
Keep the default in step with `VIRTUALS_DEFAULT_MODEL` in
`apps/web/src/app/api/_lib/llm.ts`, which is the measured source.

### `max_tokens` is reasoning + answer, not answer

The default model is a **reasoning** model. Virtuals bills its hidden reasoning inside
`usage.completion_tokens`, spends it from the same `max_tokens` budget as the answer, and never
returns it in `message.content`. A budget that looks generous for the answer can be eaten
entirely by reasoning, and you get `finish_reason: "length"` with `content_len: 0`.

Measured 2026-09-17 against one real prompt, 12 consecutive calls at `max_tokens: 400`:
**8 of 12 returned empty content**, reasoning alone consuming 189–417 tokens. The same prompt
at 1000 / 1500 / 2000 was 8/8 clean at every budget.

So: **ask for ≥ 1500**, and read an empty response as a starved budget before you suspect an
outage. Note the failure mode is the expensive one — a starved call still bills the full budget
and returns nothing.

Reasoning output may also arrive wrapped in `<think>…</think>`. Strip a leading think-block
before parsing.

### How to call it from inside this repo

| Where | Import | Notes |
|---|---|---|
| `apps/web` route handlers | `callLLM` from `apps/web/src/app/api/_lib/llm.ts` | Throws a typed `LLM_UNAVAILABLE` on failure so the caller degrades instead of fabricating |
| `packages/*` (the 5 commands) | `callWithGrounding` from `@blueagent/core` | Assembles the system prompt from this skill registry, then calls Virtuals |

`callWithGrounding(task, prompt)` is the **only** inference path in `@blueagent/skill`,
`@blueagent/sdk` and `@blueagent/builder`. Fixing it fixes all three; breaking it breaks all
three.

### Parsing JSON out of a response

Never `JSON.parse(text)` raw. Models wrap JSON in ``` fences and add preamble. Strip fences,
slice from the first `{` to the last `}`, parse inside `try/catch`, and have a defined
behaviour for the failure branch that is not a fabricated object.

### Rules

- Never call OpenAI, Anthropic, Bankr or Venice directly. One gateway.
- The key is `process.env.VIRTUALS_API_KEY`, or `virtuals_api_key` in
  `~/.blue-agent/config.toml`. Never hardcode it.
- `callBankrLLM` and `callVeniceLLM` still exist in `apps/web` and still compile — they are
  **shims that delegate to Virtuals**. Neither makes the HTTP call its name implies. Do not
  write new calls to either.
- `BANKR_API_KEY` is not an inference credential. (It is still read by three *read-only* Bankr
  consumers — see §3 — so it is not an unset-me env var either.)
- Missing or unparseable model output is `"unknown"`, never an invented number.

---

## 2. x402 — charging for an endpoint

Blue Agent's paid tools are served from `apps/web` at:

```
https://blueagent.dev/api/x402/<tool-id>
```

Self-hosted: `route.ts` builds its own 402 requirements and settles USDC on Base (8453) through
the Coinbase CDP facilitator. There is no third-party storefront in the payment path.

For the protocol itself — 402 flow, header format, EIP-3009 `transferWithAuthorization`,
replay and expiry checks — see **`x402-patterns.md`**. This section covers only the parts
specific to shipping a tool in this repo.

### Adding a paid endpoint

1. Create the handler at `apps/web/src/app/api/x402/_handlers/<tool-id>.ts`.
2. Register it in **both** `_handlers/index.ts` (the `HANDLERS` map) **and**
   `apps/web/src/lib/agent-tools.ts` (`AGENT_TOOLS`). A tool is live only if it is in both,
   and the two counts must stay equal — an entry in one map alone is either a 404 the catalog
   advertises or a handler nobody can find.
3. Price it on the `AGENT_TOOLS` entry. `priceUSDC` is in **raw USDC units, 6 decimals**:
   `200000` is $0.20, not $200000. The human-readable `price: "$0.20"` string sits beside it
   and must agree.
4. The five core commands price from `BLUE_AGENT_PRICING` in `packages/core/src/schemas.ts`
   instead: idea $0.05 · build $0.50 · audit $1.00 · ship $0.10 · raise $0.20.

Payment settles to `0x02950ad38ada1d599375bd447e080cd404809205` in native USDC
(`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) on Base. Never accept bridged USDbC.

### Calling a paid endpoint as a client

`x402-fetch` wraps `fetch` and answers the 402 challenge for you:

```ts
import { wrapFetchWithPayment } from "x402-fetch";

const paidFetch = wrapFetchWithPayment(fetch, {
  privateKey: process.env.WALLET_PRIVATE_KEY as `0x${string}`,
});

// risk-gate costs $0.20 — check the live price, don't assume:
//   https://blueagent.dev/.well-known/pricing
const res = await paidFetch("https://blueagent.dev/api/x402/risk-gate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: "0x…" }),
});
```

The live catalog of ids and prices is `AGENT_TOOLS`, published at
`https://blueagent.dev/.well-known/pricing`. Resolve a tool id against it rather than
hardcoding — an id that is not in the catalog is a 404, and a price you remembered is a
guess.

---

## 3. Deliberately not here

Re-adding any of this is a regression, not an improvement.

**Bankr as an LLM provider.** `llm.bankr.bot` is not the gateway. Measured 2026-09-06, the
Bankr **account** is suspended for all writes — `banned: true`, `banType: "restricted"`,
`reasonCode: "fraud"` — not one hostname. Reads still return 200, which is why three read-only
consumers remain in `apps/web` and `BANKR_API_KEY` stays set. Write ≠ read: measure the verb,
not the host.

**Bankr Agent as an action rail.** The old file taught
`mcp__…__bankr_agent_submit_prompt({ prompt: "Swap 10 USDC for ETH" })` for swaps and sends.
That is a money rail behind the same account suspension, and the MCP tool is not installed in
this repo. Never suggest it. On-chain actions in Blue Agent are prepared as cards the **user**
signs from their own wallet; the agent does not execute transfers.

**`@blue-agent/bankr` and `@blue-agent/payments`.** Both are `private: true` in this monorepo
and **404 on npm** (verified 2026-09-18). Code that imports them does not install. For x402
client work use `x402-fetch`; for inference use `callLLM` / `callWithGrounding`.
