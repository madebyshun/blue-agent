# Aerodrome DEX Guide

Grounding for `blue build` (DeFi/DEX category) and `blue audit` (liquidity risk review).

Deep dive into Base's native DEX and liquidity layer — veAERO mechanics, gauge voting, LP strategies, and builder patterns.

---

## 1. What is Aerodrome?

Aerodrome is the dominant DEX and liquidity layer on Base. Launched August 2023, it rapidly captured >70% of Base DEX volume by combining:

- **ve(3,3) tokenomics** — vote-escrow model pioneered by Andre Cronje's Solidly, perfected by Velodrome on Optimism
- **Gauge system** — LPs earn AERO emissions based on veAERO votes, not just swap fees
- **Bribe marketplace** — Protocols pay veAERO holders to direct liquidity to their pools
- **Concentrated liquidity (v2)** — Uniswap V3-style tick-based positions added in Aerodrome v2

**Relationship:** Aerodrome is a fork of [Velodrome V2](https://velodrome.finance) (Optimism), which is a fork of Solidly. The Velodrome team built both.

**Volume:** >$500M weekly volume on Base. Primary venue for USDC, ETH, cbETH, and new token liquidity.

**Contracts on Base:** `TODO — verify all addresses on Basescan before use`

---

## 2. AERO Token Mechanics

AERO is the native token of Aerodrome. It serves as emissions currency, governance token, and the target for lock/bribe activity.

### Supply

- **Max supply:** Uncapped (inflationary, controlled by emissions schedule)
- **Emissions:** Weekly AERO minted and distributed to gauges based on veAERO votes
- **Rebase:** veAERO holders receive a rebase proportional to their voting power to offset dilution

### Emission Schedule

```
Week 1:    15,000,000 AERO
Week 2:    14,850,000 AERO  (1% weekly decay)
Week N:    Week1 * 0.99^N
```

The 1% per-week decay creates predictable, decreasing inflation. Early liquidity provision is most rewarded.

### AERO Distribution Per Epoch (weekly)

```
Total emissions:       X AERO
  → Gauges:           100% of X  (distributed by veAERO votes)
  → veAERO rebase:    Proportional anti-dilution rebase
  → Team:             0% (no ongoing team emissions post-launch)
```

### Fee Distribution

```
Swap fees collected:
  → 80% to LPs in the pool
  → 20% to veAERO voters of that pool's gauge
```

---

## 3. veAERO — Vote-Escrow Mechanics

veAERO is the locked version of AERO. Lock to receive voting power, earn bribes, and receive fee rebates.

### Locking

```
Lock 1,000 AERO for 1 year  → 500 veAERO voting power
Lock 1,000 AERO for 2 years → 750 veAERO voting power
Lock 1,000 AERO for 4 years → 1,000 veAERO voting power (max)
```

Formula: `veAERO = AERO * (lockDuration / maxLockDuration)`

- **Max lock:** 4 years (52 epochs × 4)
- **Decay:** veAERO power decays linearly each week as lock expires
- **Tokens:** Each lock = an NFT (ERC-721), tradeable on secondary markets
- **No early exit:** Cannot unlock before the lock expires (unlike some competitors)

### Voting

Every epoch (Thursday → Thursday), veAERO holders vote for gauges:

```javascript
// Pseudo-code: Allocate voting power across pools
vote([
  { gauge: "USDC/ETH",    weight: 5000 }, // 50% of your power
  { gauge: "AERO/ETH",    weight: 3000 }, // 30%
  { gauge: "cbETH/ETH",   weight: 2000 }, // 20%
])
```

- Votes carry forward automatically each epoch (set once, earns continuously)
- You can change votes each epoch (common strategy: follow bribes)
- After voting, veAERO is locked for the epoch (cannot re-vote until next epoch)

### What veAERO Earns

1. **Swap fee share** (80/20 split) from voted pools
2. **Bribes** — tokens paid by protocols to incentivize votes
3. **AERO rebase** — anti-dilution rebate proportional to lock size

---

## 4. Gauges — The Emissions Engine

A gauge is an Aerodrome contract attached to a liquidity pool. It emits AERO to LPs proportional to their LP token stake.

### How Gauges Work

```
Pool USDC/ETH:
  Total LP tokens: 1,000,000
  Your stake:         10,000 (1%)
  Pool's share of weekly AERO: 10% (from veAERO votes)
  Weekly AERO total: 10,000,000

  Your AERO reward:
    10,000,000 * 10% * 1% = 10,000 AERO/week
```

### Gauge APY Formula

```
Weekly AERO to pool = TotalEmissions * (pool_votes / total_votes)
Annual AERO to pool = Weekly * 52

APY = (Annual AERO value in USD / Pool TVL) * 100%
```

Example:
```
Pool TVL: $1,000,000
Weekly votes for pool: 5% of total
Weekly emissions: 10,000,000 AERO at $0.30 = $3,000,000 total
Pool weekly AERO = $3,000,000 * 5% = $150,000
Annual = $150,000 * 52 = $7,800,000
APY = $7,800,000 / $1,000,000 = 780%
```

(Extremely high APYs are common for new pools in early epochs — dilute quickly as TVL grows)

### Gauge Types

| Type | Pool | Use case |
|---|---|---|
| Volatile gauge | `x * y = k` | Uncorrelated pairs (ETH/USDC, AERO/ETH) |
| Stable gauge | `x³y + xy³ = k` | Correlated pairs (USDC/DAI, stETH/ETH) |
| CL gauge | Tick-based (v2) | Concentrated positions, capital efficiency |

---

## 5. Pool Types

### Volatile Pools — `x * y = k`

Standard constant-product AMM. Used for uncorrelated asset pairs.

```
Price impact formula:
  k = x * y (constant)
  After swap of Δx:
    new_y = k / (x + Δx)
    received = y - new_y
```

- 0.02% fee (20 bps) on most pairs
- Suitable for: ETH/USDC, AERO/ETH, USDC/WETH, any token/token

### Stable Pools — `x³y + xy³ = k`

Stableswap curve. Much lower slippage for correlated assets.

- 0.01% fee (1 bp) on most stable pairs
- Suitable for: USDC/USDT, USDC/DAI, stETH/ETH, cbETH/WETH

### Concentrated Liquidity Pools (Aerodrome v2)

Uniswap V3-style tick-based positions. LPs choose a price range.

- Capital efficiency: 10–100× better than full-range
- Active management required (position goes out-of-range)
- Tick spacing: 1, 10, 50, 100, 200 depending on fee tier
- Better for professional LPs and strategies

---

## 6. LP Mechanics

### Adding Liquidity (Volatile Pool)

```typescript
// Must provide both tokens at current pool ratio
const pool = "USDC/ETH";
const usdcAmount = 10_000e6;  // $10,000 USDC
const ethAmount = computeOptimalAmount(usdcAmount, pool);  // ~2.85 ETH at $3500/ETH

// Approve tokens first
await usdc.approve(router, usdcAmount);
await weth.approve(router, ethAmount);

// Add liquidity
await router.addLiquidity(
  USDC_ADDRESS,
  WETH_ADDRESS,
  false,                  // isStable = false (volatile pool)
  usdcAmount,
  ethAmount,
  usdcAmount * 95n / 100n,   // 5% slippage on USDC min
  ethAmount * 95n / 100n,    // 5% slippage on ETH min
  recipientAddress,
  deadline
);
```

### Impermanent Loss Calculation

For a volatile pool with price ratio change `r`:

```
IL = 2 * sqrt(r) / (1 + r) - 1

Where r = new_price / initial_price

Example: ETH goes 2x:
  r = 2
  IL = 2 * sqrt(2) / (1 + 2) - 1
     = 2 * 1.414 / 3 - 1
     = 0.943 - 1
     = -5.7% (you have 5.7% less than holding)

Example: ETH goes 4x:
  r = 4
  IL = 2 * 2 / 5 - 1 = -20% (you have 20% less than holding)
```

**For stable pools:** IL is nearly 0 when price ratio stays within 0.99–1.01.

### Fee Earnings

```
Daily fees = pool_volume * fee_rate
Your share = your_LP_tokens / total_LP_tokens

Example:
  USDC/ETH pool volume: $5,000,000/day
  Fee rate: 0.02% = 0.0002
  Total fees: $5,000,000 * 0.0002 = $1,000/day
  80% to LPs: $800/day
  Your 1% stake: $8/day = $2,920/year on $10,000 = 29.2% APY (fees only)
  + AERO gauge rewards on top
```

---

## 7. Gauge Voting Strategy

### Bribe Economics

The key insight: **your veAERO vote is worth more than your fee share**. Protocols pay bribes to attract your vote, and you should optimize for total return.

```
Your veAERO power: 100,000
Pool A: $5,000 in bribes for 1,000,000 veAERO total votes
  Your bribe share: (100,000/1,000,000) * $5,000 = $500 per epoch

Pool B: $2,000 in bribes for 200,000 veAERO total votes
  Your bribe share: (100,000/200,000) * $2,000 = $1,000 per epoch

→ Vote for Pool B despite lower absolute bribes (better $/veAERO ratio)
```

### Optimal Strategy

1. **Wednesday:** Check bribe amounts on Aerodrome UI or Beefy/Velodrome analytics
2. **Calculate:** bribe_per_vote = total_bribes / current_votes_for_pool
3. **Vote:** Allocate weight to highest bribe_per_vote pools
4. **Compound:** Reinvest AERO rewards weekly by locking more

### Example Voting Simulation

```
veAERO power: 500,000
Epoch bribes:
  USDC/ETH:   $20,000 for 4,000,000 votes  → $0.005/veAERO
  AERO/USDC:  $8,000  for 800,000 votes    → $0.010/veAERO ← best
  cbETH/ETH:  $5,000  for 600,000 votes    → $0.0083/veAERO

Optimal allocation:
  AERO/USDC: 60% of votes = 300,000 veAERO → $3,000 bribes
  cbETH/ETH: 40% of votes = 200,000 veAERO → $1,666 bribes
  Total epoch: $4,666 per week = ~$242,632 annual
```

---

## 8. Builder Patterns

### Pattern 1: Token Launch with Aerodrome Liquidity

```
Step 1: Deploy token (ERC-20, capped supply, renounced ownership)
Step 2: Create MYTOKEN/USDC pool on Aerodrome (volatile)
Step 3: Add seed liquidity (e.g., 1M tokens + $10,000 USDC)
Step 4: Lock LP tokens (prevents rug pull, signals commitment)
Step 5: Submit gauge to Aerodrome governance (or use existing if approved)
Step 6: Bribe veAERO holders to vote for your gauge → AERO emissions → LPs attracted
Step 7: Deep liquidity → price stability → community trust
```

### Pattern 2: Liquidity Mining Program

```typescript
// Protocol bribes veAERO voters to attract deep USDC liquidity
const WEEKLY_BRIBE_BUDGET = 5000; // USDC
const BRIBE_PERIODS = 12;         // 12 weeks = 1 quarter

// Calculate expected TVL from bribe
// If $5,000 bribe attracts 500,000 veAERO votes → 5% of total emissions
// At 10,000,000 AERO/week * 5% * $0.30 = $15,000/week in AERO to LPs
// Expected TVL: $15,000 * 52 / targetAPY

// In practice: measure weekly, adjust bribe size
```

### Pattern 3: veAERO-Denominated Treasury

Protocols with large AERO holdings should lock max duration for:
- Maximum governance power (vote their own pools)
- Eliminate need for bribes (self-directing emissions)
- Earn fee share + external bribes passively

---

## 9. Risks

### Liquidity Concentration Risk

AERO emissions attract "mercenary liquidity" — LPs who leave when emissions slow. Deep liquidity today can thin to almost nothing in 3-6 months.

**Mitigation:** Lock LP tokens, build protocol-owned liquidity (POL), design tokenomics to sustain APY.

### Impermanent Loss on Volatile Pairs

For AERO/USDC or MYTOKEN/USDC, a 50% token price drop creates ~13.4% IL. Combined with token price decline, LP position can dramatically underperform holding.

### Smart Contract Risk

Aerodrome is a fork of Velodrome which has been battle-tested but not immune to bugs. Gauge logic, bribe contracts, and CL pools add surface area.

**Assessment:** Velodrome (same codebase) has processed billions in volume without critical exploit. Risk is low but nonzero.

### veAERO Liquidity Risk

veAERO NFTs can be sold on secondary markets, but at a discount. Illiquid lock + AERO price decline = locked in a depreciating position.

### Oracle / Price Manipulation

Aerodrome spot prices are susceptible to manipulation in low-liquidity pools. Never use Aerodrome spot price as a price oracle for lending or settlement.

---

## 10. Aerodrome vs Uniswap V3

| Factor | Aerodrome | Uniswap V3 |
|---|---|---|
| Emissions/rewards | AERO gauge emissions + bribes | Fees only |
| LP complexity | Simple (full range ok) | Active management needed for CL |
| Fee tiers | Fixed (0.01%, 0.02%, 0.05%) | 0.01%, 0.05%, 0.30%, 1.00% |
| Best for | Newer tokens, high APY farming | Deep blue-chip liquidity |
| Governance | veAERO voting controls emissions | None (no governance token) |
| Capital efficiency | Lower (unless using CL pools) | High (concentrated) |
| Risk | Inflationary AERO risk | Fee income only, no inflation |

**When to choose Aerodrome:**
- ✅ New token launches needing initial liquidity depth
- ✅ Protocols wanting to subsidize liquidity via bribe marketplace
- ✅ Yield farmers seeking high APY
- ✅ Base-native integration (Aerodrome is the "home team")

**When to choose Uniswap V3:**
- ✅ ETH/USDC, WBTC/USDC — already has deepest liquidity
- ✅ Professional LP desks running concentrated strategies
- ✅ Protocols that don't want AERO exposure

---

## Common Mistakes

❌ **Providing full-range liquidity on Uniswap V3** — 95% of capital sits unused outside current price. Use Aerodrome volatile pool or set tight ranges.

❌ **Ignoring IL on volatile pairs** — LPs in MYTOKEN/USDC lose when token pumps (other side outperforms) AND when it dumps (IL + price drop). Model both scenarios.

❌ **Using spot price from Aerodrome as oracle** — manipulable in 1 tx. Use Chainlink or TWAP.

❌ **Not locking LP tokens at launch** — signals intent to rug. Lock for 6-24 months minimum.

❌ **Bribing without modeling ROI** — $5K/week in bribes delivering $2K/week in liquidity = negative ROI. Track bribe efficiency metrics.

✅ **Stable pools for stablecoin pairs** — 1 bp fee + low IL = near-free liquidity.

✅ **Compound rewards weekly** — AERO reward → lock → more veAERO → more rewards.

✅ **Protocol-owned liquidity** — own your liquidity instead of renting it. POL doesn't leave.

---

## Resources

- Aerodrome app: `aerodrome.finance`
- Velodrome docs (same architecture): `docs.velodrome.finance`
- Bribe analytics: `aerodrome.finance/vote` (built-in bribe display)
- Related skills: `base-ecosystem.md`, `token-launch-guide.md`
- CLI: `blue build "liquidity pool on Base"`, `blue audit --check liquidity-risk`
