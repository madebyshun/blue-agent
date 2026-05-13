# blue search

Search for builders, agents, projects, and tokens on Base.

## Usage

```
blue search "<query>"
blue search "defi agent on Base"
blue search "clanker token launcher"
```

## Required output

- Name and type (builder / agent / project / token)
- Handle or identifier
- One-line description
- Relevance to the query
- Link if known

## Notes

- Searches across the Base/Bankr/Clanker ecosystem
- Results are LLM-grounded — based on Bankr's knowledge of the Base ecosystem
- Follow up with: `blue score @handle` or `blue agent-score npm:pkg`
