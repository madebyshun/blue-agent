# bankr-blueagent.prompt.md
# Prompt contract: how Blue Agent calls Bankr LLM

## Context

Blue Agent sends all AI inference through Bankr LLM at `https://llm.bankr.bot/v1/messages`.
This file documents the prompt structure, expected output format, and per-command contracts.

---

## Call pattern

```typescript
import { callBankrLLM } from "@blueagent/bankr";

const result = await callBankrLLM({
  command: "blue_idea" | "blue_build" | "blue_audit" | "blue_ship" | "blue_raise",
  input: string,          // user's raw request
  context?: {
    wallet?: string,      // connected wallet address
    chain_id?: 8453,      // always Base
    timestamp?: string,
  }
});
```

---

## Per-command prompt contracts

### `blue_idea` — $0.05

**Input:**
```json
{ "command": "blue_idea", "input": "<rough concept from user>" }
```

**Expected output:**
```json
{
  "problem": "string",
  "why_now": "string",
  "why_base": "string",
  "mvp_scope": ["string"],
  "risks": ["string"],
  "plan_24h": ["string"],
  "token_angle": "string | null"
}
```

---

### `blue_build` — $0.50

**Input:**
```json
{ "command": "blue_build", "input": "<idea brief or description>" }
```

**Expected output:**
```json
{
  "stack": { "frontend": "string", "backend": "string", "chain": "Base" },
  "folder_structure": ["string"],
  "key_files": [{ "path": "string", "purpose": "string" }],
  "integrations": ["string"],
  "test_plan": ["string"]
}
```

---

### `blue_audit` — $1.00

**Input:**
```json
{ "command": "blue_audit", "input": "<code snippet or repo summary>" }
```

**Expected output:**
```json
{
  "critical": [{ "issue": "string", "fix": "string" }],
  "warnings": [{ "issue": "string", "fix": "string" }],
  "verdict": "go" | "no-go" | "go-with-fixes",
  "summary": "string"
}
```

---

### `blue_ship` — $0.10

**Input:**
```json
{ "command": "blue_ship", "input": "<project description or repo>" }
```

**Expected output:**
```json
{
  "checklist": ["string"],
  "verification_steps": ["string"],
  "release_notes": "string",
  "monitoring": ["string"]
}
```

---

### `blue_raise` — $0.20

**Input:**
```json
{ "command": "blue_raise", "input": "<project description or traction data>" }
```

**Expected output:**
```json
{
  "narrative": "string",
  "market_framing": "string",
  "why_we_win": "string",
  "traction": "string",
  "ask": "string",
  "target_investors": ["string"]
}
```

---

## Error handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Parse JSON, return to user |
| 401 | Invalid BANKR_API_KEY | Log server-side, return generic error to client |
| 429 | Rate limited | Retry with exponential backoff (max 3x) |
| 500 | Bankr LLM error | Return holder gate message to client |

**Never expose BANKR_API_KEY to the client.**  
On 401/500, return: `// Coming soon for holders — hold $BLUEAGENT to unlock Console access`
