# Integrate with Blue Agent

Three ways to connect your agent to Blue Agent on Base.

---

## Option 1 — Call via API (HTTP + x402)

Blue Agent exposes paid endpoints via x402 — pay per call in USDC on Base.

### Discovery

```bash
curl https://blueagent.dev/.well-known/agent.json
```

### Signal endpoint

Send a signal to Blue Agent and trigger the Aeon → Blue Agent → MiroShark loop:

```bash
POST https://blueagent.dev/api/signal
Content-Type: application/json

{
  "id": "sig_youragent_001",
  "source": "your-agent-name",
  "type": "trending",
  "data": { "subject": "...", "context": "..." },
  "confidence": 0.85,
  "timestamp": "2026-05-17T09:00:00Z"
}
```

See `shared-schemas.yml` for full signal schema.

### Paid skill endpoints (x402)

```bash
POST https://blueagent.dev/api/console
X-Payment: <x402-payment-header>
Content-Type: application/json

{
  "command": "idea",
  "prompt": "Your idea or question"
}
```

Prices: `idea $0.05` · `build $0.50` · `audit $1.00` · `ship $0.10` · `raise $0.20`

---

## Option 2 — Install MCP Skill

Install Blue Agent as an MCP skill — use all tools directly from Claude, Cursor, Windsurf, or any MCP-compatible host.

```bash
npm install -g @blueagent/skill
```

Available tools after install:

| Tool | Description | Price |
|---|---|---|
| `blue_idea` | Fundable brief from rough concept | $0.05 |
| `blue_build` | Architecture + build plan | $0.50 |
| `blue_audit` | Security + risk review | $1.00 |
| `blue_ship` | Deployment checklist | $0.10 |
| `blue_raise` | Pitch narrative | $0.20 |
| `blue_score` | Builder Score lookup | Free |
| `blue_new` | Scaffold Base project | Free |

---

## Option 3 — Add a Bridge File (Agent Collab)

If your agent wants a deeper integration — watching Blue Agent, feeding it signals, or receiving forecasts — add a bridge file to this repo.

### Step 1 — Fork the repo

```bash
git clone https://github.com/madebyshun/blue-agent
cd blue-agent
```

### Step 2 — Create your bridge files

Use the existing bridges as templates:

```
collab/
├── aeon-blueagent.yml           ← Aeon bridge (reference)
├── aeon-blueagent.prompt.md     ← Aeon prompt (reference)
└── aeon-blueagent-bridge.md     ← Aeon architecture (reference)
```

Name your files using the format:

```
<youragent>-blueagent.yml
<youragent>-blueagent.prompt.md
<youragent>-blueagent-bridge.md
```

### Step 3 — Use shared schemas

All data exchanged with Blue Agent must follow `shared-schemas.yml`:

- `signal` — what your agent sends to Blue Agent
- `forecast` — what Blue Agent sends back after simulation
- `action` — what Blue Agent executes onchain
- `result` — feedback loop data

### Step 4 — Open a PR

```bash
git checkout -b collab/<youragent>-blueagent
git add collab/
git commit -m "collab: add <youragent>-blueagent bridge"
git push origin collab/<youragent>-blueagent
```

Open a PR with label `collab`. Include in the PR description:
- What your agent does
- What it sends to Blue Agent
- What it expects back
- Any schema extensions needed

---

## Data schemas

All integration data uses `shared-schemas.yml`:

```bash
curl https://raw.githubusercontent.com/madebyshun/blue-agent/main/collab/shared-schemas.yml
```

Schemas: `signal` · `scenario` · `forecast` · `action` · `result`

---

## Rules

- Base-only scope — all onchain actions target chain ID 8453
- No invented addresses, stats, or partnerships
- High-value actions (> $50 USDC) require a MiroShark confidence check
- Never expose private keys or API keys in bridge files or signals
- Follow `shared-schemas.yml` — do not invent new top-level fields without a PR

---

## Questions

- GitHub Discussions: github.com/madebyshun/blue-agent/discussions
- Telegram: t.me/blueagent_hub
- X: x.com/blocky_agent
