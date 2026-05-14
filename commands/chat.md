# blue chat

Streaming chat with Blue Agent — multi-turn REPL or single-prompt mode.

## Usage

```bash
# Single prompt (non-interactive)
blue chat "What's a good token launch strategy on Base?"

# Interactive REPL
blue chat

# Pipe input
echo "Explain x402 micropayments" | blue chat

# Model selection
blue chat "my question" --sonnet     # balanced, slower
blue chat "my question" --opus       # deep thinking
blue chat "my question" -m claude-haiku-4-5  # explicit override
```

## Models

| Flag | Model | Best for |
|---|---|---|
| (default) | claude-haiku-4-5 | Quick questions, fast iteration |
| `--sonnet` | claude-sonnet-4-6 | Balanced depth + speed |
| `--opus` | claude-opus-4-6 | Complex architecture, deep analysis |

## Output

- Streamed response (word-by-word) to stdout
- Cost estimate at end of each turn (informational, based on token usage)
- REPL: multi-turn with context preserved within the session

## Notes

- All responses are grounded in Blue Agent's founder-console identity (Base-first, Bankr-native)
- Requires `BANKR_API_KEY` — check with `blue doctor`
- Session history is in-memory only — not persisted between invocations
- For workflow-specific AI calls, use `blue idea | build | audit | ship | raise` instead
