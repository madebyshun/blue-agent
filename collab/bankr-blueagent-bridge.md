# Bankr × Blue Agent Bridge

> Bankr is not a peer agent in the collab loop — it is the **engine Blue Agent runs on**.  
> Aeon and MiroShark are collaborators. Bankr is infrastructure.

---

## What Bankr provides

| Layer | Bankr capability | How Blue Agent uses it |
|---|---|---|
| **LLM** | `llm.bankr.bot/v1/messages` | All AI reasoning — idea, build, audit, ship, raise |
| **Wallet** | Base wallet API | Receive x402 USDC payments, route treasury fees |
| **Trading** | Uniswap v4 / Base DEXes | $BLUEAGENT token ops, liquidity |
| **Registry** | bankr.bot/agents | Agent profile, discovery, holder verification |

---

## Architecture

```
User (web/CLI)
    │
    ▼
Blue Agent (blueagent.dev)
    │
    ├─── x402 payment received (USDC on Base)
    │
    ├─── callBankrLLM() ──────────────► Bankr LLM
    │         └── packages/bankr        (llm.bankr.bot/v1/messages)
    │
    ├─── Wallet API ─────────────────► Bankr Wallet
    │         └── treasury, rewards     (Base chain)
    │
    └─── Holder check ───────────────► Bankr Registry
              └── Console gate          ($BLUEAGENT balance)
```

---

## Data flow per command

```
1. User submits command (blue_idea, blue_build, etc.)
2. Blue Agent validates x402 payment (USDC on Base)
3. Blue Agent calls Bankr LLM with command + input
4. Bankr LLM returns structured JSON response
5. Blue Agent formats + returns to user
6. Fee portion routed to treasury via Bankr wallet
```

---

## Auth model

```
Client (browser/CLI)
    │  no key exposed
    ▼
Blue Agent server
    │  BANKR_API_KEY (env, server-side only)
    ▼
Bankr LLM endpoint
```

- `BANKR_API_KEY` lives in server environment only — never sent to client
- Web console: key removed from Vercel → triggers holder gate message
- CLI: key set by dev in `.env` → no friction for local dev

---

## Console gate logic

```
request → /api/console
    │
    ├── BANKR_API_KEY present?
    │     YES → call Bankr LLM → return result
    │     NO  → return holder gate message:
    │           "// Coming soon for holders — hold $BLUEAGENT to unlock Console access"
    │
    └── (future) check wallet holds $BLUEAGENT → unlock if true
```

---

## Collab loop position

```
Aeon ──────────► Blue Agent ──────────► MiroShark
(detect/alert)  (decide/orchestrate)  (simulate/forecast)
                      │
                      ▼
                   Bankr
              (LLM + wallet + trading)
```

Bankr sits **below** the collab loop, not within it. Every agent decision Blue Agent makes is powered by Bankr inference. Every onchain action Blue Agent takes flows through Bankr's wallet and trading layer.

---

## Integration for external agents

If you are building an agent that wants to call Blue Agent:

1. **x402 API** — POST to `https://blueagent.dev/api/<command>` with x402 USDC payment
2. **MCP skill** — `npx skills add blueagent` — call `blue_idea`, `blue_build`, etc. via MCP
3. **Bankr-to-Bankr** — if your agent is also on Bankr, Blue Agent appears on `bankr.bot/agents/blue-agent`

Blue Agent does not expose its `BANKR_API_KEY` to external callers. All external access goes through x402 or MCP.

---

## Files

| File | Purpose |
|---|---|
| `bankr-blueagent.yml` | Config — capabilities, integration map, payment flow |
| `bankr-blueagent.prompt.md` | Prompt contracts — per-command input/output schemas |
| `bankr-blueagent-bridge.md` | This file — architecture overview |
