# token-launch-guide — sample export

## What it covers

Token design, supply structure, vesting, burn mechanisms, launch checklist, and common failure patterns for Base token launches.

## When to use it

Use this skill when simulating token launch scenarios in MiroShark, auditing tokenomics in `blue audit`, or planning a launch with `blue raise`.

## Core concepts

- Max supply should be bounded — infinite inflation kills token value.
- Team allocation > 50% is a red flag — community distrust guaranteed.
- Vesting cliff prevents team from dumping on launch.
- Healthy annual inflation: < 5% sustainable, > 20% unsustainable.

## Common supply structure

```
Max Supply: 1,000,000,000 (1B)
  Liquidity Pool:    50% — locked 1+ years
  Team:              20% — 4yr vesting, 1yr cliff
  Treasury:          20% — governance-controlled
  Community/Airdrop: 10% — community building
```

## Patterns

- Always lock liquidity at launch — minimum 1 year.
- Use 4-year vesting with 1-year cliff for team tokens.
- Add a burn mechanism tied to revenue or transaction fees.
- Launch on Base (chain ID 8453) — low gas enables microtransactions.
- Verify all contract addresses on Basescan before publishing.
- Never mint beyond declared max supply in the contract.
