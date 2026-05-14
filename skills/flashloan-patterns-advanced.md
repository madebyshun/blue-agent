# Flash Loan Patterns Advanced

Grounding for `blue build` (advanced DeFi) and `blue audit` (complex flash loan risk).

Multi-hop flash loans, cross-chain flash loans, MEV + flash loan combos, self-liquidation, and real protocol patterns.

---

## 1. Recap: Flash Loan Fundamentals

Flash loans covered in `flashloan-patterns.md`. This document covers advanced patterns.

```
Basic flash loan:
  Borrow → Use → Repay (in one transaction)

Advanced patterns:
  Multi-hop:    Borrow from A, use in B, repay to A
  Cross-asset:  Borrow token X, do something, repay token Y
  Chained:      Flash loan enables another flash loan
  MEV+loan:     Flash loan + arbitrage in same block
  Cross-chain:  Flash loan on chain A, action on chain B (not truly atomic — advanced topic)
```

---

## 2. Multi-Asset Flash Loans

Borrow multiple assets in a single flash loan.

### Balancer Multi-Asset Flash Loan

```solidity
import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IFlashLoanRecipient.sol";

contract MultiAssetFlashLoan is IFlashLoanRecipient {
    IVault public constant BALANCER_VAULT =
        IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);  // TODO: verify on Base
    
    function executeMultiLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
        BALANCER_VAULT.flashLoan(
            IFlashLoanRecipient(address(this)),
            tokens,
            amounts,
            userData
        );
    }
    
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,  // Balancer fee (0.0001% — near zero)
        bytes memory userData
    ) external override {
        require(msg.sender == address(BALANCER_VAULT), "Not Balancer Vault");
        
        // Now have: tokens[0] (e.g., USDC), tokens[1] (e.g., WETH), tokens[2] (e.g., DAI)
        // All amounts available simultaneously
        
        // Decode strategy from userData
        (uint8 strategyType, bytes memory strategyParams) = abi.decode(userData, (uint8, bytes));
        
        if (strategyType == 0) {
            _executeArbitrage(tokens, amounts, strategyParams);
        } else if (strategyType == 1) {
            _executeCollateralSwap(tokens, amounts, strategyParams);
        }
        
        // Repay all loans + fees
        for (uint i = 0; i < tokens.length; i++) {
            tokens[i].transfer(
                address(BALANCER_VAULT),
                amounts[i] + feeAmounts[i]
            );
        }
    }
}
```

---

## 3. Chained Flash Loans

A flash loan that enables a second flash loan inside the callback.

### Pattern: Amplified Capital

```
Scenario: Need $10M for arbitrage but can only source $5M from Aave
Solution: Aave flash loan ($5M) → inside callback: Balancer flash loan ($5M more)
Total capital: $10M (both repaid in same tx)

Use case: Large arbitrage opportunities requiring more capital than any single source
Risk: Increased complexity, multiple repayments must all succeed
```

```solidity
contract ChainedFlashLoan is IFlashLoanReceiver, IFlashLoanRecipient {
    address public constant AAVE_POOL = 0x...;  // TODO: verify
    address public constant BALANCER_VAULT = 0x...;  // TODO: verify
    
    bool private _executingInner;  // Track which loan we're handling
    
    // Step 1: Start outer loan (Aave)
    function startChainedLoan() external {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(USDC);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5_000_000e6;  // $5M USDC from Aave
        
        IAavePool(AAVE_POOL).flashLoan(
            address(this), [USDC], [5_000_000e6], [0],
            address(this), abi.encode("start_inner"), 0
        );
    }
    
    // Aave callback — start inner loan
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == AAVE_POOL);
        
        // Now have $5M from Aave — start Balancer loan for $5M more
        _executingInner = true;
        BALANCER_VAULT.flashLoan(
            IFlashLoanRecipient(address(this)),
            [IERC20(USDC)],
            [5_000_000e6],  // $5M more from Balancer
            ""
        );
        _executingInner = false;
        
        // Repay Aave ($5M + premium)
        IERC20(USDC).approve(AAVE_POOL, amounts[0] + premiums[0]);
        return true;
    }
    
    // Balancer callback — have total $10M here
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory
    ) external override {
        require(msg.sender == address(BALANCER_VAULT));
        require(_executingInner, "Not from chained loan");
        
        // HERE: Have $5M (Aave) + $5M (Balancer) = $10M USDC total
        uint256 totalCapital = IERC20(USDC).balanceOf(address(this));
        
        // Execute arbitrage or strategy with full $10M
        _executeStrategy(totalCapital);
        
        // Repay Balancer ($5M + fee)
        tokens[0].transfer(
            address(BALANCER_VAULT),
            amounts[0] + feeAmounts[0]
        );
        // Aave gets repaid back in executeOperation after this returns
    }
}
```

---

## 4. Collateral Swap via Flash Loan

Change collateral type in a lending position without liquidation.

### Aave Collateral Swap: WBTC → ETH

```
Current position:
  Collateral: 1 WBTC ($60,000)
  Debt: 30,000 USDC (50% LTV)

Goal: Switch collateral to ETH without repaying debt

Without flash loan: Would need $30,000 to repay, then free WBTC, then deposit ETH
With flash loan: Single atomic transaction

Steps:
  1. Flash borrow 30,000 USDC from Balancer
  2. Repay USDC debt → WBTC collateral freed
  3. Withdraw WBTC from Aave
  4. Swap WBTC → ETH on Uniswap
  5. Deposit ETH back as Aave collateral
  6. Borrow 30,000 USDC again (against ETH)
  7. Repay flash loan (30,000 USDC + fee)
```

```solidity
contract CollateralSwap is IFlashLoanRecipient {
    IVault constant BALANCER = IVault(0x...);
    address constant AAVE_POOL = 0x...;
    address constant UNISWAP_ROUTER = 0x...;
    
    struct SwapParams {
        address debtToken;
        uint256 debtAmount;
        address oldCollateral;
        address newCollateral;
        address user;
    }
    
    function swapCollateral(SwapParams calldata params) external {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(params.debtToken);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.debtAmount;
        
        BALANCER.flashLoan(
            IFlashLoanRecipient(address(this)),
            tokens, amounts,
            abi.encode(params)
        );
    }
    
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        SwapParams memory p = abi.decode(userData, (SwapParams));
        
        // 1. Repay debt (on behalf of user)
        tokens[0].approve(AAVE_POOL, amounts[0]);
        IAavePool(AAVE_POOL).repay(p.debtToken, amounts[0], 2, p.user);
        
        // 2. Withdraw old collateral (requires user to have approved this contract as operator)
        uint256 oldCollateralAmount = IAavePool(AAVE_POOL).withdraw(
            p.oldCollateral,
            type(uint256).max,  // Withdraw all
            address(this)
        );
        
        // 3. Swap old → new collateral
        IERC20(p.oldCollateral).approve(UNISWAP_ROUTER, oldCollateralAmount);
        uint256 newCollateralAmount = _swapExactInput(
            p.oldCollateral,
            p.newCollateral,
            oldCollateralAmount,
            amounts[0] + feeAmounts[0]  // Need at least enough to repay flash loan
        );
        
        // 4. Deposit new collateral
        IERC20(p.newCollateral).approve(AAVE_POOL, newCollateralAmount);
        IAavePool(AAVE_POOL).supply(p.newCollateral, newCollateralAmount, p.user, 0);
        
        // 5. Borrow debt again (user now has new collateral)
        IAavePool(AAVE_POOL).borrow(p.debtToken, amounts[0] + feeAmounts[0], 2, 0, p.user);
        
        // 6. Repay flash loan
        tokens[0].transfer(address(BALANCER), amounts[0] + feeAmounts[0]);
    }
}
```

---

## 5. Flash Loan Arbitrage with MEV

Combining flash loans with MEV-captured arbitrage opportunities.

### Triangle Arbitrage Bot

```solidity
contract TriangleArbitrage {
    using SafeERC20 for IERC20;
    
    address public owner;
    
    struct ArbPath {
        address pool0;    // First pool
        address pool1;    // Second pool
        address pool2;    // Third pool
        address token0;   // Start/end token
        address token1;   // Middle token 1
        address token2;   // Middle token 2
        uint24 fee0;
        uint24 fee1;
        uint24 fee2;
    }
    
    // Monitor mempool / onchain events for price dislocations
    // Then atomically: flash loan → arb → repay
    
    function executeArb(
        ArbPath calldata path,
        uint256 flashAmount
    ) external {
        require(msg.sender == owner, "Not owner");
        
        // Calculate expected profit before executing
        uint256 expectedOut = _simulatePath(path, flashAmount);
        uint256 fee = flashAmount * 9 / 10000;  // Aave 0.09%
        require(expectedOut > flashAmount + fee, "Not profitable");
        
        // Flash loan to capitalize the arbitrage
        IAavePool(AAVE_POOL).flashLoanSimple(
            address(this),
            path.token0,
            flashAmount,
            abi.encode(path),
            0
        );
    }
    
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL);
        
        ArbPath memory path = abi.decode(params, (ArbPath));
        
        // Leg 1: token0 → token1 on pool0
        uint256 amount1 = _swapOnPool(path.pool0, path.token0, path.token1, amount, path.fee0);
        
        // Leg 2: token1 → token2 on pool1
        uint256 amount2 = _swapOnPool(path.pool1, path.token1, path.token2, amount1, path.fee1);
        
        // Leg 3: token2 → token0 on pool2 (back to start)
        uint256 amount3 = _swapOnPool(path.pool2, path.token2, path.token0, amount2, path.fee2);
        
        uint256 profit = amount3 - amount - premium;
        require(profit > 0, "Arb not profitable");
        
        // Send profit to owner
        IERC20(asset).safeTransfer(owner, profit);
        
        // Repay flash loan
        IERC20(asset).approve(AAVE_POOL, amount + premium);
        return true;
    }
}
```

---

## 6. Flash Loan Liquidation Bot

Liquidate undercollateralized positions using flash loans.

```solidity
contract LiquidationBot {
    address public owner;
    
    // Monitor Aave health factors — liquidate when < 1.0
    function liquidatePosition(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover
    ) external {
        require(msg.sender == owner);
        
        // Flash borrow the debt asset
        IAavePool(AAVE_POOL).flashLoanSimple(
            address(this),
            debtAsset,
            debtToCover,
            abi.encode(collateralAsset, debtAsset, user, debtToCover),
            0
        );
    }
    
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external returns (bool) {
        (address collateralAsset, address debtAsset, address user, uint256 debtToCover) =
            abi.decode(params, (address, address, address, uint256));
        
        // 1. Liquidate the position
        IERC20(debtAsset).approve(AAVE_POOL, debtToCover);
        IAavePool(AAVE_POOL).liquidationCall(
            collateralAsset,
            debtAsset,
            user,
            debtToCover,
            false  // Don't receive aToken, receive underlying
        );
        
        // 2. Get received collateral amount
        uint256 collateralReceived = IERC20(collateralAsset).balanceOf(address(this));
        
        // 3. Swap collateral → debt token (to repay flash loan)
        if (collateralAsset != debtAsset) {
            IERC20(collateralAsset).approve(UNISWAP_ROUTER, collateralReceived);
            _swapForExactOutput(
                collateralAsset,
                debtAsset,
                amount + premium,  // Need exactly this much debtAsset
                collateralReceived
            );
        }
        
        // 4. Calculate and send profit to owner
        uint256 profit = IERC20(debtAsset).balanceOf(address(this)) - amount - premium;
        if (profit > 0) {
            IERC20(debtAsset).transfer(owner, profit);
        }
        
        // 5. Repay flash loan
        IERC20(debtAsset).approve(AAVE_POOL, amount + premium);
        return true;
    }
}
```

---

## 7. Cross-Protocol Leveraged Position

Build leveraged positions in single transaction.

```
Goal: 3× leveraged ETH long using Aave

Without flash loan: 
  Deposit 1 ETH → borrow 0.67 ETH worth USDC → swap for ETH → deposit again × 3 times
  Takes multiple transactions, price slippage between steps

With flash loan (1 tx):
  Flash borrow 2 ETH
  Deposit 3 ETH total (1 own + 2 borrowed)
  Borrow 2 ETH worth of USDC
  Swap USDC → 2 ETH
  Repay flash loan (2 ETH)
  Result: 3× ETH long in one transaction
```

```solidity
function createLeverage(
    uint256 ownCapital,    // ETH user brings
    uint256 leverageMultiplier,  // 3 = 3× leverage
    address collateral,    // WETH
    address debt           // USDC
) external {
    uint256 borrowAmount = ownCapital * (leverageMultiplier - 1);
    
    // Flash borrow additional capital
    IAavePool(AAVE_POOL).flashLoanSimple(
        address(this),
        collateral,
        borrowAmount,
        abi.encode(ownCapital, leverageMultiplier, collateral, debt),
        0
    );
}

function executeOperation(
    address asset,
    uint256 amount,
    uint256 premium,
    address,
    bytes calldata params
) external returns (bool) {
    (uint256 ownCapital, uint256 leverage, address collateral, address debt) =
        abi.decode(params, (uint256, uint256, address, address));
    
    uint256 totalCollateral = ownCapital + amount;  // 1 ETH + 2 ETH flash = 3 ETH
    
    // Deposit all as collateral
    IERC20(collateral).approve(AAVE_POOL, totalCollateral);
    IAavePool(AAVE_POOL).supply(collateral, totalCollateral, msg.sender, 0);
    
    // Borrow against collateral (to repay flash loan + premium)
    uint256 borrowNeeded = amount + premium;
    uint256 usdcBorrow = _getTokenValue(borrowNeeded, collateral, debt);
    IAavePool(AAVE_POOL).borrow(debt, usdcBorrow, 2, 0, msg.sender);
    
    // Swap borrowed USDC → collateral to repay flash loan
    IERC20(debt).approve(UNISWAP_ROUTER, usdcBorrow);
    uint256 received = _swapExactInput(debt, collateral, usdcBorrow, amount + premium);
    
    // Repay flash loan
    IERC20(collateral).approve(AAVE_POOL, amount + premium);
    return true;
}
```

---

## 8. Security Considerations for Flash Loan Protocols

### Protecting Against Flash Loan Attacks

```solidity
// ✅ Use TWAP not spot price for oracles (as always)
// ✅ Check balances before and after in lending protocols

// Guard: prevent same-block supply/borrow
mapping(address => uint256) private lastActionBlock;

modifier noFlashLoanAbuse() {
    require(lastActionBlock[msg.sender] != block.number, "Same-block not allowed");
    lastActionBlock[msg.sender] = block.number;
    _;
}

// Guard: minimum hold time for collateral
mapping(address => uint256) private collateralDepositTime;

modifier requireMinHold() {
    require(
        block.timestamp >= collateralDepositTime[msg.sender] + 1 hours,
        "Must hold collateral for minimum period"
    );
    _;
}
```

### Callback Reentrancy in Flash Loan Callbacks

```solidity
// ❌ DANGEROUS: Flash loan callback modifies state that other functions read
bool private inFlashLoan;

function dangerousCallback(bytes calldata) external {
    inFlashLoan = true;
    // ... do stuff ...
    inFlashLoan = false;  // ← If _executeStrategy calls back into this contract...
}

// ✅ SAFE: Validate caller, use reentrancy guard
bool private locked;

function safeCallback(bytes calldata params) external {
    require(msg.sender == AAVE_POOL, "Untrusted caller");
    require(!locked, "Reentrancy");
    locked = true;
    // ... do stuff ...
    locked = false;
}
```

---

## 9. Profit Calculation

```typescript
// Before executing any flash loan strategy, simulate profit
async function simulateFlashLoanProfit(
  flashAmount: bigint,
  flashFeeRate: number,  // e.g., 0.0009 for Aave (0.09%)
  expectedProfit: bigint
): Promise<{ profitable: boolean; netProfit: bigint; roi: number }> {
  const flashFee = BigInt(Math.floor(Number(flashAmount) * flashFeeRate));
  const gasCost = await estimateGasCost();  // Simulate and estimate
  
  const netProfit = expectedProfit - flashFee - gasCost;
  const roi = Number(netProfit) / Number(flashAmount) * 100;
  
  return {
    profitable: netProfit > 0n,
    netProfit,
    roi,
  };
}

// Rule: Only execute if ROI > 0.1% (above gas uncertainty)
const MIN_ROI = 0.1;
```

---

## 10. Flash Loan Provider Comparison (Advanced)

| Provider | Max Amount | Fee | Multi-asset | Callback |
|---|---|---|---|---|
| Aave V3 (Base) | Pool TVL | 0.05–0.09% | No (one asset) | `executeOperation` |
| Balancer | Pool TVL | 0% (free!) | Yes (many) | `receiveFlashLoan` |
| Uniswap V3 | Pool liquidity | ~0.05% + swap fee | No | `uniswapV3FlashCallback` |
| dYdX | Pool TVL | 0% (free!) | No | `callFunction` |
| Morpho | Pool TVL | Configurable | No | `onMorphoFlashLoan` |

**Note on Balancer free flash loans:** Balancer's fee is 0 but their pools have less TVL than Aave for exotic assets. For most tokens, Aave or Balancer both work.

---

## Common Mistakes

❌ **Not checking callback caller** — allow anyone to call executeOperation = funds stolen.

❌ **Forgetting to repay + fee** — transaction reverts, wasting gas. Pre-calculate total repayment.

❌ **Flash loan + oracle manipulation** — TWAP defense applies to attacks, not just your protocol.

❌ **Ignoring token decimals** — swapping $1M of 6-decimal USDC vs 18-decimal token = wrong amounts.

❌ **Single-block attacks without considering chain-specific timing** — Base blocks are 2s, not 12s.

✅ **Always simulate before executing** — use Tenderly fork to test flash loan strategies off-chain.

✅ **Check profit minimum** — require at least 0.1% ROI to account for gas estimation variance.

✅ **Use Balancer for multi-asset** — free flash loans with multiple tokens in one callback.

---

## Resources

- Aave V3 flash loans: `docs.aave.com/developers/guides/flash-loans`
- Balancer flash loans: `docs.balancer.fi/concepts/vault/flash-loans`
- Tenderly (fork simulation): `tenderly.co`
- Related skills: `flashloan-patterns.md`, `aave-lending-patterns.md`, `mev-protection-advanced.md`
- CLI: `blue build "flash loan arbitrage bot on Base"`, `blue audit --check flash-loan-attack`
