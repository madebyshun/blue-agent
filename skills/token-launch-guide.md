# Token Launch Guide

Grounding for `blue build` (token category) and `blue audit` (tokenomics validation).

Comprehensive guide to designing and launching tokens safely on Base.

---

## 1. Tokenomics Design Fundamentals

### Supply Structure

**Total Supply Allocation (Common Model):**
```
Max Supply: 1,000,000,000 tokens (1B)

Distribution:
  Liquidity Pool:      500M (50%) — locked 1+ years
  Team:                200M (20%) — 4-year vesting, 1-year cliff
  Treasury:            200M (20%) — governance-controlled
  Airdrop/Community:   100M (10%) — community building
```

**Never:**
- Mint unbounded supply (infinite inflation = death)
- Hide supply details (community distrust)
- Allocate >50% to team (red flag: founder capture)

### Inflation & Vesting

**Healthy Inflation:**
- **< 5% annual:** Sustainable, holders can stake/earn above inflation
- **5-20% annual:** High, but OK if there's clear burn/staking mechanism
- **> 20% annual:** Unsustainable, token value likely to tank

**Team Vesting (Best Practice):**
```
4-year vesting, 1-year cliff:
  Year 0: 0% unlocked (cliff)
  Year 1: 25% unlocked
  Year 2: 50% unlocked
  Year 3: 75% unlocked
  Year 4: 100% unlocked
```

Prevents team from dumping on launch.

### Burn Mechanism

**Deflationary Pressure:**
- Burn % of transaction fees
- Burn % of platform revenue
- Community can burn tokens for utility

**Example:**
```
Protocol generates 1M USDC revenue/month
  → Burn 10% in tokens (equivalent)
  → 1M token burn/month (assuming $1 price)
  → Annual burn: 12M tokens (1.2% of supply)
  → Creates scarcity pressure
```

---

## 2. Fair Launch Patterns

### Bonding Curve (Recommended)

**How it works:**
```
Price increases as supply increases.
Price = base_price × (supply / 1M) ^ curve_exponent

Examples:
  At 100K supply: price = $0.001
  At 500K supply: price = $0.025 (exponential growth)
  At 1M supply: price = $1.00

Advantages:
  ✓ No presale (fair entry)
  ✓ Price discovery mechanism
  ✓ Early supporters rewarded (bought low)
  ✓ Community alignment
  ✓ Clanker uses this (recommended)
```

**Clanker Integration:**
```bash
blue launch-token \
  --name "MyToken" \
  --symbol "MYT" \
  --supply 1000000000 \
  --curve bonding \
  --liquidity-lock 1year
```

### Public Sale (Descending Price)

**How it works:**
```
Price starts high, decreases over time.
Week 1: $1.00
Week 2: $0.80
Week 3: $0.60
Week 4: $0.40

Encourages early participation (no waiting).
```

### Allowlist (Whitelist)

**For strategic supporters:**
```
Whitelist 1000 addresses for private allocation
Price: $0.01 per token (discount vs public)
Vesting: 12 months linear

Pros:
  ✓ Secure early funding
  ✓ Community building (whitelist = prestige)

Cons:
  ✗ Less "fair" than public
  ✗ Community perception risk (if list leaks)
```

### Auction (Dutch or English)

**Dutch Auction:**
```
Start price: $10
Decrease by $0.10 per hour
Stop when someone buys

Creates urgency, avoids guessing game.
```

---

## 3. Liquidity Strategy

### Initial Liquidity Provision

**Uniswap V3 (Most common on Base):**
```
Add to concentrated liquidity pool:
  Token amount: 100M
  USDC amount: $100K (100M × $0.001)
  Fee tier: 1% (most liquid)
  Price range: $0.0008 - $0.005 (cover expected volatility)

Pros:
  ✓ Tightest spreads
  ✓ Capital efficient
  ✓ Can manage range over time

Cons:
  ✗ Requires rebalancing (impermanent loss)
  ✗ More complex
```

**Aerodrome (Base native):**
```
Add to volatile pool:
  Token amount: 100M
  USDC amount: $100K
  Pool type: volatile (non-correlated assets)

Pros:
  ✓ Native to Base
  ✓ Simpler than V3
  ✓ Can incentivize with AERO gauges

Cons:
  ✗ Wider spreads
  ✗ Less capital efficient
```

### Liquidity Locking

**Must-do:**
- Lock liquidity for 1+ years minimum
- Use Uniswap V3 Liquidity Locker or similar
- Public proof (show TX hash)

**Why:**
- Prevents team from pulling liquidity (rug pull protection)
- Shows commitment to project
- Holder confidence increases

### Incentive Programs

**Bootstrap Liquidity:**
```
Offer LP rewards to early providers:
  LP gets governance token
  + % of platform fees
  + AERO gauge votes (if on Aerodrome)

Example:
  Provide 100M token + $100K USDC to pool
  Get 50K incentive tokens
  Earn % of protocol revenue
```

---

## 4. MEV & Slippage Protection

### Sandwich Attack Prevention

**Problem:**
```
User: "Swap 1 USDC for MyToken"
  ↓
Attacker sees tx in mempool
  ↓
Attacker: "Swap 10 USDC first" (frontrun)
  ↓
User gets worse price
  ↓
Attacker reverses (backrun)
```

**Solutions:**
1. **Private mempool:** Use Flashbots Protect (MEV-resistant)
   ```bash
   blue swap --private-mempool 1 USDC MyToken
   ```

2. **Slippage tolerance:** Set limit
   ```bash
   blue swap 1 USDC MyToken --slippage 0.5%  # max 0.5% price impact
   ```

3. **MEV-resistant DEX:** UniswapX (intent-based, pending Base support)

### Liquidity Depth Check

**Before launch:**
```
Recommended minimum liquidity:
  - 100M token supply → $100K USDC depth
  - 1B token supply → $1M USDC depth

Rule: 1 token supply (millions) = $X USDC depth

Check depth:
  blue compare @token1 @token2 --liquidity
```

---

## 5. Common Pitfalls & Red Flags

### Honeypots (Scam Tokens)

**How they work:**
```
Token looks legitimate, but:
  - Buy: ✓ Works, you get tokens
  - Sell: ✗ Blocked by hidden code
  
User loses all money.
```

**Detection:**
```solidity
// Red flag: Sell disabled or limited
if (msg.sender == user && !whitelisted[user]) {
  revert("Cannot sell");  // HONEYPOT!
}
```

**Check:**
```bash
blue audit MyTokenAddress --check honeypot
```

### Transfer Tax (Hidden Fee)

**How they work:**
```
You send 100 tokens, recipient gets 95.
Fee: 5% (taken by contract)

Users don't expect this.
```

**Mitigation:**
- Clearly disclose if using transfer tax
- Keep tax <2% (any higher = rug flag)
- Use for burn/marketing only (not team)

### Centralized Control (Pause, Freeze, Blacklist)

**Red flags:**
```solidity
function pauseToken() onlyOwner { /* freeze all transfers */ }
function blacklistAddress(address user) onlyOwner { /* user can't trade */ }
function setTaxRate(uint256 newTax) onlyOwner { /* change fee anytime */ }
```

**Better:**
- Remove owner controls after launch
- Use multisig for governance
- Announce any parameter changes 24h in advance

---

## 6. Launch Security Checklist

### Before Launch

- [ ] **Supply verified:** Max supply is fixed (immutable)
- [ ] **Liquidity locked:** Proof TX in thread/docs
- [ ] **Team vesting:** 1-year cliff, 4-year vesting (visible on Etherscan)
- [ ] **No pause/freeze/blacklist:** Check contract code
- [ ] **No transfer tax:** Or clearly disclosed (<2%)
- [ ] **Audit:** At least basic security review (use `blue audit`)
- [ ] **Social proof:** Twitter community, Discord, website
- [ ] **Deployment multisig:** 3-of-5 minimum (not single owner)

### Post-Launch

- [ ] **Announce liquidity lock:** Tweet TX hash
- [ ] **Weekly updates:** Progress on roadmap
- [ ] **Community governance:** Let holders vote on decisions
- [ ] **Monitor for issues:** Watch for liquidity crunches
- [ ] **Respond to concerns:** Community transparency

---

## 7. Valuation Reality Check

### Market Cap Calculation

```
Market Cap = Current Price × Total Supply

Example:
  Price: $1.00
  Supply: 1B tokens
  Market Cap: $1B

Fully Diluted Value (FDV):
  Includes future unlocks (vesting, mining, etc.)
  Usually >2x market cap
```

### Realistic Launch Valuations

**Red flags:**
```
New token at $100M market cap → TOO HIGH
New token at $1B FDV at launch → MASSIVE RED FLAG
  (Why would 1B+ in value exist with no volume?)
```

**Healthy launch:**
```
- $100K - $10M market cap (realistic)
- Proves product value first
- Can grow from there
```

### Comparison

```
Token A: $1M market cap, 1B supply, $1 token price
Token B: $100K market cap, 100M supply, $1 token price

Which is better?
  → Both at $1 price, but Token A (10x larger, more adoption)
  → Or Token B (smaller, more room to grow)

Metric: Look at FDV + liquidity, not just token price.
```

---

## 8. Post-Launch Growth

### Listing on DEXs

```
Automated (Uniswap, Aerodrome): Already live after launch
Centralized (Coinbase, Kraken): Requires application + vetting

Timeline:
  Week 1: Launch on Uniswap/Aerodrome
  Month 1-3: Community growth
  Month 3+: Apply to CEX listing
```

### Community & Marketing

```
What drives token price:
  1. Community size (Twitter, Discord followers)
  2. Daily transaction volume
  3. Developer activity (commits, PRs)
  4. Real product usage (not just speculation)

Focus on: Building community first, price second.
```

### Revenue Share

```
If protocol generates revenue:
  - Share with token holders (staking APY)
  - Use to buy + burn tokens
  - Announce monthly (transparency)

Example:
  Protocol revenue: $10K USDC
    ↓
  Buy 10K worth of tokens @ $1 price = 10K tokens
    ↓
  Burn all 10K tokens
    ↓
  Holders: 10K fewer tokens = 10K more scarce
    ↓
  Price appreciation (if demand stable)
```

---

## 9. Legal & Compliance

### Securities Risk

**Question:** Is my token a security?

**Howey Test (US law):**
```
If token has all 4, it's likely a security:
  1. Investment of money
  2. Common enterprise
  3. Expectation of profits
  4. Profits from efforts of others
```

**Mitigation:**
- Focus on utility (token = access to feature)
- Not just investment/speculation
- Ensure project is decentralized (not dependent on founder)
- Consult lawyer (seriously)

### Tax Implications

**For users:**
- Buying token = taxable event (if different from initial cost)
- Selling token = taxable event (capital gains)
- Staking rewards = income tax

**For creators:**
- Airdrop = income (1099 equivalent)
- Vesting = income as it unlocks
- Consult CPA

---

## 10. Clanker Integration (Recommended)

**Use Clanker for easy launch:**

```bash
blue launch-token \
  --name "Builder Token" \
  --symbol "BLDR" \
  --supply 1000000000 \
  --curve bonding \
  --liquidity-percent 50 \
  --liquidity-lock 365 days
```

**Clanker benefits:**
- ✓ Fair bonding curve (no presale)
- ✓ Automatic Uniswap V3 LP creation
- ✓ Liquidity automatically locked
- ✓ Tax-free (no transfer tax)
- ✓ Verified contract (audited patterns)

**Cost:** Only gas (~$20-50 on Base)

---

## Summary: Safe Token Launch Recipe

1. **Design:** Fair supply distribution, 4-year team vesting, burn mechanism
2. **Fair Launch:** Use bonding curve (Clanker), no presale
3. **Liquidity:** Pair with USDC, lock 1+ years
4. **Community:** Build Twitter/Discord before launch
5. **Security:** Audit code, no owner controls, multisig
6. **Transparency:** Announce supply, vesting, lock proofs
7. **Growth:** Focus on product usage, not price

---

## Resources

- Clanker: https://clanker.world
- Uniswap V3: https://uniswap.org
- Aerodrome: https://aerodrome.finance
- Token security: `blue audit [token-address]`
