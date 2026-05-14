# Staking & Yield Farming Guide

Grounding for `blue build` (yield protocols) and `blue audit` (staking contract security).

Lock/unlock mechanics, APY vs APR, LP rewards, impermanent loss, composable yield strategies on Base.

---

## 1. Staking Fundamentals

Staking = locking tokens to earn rewards. Two main models:

```
Model 1: Inflationary rewards
  Protocol mints new tokens → distributed to stakers
  APY driven by emission schedule
  Risk: Token dilution if stakers outnumber buyers

Model 2: Protocol fee revenue
  Protocol takes fees → distributed to stakers
  APY tied to protocol volume
  Risk: Low volume → low yield

Model 3: Hybrid (most common)
  Emissions for early growth + fee revenue for sustainability
  Emissions decrease over time, fee revenue should grow
  Example: Aerodrome (AERO emissions + LP fees → veAERO voters)
```

### Key Metrics

```
APR (Annual Percentage Rate):
  Simple interest, no compounding
  APR = (rewards / staked) × (365 / days)
  
  Example: 100 USDC staked, 10 USDC earned in 30 days
  APR = 10/100 × (365/30) = 121.67%

APY (Annual Percentage Yield):
  Compound interest — assumes rewards are auto-reinvested
  APY = (1 + APR/n)^n - 1  where n = compounding periods per year
  
  Example: 121.67% APR, compounding daily (n=365)
  APY = (1 + 1.2167/365)^365 - 1 = 237.8%

TVL (Total Value Locked):
  Total value of assets deposited in a protocol
  Higher TVL ≠ safer — verify smart contract audits
  
Reward Rate:
  Tokens distributed per second / per block
  rewardRate = totalRewards / stakingDuration
```

---

## 2. Simple Staking Contract

```solidity
// Based on Synthetix staking rewards pattern
contract StakingRewards {
    IERC20 public stakingToken;   // What users stake
    IERC20 public rewardToken;    // What users earn
    
    uint256 public duration = 30 days;
    uint256 public finishAt;         // When rewards end
    uint256 public updatedAt;        // Last reward update
    uint256 public rewardRate;       // Reward tokens per second
    uint256 public rewardPerTokenStored;  // Accumulated rewards per staked token
    
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        updatedAt = lastTimeRewardApplicable();
        
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }
    
    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (
            rewardRate * (lastTimeRewardApplicable() - updatedAt) * 1e18 / totalSupply
        );
    }
    
    function earned(address account) public view returns (uint256) {
        return (
            balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18
        ) + rewards[account];
    }
    
    function stake(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0, "amount = 0");
        stakingToken.transferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
        totalSupply += amount;
    }
    
    function withdraw(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0, "amount = 0");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        stakingToken.transfer(msg.sender, amount);
    }
    
    function getReward() external updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.transfer(msg.sender, reward);
        }
    }
    
    // Owner: set reward amount for next period
    function setRewardAmount(uint256 amount) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= finishAt) {
            rewardRate = amount / duration;
        } else {
            uint256 remaining = rewardRate * (finishAt - block.timestamp);
            rewardRate = (amount + remaining) / duration;
        }
        
        require(rewardRate > 0, "reward rate = 0");
        require(
            rewardRate * duration <= rewardToken.balanceOf(address(this)),
            "Reward amount > balance"
        );
        
        finishAt = block.timestamp + duration;
        updatedAt = block.timestamp;
    }
}
```

---

## 3. Lock/Unlock Mechanics

Time-locks align incentives — longer lock = higher rewards.

### Linear Decay Lock

```solidity
// Voting escrow model (like Curve veCRV / Aerodrome veAERO)
contract VotingEscrow {
    struct Lock {
        int128 amount;      // Locked amount
        uint256 end;        // Lock end time
    }
    
    uint256 constant MAXTIME = 4 * 365 * 86400;  // 4 years max lock
    
    mapping(address => Lock) public locked;
    
    // Lock weight = amount × (remaining_time / MAXTIME)
    function balanceOf(address addr) public view returns (uint256) {
        Lock memory _locked = locked[addr];
        if (_locked.end <= block.timestamp) return 0;
        
        uint256 remainingTime = _locked.end - block.timestamp;
        return uint256(uint128(_locked.amount)) * remainingTime / MAXTIME;
    }
    
    function createLock(uint256 amount, uint256 unlockTime) external {
        require(amount > 0, "Need non-zero amount");
        require(unlockTime > block.timestamp, "Can only lock in future");
        require(unlockTime <= block.timestamp + MAXTIME, "Voting lock too long");
        
        locked[msg.sender] = Lock(int128(int256(amount)), unlockTime);
        token.transferFrom(msg.sender, address(this), amount);
    }
    
    function withdraw() external {
        Lock memory _locked = locked[msg.sender];
        require(block.timestamp >= _locked.end, "Lock not expired");
        
        uint256 amount = uint256(uint128(_locked.amount));
        locked[msg.sender] = Lock(0, 0);
        token.transfer(msg.sender, amount);
    }
}
```

### Tiered Lock Multipliers

```solidity
// Fixed tiers instead of linear decay
contract TieredStaking {
    struct Tier {
        uint256 duration;    // Lock duration in seconds
        uint256 multiplier;  // Reward multiplier in basis points (10000 = 1×)
    }
    
    Tier[] public tiers = [
        Tier(30 days,  10000),  // 1×  — 30 day lock
        Tier(90 days,  15000),  // 1.5× — 90 day lock
        Tier(180 days, 20000),  // 2×  — 180 day lock
        Tier(365 days, 30000),  // 3×  — 1 year lock
    ];
    
    mapping(address => uint256) public lockTier;
    mapping(address => uint256) public lockExpiry;
    
    function stake(uint256 amount, uint256 tierId) external {
        require(tierId < tiers.length, "Invalid tier");
        
        lockTier[msg.sender] = tierId;
        lockExpiry[msg.sender] = block.timestamp + tiers[tierId].duration;
        
        // Boosted rewards based on tier multiplier
        uint256 boostedAmount = amount * tiers[tierId].multiplier / 10000;
        _stake(msg.sender, boostedAmount);
    }
}
```

---

## 4. LP Staking and Impermanent Loss

### What Is Impermanent Loss

```
You provide ETH + USDC to a 50/50 Uniswap V2-style pool.

Initial: 1 ETH ($3,000) + 3,000 USDC = $6,000 total
Price ratio: 1 ETH = 3,000 USDC

ETH price doubles to $6,000:
  Arbitrageurs rebalance pool to maintain x × y = k
  New pool state: 0.707 ETH + 4,243 USDC = $4,243 + $4,243 = $8,485

If you just HODLed: 1 ETH ($6,000) + 3,000 USDC = $9,000

IL = $9,000 - $8,485 = $515 loss vs holding
IL% = $515 / $9,000 = 5.7%

IL formula for price change ratio r = new_price / old_price:
IL = 2 × sqrt(r) / (1 + r) - 1

r = 2:  IL = -5.7%
r = 4:  IL = -20%
r = 10: IL = -42%
```

### IL Calculator

```typescript
function calculateImpermanentLoss(priceRatio: number): number {
  // priceRatio = new_price / initial_price
  const il = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
  return il * 100;  // Return as percentage (negative = loss)
}

function isLPProfitable(
  initialValue: number,    // USD at time of deposit
  currentValue: number,    // LP position value now (after IL)
  feesEarned: number,      // Trading fees collected
  rewardsEarned: number    // Protocol token rewards
): boolean {
  const holdValue = initialValue * (currentValue / (initialValue - feesEarned - rewardsEarned));
  const lpValue = currentValue + feesEarned + rewardsEarned;
  return lpValue > holdValue;
}
```

### Concentrated Liquidity (Uniswap V3 Style)

```
V3 concentrates liquidity in price ranges:
  Benefit: Higher fee income per dollar of TVL
  Risk: Larger IL if price moves out of range
  
Out-of-range position:
  Holds only one token (more like single-asset than LP)
  Earns no fees while out of range
  
IL in concentrated liquidity is worse than V2:
  Tighter range = higher APY in range = higher IL out of range

Strategy: Wider ranges for stable pairs, narrow for correlated pairs
```

---

## 5. Yield Farming Strategies

### Single-Sided Staking (No IL Risk)

```typescript
// Best for beginners — stake one token, earn rewards
const stakingStrategy = {
  name: "Single-sided USDC staking",
  action: "Deposit USDC → earn protocol token rewards",
  risk: "Smart contract risk only (no IL)",
  platforms: ["Aave (supply APY)", "Compound", "Morpho"],
  typical_apy: "3-8% USDC supply rate + reward token",
};

// Implementation: supply to Aave V3 on Base
const aavePool = getContract({ address: AAVE_POOL, abi: aavePoolAbi, client });
await aavePool.write.supply([USDC, amount, userAddress, 0]);
// Receive aUSDC (interest-bearing token) + AAVE rewards
```

### LP Farming (Higher Risk, Higher Reward)

```typescript
const lpStrategy = {
  name: "ETH/USDC LP on Aerodrome",
  steps: [
    "1. Split funds 50/50 ETH + USDC",
    "2. Add liquidity to Aerodrome ETH/USDC pool",
    "3. Receive LP tokens",
    "4. Stake LP tokens in Aerodrome gauge",
    "5. Earn AERO emissions + trading fees",
  ],
  risk: "IL + smart contract risk",
  typical_apy: "20-80% (varies with AERO price + volume)",
};

// Autocompound strategy
async function autoCompound(
  gaugeAddress: Address,
  lpTokenAddress: Address,
  router: Address
): Promise<void> {
  // 1. Claim AERO rewards
  await gauge.write.getReward([userAddress, [AERO_TOKEN]]);
  
  // 2. Sell 50% AERO for ETH, 50% for USDC
  const aeroBalance = await aeroToken.read.balanceOf([userAddress]);
  await swapExactTokensForTokens(aeroBalance / 2n, AERO, ETH);
  await swapExactTokensForTokens(aeroBalance / 2n, AERO, USDC);
  
  // 3. Add back as LP
  await addLiquidity(ETH, USDC, ethBalance, usdcBalance);
  
  // 4. Stake new LP tokens
  const newLPBalance = await lpToken.read.balanceOf([userAddress]);
  await gauge.write.deposit([newLPBalance]);
}
```

### Delta-Neutral Farming

```
Goal: Earn yield without directional exposure to token price

Strategy:
  1. Deposit ETH as collateral on Aave
  2. Borrow 50% of value in USDC
  3. Pair borrowed USDC with ETH for LP
  4. LP fees + AERO rewards offset borrow costs

Math example:
  $10,000 ETH deposited
  $4,000 USDC borrowed (40% LTV — safe)
  $4,000 USDC + $4,000 ETH = $8,000 LP position
  
  Earnings:
    LP APY: 40% → $3,200/year
    Borrow cost: 5% on $4,000 → -$200/year
    Net yield: $3,000/year on $10,000 = 30%
    
  Risk:
    ETH price drop → collateral value drops → risk of liquidation
    Impermanent loss still affects LP position
```

---

## 6. Reward Distribution Math

```solidity
// How to calculate rewards correctly with variable deposits
// Using reward-per-token-accumulated pattern (avoids iterating all stakers)

contract RewardDistributor {
    uint256 public totalRewardsPerToken;  // Accumulated rewards per staked token (scaled by 1e18)
    uint256 public lastUpdateTime;
    uint256 public rewardRatePerSecond;
    
    mapping(address => uint256) public rewardsPerTokenPaidAt;  // Snapshot when user last claimed
    mapping(address => uint256) public claimable;
    
    // Called before any stake/withdraw/claim
    modifier updateRewards(address user) {
        totalRewardsPerToken = _currentRewardsPerToken();
        lastUpdateTime = block.timestamp;
        
        if (user != address(0)) {
            claimable[user] = _pendingRewards(user);
            rewardsPerTokenPaidAt[user] = totalRewardsPerToken;
        }
        _;
    }
    
    function _currentRewardsPerToken() internal view returns (uint256) {
        if (totalStaked == 0) return totalRewardsPerToken;
        uint256 elapsed = block.timestamp - lastUpdateTime;
        return totalRewardsPerToken + (rewardRatePerSecond * elapsed * 1e18 / totalStaked);
    }
    
    function _pendingRewards(address user) internal view returns (uint256) {
        uint256 rewardDelta = _currentRewardsPerToken() - rewardsPerTokenPaidAt[user];
        return claimable[user] + (stakedBalance[user] * rewardDelta / 1e18);
    }
}
```

---

## 7. Composable Yield

### Yield Aggregators

```typescript
// Yearn-style vault: auto-compounds multiple sources
interface YieldStrategy {
  deposit(): Promise<void>;      // User deposits
  harvest(): Promise<void>;      // Claim + reinvest rewards (called by keeper)
  withdraw(): Promise<void>;     // User withdraws + yield
  totalAssets(): Promise<bigint>; // Total value (including unrealized yield)
}

// ERC-4626 Tokenized Vault Standard
// Standard interface for yield-bearing vaults
interface IERC4626 {
  // Deposit base asset → receive shares
  deposit(assets: bigint, receiver: Address): Promise<bigint>;
  
  // Redeem shares → receive base asset + yield
  redeem(shares: bigint, receiver: Address, owner: Address): Promise<bigint>;
  
  // Calculate share price
  convertToAssets(shares: bigint): Promise<bigint>;
  convertToShares(assets: bigint): Promise<bigint>;
  
  totalAssets(): Promise<bigint>;  // AUM including yield
}
```

### Nested Yield Strategies

```
Base yield stack example:
  USDC → [Aave aUSDC: 5%]
       → [LP aUSDC/USDC: +15%]
       → [Gauge stake: +25% AERO]
       → [Auto-compound: compounding bonus]
       
  Total: ~40-60% APY (before IL)
  Risk layers: smart contract × liquidity × price exposure
  
Rule: Each layer adds yield AND adds risk
      Don't nest more than 3 levels deep for security
```

---

## 8. Risk Matrix

| Strategy | IL Risk | Smart Contract Risk | Liquidation Risk | Typical APY |
|---|---|---|---|---|
| Lending (Aave) | None | Low (audited) | None | 3-10% |
| Single-sided staking | None | Medium | None | 10-50% |
| Stable LP (USDC/USDT) | Very Low | Medium | None | 5-25% |
| Correlated LP (ETH/stETH) | Low | Medium | None | 10-40% |
| Volatile LP (ETH/USDC) | Medium | Medium | None | 20-80% |
| Leveraged LP | Medium | Medium | High | 30-150% |
| New protocol | None-Medium | High | Varies | 100-1000% |

---

## 9. Security Patterns

### Reentrancy in Staking Contracts

```solidity
// ❌ DANGEROUS: State update after external call
function withdraw(uint256 amount) external {
    uint256 reward = earned(msg.sender);
    
    // External calls BEFORE state update
    stakingToken.transfer(msg.sender, amount);  // ← reentrancy here
    rewardToken.transfer(msg.sender, reward);
    
    // State update too late
    balanceOf[msg.sender] -= amount;  // ← already re-entered
}

// ✅ CEI pattern: Checks-Effects-Interactions
function withdraw(uint256 amount) external {
    // 1. Checks
    require(balanceOf[msg.sender] >= amount, "Insufficient balance");
    
    // 2. Effects (state changes first)
    balanceOf[msg.sender] -= amount;
    totalSupply -= amount;
    
    // 3. Interactions last
    stakingToken.transfer(msg.sender, amount);
}
```

### Reward Inflation Attack

```solidity
// ❌ ATTACK VECTOR: First depositor can inflate share price
// Attack: Deposit 1 wei, donate 1M tokens, new depositors get 0 shares

// ✅ Fix: Minimum deposit amount + virtual shares
uint256 constant MINIMUM_SHARES = 1000;  // Burn 1000 shares on init
uint256 constant VIRTUAL_SHARES = 1;    // Add 1 virtual share for math

function totalShares() public view returns (uint256) {
    return _totalShares + VIRTUAL_SHARES;
}

function totalAssets() public view returns (uint256) {
    return _totalAssets + MINIMUM_SHARES;
}
```

---

## 10. Real Protocol Patterns

### Morpho (Lending Optimization)

```typescript
// Morpho optimizes Aave/Compound rates via peer-to-peer matching
const morpho = getContract({ address: MORPHO_BASE, abi: morphoAbi, client });

// Supply USDC to Morpho (better rates than Aave directly)
await morpho.write.supply([
  USDC_MARKET_ID,    // (collateral, loan, oracle, IRM, LLTV) packed
  amount,
  userAddress,
  "0x",
]);
// Rate: peer-matched at 7% vs Aave pool rate 5%
```

### Aerodrome Concentrated LP Farming

```
Full cycle on Aerodrome (Base's largest DEX):

1. Get LP tokens:
   aerodrome.router.addLiquidity(tokenA, tokenB, stable, amtA, amtB, ...)
   
2. Stake in gauge:
   gauge.deposit(lpTokens)
   
3. Vote with veAERO to boost your gauge's emissions:
   voter.vote(tokenId, [gaugeAddress], [100])
   
4. Claim rewards:
   gauge.getReward(address, [AERO])
   
5. Auto-compound or lock AERO for veAERO for more boost
```

---

## Common Mistakes

❌ **Calculating APY from one day of data** — one good day → annualized → 50,000% APY. Always use 7-30 day averages.

❌ **Ignoring IL when comparing APY** — LP at 40% APY with 30% IL = real yield of 10%.

❌ **Farming token with no exit liquidity** — you earn 1M tokens but can't sell them without crashing price.

❌ **No slippage on auto-compound swaps** — front-run during harvest → lose compound gains.

❌ **Not accounting for gas costs** — on Ethereum, frequent harvesting erodes small positions.

✅ **Always model full cost: IL + gas + smart contract risk** — not just advertised APY.

✅ **Use ERC-4626 for vault tokens** — composable with aggregators and other DeFi.

✅ **Test reward math with edge cases** — zero TVL, late deposits, partial withdrawals.

---

## Resources

- Aerodrome: `aerodrome.finance`
- Morpho (Base): `app.morpho.org`
- Aave V3 (Base): `app.aave.com`
- IL calculator: `dailydefi.org/tools/impermanent-loss-calculator`
- Synthetix rewards pattern: `github.com/Synthetixio/synthetix/blob/master/contracts/StakingRewards.sol`
- ERC-4626: `eips.ethereum.org/EIPS/eip-4626`
- Related skills: `aerodrome-dex-guide.md`, `aave-lending-patterns.md`
- CLI: `blue build "yield vault on Base"`, `blue audit --check staking-math`
