# LLM & x402

Reference for the inference gateway and the payment layer Blue Agent uses.

> Renamed from `bankr-tools.md` on 2026-09-18. That file taught this exact prompt to
> emit `callBankrLLM()` against `https://llm.bankr.bot/v1/messages` — an endpoint that
> 403s. Grounding knowledge is code that gets written by whoever reads it, so a stale
> skill file does not merely mislead: it ships dead calls into every project scaffolded
> from it.

---

## Inference: Virtuals, and only Virtuals

### Endpoint

```
POST https://compute.virtuals.io/v1/chat/completions
```

Auth: `Authorization: Bearer $VIRTUALS_API_KEY`

The gateway is **OpenAI-compatible**, not Anthropic-compatible. Concretely:

| | Shape |
|---|---|
| Path | `/v1/chat/completions` |
| Auth header | `Authorization: Bearer <key>` |
| System prompt | the **first message**, `{ role: "system", content }` — there is no top-level `system` field |
| Reply text | `choices[0].message.content` |
| Token counts | `usage.prompt_tokens` / `usage.completion_tokens` |

Model ids come from the live Virtuals catalog. Do not hardcode `claude-*` ids — those
were Bankr's and this gateway does not serve them.

### How to call it

From a CLI/package context:

```ts
import { callVirtuals } from "@blueagent/core";

const result = await callVirtuals({
  system: "You are a Base builder assistant.",
  messages: [
    { role: "user", content: "Give me a build plan for a USDC streaming app on Base." }
  ],
  temperature: 0.7,   // optional, default 0.7
  maxTokens: 800,     // optional, default 800
  // model: omitted → $VIRTUALS_MODEL, else the package default
});
```

From inside `apps/web`:

```ts
import { callLLM } from "@/app/api/_lib/llm";
```

### Extracting JSON from LLM output

Models wrap JSON in ``` fences and add preamble, so a raw `JSON.parse(text)` is a bug.
Slice from the first brace to the last:

```ts
import { extractJson } from "../llm";       // packages/builder
import { extractJsonObject } from "@/app/api/_lib/llm";  // apps/web

const json = extractJson(result);
```

### Rules

- **One provider, no silent fallback.** A failure throws. It must never degrade into a
  different model: a caller that cannot tell which model answered cannot trust the answer.
- Never call OpenAI, Anthropic, Bankr, or Venice directly.
- The key is `process.env.VIRTUALS_API_KEY` — never hardcode it, never print it.
- `callBankrLLM` and `callVeniceLLM` still exist inside `apps/web` as compatibility shims
  for ~46 legacy importers. **Both delegate to Virtuals; neither makes the HTTP call its
  name implies.** Do not write new calls to either, and do not read their names as evidence
  that those providers are live. They are not: Bankr 403-banned this project at the account
  level on 2026-07-20, re-measured on every verb 2026-09-06 and 2026-09-18.

---

## Honesty rules for generated output

These bind anything the LLM writes, not just the code that calls it.

- **Verifiable facts** — grant amounts, token data, contract addresses, yields, on-chain
  metrics — must come from a real data source. The model interprets; it never generates
  the numbers. Compute derived values in code, not in the prompt.
- **Advisory output** — strategy, GTM, roadmap, ideas — may be model-generated, but label
  it as an estimate. It is a framework, not a measurement.
- **Missing data → "insufficient data".** Never infer a score, a risk level, or a price
  from absent data. "Cannot assess" is a correct answer; a plausible-looking number is not.
- **Never invent a contract address.** If an address is not already verified in the
  grounding knowledge, say so and stop.
- **Verdicts** (BUY/WATCH/PASS, SHIP/REVISE) are hard-mapped from a numeric score in code.
  A model picking the verdict word flips the same input between runs.

---

## x402 Payments

x402 is a micropayment protocol for HTTP APIs. Blue Agent exposes paid endpoints from
`apps/web` at `https://blueagent.dev/api/x402/<tool-id>` — **self-hosted**, settled in USDC
on Base through the Coinbase CDP facilitator. There is no third-party storefront in the
payment path.

### How it works

1. Client calls an x402 endpoint without payment → `402 Payment Required` with the price.
2. Client pays the required amount in USDC on Base (EIP-3009 transfer authorization).
3. Client retries with the payment proof header → gets the response.

### Price format

Core command prices live in `packages/core/src/schemas.ts`:

```ts
export const BLUE_AGENT_PRICING = {
  idea:  0.05,  // $0.05 USDC
  build: 0.50,
  audit: 1.00,
  ship:  0.10,
  raise: 0.20,
};
```

Prices are in USD, paid in USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) on Base
(chain ID 8453).

### Adding a new paid endpoint

1. Create the handler in `apps/web/src/app/api/x402/_handlers/<tool-id>.ts`.
2. Register it in BOTH `_handlers/index.ts` (the `HANDLERS` map) and
   `apps/web/src/lib/agent-tools.ts` (`AGENT_TOOLS`) — a tool is only live if it is in
   both, and the two counts must stay equal.
3. Set the price in `BLUE_AGENT_PRICING` if it's a core command, or define it inline.
4. Verification and settlement are already done for you by `apps/web/src/app/api/x402/[tool]/route.ts`
   — it builds the 402 requirements and calls `cdpVerify`/`cdpSettle` in
   `api/_lib/x402-cdp.ts`. A handler never verifies payment itself.

### Calling a paid endpoint (client side)

The server answers an unpaid request with `402` and an `accepts[]` array. Pay one entry,
then retry with the `X-Payment` header:

```ts
const url  = "https://blueagent.dev/api/x402/deep-analysis";
const body = JSON.stringify({ token: "0x…" });

let res = await fetch(url, { method: "POST", body });

if (res.status === 402) {
  const { accepts } = await res.json();
  // accepts[0] = { scheme: "exact", network: "eip155:8453", asset: <USDC>,
  //                amount: "500000" /* base units — USDC is 6dp */, payTo, ... }
  // Sign an EIP-3009 transferWithAuthorization for `amount` to `payTo` with your own
  // wallet and base64-encode the x402 v2 payload. Nothing in this repo signs for you.
  res = await fetch(url, {
    method: "POST",
    body,
    headers: { "X-Payment": await signX402(accepts[0]) },
  });
}
```

> Do **not** reach for `packages/payments` — it is an unfinished stub with no call sites
> (`buildExactPayment` returns `signature: ""` and speaks x402 **v1** with a
> `"base-mainnet"` string, while the live server speaks **v2** with CAIP-2 networks). It
> is `private: true` and has never been published, so `npm install @blueagent/payments`
> 404s. For an AgentKit integration use the published `@blueagent/agentkit` instead.

---

## On-chain actions

Blue Agent prepares transactions; **the user signs them**. The agent holds no key on the
user's behalf and never broadcasts a transfer, swap, or claim by itself.

- Base (8453) and Robinhood Chain (4663) are both live. They share no state — an address
  without its chain is meaningless, and a ticker string alone never identifies a token.
- Never suggest Ethereum mainnet.
- Every token address must be verified on its own chain's explorer before use.
