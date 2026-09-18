# @blueagent/builder

CLI for Blue Agent — the AI-native founder console for Base builders.

## Install

```bash
npm install -g @blueagent/builder
blue init     # installs skill files for grounding
blue doctor   # checks node, skills, config, API key
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
blue new my-agent --template base-agent   # agent with wallet + x402 payments
blue new my-api   --template base-x402    # paid API service
blue new my-token --template base-token   # ERC-20 + Uniswap v4 hook
```

### Setup

```bash
blue init   # copies skills/*.md to ~/.blue-agent/skills/
```

## Options

The five workflow commands accept:

- `--model <model>` — model id override. Must exist in the live Virtuals catalog;
  an unknown id returns **400, not a fallback**. Leave it unset to use the default.
- `--max-tokens <n>` — max output tokens (default 2000, or 3000 for `build` / `audit`).
  Do not lower this below ~1500: the default model reasons before answering, that
  reasoning is billed from the same budget, and a starved call returns nothing
  while still charging in full.

## Environment

Inference runs through **Virtuals** (`https://compute.virtuals.io/v1`). Set the key
either as an env var or in `~/.blue-agent/config.toml`:

```bash
VIRTUALS_API_KEY=your_key                  # required by idea/build/audit/ship/raise
VIRTUALS_MODEL=deepseek-deepseek-v4-flash  # optional override
BLUE_AGENT_SKILLS_DIR=/custom/skills/path  # optional override
```

```toml
# ~/.blue-agent/config.toml
virtuals_api_key = "your_key"
```

`blue doctor` reports whether the key is readable from either source.

## How grounding works

Each command loads skill files relevant to the task and injects them as system
context before the model sees your prompt. The table below is generated from
`SKILL_REGISTRY` in `@blueagent/core` and checked in CI — if it disagrees with the
code, the code wins:

| Command | Skills loaded |
|---|---|
| `idea` | base-standards, base-addresses, blue-agent-identity, base-ecosystem |
| `build` | base-standards, base-addresses, blue-agent-platform, base-ecosystem, x402-patterns |
| `audit` | base-standards, base-addresses, base-security, base-ecosystem, x402-patterns |
| `ship` | x402-patterns |
| `raise` | blue-agent-identity |

Skills are loaded from (first found wins):
1. `BLUE_AGENT_SKILLS_DIR` env var
2. `~/.blue-agent/skills/` (installed via `blue init`)
3. Monorepo `skills/` directory (dev)

A skill file that cannot be resolved is **skipped with a warning**, not an error —
the command still answers, with less grounding than the table claims. That is why
the registry is verified in CI rather than by reading.

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)
