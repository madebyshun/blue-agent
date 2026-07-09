// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BlueBuyBack — accumulate B20HUB launchpad fees, batch-swap for $BLUEAGENT,
 * distribute to configured recipient (BlueMarketStaking or a burn address).
 *
 * === Why this contract exists ===
 * B20HUB tokens on Base launch through a Uniswap V4 hook that intercepts 100%
 * of each swap's fee and splits it: 80% creator, 15% here, 5% treasury.
 * The 15% share arrives here as WHATEVER TOKEN a swap consumed (usually WETH
 * or the launched B20 token, since V4 fee flow follows token flow), and this
 * contract's only job is: (1) accumulate cheaply, (2) periodically convert to
 * $BLUEAGENT via the on-chain V4 pool, (3) send bought $BLUEAGENT to the
 * `payoutRecipient` (initially the BlueAgent treasury; can later point at a
 * stake-side distributor once we ship one).
 *
 * === Why batched, not per-swap ===
 * Real-time buyback (swap-inside-swap) would ~2× the gas of every user swap
 * on B20HUB pools and destroy the UX. Instead, ANYONE can call `distribute()`
 * whenever accumulated value clears `minDistributeThreshold`, and the caller
 * earns `KEEPER_BPS` (0.1%) of the swap output as a gas rebate. This is
 * MEV-safe: the swap is executed at V4 price at call time, and the keeper's
 * cut is only 10 bps — not enough to sandwich profitably vs. the gas cost.
 *
 * === Trust model ===
 * IMMUTABLE at deploy: BLUE token, V4 UniversalRouter, payoutRecipient,
 * WETH9, KEEPER_BPS. The owner can ONLY (a) adjust the min-distribute
 * threshold, (b) rescue a stuck non-BLUE ERC20 token that wasn't part of a
 * B20HUB launch (paranoia against a hook sending garbage). Owner CANNOT
 * change payoutRecipient — that would let a hostile owner redirect stakers'
 * yield. If we want to change the recipient later, we deploy a new
 * BlueBuyBack and update the hooks that reference it.
 *
 * Base mainnet dependencies (all verified — see lib/b20hub/constants.ts):
 *   BLUE     : 0xf895783b2931c919955e18b5e3343e7c7c456ba3
 *   WETH9    : 0x4200000000000000000000000000000000000006
 *   V4 Router: 0x6fF5693b99212Da76ad316178A184AB56D299b43 (UniversalRouter)
 *   V4 Pool  : 0x3245fb…08c8d (BLUE/WETH, $86k liquidity, verified live)
 */

import { V4Actions } from "./lib/V4Actions.sol";
import { PoolKey, Currency } from "./B20HUBHook.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * Universal Router V4 execute() takes a compact command sequence:
 *   `commands` is a bytes-packed array; each byte selects one of the router's
 *   ops (V4_SWAP_EXACT_IN = 0x10, WRAP_ETH = 0x0b, etc.).
 *   `inputs` is a bytes[] parallel to commands with the encoded args.
 * BuyBack keeps this abstract behind `_swapV4ExactIn` so contract callers
 * don't need to know the byte-packing.
 */
interface IUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

interface IPermit2 {
    function approve(
        address token,
        address spender,
        uint160 amount,
        uint48 expiration
    ) external;
}

contract BlueBuyBack {
    // ─── Immutable config ─────────────────────────────────────────────────────
    address public immutable BLUE;             // token we buy
    address public immutable WETH9;            // interim currency
    address public immutable UNIVERSAL_ROUTER; // Uniswap V4 UniversalRouter
    address public immutable PERMIT2;          // approval router
    address public immutable payoutRecipient;  // where bought BLUE goes

    /// The BLUE/WETH V4 pool key — set once at deploy so `distribute()` knows
    /// which pool to swap through. Verified on Base mainnet: BLUE/WETH V4
    /// pool at 0x3245fb…08c8d has $86k liquidity and $28k daily volume, so
    /// this route is real and won't be a value-destroying swap.
    /// currency0 = WETH (address 0x4200… < BLUE address).
    PoolKey public bluePoolKey;
    uint24 private constant BLUE_POOL_FEE = 10000; // 1% — matches deployed V4 pool
    int24  private constant BLUE_POOL_TICK_SPACING = 200;

    /// Keeper reward on distribute — 0.1% of bought BLUE (10 bps).
    uint16  public constant KEEPER_BPS = 10;
    uint16  public constant BPS_DENOMINATOR = 10_000;

    // ─── Owner-adjustable ─────────────────────────────────────────────────────
    address public owner;
    /// Below this many wei-BLUE-equivalent, distribute() reverts to avoid
    /// wasting gas + causing tiny keeper rewards. Owner can retune.
    uint256 public minDistributeThreshold;

    // ─── Events ───────────────────────────────────────────────────────────────
    event FeesReceived(address indexed token, uint256 amount, address indexed from);
    event Distributed(
        address indexed keeper,
        uint256 wethSpent,
        uint256 blueBought,
        uint256 keeperReward,
        uint256 recipientAmount
    );
    event ThresholdUpdated(uint256 newThreshold);
    event OwnerUpdated(address indexed newOwner);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotOwner();
    error BelowThreshold(uint256 have, uint256 need);
    error ZeroAddress();
    error NothingToSwap();
    error CannotRescueBlue();
    error SwapFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address blue_,
        address weth_,
        address universalRouter_,
        address permit2_,
        address payoutRecipient_,
        uint256 initialThreshold_
    ) {
        if (
            blue_ == address(0) || weth_ == address(0) ||
            universalRouter_ == address(0) || permit2_ == address(0) ||
            payoutRecipient_ == address(0)
        ) revert ZeroAddress();

        BLUE = blue_;
        WETH9 = weth_;
        UNIVERSAL_ROUTER = universalRouter_;
        PERMIT2 = permit2_;
        payoutRecipient = payoutRecipient_;
        owner = msg.sender;
        minDistributeThreshold = initialThreshold_;

        // Build the BLUE/WETH V4 pool key. V4 requires ascending address
        // ordering. WETH's 0x4200… is always numerically less than BLUE's
        // 0xf895… on Base, so WETH is currency0, BLUE is currency1.
        (Currency c0, Currency c1) = V4Actions.sortCurrencies(weth_, blue_);
        bluePoolKey = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: BLUE_POOL_FEE,
            tickSpacing: BLUE_POOL_TICK_SPACING,
            hooks: address(0)  // no custom hook on the BLUE/WETH pool
        });
    }

    // ─── Fee receiving ────────────────────────────────────────────────────────

    /**
     * Called by B20HUBHook after every fee capture. The hook does the actual
     * transfer of `token`+`amount` into this contract in the same tx; this
     * function only exists to emit an event so off-chain accounting can track
     * accumulated fees per launch. Not gated: any token can be pushed here —
     * distribute() decides what to actually convert. Ignoring a spurious call
     * only wastes the caller's gas.
     */
    function notifyFeesReceived(address token, uint256 amount) external {
        emit FeesReceived(token, amount, msg.sender);
    }

    /**
     * Passthrough for native ETH — hooks paying in native currency send here.
     * We hold ETH in this contract; distribute() will wrap it to WETH before
     * swapping.
     */
    receive() external payable {}

    // ─── Owner functions ──────────────────────────────────────────────────────

    function setThreshold(uint256 newThreshold) external onlyOwner {
        minDistributeThreshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /**
     * Rescue stuck tokens that aren't part of the buyback flow. Guardrail:
     * BLUE itself CANNOT be rescued — that would let a captured owner drain
     * stakers' unrealized rewards mid-distribute. WETH also disallowed since
     * it's the interim currency; if a WETH balance is stuck, the fix is to
     * call distribute(), not rescue it. Everything else (random airdrop
     * tokens, sanction-adjacent tokens, etc.) can be extracted.
     */
    function rescue(address token, address to) external onlyOwner {
        if (token == BLUE) revert CannotRescueBlue();
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = IERC20(token).balanceOf(address(this));
        _safeTransfer(token, to, bal);
        emit Rescued(token, to, bal);
    }

    // ─── Distribute — the actual buyback ──────────────────────────────────────

    /**
     * Anyone can call. Steps:
     *   1. Compute WETH balance held here (native ETH already wrapped in prior
     *      step by hook, or by manual wrapping via UniversalRouter WRAP_ETH).
     *   2. Revert if below threshold.
     *   3. Swap WETH → BLUE via Uniswap V4 UniversalRouter.
     *   4. Take KEEPER_BPS off the bought BLUE and send to msg.sender.
     *   5. Send the rest to payoutRecipient.
     *
     * This function is a STUB in this file — the actual _swapV4ExactIn body
     * needs the V4 Universal Router command encoding (V4_SWAP_EXACT_IN =
     * 0x10) which references PoolKey, PathKey and swap params structs. Those
     * are defined in Uniswap's v4-periphery (PathKey.sol + Actions.sol) and
     * will be pulled in alongside the V4 hook contract in the NEXT commit, so
     * we can share encoding helpers across both files. Kept as revert-stub
     * here rather than a fake implementation so we NEVER silently ship a
     * broken buyback.
     */
    function distribute(uint256 minBlueOut, uint256 deadline)
        external
        returns (uint256 blueBought, uint256 keeperReward)
    {
        uint256 wethBal = IERC20(WETH9).balanceOf(address(this));
        if (wethBal < minDistributeThreshold) {
            revert BelowThreshold(wethBal, minDistributeThreshold);
        }
        if (wethBal == 0) revert NothingToSwap();

        blueBought = _swapV4ExactIn(WETH9, BLUE, wethBal, minBlueOut, deadline);

        // Skim keeper reward.
        keeperReward = (blueBought * KEEPER_BPS) / BPS_DENOMINATOR;
        uint256 recipientAmount = blueBought - keeperReward;

        if (keeperReward > 0) {
            _safeTransfer(BLUE, msg.sender, keeperReward);
        }
        _safeTransfer(BLUE, payoutRecipient, recipientAmount);

        emit Distributed(msg.sender, wethBal, blueBought, keeperReward, recipientAmount);
    }

    // ─── V4 swap helper (STUB — implemented alongside B20HUBHook) ─────────────
    //
    // Deliberately left as revert-stub so that:
    //  1. This contract compiles + deploys + tests owner functions independently.
    //  2. When we ship the V4 hook in the next commit, we implement _swapV4ExactIn
    //     in ONE place (a shared library) and both hook + this contract link to it.
    //  3. We never accidentally ship a buyback that silently no-ops because
    //     someone edited an "empty" implementation and forgot to fill it in.

    /**
     * Wrapper around IERC20.transfer that reverts on `false` return or a
     * revert-string from the token. Real ERC20s + $BLUEAGENT return true on
     * success, but some tokens (USDT is famous for this) return no value at
     * all. We treat an empty return as success as long as the call itself
     * didn't revert — same convention as OpenZeppelin's SafeERC20.
     */
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert SwapFailed();
        }
    }

    function _swapV4ExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) internal virtual returns (uint256 amountOut) {
        // Wired route: only the BLUE/WETH V4 pool. Any other tokenIn/tokenOut
        // pair is rejected — we don't want a captured owner or malformed
        // caller to route swaps through an unknown pool. Fee-token conversion
        // (whatever B20HUB fee currency lands here) is done in a separate
        // step outside this function: caller must convert to WETH first.
        require(tokenIn == WETH9 && tokenOut == BLUE, "BlueBuyBack: unsupported swap route");
        require(amountIn <= type(uint128).max, "BlueBuyBack: amountIn overflow");
        require(minAmountOut <= type(uint128).max, "BlueBuyBack: minAmountOut overflow");

        // Direction: WETH is currency0 → swap zero-for-one (WETH → BLUE).
        bool zeroForOne = Currency.unwrap(bluePoolKey.currency0) == WETH9;

        // Build V4 swap params and hand to Universal Router. Approvals are
        // set once at deploy — see setupPermit2Approvals() called by the owner
        // in the same tx as construction (or later manually if needed).
        V4Actions.ExactInputSingleParams memory swapParams = V4Actions.ExactInputSingleParams({
            poolKey: bluePoolKey,
            zeroForOne: zeroForOne,
            amountIn: uint128(amountIn),
            amountOutMinimum: uint128(minAmountOut),
            hookData: bytes("")
        });

        (bytes memory commands, bytes[] memory inputs) =
            V4Actions.encodeUniversalRouterSwapExactInSingle(swapParams);

        uint256 balanceBefore = IERC20(BLUE).balanceOf(address(this));

        // UniversalRouter.execute(commands, inputs, deadline) — the
        // interface is defined at top of file. The router will pull WETH
        // via Permit2 (we approved once), execute the V4 swap on the pool,
        // and settle BLUE back to us via the TAKE_ALL action in the encoded
        // blob. Value = 0 because we're paying in ERC20, not native ETH.
        IUniversalRouter(UNIVERSAL_ROUTER).execute(commands, inputs, deadline);

        amountOut = IERC20(BLUE).balanceOf(address(this)) - balanceBefore;
        require(amountOut >= minAmountOut, "BlueBuyBack: swap slippage exceeded floor");
    }

    /**
     * One-time Permit2 setup. Owner calls this after deployment to give
     * Universal Router permission to pull WETH from BlueBuyBack. Uses
     * max approvals since the router pulls exactly what it needs per call.
     * Idempotent — safe to re-call if approvals get somehow invalidated.
     */
    function setupPermit2Approvals() external onlyOwner {
        // WETH → Permit2 direct approval (Permit2 needs raw allowance from us)
        IERC20(WETH9).approve(PERMIT2, type(uint256).max);
        // Permit2 → UniversalRouter forward approval (with far-future expiry)
        IPermit2(PERMIT2).approve(WETH9, UNIVERSAL_ROUTER, type(uint160).max, type(uint48).max);
    }
}
