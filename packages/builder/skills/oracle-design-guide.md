# Oracle Design Guide

Grounding for `blue audit` (oracle risk review) and `blue build` (price feed integration).

On-chain price feeds, oracle architectures, manipulation attacks, and secure patterns for Base.

---

## 1. Oracle Architecture

An oracle is any mechanism that brings off-chain data (price, weather, outcome) on-chain. For DeFi, price oracles are critical — wrong prices = bad liquidations, protocol drains.

### The Oracle Trilemma

| Property | Tradeoff |
|---|---|
| **Decentralized** | Slow to update, expensive |
| **Fresh** | Manipulable in the same block |
| **Cheap** | Less secure, single source |

No oracle satisfies all three simultaneously. Choose based on your security needs.

### Oracle Types

```
Centralized push oracles:   Chainlink, Pyth — off-chain nodes push prices on-chain
Decentralized AMM:          Uniswap TWAP — price derived from onchain trades
Custom on-chain:            DEX spot price — DANGEROUS, manipulable
Hybrid:                     Use Chainlink primary + TWAP fallback
```

---

## 2. Chainlink Price Feeds

Chainlink is the gold standard for DeFi price oracles. Multiple independent node operators aggregate prices with cryptographic guarantees.

### Architecture

```
Chainlink Data Feed:
  31+ independent node operators
  Each fetches price from multiple CEX/DEX sources
  Median of responses submitted on-chain
  Deviation threshold: update when price moves >0.5%
  Heartbeat: update at least every 1 hour (or 24h for less volatile assets)
```

### Integration on Base

```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumer {
    AggregatorV3Interface public priceFeed;

    // ETH/USD on Base: TODO — verify on Basescan
    // USDC/USD on Base: TODO — verify on Basescan
    // BTC/USD on Base: TODO — verify on Basescan

    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function getLatestPrice() public view returns (int256 price, uint256 updatedAt) {
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAtTs,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        // ✅ Check for stale price
        uint256 heartbeat = 3600; // 1 hour heartbeat
        require(updatedAtTs + heartbeat > block.timestamp, "Stale price");

        // ✅ Check for valid price
        require(answer > 0, "Invalid price");

        // ✅ Check round completeness
        require(answeredInRound >= roundId, "Incomplete round");

        return (answer, updatedAtTs);
    }

    function getEthPrice() external view returns (uint256) {
        (int256 price,) = getLatestPrice();
        return uint256(price);  // 8 decimals (Chainlink standard)
    }
}
```

### Chainlink Staleness Check

```solidity
// ❌ No staleness check — using stale price during oracle outage
function badGetPrice() external view returns (int256) {
    (, int256 answer,,,) = priceFeed.latestRoundData();
    return answer;
}

// ✅ Comprehensive staleness checks
function safeGetPrice() external view returns (uint256) {
    (
        uint80 roundId,
        int256 answer,
        ,
        uint256 updatedAt,
        uint80 answeredInRound
    ) = priceFeed.latestRoundData();

    require(answer > 0, "Oracle: negative price");
    require(answer < type(int256).max, "Oracle: price overflow");
    require(updatedAt + 1 hours > block.timestamp, "Oracle: price stale");
    require(answeredInRound >= roundId, "Oracle: round incomplete");

    return uint256(answer);
}
```

---

## 3. Uniswap TWAP Oracle

Time-Weighted Average Price — manipulate-resistant because it requires sustained capital over many blocks.

### How TWAP Works

```
Block 1: ETH = $3,000  → cumulative price += $3,000 * elapsed_seconds
Block 2: ETH = $3,100  → cumulative price += $3,100 * elapsed_seconds
...
Block N: ETH = $3,050  → cumulative price += $3,050 * elapsed_seconds

TWAP(30 min) = (cumulative_price[now] - cumulative_price[30min ago]) / 1800 seconds
```

**Manipulation cost:** To move TWAP by 10% for 30 minutes requires controlling price for 1800 consecutive seconds — extremely expensive in capital terms.

### Uniswap V3 TWAP Integration

```solidity
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

contract TWAPOracle {
    address public pool;
    uint32 public constant TWAP_PERIOD = 1800; // 30 minutes

    constructor(address _pool) {
        pool = _pool;
    }

    function getTWAP() external view returns (uint256 price) {
        // Consult the pool for TWAP over the last 30 minutes
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(
            pool,
            TWAP_PERIOD  // secondsAgo
        );

        // Convert tick to price
        price = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            1e18,          // base amount (1 ETH)
            WETH,          // base token
            USDC           // quote token
        );
    }
}
```

### TWAP Requirements

```solidity
// Pool must have enough liquidity history
// ❌ New pool (< 30 min old) — not enough observations
// ✅ Established pool (> 100K USD TVL, > 1 week old)

// Minimum TWAP period for security:
uint32 constant MIN_TWAP = 30 minutes;  // 30 min minimum
// Less than this = easier to manipulate in single blocks

// Pool must have observation cardinality >= period/blockTime
// Base: ~2 second blocks → 30 min = 900 observations minimum
// Check: pool.increaseObservationCardinalityNext(900);
```

---

## 4. Custom On-Chain Oracles (Danger Zone)

Spot prices from AMMs are **easily manipulable with flash loans**.

```solidity
// ❌ DANGEROUS: Spot price from AMM pool
function getSpotPrice() external view returns (uint256) {
    (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
    // This is manipulable in the same block via flash loan!
    return uint256(sqrtPriceX96) ** 2 / 2**192;
}

// Attack:
// 1. Flash loan 10,000 ETH
// 2. Dump ETH → price crashes to $100
// 3. Call your contract (spot price reads $100)
// 4. Borrow against "cheap" collateral, drain protocol
// 5. Repay flash loan
// All in one transaction!

// ✅ SAFE: Use TWAP instead
function getSafePrice() external view returns (uint256) {
    return twapOracle.getTWAP();  // 30-minute TWAP, manipulation-resistant
}
```

---

## 5. Price Manipulation Attacks

### Flash Loan Oracle Attack (Classic)

```
Setup: Protocol uses spot DEX price as collateral oracle

Attack sequence (1 transaction):
  1. Flash loan $10M USDC from Aave
  2. Dump $10M USDC into TOKEN/USDC pool → TOKEN price +500%
  3. Deposit 1,000 TOKEN as collateral (now "worth" $5M)
  4. Borrow $4M USDC against "inflated" TOKEN collateral
  5. Repay flash loan ($10M) + fee ($9K)
  6. Keep $4M - $10M borrowed = profit if TOKEN inflation > repayment

Real examples: Mango Markets ($117M), Cream Finance ($130M), many others
```

### Large Swap Oracle Manipulation

Even without flash loans, a whale can:
1. Buy token before price-sensitive action (inflate oracle)
2. Exploit inflated price
3. Sell token after

Requires sustained capital (no atomicity), but still dangerous for illiquid tokens.

### Detection

```solidity
// Detect abnormal price movement between oracle updates
uint256 lastPrice;
uint256 constant MAX_PRICE_CHANGE_BPS = 200; // 2% max change between reads

function validatePrice(uint256 newPrice) internal {
    if (lastPrice > 0) {
        uint256 change = newPrice > lastPrice
            ? (newPrice - lastPrice) * 10000 / lastPrice
            : (lastPrice - newPrice) * 10000 / lastPrice;

        require(change <= MAX_PRICE_CHANGE_BPS, "Price moved too much");
    }
    lastPrice = newPrice;
}
```

---

## 6. Fallback Oracles

Single oracle = single point of failure. Robust systems use multiple.

```solidity
contract MultiOracle {
    AggregatorV3Interface chainlink;
    ITWAPOracle uniswapTwap;
    uint256 constant MAX_DEVIATION_BPS = 200; // 2% max spread

    function getPrice() external view returns (uint256) {
        // Primary: Chainlink
        uint256 chainlinkPrice;
        bool chainlinkOk = false;
        try this.getChainlinkPrice() returns (uint256 p) {
            chainlinkPrice = p;
            chainlinkOk = true;
        } catch {}

        // Fallback: Uniswap TWAP
        uint256 twapPrice;
        bool twapOk = false;
        try this.getTWAPPrice() returns (uint256 p) {
            twapPrice = p;
            twapOk = true;
        } catch {}

        // Both available: check they agree
        if (chainlinkOk && twapOk) {
            uint256 spread = _pctDiff(chainlinkPrice, twapPrice);
            require(spread <= MAX_DEVIATION_BPS, "Oracles disagree — pausing");
            return chainlinkPrice;  // Prefer Chainlink when both agree
        }

        // One available
        if (chainlinkOk) return chainlinkPrice;
        if (twapOk) return twapPrice;

        revert("All oracles failed");
    }
}
```

---

## 7. Freshness & Staleness

Different assets have different update frequencies.

| Asset Type | Chainlink Heartbeat | Acceptable Staleness |
|---|---|---|
| ETH/USD, BTC/USD | 1 hour | 90 minutes |
| USDC/USD, stables | 24 hours | 26 hours |
| Long-tail altcoins | 24 hours | 26 hours |
| Volatile small caps | May not exist | N/A — use TWAP |

```solidity
mapping(address => uint256) public heartbeats;

function registerFeed(address feed, uint256 heartbeat) external onlyOwner {
    heartbeats[feed] = heartbeat;
}

function isStale(address feed) public view returns (bool) {
    (,,, uint256 updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
    return block.timestamp > updatedAt + heartbeats[feed] + 30 minutes;
    // 30 min buffer for network delays
}
```

---

## 8. Gas Costs

| Oracle Type | Gas per Call | Notes |
|---|---|---|
| Chainlink (SLOAD) | 2,100–5,000 | Cached in block, reuses state |
| Uniswap V3 TWAP | 5,000–30,000 | Depends on observation lookback |
| Uniswap V4 TWAP hook | 3,000–15,000 | More efficient singleton storage |
| Custom on-chain | 2,100–10,000 | Spot price — don't use for security |

**Optimization:** Cache oracle price in `transient storage` (EIP-1153) or within-tx cache for multiple reads in same transaction.

---

## 9. Oracle Selection Matrix

| Use Case | Primary | Secondary | Reasoning |
|---|---|---|---|
| Lending collateral value | Chainlink | TWAP fallback | Security critical, fresh data needed |
| DEX fee adjustment | Uniswap TWAP | None | Low stakes, cheap |
| Stablecoin peg check | Chainlink | Curve spot | Want fast detection of depeg |
| Liquidation threshold | Chainlink | Circuit breaker | One bad oracle = huge loss |
| NFT floor price | No good oracle | Off-chain + signature | On-chain NFT oracles are unreliable |
| Gaming/randomness | Chainlink VRF | None | Need unpredictable randomness |

---

## 10. Real Examples & Failures

### Mango Markets (2022) — $117M — Oracle Manipulation

Attacker self-manipulated MNGO token price on Mango's own spot oracle by buying MNGO across multiple exchanges, inflating onchain spot price, then borrowing against the inflated collateral.

**Fix:** Use TWAP minimum 30 minutes. Never use spot price for collateral.

### Synthetix sKRW (2019) — $1B potential loss — Stale Oracle

Chainlink oracle for Korean Won went offline. Old price remained, allowing attackers to exploit the stale rate.

**Fix:** Add heartbeat checks. Circuit-break if price not updated within 2× heartbeat.

### Harvest Finance (2020) — $34M — USDC/USDT Price Manipulation

Attacker flash-swapped $50M USDC through Curve, manipulated USDC/USDT price momentarily, withdrew inflated Harvest vault shares, repaid flash loan.

**Fix:** Use TWAP of at least 15 minutes for all vault pricing. Reject large single-block swaps.

### Compound (2021) — $89M — Single Oracle Source

COMP price reported incorrectly by Coinbase Pro API, Compound's sole oracle. Mass liquidations.

**Fix:** Multi-oracle aggregation. Never single-source for critical values.

---

## Common Mistakes

❌ **Using spot AMM price for collateral** — flash loan attack vector. Always TWAP for security-critical paths.

❌ **No staleness check** — Chainlink can go offline. Check `updatedAt` before trusting.

❌ **Single oracle source** — one failure = protocol halt or exploit.

❌ **TWAP period < 10 minutes** — short TWAP manipulable with sustained capital.

❌ **Trusting user-provided oracle address** — always hardcode or validate oracle addresses.

✅ **Chainlink + TWAP for anything >$10K impact** — belt and suspenders.

✅ **Circuit breaker on abnormal price moves** — pause protocol if price moves >10% in one update.

✅ **Emergency admin override** — ability to pause oracle reads and freeze the protocol.

---

## Resources

- Chainlink docs: `docs.chain.link`
- Chainlink feeds on Base: `data.chain.link/base` (find verified addresses)
- Uniswap V3 Oracle library: `github.com/Uniswap/v3-periphery`
- Oracle security research: `blog.openzeppelin.com`
- Related skills: `solidity-security-patterns.md`, `aave-lending-patterns.md`
- CLI: `blue audit --check oracle-risk`, `blue audit --check price-manipulation`
