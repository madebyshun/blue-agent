# @blueagent/builder

CLI for Blue Agent — the AI-native founder console for Base builders.

## Install

```bash
npm install -g @blueagent/builder
blue init   # installs skill files for grounding
```

## Commands

### Workflow

```bash
blue idea "a USDC streaming payroll app on Base"
blue build "USDC streaming payroll: ERC-20 + x402 payment"
blue audit "review my streaming contract for reentrancy"
blue ship  "checklist for mainnet launch of payroll app"
blue raise "pitch for a USDC payroll agent on Base"
```

You can also pipe input:

```bash
cat BRIEF.md | blue build
cat contracts/Token.sol | blue audit
```

### Scaffold

```bash
blue new my-agent --template base-agent   # Base agent with wallet + x402
blue new my-api   --template base-x402    # paid API service
blue new my-token --template base-token   # ERC-20 + Uniswap v4 hook
```

### Setup

```bash
blue init   # copies skills/*.md to ~/.blue-agent/skills/
```

## Options

All workflow commands accept:
- `--model <model>` — model id override. Left unset it resolves from `$VIRTUALS_MODEL`,
  else the `@blueagent/core` default. There is deliberately no default printed here: a
  hardcoded id in a README is how a flag goes stale against a gateway that de-lists models.
- `--max-tokens <n>` — max response tokens

## Environment

```bash
VIRTUALS_API_KEY=your_key   # required — Virtuals inference, the only gateway this CLI calls
VIRTUALS_MODEL=...          # optional — pin a model id from the live Virtuals catalog
BLUE_AGENT_SKILLS_DIR=/custom/skills/path  # optional override
```

The key can also live in `~/.blue-agent/config.toml` as `virtuals_api_key`. Run
`blue doctor` to see which source is being used.

## How grounding works

Each command loads skill files relevant to the task before calling the LLM. The table
below mirrors `SKILL_REGISTRY` in `@blueagent/core` — that map is the source of truth:

| Command | Skills loaded |
|---|---|
| `idea` | base-standards, base-addresses, blue-agent-identity, base-ecosystem, base-4337-aa |
| `build` | base-standards, base-addresses, llm-and-x402, base-ecosystem, x402-patterns, base-4337-aa |
| `audit` | base-standards, base-addresses, base-security, base-ecosystem, x402-patterns, base-4337-aa |
| `ship` | x402-patterns |
| `raise` | blue-agent-identity |

Skills are loaded from (first found wins):
1. `BLUE_AGENT_SKILLS_DIR` env var
2. `~/.blue-agent/skills/` (installed via `blue init`)
3. Monorepo `skills/` directory (dev)

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)
