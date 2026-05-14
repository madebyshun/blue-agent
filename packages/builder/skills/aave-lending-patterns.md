# Aave Lending Patterns

Grounding for `blue build` (lending/DeFi category) and `blue audit` (risk assessment).

Aave V3 lending and borrowing on Base — architecture, integration, risk management, and flash loans.

---

## 1. Aave V3 Architecture

Aave is the dominant lending protocol on Base. V3 introduced significant efficiency improvements over V2.

### Core Contracts

```
Pool                 — Main entry point for supply/borrow/repay/withdraw
PoolDataProvider     — Read-only query interface for positions and rates
AaveOracle           — Price feeds (Chainlink-based)
PoolAddressesProvider — Registry for all protocol contracts

Addresses on Base:
  Pool:                  TODO — verify on Basescan
  PoolAddressesProvider: TODO — verify on Basescan
  PoolDataProvider:      TODO — verify on Basescan
  AaveOracle:            TODO — verify on Basescan
```

### Key Assets on Base Aave V3

| Asset | Type | Collateral | Borrow |
|---|---|---|---|
| USDC | Stablecoin | ✅ Yes | ✅ Yes |
| WETH | Volatile | ✅ Yes | ✅ Yes |
| cbETH | Liquid staking | ✅ Yes | ✅ Yes |
| wstETH | Liquid staking | ✅ Yes | ✅ Yes |

### V3 vs V2 Key Differences

| Feature | V2 | V3 |
|---|---|---|
| Efficiency mode (eMode) | ❌ | ✅ Higher LTV for correlated assets |
| Isolation mode | ❌ | ✅ New assets added with capped exposure |
| Portal (cross-chain) | ❌ | ✅ Bridgeable positions |
| Risk parameters | Per-asset global | Per-asset + per-pool |
| Supply caps | None | ✅ Enforced per-asset |

---

## 2. Supply Mechanics

Supplying assets earns interest and (usually) serves as collateral for borrowing.

```typescript
import { Pool, EthereumTransactionTypeExtended } from "@aave/contract-helpers";
import { AaveV3Base } from "@bgd-labs/aave-address-book";

const pool = new Pool(provider, {
  POOL: AaveV3Base.POOL,
  WETH_GATEWAY: AaveV3Base.WETH_GATEWAY,
});

// Supply 10,000 USDC
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const amount = "10000000000"; // 10,000 USDC (6 decimals)

const supplyTxs = await pool.supply({
  user: userAddress,
  reserve: USDC,
  amount,
  onBehalfOf: userAddress,   // Can supply for another address
  referralCode: "0",          // Optional partner code
});

// Execute transactions (may include approve + supply)
for (const tx of supplyTxs) {
  const txData = await tx.tx();
  await signer.sendTransaction(txData);
}
```

### aTokens — What You Receive

When you supply, you receive **aTokens** (e.g., aUSDC, aWETH). These are interest-bearing.

```
Supply 10,000 USDC → Receive 10,000 aUSDC
After 1 year at 5% APY → 10,500 aUSDC
Withdraw → Receive 10,500 USDC (aTokens burned)

aToken balance = principal + accrued interest
aToken is rebasing (balance increases every block)
```

### APY Calculation

```
Supply APY = liquidityRate (per-second, annualized)
Borrow APY = variableBorrowRate or stableBorrowRate

Actual formula:
  APY = (1 + liquidityRate / RAY) ^ secondsPerYear - 1

Where RAY = 1e27 (Aave's precision denominator)
```

---

## 3. Borrow Mechanics

Borrow against your collateral. Your collateral must exceed borrowed value by the collateral factor.

```typescript
// Borrow 5,000 USDC against ETH collateral
const borrowTx = await pool.borrow({
  user: userAddress,
  reserve: USDC,
  amount: "5000000000",    // 5,000 USDC
  interestRateMode: 2,     // 1 = stable rate, 2 = variable rate
  referralCode: "0",
  onBehalfOf: userAddress,
});

// Repay borrowed USDC
const repayTx = await pool.repay({
  user: userAddress,
  reserve: USDC,
  amount: "5000000000",    // Repay 5,000 USDC
  interestRateMode: 2,
  onBehalfOf: userAddress,
});
```

### Interest Rate Modes

| Mode | Rate | Predictability | Best For |
|---|---|---|---|
| Variable | Changes with supply/demand | Unpredictable | Short-term borrowing |
| Stable | Fixed at borrow time | Predictable | Long-term positions |

**Variable rate** is almost always cheaper. Stable rate has a premium for predictability.

---

## 4. Interest Rate Models

Aave uses a two-slope interest rate model. Rates increase sharply after "optimal utilization" is exceeded.

```
utilization = total_borrowed / total_supplied

if utilization <= optimalUtilization:
  borrowRate = baseRate + (utilization / optimalUtilization) * slope1

else:
  excess = utilization - optimalUtilization
  borrowRate = baseRate + slope1 + (excess / (1 - optimalUtilization)) * slope2
```

**Example for USDC (approximate):**
```
optimalUtilization = 90%
baseRate = 0%
slope1 = 5% (rate at 90% utilization)
slope2 = 60% (kicks in above 90%)

At 50% utilization:
  borrowRate = 0% + (50/90) * 5% = 2.78%

At 90% utilization:
  borrowRate = 0% + 5% = 5%

At 95% utilization (5% above optimal):
  borrowRate = 5% + (5% / 10%) * 60% = 5% + 30% = 35%  ← Very expensive
```

**Implication:** High utilization spikes rates dramatically. Watch the kink point.

---

## 5. Collateral Factors

```
LTV (Loan-to-Value):           Maximum borrow amount / collateral value
                               e.g., 80% LTV: $10,000 ETH → max $8,000 borrow

Liquidation Threshold (LT):    Health Factor drops below 1 at this ratio
                               e.g., 82.5% LT: liquidated when borrow > $8,250

Liquidation Bonus:             Extra collateral liquidator receives
                               e.g., 5% bonus: liquidator pays $8,250, receives $8,662.50

Health Factor = sum(collateral * LT) / total_borrowed_in_base_currency
Health Factor < 1.0 → liquidatable

Example:
  Supply: 10 ETH at $3,500 = $35,000
  LT: 82.5%
  Max safe borrow: $35,000 * 82.5% = $28,875

  Borrowed: $20,000 USDC
  Health Factor = ($35,000 * 82.5%) / $20,000 = $28,875 / $20,000 = 1.44
  Safe (HF > 1.0)

  ETH drops 30% → ETH worth $24,500
  HF = ($24,500 * 82.5%) / $20,000 = $20,212 / $20,000 = 1.01
  Near liquidation! Add collateral or repay immediately.
```

---

## 6. Flash Loan Patterns

Aave's flash loans are uncollateralized loans that must be repaid in the same transaction.

```solidity
// IERC3156FlashBorrower implementation
interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,  // fees (0.09% = amounts[i] * 9 / 10000)
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract MyFlashLoan is IFlashLoanReceiver {
    address public constant POOL = address(0); // TODO: Aave Pool on Base

    function flashLoan(address asset, uint256 amount, bytes calldata params) external {
        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;  // 0 = no debt (must repay), 1 = stable, 2 = variable

        IPool(POOL).flashLoan(
            address(this),  // receiver
            assets,
            amounts,
            modes,
            address(this),  // onBehalfOf (only for mode 1/2)
            params,
            0               // referralCode
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        // ────────────────────────────────────────
        // DO SOMETHING WITH THE BORROWED TOKENS
        // e.g., arbitrage, liquidation, collateral swap
        // ────────────────────────────────────────

        // Must approve repayment: amount + premium (fee)
        uint256 repayAmount = amounts[0] + premiums[0];
        IERC20(assets[0]).approve(POOL, repayAmount);

        return true;  // Must return true to indicate success
    }
}
```

### Flash Loan Fee

```
Fee = borrowed_amount * 9 / 10000  (0.09%)

Borrow 1,000,000 USDC:
  Fee = 1,000,000 * 0.09% = 900 USDC
  Must repay: 1,000,900 USDC
```

### Flash Loan Use Cases

1. **Arbitrage:** Buy on Uniswap at $1.00, sell on Curve at $1.01, profit $100 per $10,000 borrowed
2. **Collateral swap:** Replace ETH collateral with wstETH in one transaction
3. **Self-liquidation:** Repay debt, recover collateral, avoid liquidation penalty
4. **Liquidation bot:** Use flash loan to liquidate undercollateralized positions, earn bonus

---

## 7. Liquidation Mechanics

Liquidation protects the protocol when Health Factor < 1.0.

```typescript
// Bot monitors HF and liquidates when < 1.0
async function liquidatePosition(
  borrower: Address,
  collateralAsset: Address,  // Which collateral to seize
  debtAsset: Address,        // Which debt to repay
  debtToCover: bigint,       // Max 50% of total debt per liquidation call
) {
  // Liquidator pays debtToCover in debtAsset
  // Receives collateralAsset at a discount (liquidation bonus, e.g., 5%)

  const liquidateTx = await pool.liquidationCall({
    collateralAsset,
    debtAsset,
    user: borrower,
    debtToCover: debtToCover.toString(),
    receiveAToken: false,  // Receive underlying asset, not aToken
  });
}
```

### Liquidation Economics

```
Liquidation bonus: 5% (typical)
Max debt per call: 50% of position

Example:
  Borrower has $10,000 USDC debt, $11,000 ETH collateral (HF < 1)
  Liquidator repays: $5,000 USDC (50% max)
  Liquidator receives: $5,000 * 1.05 = $5,250 in ETH
  Liquidator profit: $250 (minus gas ~$0.10 on Base)
```

---

## 8. Risk Assessment

### Oracle Risk

Aave uses Chainlink for price feeds. Oracle failures can cause:
- Incorrect liquidations (price reported too low → healthy position liquidated)
- Undercollateralized borrows (price reported too high → borrow against thin collateral)

**Mitigation:** Aave has circuit breakers and multiple oracle fallbacks.

### Collateral Concentration Risk

If too many loans are collateralized by the same asset, a crash in that asset causes:
- Mass liquidations → sell pressure → deeper crash → more liquidations (cascade)

**Watch for:** New assets with thin liquidity but high borrow demand.

### Liquidity Crisis

If utilization hits 100%, suppliers can't withdraw until new depositors arrive or borrowers repay.

**Mitigation:** The steep slope2 makes borrowing very expensive above 90% utilization, discouraging it naturally.

### APY Calculation with Real Numbers

```javascript
// Current rates from Aave data provider
const reserveData = await aaveDataProvider.getReserveData(USDC_ADDRESS);

const supplyAPY = (
  (1 + Number(reserveData.liquidityRate) / 1e27 / 31536000) ** 31536000 - 1
) * 100;

const borrowAPY = (
  (1 + Number(reserveData.variableBorrowRate) / 1e27 / 31536000) ** 31536000 - 1
) * 100;

console.log(`Supply APY: ${supplyAPY.toFixed(2)}%`);
console.log(`Borrow APY: ${borrowAPY.toFixed(2)}%`);
```

---

## 9. Protocol Fees

```
Interest paid by borrowers:
  → 90% to suppliers (via rising aToken balance)
  → 10% to Aave treasury (protocol reserve factor)

Flash loan fees:
  → 0.09% of borrowed amount
  → Split between treasury and suppliers

Liquidation bonus:
  → Paid by liquidated borrower's collateral
  → Goes entirely to liquidator (not Aave)
```

---

## 10. Integration Checklist

```typescript
// Full integration example: Supply USDC, borrow WETH, monitor HF

import { Pool, UiPoolDataProvider } from "@aave/contract-helpers";

// 1. Initialize
const pool = new Pool(provider, { POOL: AAVE_POOL_ADDRESS });
const uiProvider = new UiPoolDataProvider({
  uiPoolDataProviderAddress: UI_POOL_DATA_PROVIDER,
  provider,
  chainId: 8453,  // Base
});

// 2. Get current reserves and user data
const reserves = await uiProvider.getReservesHumanized({
  lendingPoolAddressProvider: POOL_ADDRESSES_PROVIDER,
});
const userData = await uiProvider.getUserReservesHumanized({
  lendingPoolAddressProvider: POOL_ADDRESSES_PROVIDER,
  user: userAddress,
});

// 3. Calculate current health factor
const { healthFactor } = formatUserSummary({
  currentTimestamp: Math.floor(Date.now() / 1000),
  marketReferencePriceInUsd: reserves.baseCurrencyData.networkBaseTokenPriceInUsd,
  marketReferenceCurrencyDecimals: 8,
  userReserves: userData.userReserves,
  formattedReserves: reserves.reservesData,
  userEmodeCategoryId: userData.userEmodeCategoryId,
});

// 4. Alert if HF < 1.3 (danger zone)
if (Number(healthFactor) < 1.3) {
  console.warn(`DANGER: Health Factor = ${healthFactor}. Add collateral or repay!`);
}
```

---

## Common Mistakes

❌ **Borrowing at maximum LTV** — any price drop liquidates you. Stay at 60-70% of max.

❌ **Ignoring rate mode** — stable rate borrows can be "rebalanced" by Aave in extreme conditions. Variable is safer for most.

❌ **Flash loan without profit check** — if arbitrage profit < flash loan fee + gas, you lose money.

❌ **Liquidating tiny positions** — gas cost may exceed liquidation profit on Base (less so, but check).

❌ **Supplying without checking utilization** — if utilization spikes to 100%, you can't withdraw until borrowers repay.

✅ **Target HF > 1.5** — gives you a buffer for price moves.

✅ **Monitor HF off-chain** — set up a watcher that alerts you when HF drops below 1.3.

✅ **Use flash loan + liquidation bot** — earn consistently from protocol fees without capital requirement.

---

## Resources

- Aave V3 docs: `docs.aave.com`
- Aave address book (all chain contracts): `github.com/bgd-labs/aave-address-book`
- Aave helpers SDK: `github.com/aave/aave-utilities`
- Aave Risk Dashboard: `aave.com/risk`
- Related skills: `oracle-design-guide.md`, `flashloan-patterns.md`
- CLI: `blue audit --check aave-risk`, `blue build "lending protocol on Base"`
