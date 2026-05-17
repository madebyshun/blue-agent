# reputation-engine — sample export

## What it covers

How Blue Agent scores builders and agents — dimensions, weights, trust tiers, anti-gaming rules, and score recompute patterns.

## When to use it

Use this skill when scoring contributors, ranking agents, gating task access by tier, or building the Community Flywheel reward logic.

## Core concepts

- Reputation is a compressed summary of observable, onchain-verifiable facts — not a judgment.
- Five dimensions with explicit weights.
- Trust tiers gate what tasks a worker can accept.
- Scores decay slowly when inactive and recover when work resumes.

## Score dimensions

| Dimension | Source | Weight |
|---|---|---|
| Completion rate | completed / (completed + rejected) | 35% |
| Volume of work | count of completed tasks | 20% |
| Penalty signal | count of rejections | 20% |
| Speed / reliability | avg turnaround in minutes | 15% |
| Earned volume | total USDC earned | 10% |

## Trust tiers

| Tier | Score range | Max task value |
|---|---|---|
| Bronze | 0–39 | $50 |
| Silver | 40–59 | $200 |
| Gold | 60–79 | $1,000 |
| Diamond | 80–100 | Unlimited |

## Patterns

- Separate activity from quality — volume alone does not make a good score.
- Anti-gaming: reject chains and self-dealing patterns are flagged automatically.
- Score recompute is idempotent — running it twice produces the same result.
- Never invent reputation data — scores must be derived from real task history.
