# @blueagent/skill

MCP server for Blue Agent — exposes the 5 builder commands as MCP tools for Claude Desktop, Cursor, and other MCP clients.

## Install

```bash
npm install -g @blueagent/skill
```

## MCP Tools

| Tool | Description | Price |
|---|---|---|
| `blue_idea` | Concept → fundable brief | $0.05 |
| `blue_build` | Architecture + file plan | $0.50 |
| `blue_audit` | Security risk review | $1.00 |
| `blue_ship` | Deployment checklist | $0.10 |
| `blue_raise` | Pitch narrative | $0.20 |

## Setup — Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blueagent": {
      "command": "blueagent-skill",
      "env": {
        "VIRTUALS_API_KEY": "your_virtuals_api_key"
      }
    }
  }
}
```

## Environment

```bash
VIRTUALS_API_KEY=your_key           # required — Virtuals inference, the only gateway used
VIRTUALS_MODEL=...                  # optional — pin a model id from the live Virtuals catalog
BLUE_AGENT_SKILLS_DIR=/custom/path  # optional skill override
```

The key can also live in `~/.blue-agent/config.toml` as `virtuals_api_key`.

Built by [Blocky Studio](https://blocky.studio).
