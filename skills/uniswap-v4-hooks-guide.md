# Uniswap V4 Hooks Guide

Grounding for `blue build` (DEX/hook category) and `blue audit` (hook security review).

Building custom Uniswap V4 hooks on Base — architecture, patterns, security, and deployment.

---

## 1. Hook Architecture

Hooks are smart contracts that execute custom logic at key lifecycle events in Uniswap V4 pools.

### What Changed in V4

**V3:** Each pool is a separate contract. No custom logic possible.

**V4:** All pools live in a single **PoolManager** contract. Hooks are external contracts called at specific points. One PoolManager, infinite customizability.

```
V3: ETH/USDC Pool Contract → handles swaps directly
V4: PoolManager (singleton) → calls your Hook → executes swap
```

### Hook Contract Address Determines Permissions

In V4, the hook address encodes which lifecycle points the hook uses. The lower 20 bits of the address define the "permissions bitmap."

```solidity
// Hook address must match its permission bitmap
// Bits 0-9 encode which hook functions are enabled:
// bit 0:  beforeInitialize
// bit 1:  afterInitialize
// bit 2:  beforeAddLiquidity
// bit 3:  afterAddLiquidity
// bit 4:  beforeRemoveLiquidity
// bit 5:  afterRemoveLiquidity
// bit 6:  beforeSwap
// bit 7:  afterSwap
// bit 8:  beforeDonate
// bit 9:  afterDonate

// Example: Hook that uses beforeSwap (bit 6) and afterSwap (bit 7)
// Address must end in ...0b11000000 = 0xC0

// Use CREATE2 mining to find the right address:
// HookMiner.find(deployer, flags, creationCode, constructorArgs)
```

---

## 2. PoolManager Design

The PoolManager is the singleton contract managing all V4 pools.

```solidity
interface IPoolManager {
    // Create a new pool
    function initialize(PoolKey memory key, uint160 sqrtPriceX96, bytes calldata hookData)
        external returns (int24 tick);

    // Execute a swap
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external returns (BalanceDelta delta);

    // Add liquidity
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (BalanceDelta delta, BalanceDelta fees);
}

struct PoolKey {
    Currency currency0;    // Lower address token (always token0 < token1 by address)
    Currency currency1;    // Higher address token
    uint24 fee;            // Fee in pips (3000 = 0.3%, 500 = 0.05%)
    int24 tickSpacing;     // Tick granularity (must match fee tier)
    IHooks hooks;          // Your hook contract (or address(0) for no hook)
}
```

**PoolManager on Base:** `TODO — verify on Basescan`

---

## 3. Hook Lifecycle Points

Six events where your hook can execute logic:

```
Pool Initialization:
  beforeInitialize(sender, key, sqrtPriceX96, hookData) → bytes4
  afterInitialize(sender, key, sqrtPriceX96, tick, hookData) → bytes4

Liquidity Management:
  beforeAddLiquidity(sender, key, params, hookData) → bytes4
  afterAddLiquidity(sender, key, params, delta, feesAccrued, hookData) → (bytes4, BalanceDelta)
  beforeRemoveLiquidity(sender, key, params, hookData) → bytes4
  afterRemoveLiquidity(sender, key, params, delta, feesAccrued, hookData) → (bytes4, BalanceDelta)

Swaps:
  beforeSwap(sender, key, params, hookData) → (bytes4, BeforeSwapDelta, uint24)
  afterSwap(sender, key, params, delta, hookData) → (bytes4, int128)

Donations:
  beforeDonate(sender, key, amount0, amount1, hookData) → bytes4
  afterDonate(sender, key, amount0, amount1, hookData) → bytes4
```

**Return values:** Each hook function must return a 4-byte selector to confirm it ran successfully.

```solidity
// BaseHook makes this easy
import {BaseHook} from "v4-periphery/src/base/hooks/BaseHook.sol";

contract MyHook is BaseHook {
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        // Your logic here
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
}
```

---

## 4. Common Hook Patterns

### Pattern 1: Dynamic Fee Hook

Adjust swap fee based on volatility, time, or external signals.

```solidity
contract DynamicFeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    // Fee in pips (1 pip = 0.0001%)
    uint24 public constant BASE_FEE = 3000;    // 0.3%
    uint24 public constant HIGH_VOL_FEE = 10000; // 1%

    uint256 lastPrice;
    uint256 lastUpdateTime;

    function beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        uint24 fee = calculateDynamicFee();

        // Return fee override (0 = use pool default, nonzero = override)
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee);
    }

    function calculateDynamicFee() internal view returns (uint24) {
        // High volatility (price moved >2% in last 10 minutes) → higher fee
        if (isHighVolatility()) return HIGH_VOL_FEE;
        return BASE_FEE;
    }
}
```

### Pattern 2: On-Chain Limit Order Hook

Fill limit orders automatically during swaps.

```solidity
contract LimitOrderHook is BaseHook {
    mapping(bytes32 => Order) public orders;

    struct Order {
        address owner;
        bool zeroForOne;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bool filled;
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override returns (bytes4, int128) {
        // Get current tick after swap
        (, int24 currentTick,,) = poolManager.getSlot0(key.toId());

        // Check if any limit orders crossed the current tick
        // If yes, fill them (remove liquidity at their range)
        _fillCrossedOrders(key, currentTick);

        return (BaseHook.afterSwap.selector, 0);
    }
}
```

### Pattern 3: TWAP Oracle Hook

Accumulate price data on every swap for cheap onchain TWAP.

```solidity
contract TWAPOracleHook is BaseHook {
    mapping(PoolId => Observation[]) public observations;

    struct Observation {
        uint32 timestamp;
        int56 tickCumulative;    // Tick * seconds elapsed
        uint160 secondsPerLiquidityCumulativeX128;
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external override returns (bytes4, int128) {
        PoolId id = key.toId();
        (, int24 currentTick,,) = poolManager.getSlot0(id);

        // Write observation
        observations[id].push(Observation({
            timestamp: uint32(block.timestamp),
            tickCumulative: latestTickCumulative + int56(currentTick) * int56(uint56(block.timestamp - lastTimestamp)),
            secondsPerLiquidityCumulativeX128: 0  // simplified
        }));

        return (BaseHook.afterSwap.selector, 0);
    }

    function consult(PoolId id, uint32 secondsAgo) external view returns (int24 arithmeticMeanTick) {
        // Calculate TWAP from observation array
        Observation[] storage obs = observations[id];
        // ... binary search + interpolation
    }
}
```

### Pattern 4: KYC / Allowlist Hook

Restrict pool access to verified addresses.

```solidity
contract KYCHook is BaseHook {
    mapping(address => bool) public isApproved;
    address public admin;

    function beforeSwap(
        address sender,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        require(isApproved[sender], "KYC required");
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function beforeAddLiquidity(
        address sender,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external override returns (bytes4) {
        require(isApproved[sender], "KYC required for LP");
        return BaseHook.beforeAddLiquidity.selector;
    }
}
```

---

## 5. Hook Security

### Reentrancy via PoolManager

The PoolManager has a lock mechanism that prevents reentrancy into itself. But your hook can still call external contracts.

```solidity
// ❌ Dangerous: calling untrusted external contract from hook
function afterSwap(...) external override {
    externalContract.notify();  // Could re-enter via callbacks
    return (BaseHook.afterSwap.selector, 0);
}

// ✅ Safe: only trusted, audited calls
function afterSwap(...) external override {
    // Only update internal state or call trusted system contracts
    emit SwapOccurred(key.toId(), delta);
    return (BaseHook.afterSwap.selector, 0);
}
```

### Only PoolManager Can Call Hooks

```solidity
// BaseHook enforces this automatically:
modifier onlyByPoolManager() {
    if (msg.sender != address(poolManager)) revert NotPoolManager();
    _;
}

// All hook functions should have this guard (BaseHook provides it)
```

### Gas Limits in Hooks

Hooks must complete within available gas. Expensive hooks make swaps unviable.

```
Swap overhead from hook:
  Simple state update: 5,000–10,000 gas
  Storage write: 20,000 gas
  External call: 2,100+ gas
  Complex computation: varies

Guideline: Hook overhead < 100,000 gas (or users won't use the pool)
```

### Immutable Hook Addresses

Once a pool is created with a hook, it cannot be changed. Design hook upgrade paths carefully (use proxies if upgrades needed).

---

## 6. Testing & Debugging

```solidity
// Foundry test setup
import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {HookMiner} from "v4-periphery/src/libraries/HookMiner.sol";

contract MyHookTest is Test, Deployers {
    MyHook hook;

    function setUp() public {
        // Deploy PoolManager
        deployFreshManagerAndRouters();

        // Mine correct hook address (must match permissions bitmap)
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        );
        (address hookAddress, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(MyHook).creationCode,
            abi.encode(address(manager))
        );

        // Deploy hook at computed address
        hook = new MyHook{salt: salt}(IPoolManager(address(manager)));

        // Initialize pool with hook
        (key,) = initPool(
            Currency.wrap(address(token0)),
            Currency.wrap(address(token1)),
            IHooks(address(hook)),
            3000,  // 0.3% fee
            SQRT_PRICE_1_1,
            ZERO_BYTES
        );
    }

    function test_SwapWithHook() public {
        // Perform swap and verify hook executed
        swap(key, true, 1e18, ZERO_BYTES);
        // Assert hook state updated
    }
}
```

---

## 7. Gas Cost Analysis

| Hook Action | Gas Cost |
|---|---|
| Empty hook (just return selector) | ~1,500 gas |
| Single storage read (SLOAD) | ~2,100 gas |
| Single storage write (SSTORE) | ~20,000 gas |
| Observation write (TWAP) | ~22,000 gas |
| External call (trusted) | ~2,100 + call cost |
| Complex math (TWAP calculation) | ~5,000–15,000 gas |

**Total overhead budget:** 50,000–100,000 gas. More than this and the pool becomes uncompetitive.

---

## 8. Integration Process

```bash
# 1. Install dependencies
forge install Uniswap/v4-core Uniswap/v4-periphery

# 2. Implement hook (inheriting BaseHook)
# 3. Mine correct hook address for your permissions
# 4. Deploy with CREATE2 to mined address
# 5. Verify on Basescan
# 6. Create pool on PoolManager with your hook
# 7. Add initial liquidity to activate the pool
```

```solidity
// Deploy script
contract DeployHook is Script {
    function run() external {
        // Mine address
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            msg.sender,
            flags,
            type(MyHook).creationCode,
            abi.encode(POOL_MANAGER_ADDRESS)
        );

        vm.broadcast();
        MyHook hook = new MyHook{salt: salt}(IPoolManager(POOL_MANAGER_ADDRESS));
        require(address(hook) == hookAddress, "Hook address mismatch");
    }
}
```

---

## 9. Real Examples

### Uniswap's Official Example Hooks

- **Counter hook** — counts beforeSwap/afterSwap calls (reference implementation)
- **GeomeanOracle** — geometric mean TWAP oracle built into swaps
- **FullRange** — forces all liquidity to be full-range (like V2)
- **TWAMM** — time-weighted average market maker (large order execution)

### Community Hooks

- **Limit orders** — fill on-chain limit orders during swaps
- **Stop-loss** — auto-sell when price drops below threshold
- **MEV tax** — charge extra fee to sandwich bots, rebate to LPs

---

## 10. Best Practices & Pitfalls

### ✅ Do

- Use `BaseHook` from `v4-periphery` — it handles the boilerplate
- Test with Foundry fork tests against Base mainnet
- Mine hook address before writing deployment script
- Keep hook logic simple and gas-efficient
- Emit events for all state changes in hooks

### ❌ Don't

- Don't store large arrays in hook storage — gas scales with size
- Don't make hooks upgradeable without extensive testing (pool address is immutable)
- Don't assume swap direction — `params.zeroForOne` is your friend
- Don't forget to handle both `beforeSwap` and `afterSwap` if you need pre+post state
- Don't ignore `hookData` — it's how the pool router passes extra params to your hook

---

## Resources

- Uniswap V4 docs: `docs.uniswap.org/contracts/v4`
- V4 Core repo: `github.com/Uniswap/v4-core`
- V4 Periphery: `github.com/Uniswap/v4-periphery`
- Hook examples: `github.com/uniswapfoundation/v4-template`
- Related skills: `base-ecosystem.md`, `oracle-design-guide.md`, `mev-protection-guide.md`
- CLI: `blue build "Uniswap V4 hook on Base"`, `blue audit --check hook-security`
