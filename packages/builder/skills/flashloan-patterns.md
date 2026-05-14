# Flash Loan Patterns

Grounding for `blue build` (DeFi/arbitrage category) and `blue audit` (flash loan vulnerability review).

Flash loan mechanics, arbitrage strategies, attack vectors, and economic analysis.

---

## 1. Flash Loan Mechanics

Flash loans are uncollateralized loans that must be repaid within the **same transaction**. If repayment fails, the entire transaction reverts — as if the loan never happened.

### How They Work

```
Block execution (one atomic transaction):
  1. Borrow 1,000,000 USDC from Aave (no collateral needed)
  2. Do anything with 1,000,000 USDC
  3. Repay 1,000,900 USDC (original + 0.09% fee)
  
  If step 3 fails → entire tx reverts → Aave never lost anything
  If step 3 succeeds → complete
```

### Why This Is Safe for Lenders

```
Atomicity: Ethereum executes all steps or none (all-or-nothing)
No credit risk: Can't default if loan must be repaid in same tx
Protocol earns: Fee collected on every flash loan regardless
```

### Available Protocols

| Protocol | Fee | Assets | Notes |
|---|---|---|---|
| Aave V3 | 0.09% | USDC, WETH, cbETH, etc. | Most used on Base |
| Balancer | 0% | BAL, USDC, WETH | Free if no Balancer trade |
| Uniswap V3 | 0.01–1% | Any pool asset | Flash swap (built into swap) |

---

## 2. Callback Function Implementation

Flash loan providers send borrowed tokens and call your contract's callback function. You must repay before the callback returns.

### Aave V3 Flash Loan Callback

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFlashLoanReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AaveFlashLoan is IFlashLoanReceiver {
    IPool public immutable POOL;
    address public immutable POOL_ADDRESSES_PROVIDER;

    constructor(address _poolAddressesProvider) {
        POOL_ADDRESSES_PROVIDER = _poolAddressesProvider;
        POOL = IPool(IPoolAddressesProvider(_poolAddressesProvider).getPool());
    }

    // Called by Aave after sending tokens
    function executeOperation(
        address[] calldata assets,         // Borrowed token addresses
        uint256[] calldata amounts,        // Borrowed amounts
        uint256[] calldata premiums,       // Fees (0.09% of amounts)
        address initiator,                 // Who called flashLoan()
        bytes calldata params             // Custom data passed from initiator
    ) external override returns (bool) {
        // ⚡ YOU HAVE THE TOKENS HERE — do your logic

        // Decode custom params if needed
        (address target, bytes memory data) = abi.decode(params, (address, bytes));

        // Execute arbitrage, liquidation, etc.
        (bool ok,) = target.call(data);
        require(ok, "Operation failed");

        // ⚡ REPAY: approve Aave to take back tokens + fee
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 totalRepayment = amounts[i] + premiums[i];
            IERC20(assets[i]).approve(address(POOL), totalRepayment);
        }

        return true;  // Must return true to confirm success
    }

    // Entry point — initiate the flash loan
    function flashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external {
        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // mode: 0 = flash loan (must repay), 1 = stable debt, 2 = variable debt
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        POOL.flashLoan(
            address(this),   // receiver
            assets,
            amounts,
            modes,
            address(this),   // onBehalfOf
            params,
            0               // referralCode
        );
    }
}
```

---

## 3. Fee Structure

```
Aave V3 flash loan fee: 0.09% (9 bps)
  Borrow 1,000,000 USDC → Fee: 900 USDC
  Must repay: 1,000,900 USDC

Balancer flash loan fee: 0% (protocol-level, no fee)
  But: must hold WETH/USDC in Balancer pool as part of the tx (swap fee may apply)

Uniswap V3 flash swap:
  Borrow token0, return token1 at current pool ratio (built into the swap mechanism)
  Effective cost: Uniswap pool fee (0.05%, 0.3%, or 1%)

Fee calculation:
  fee = amount * feePercent / 10000
  Aave: fee = amount * 9 / 10000  (0.09%)
```

### Break-Even Analysis

```
Must profit > fee + gas cost

Flash loan economics:
  Borrow: 1,000,000 USDC
  Fee: 900 USDC (0.09%)
  Gas: ~300,000 gas × 0.01 gwei × $3,500/ETH ≈ $0.105 on Base

  Minimum profitable arbitrage: $900.10
  As % of borrowed amount: 0.09%

  If arbitrage earns 0.1% = $1,000 → profit $99.90
  If arbitrage earns 0.5% = $5,000 → profit $4,099.90
```

---

## 4. Arbitrage Patterns

### Simple Cross-DEX Arbitrage

```solidity
contract ArbitrageBot is AaveFlashLoan {
    address UNISWAP_ROUTER;
    address AERODROME_ROUTER;

    function arbitrage(
        address token,
        uint256 amount,
        bool uniThenAero  // true = buy Uniswap, sell Aerodrome
    ) external {
        bytes memory params = abi.encode(token, uniThenAero);
        this.flashLoan(USDC, amount, params);
    }

    function executeOperation(...) external override returns (bool) {
        (address token, bool uniThenAero) = abi.decode(params, (address, bool));

        if (uniThenAero) {
            // Buy token on Uniswap (cheaper price)
            uint256 tokensOut = _swapOnUniswap(USDC, token, amounts[0] - premiums[0]);
            // Sell token on Aerodrome (higher price)
            uint256 usdcOut = _swapOnAerodrome(token, USDC, tokensOut);
            // Profit = usdcOut - amounts[0]
        } else {
            // Buy token on Aerodrome (cheaper)
            uint256 tokensOut = _swapOnAerodrome(USDC, token, amounts[0] - premiums[0]);
            // Sell token on Uniswap (higher)
            uint256 usdcOut = _swapOnUniswap(token, USDC, tokensOut);
        }

        // Repay
        IERC20(USDC).approve(address(POOL), amounts[0] + premiums[0]);
        return true;
    }
}
```

### Profit Calculation Before Execution

```typescript
// Simulate before submitting to avoid gas waste
async function checkArbitrageProfit(
  buyDex: "uniswap" | "aerodrome",
  sellDex: "uniswap" | "aerodrome",
  token: Address,
  amount: bigint
): Promise<{ profitable: boolean; profit: bigint; profitBps: bigint }> {
  const FLASH_LOAN_FEE = amount * 9n / 10000n;  // 0.09%

  // Simulate buy on buyDex
  const tokensOut = await simulateSwap(buyDex, USDC, token, amount);

  // Simulate sell on sellDex
  const usdcOut = await simulateSwap(sellDex, token, USDC, tokensOut);

  const profit = usdcOut - amount - FLASH_LOAN_FEE;
  const profitBps = profit * 10000n / amount;

  // Estimate gas cost
  const gasEstimate = 300_000n;
  const gasPrice = await provider.getGasPrice();
  const gasCostUSD = gasEstimate * gasPrice * ETH_PRICE / 1_000_000_000_000_000_000n;

  return {
    profitable: profit > gasCostUSD,
    profit,
    profitBps,
  };
}
```

---

## 5. Attack Vectors

Flash loans dramatically reduce the capital requirement for sophisticated attacks.

### Price Oracle Manipulation

```
WITHOUT flash loan: Attacker needs $50M to move price
WITH flash loan:    Attacker borrows $50M → moves price → exploits → repays

Classic attack:
  1. Flash loan $50M USDC from Aave
  2. Dump $50M into TOKEN/USDC pool (price drops 80%)
  3. Call victim protocol's liquidate() (uses manipulated spot price as oracle)
  4. Buy liquidated collateral at 80% discount
  5. Sell collateral at true price → $X profit
  6. Repay flash loan + fee
```

### Governance Attack

```
Protocol uses flash-borrowed tokens for governance votes:

  1. Borrow 1M governance tokens via flash loan
  2. Vote YES on malicious proposal in same tx
  3. Proposal immediately executes (same-block governance)
  4. Drain treasury
  5. Repay flash loan

Fix: Use snapshot voting (past block balance, not current)
Fix: Add timelock between vote and execution
```

### Reentrancy via Flash Loan

```
Attacker wraps the reentrancy attack in a flash loan to amplify capital:

  1. Flash loan $1M
  2. Deposit $1M as collateral
  3. Call withdraw() (reentrancy attack — drain pool)
  4. Profit > $1M
  5. Repay flash loan
```

---

## 6. Liquidation with Flash Loans

One of the most useful legitimate uses — liquidate undercollateralized DeFi positions without needing capital.

```solidity
contract LiquidationBot is AaveFlashLoan {
    // Liquidate an Aave position using a flash loan for the debt capital
    function liquidate(
        address borrower,
        address debtAsset,    // Asset to repay
        address collateral,   // Asset to receive
        uint256 debtAmount    // Amount to repay (max 50% of position)
    ) external {
        bytes memory params = abi.encode(borrower, collateral);
        this.flashLoan(debtAsset, debtAmount, params);
    }

    function executeOperation(...) external override returns (bool) {
        (address borrower, address collateral) = abi.decode(params, (address, address));

        // Step 1: Approve Aave Pool to use our borrowed tokens
        IERC20(assets[0]).approve(address(POOL), amounts[0]);

        // Step 2: Liquidate the position
        // We pay debtAmount → receive collateral at discount (5% bonus)
        POOL.liquidationCall(
            collateral,          // Collateral to seize
            assets[0],           // Debt to repay
            borrower,
            amounts[0],          // Debt amount
            false               // Don't receive aToken (receive underlying)
        );

        // Step 3: Sell seized collateral for USDC (to repay flash loan)
        uint256 collateralBalance = IERC20(collateral).balanceOf(address(this));
        uint256 usdcReceived = _swapForRepayment(collateral, assets[0], collateralBalance);

        // Step 4: Repay flash loan
        IERC20(assets[0]).approve(address(POOL), amounts[0] + premiums[0]);

        return true;
        // Profit: liquidation bonus (5%) - flash loan fee (0.09%) - gas (~$0.10)
    }
}
```

### Liquidation Profitability

```
Position:
  Borrower's collateral: 10 ETH at $3,000 = $30,000
  Borrower's debt: $26,000 USDC (HF < 1.0)
  Liquidation bonus: 5%

Flash loan: $13,000 USDC (50% of $26,000)
Fee: $11.70 (0.09%)

Step 1: Repay $13,000 debt
Step 2: Receive $13,650 in ETH ($13,000 × 1.05 bonus)
Step 3: Sell $13,650 ETH for USDC
Step 4: Repay $13,011.70

Profit: $13,650 - $13,011.70 - gas = ~$638.30 per liquidation
```

---

## 7. Self-Liquidation (Debt Restructuring)

Avoid the 5% liquidation penalty by self-liquidating before your HF drops below 1.0.

```
Scenario: Your USDC debt is due but ETH is locked as collateral.
Problem: Can't withdraw ETH until debt is repaid. Can't repay without USDC.
Flash loan solution:

  1. Flash loan USDC (equal to your debt)
  2. Repay all USDC debt to Aave
  3. Withdraw ETH collateral (now free)
  4. Sell just enough ETH for USDC + flash loan fee
  5. Repay flash loan
  6. Keep remaining ETH
```

```solidity
function selfLiquidate(
    address collateral,        // Your ETH/cbETH
    address debt,              // USDC debt
    uint256 debtAmount
) external {
    bytes memory params = abi.encode(collateral, msg.sender);
    this.flashLoan(debt, debtAmount, params);
}

function executeOperation(...) external override returns (bool) {
    (address collateral, address user) = abi.decode(params, (address, address));

    // Repay debt on behalf of user
    IERC20(assets[0]).approve(address(POOL), amounts[0]);
    POOL.repay(assets[0], amounts[0], 2, user);

    // Withdraw collateral
    uint256 collateralOut = POOL.withdraw(collateral, type(uint256).max, address(this));

    // Sell only enough collateral to cover flash loan repayment
    uint256 needed = amounts[0] + premiums[0];
    uint256 collateralToSell = _quoteCollateralForDebt(collateral, assets[0], needed);
    _swap(collateral, assets[0], collateralToSell);

    // Return remaining collateral to user
    IERC20(collateral).transfer(user, collateralOut - collateralToSell);

    IERC20(assets[0]).approve(address(POOL), needed);
    return true;
}
```

---

## 8. Gas Costs & Economics on Base

```
Flash loan transaction gas breakdown:
  Flash loan initiation:    ~30,000 gas
  Token transfer (lend):    ~30,000 gas
  Your callback execution:  varies (50,000–300,000+)
  Repayment approval:       ~30,000 gas
  Token transfer (repay):   ~30,000 gas
  Total overhead:           ~170,000 gas minimum

At Base gas prices (0.01 gwei):
  170,000 gas × 0.01 gwei × $3,500/ETH ≈ $0.006 USD

Even complex arbitrage (500,000 gas total): ~$0.017 USD

Gas is essentially free on Base → flash loans are extremely cheap to attempt
Implication: Profitable if arbitrage spread > 0.09% (flash loan fee only)
```

---

## 9. Monitoring and Detection

### Detect Flash Loan in Your Contract

```solidity
// Flash loans show up as large, temporary balance changes
// Can be detected by checking initial vs final balance

uint256 private initialBalance;

modifier noFlashLoan() {
    initialBalance = token.balanceOf(address(this));
    _;
    // After execution: balance should not have changed
    require(
        token.balanceOf(address(this)) >= initialBalance,
        "Flash loan manipulation detected"
    );
}

// Alternative: check if caller is flash loan provider
modifier notFromFlashLoan() {
    require(
        msg.sender != AAVE_POOL,
        "Direct flash loan callbacks not accepted"
    );
    _;
}
```

### Governance Anti-Flash-Loan

```solidity
// ❌ Vulnerable: uses current balance for votes
function getVotes(address voter) public view returns (uint256) {
    return token.balanceOf(voter);  // Flash-loanable!
}

// ✅ Secure: uses balance from previous block (snapshot)
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

function getVotes(address voter) public view returns (uint256) {
    return token.getPastVotes(voter, block.number - 1);  // Snapshot voting
}
```

---

## 10. Real Hacks Using Flash Loans

### bZx (2020) — $350K + $600K — First Major Flash Loan Attacks

Two attacks in 3 days. Attacker borrowed ETH via flash loan, manipulated Uniswap price oracle, borrowed more than collateral via bZx's stale price feed.

**Lesson:** Never use spot price as oracle. TWAP minimum.

### Harvest Finance (2020) — $34M

Flash swapped USDC through Curve to manipulate USDC/USDT ratio. Withdrew Harvest's USDC vault at inflated prices. Swapped back.

**Lesson:** Any yield aggregator holding stablecoins must not use spot price for share price calculation.

### PancakeBunny (2021) — $45M

Flash borrowed BNB, dumped into BUNNY/BNB pool, triggered BUNNY price oracle spike, minted excess BUNNY against inflated price.

**Lesson:** Minting logic must use time-weighted prices, not spot.

### Cream Finance V2 (2021) — $130M — Reentrancy + Flash Loan

Attacker used flash loan to exploit reentrancy in Cream's lending logic, recursively borrowing against the same collateral.

**Lesson:** Flash loans amplify reentrancy severity by 100–1000×. CEI pattern + ReentrancyGuard are essential.

---

## Common Mistakes

❌ **Not checking profitability before submission** — gas on Base is cheap, but an unprofitable flashloan still costs the fee.

❌ **Using `transfer()` instead of `approve()` for repayment** — Aave takes repayment via `transferFrom`, not receiving a push.

❌ **Not handling flash loan reversal** — if callback reverts, entire tx reverts. Test revert paths.

❌ **Protocol accepting flash-borrowed governance tokens** — snapshot voting is required.

❌ **Assuming flash loans are inherently malicious** — they are a core primitive. Focus on whether YOUR protocol is vulnerable.

✅ **Simulation first** — always simulate the full tx before submitting. Foundry's `vm.prank` + fork test.

✅ **Use Balancer for 0% fee** — when doing collateral swaps without profit motive, Balancer saves 0.09%.

✅ **Batch multiple arbitrages in one flash loan** — amortize the fixed cost across multiple profits.

---

## Resources

- Aave V3 flash loan docs: `docs.aave.com/developers/guides/flash-loans`
- Balancer flash loans: `docs.balancer.fi/reference/contracts/flash-loans.html`
- Real flash loan examples: `github.com/aave/aave-v3-periphery`
- Related skills: `aave-lending-patterns.md`, `oracle-design-guide.md`, `solidity-security-patterns.md`
- CLI: `blue audit --check flashloan-risk`, `blue build "flash loan arbitrage on Base"`
