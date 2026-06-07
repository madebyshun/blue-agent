# Blue Agent MCP — Distribution Checklist

The MCP server is live at **`https://blueagent.dev/api/mcp`** with 50 tools (5 console commands + 43 Hub tools + `blue_score` + `blue_new`).

This doc is the canonical install + submission reference. Copy-paste these snippets into MCP catalogs and dev tools.

---

## 🔌 Install snippets (copy-paste)

### Claude Desktop / Claude Code (native HTTP)

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}
```

Claude Code CLI:
```bash
claude mcp add blue-agent --transport http https://blueagent.dev/api/mcp
```

### Cursor / Cline / Windsurf (via `mcp-remote` bridge)

```json
{
  "mcpServers": {
    "blue-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://blueagent.dev/api/mcp"]
    }
  }
}
```

### Direct test (no client)

```bash
# Initialize
curl -sS -X POST https://blueagent.dev/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List tools
curl -sS -X POST https://blueagent.dev/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call a tool
curl -sS -X POST https://blueagent.dev/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"blue_idea","arguments":{"prompt":"USDC streaming payroll for Base DAOs"}}}'
```

---

## 📡 Protocol

- **Transport:** MCP 2025-03-26 Streamable HTTP — single endpoint, content-negotiates `application/json` or `text/event-stream` on `Accept`.
- **Auth:** none (free tier — rate-limited per IP). x402 paid path remains available via Hub UI at `/hub`.
- **Spec compliance:** JSON-RPC 2.0, `initialize` → `tools/list` → `tools/call`, `ping`, `notifications/initialized`.

---

## 🗂 50 Tools

**Console commands (5):** `blue_idea`, `blue_build`, `blue_audit`, `blue_ship`, `blue_raise`

**Hub tools (43):** token-pick-signal, narrative-position, ecosystem-digest, market-fit, token-launch-readiness, roadmap-validator, competitor-scan, pitch-intelligence, fundraise-timing, gtm-brief, stack-recommender, investor-memo, token-distribution-plan, agent-performance, agent-collab-match, repo-health, community-sentiment, defi-opportunity, builder-deep-dd, launch-simulator, whale-copy-signal, token-momentum-scanner, portfolio-rebalancer, thread-intelligence, builder-brand-score, community-growth-playbook, agent-revenue-optimizer, agent-token-strategy, multi-agent-workflow, base-grant-finder, base-protocol-comparison, base-builder-network-match, wallet-strategy-analyzer, protocol-risk-monitor, contract-trust, honeypot-check, risk-gate, deep-analysis, wallet-pnl, aml-screen, airdrop-check, whale-tracker, dex-flow

**Utility (2):** `blue_score` (Builder Score by X handle), `blue_new` (scaffold scripts)

---

## 📬 Distribution targets

Submit the install JSON above to each registry. Replace `<your-contact>` with twitter/X handle for support.

### 1. Smithery (`smithery.ai`)
- URL: https://smithery.ai/server/new
- Server name: `blue-agent`
- Transport: HTTP (Streamable)
- Endpoint: `https://blueagent.dev/api/mcp`
- Category: `web3`, `defi`, `ai-agents`
- Description: "50 AI tools for Base builders — research, trade, ship. Powered by Aeon, MiroShark, Blue Agent. Pay-per-call via x402 USDC."

### 2. MCP.SO (`mcp.so`)
- URL: https://mcp.so/submit
- Same payload as Smithery; add: `blockchain: Base (8453)`.

### 3. CDP x402 (Coinbase Developer Platform)
- URL: https://portal.cdp.coinbase.com/products/x402
- Submit as x402 service provider. Endpoint base: `https://blueagent.dev/api/x402`
- The MCP path is the **free** discovery layer; x402 path is the **paid** execution layer.

### 4. Agentic Market (`agenticmarket.ai`)
- URL: https://agenticmarket.ai/submit
- Category: `Agent Tools`
- USP: "Multi-agent ecosystem (Blue + Aeon + MiroShark) — first MCP server with built-in Base intelligence."

### 5. Orbis (`orbisapi.com`) — list as provider
- URL: https://orbisapi.com/providers/apply
- Position as **Base-native specialist** complementing Orbis's general API marketplace.
- All 43 Hub tools become callable via Orbis MCP → cross-distribution.

---

## ✅ Submission checklist

- [ ] Smithery
- [ ] MCP.SO
- [ ] CDP x402
- [ ] Agentic Market
- [ ] Orbis (as provider)
- [ ] Post on X with install snippet (@blueagent_)
- [ ] Add to `/docs/quickstart.md` "Install MCP" section
- [ ] Add MCP badge to README

---

## 🐛 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Payment required for <tool>` | `INTERNAL_SERVICE_KEY` not set on Vercel | Set env var, redeploy |
| `Rate limit exceeded` | >100 req/min per IP | Wait 1 min or self-host |
| `mcp-remote` hangs | Old `mcp-remote` version | `npm i -g mcp-remote@latest` |
| Empty `tools/list` | `agent-tools.ts` build issue | Check Vercel build logs |
| SSE timeout in Cursor | Cursor expects HTTP, not SSE | Use direct URL (no `mcp-remote`) |

---

## 📈 Track success

- `/api/usage` returns paid + MCP run counts per tool. Surface this in `/hub` Featured ranking.
- Vercel Analytics: filter requests by path `/api/mcp` → unique daily callers.
- Search X for `blueagent.dev/api/mcp` to find unsanctioned mentions.
