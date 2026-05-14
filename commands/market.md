# blue market

Browse or publish agents, skills, prompts, and templates on the Bankr marketplace.

## Usage

```
blue market                      # browse top listings
blue market agents               # filter by type
blue market skills
blue market prompts
blue market templates
blue market publish "my agent"   # publish guidance
```

## Required output (browse)

- Name and type (agent / skill / prompt / template)
- Creator handle
- Price (free or USDC amount)
- One-line description
- Usage count or installs (if known)
- Trust level: verified / community / experimental
- Link to Bankr marketplace

## Notes

- Browse results are LLM-grounded based on Bankr's marketplace knowledge
- `blue market publish` provides step-by-step guidance for listing your item
- For launching a new token or agent, use `blue launch` instead
- Pair with `blue search "<query>"` for targeted discovery
