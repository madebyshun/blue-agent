# blue launch

Launch a token or agent on Base via Bankr.

## Modes

### Token Launch (via Bankr + Clanker)

Deploy a fair-launch ERC-20 token on Base with liquidity locked automatically.

**Required input:**
- Token name
- Token symbol (ticker)
- Description

**Optional input:**
- Image URL
- Twitter / X handle
- Website URL

**Output:**
- Token contract address (Base)
- Uniswap V3 liquidity pool setup
- Creator fee config (40% of 1% swap fee → your wallet)
- Bankr agent prompt to execute launch

**Fee structure:**
- No upfront cost, no gas fees
- 1% fee on every trade in the liquidity pool
- 40% → creator wallet, 40% → Bankr, 20% → Clanker

**Execution:**
```
bankr agent prompt "Launch a token called [name] ([SYMBOL]) on Base. Description: [description]. Website: [url]. Twitter: @[handle]."
```

---

### Agent Launch (publish to Bankr marketplace)

Turn a configured agent into a sellable, monetized product.

**Required input:**
- Agent name
- Persona description
- Default model

**Optional input:**
- Tools / skills list
- Pricing per session
- Publish config

**Output:**
- Agent name + slug
- Persona + system prompt
- Model config
- Skills manifest
- Pricing plan
- Publish checklist for Bankr marketplace

---

## Notes

- Token launches on Base use Clanker protocol under the hood
- Solana launches use Raydium LaunchLab (bonding curve → auto-migrate to CPMM)
- Standard rate limit: 1 token launch/day (10/day for Bankr Club members)
- Creator fees are claimable directly from the Bankr dashboard
