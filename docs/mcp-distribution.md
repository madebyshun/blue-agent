# Blue Agent MCP — Distribution Checklist

The MCP server is live at **`https://blueagent.dev/api/mcp`** with 56 tools (15 console + 41 Hub).

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

## 🗂 56 Tools

**Console / blue_ (15):** `blue_idea`, `blue_build`, `blue_audit`, `blue_ship`, `blue_raise`, `blue_score`, `blue_new`, `blue_monitor`, `blue_registry`, `blue_research`, `blue_compose`, `blue_deploy`, `blue_analytics`, `blue_simulate`, `blue_stream`

**Hub tools / hub_ (41):** `hub_builder_score`, `hub_agent_score`, `hub_market_fit`, `hub_token_pick`, `hub_narrative`, `hub_ecosystem`, `hub_competitor_scan`, `hub_investor_memo`, `hub_repo_health`, `hub_base_grant`, `hub_risk_gate`, `hub_honeypot`, `hub_deep_analysis`, `hub_whale_signal`, `hub_fundraise_timing`, `hub_contract_trust`, `hub_aml_screen`, `hub_key_exposure`, `hub_token_momentum`, `hub_whale_tracker`, `hub_community_sentiment`, `hub_launch_simulator`, `hub_token_launch`, `hub_builder_dd`, `hub_brand_score`, `hub_roadmap`, `hub_gtm`, `hub_pitch_intel`, `hub_wallet_pnl`, `hub_wallet_strategy`, `hub_portfolio`, `hub_defi_opportunity`, `hub_protocol_risk`, `hub_multi_agent`, `hub_agent_match`, `hub_agent_perf`, `hub_agent_revenue`, `hub_agent_token`, `hub_community_growth`, `hub_thread_intel`, `hub_narrative_pulse`

---

## 📬 Distribution targets

Submit the install JSON above to each registry. Replace `<your-contact>` with twitter/X handle for support.

### 1. Smithery (`smithery.ai`)
- URL: https://smithery.ai/server/new
- Server name: `blue-agent`
- Transport: HTTP (Streamable)
- Endpoint: `https://blueagent.dev/api/mcp`
- Category: `web3`, `defi`, `ai-agents`
- Description: "56 AI tools for Base builders — research, trade, ship. Powered by Aeon, MiroShark, Blue Agent. Pay-per-call via x402 USDC."

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
- All 41 Hub tools become callable via Orbis MCP → cross-distribution.

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
