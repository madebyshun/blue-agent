# blue compare

Compare two builders or agents side by side using their score profiles.

## Usage

```
blue compare <a> <b>
blue compare @builderA @builderB
blue compare npm:agentA npm:agentB
blue compare @handle npm:package
```

## Input types

- `@handle` → Builder Score (X/Twitter)
- `npm:package` → Agent Score (npm)
- `github.com/owner/repo` → Agent Score (GitHub)
- `https://endpoint` → Agent Score (live endpoint)

## Required output

- Side-by-side score and tier for both
- Dimension comparison with bar charts (12-char █░ bars)
- Verdict line: who leads and by how many points

## Notes

- Mixed comparisons work (builder vs agent), but dimension names will differ
- Scores are LLM-grounded estimates where public data is unavailable
- Use `blue score` and `blue agent-score` for individual detailed views
