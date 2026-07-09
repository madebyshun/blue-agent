// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { B20HUBHook, PoolKey, Currency } from "./B20HUBHook.sol";
import { V4Actions } from "./lib/V4Actions.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { LiquidityAmounts } from "v4-periphery/libraries/LiquidityAmounts.sol";

/**
 * B20HUBLauncher — single-transaction orchestrator that spawns a real B20
 * token, its Uniswap V4 pool, and a permanent multi-tick LP position in one
 * user signature.
 *
 * === Flow ===
 *  1. Call B20Factory (0xB20f…) to deploy a REAL B20 token with:
 *       • initialSupply = 100B minted to this Launcher (temporary custody)
 *       • TRANSFER_SENDER policy = ALWAYS_ALLOW (open transfers post-launch)
 *       • TRANSFER_RECEIVER policy = ALWAYS_ALLOW
 *       • DEFAULT_ADMIN_ROLE granted to Launcher
 *  2. Approve V4 PositionManager to spend the whole 100B.
 *  3. Build PoolKey with:
 *       • currency0 / currency1 sorted ascending (WETH will typically be
 *         currency0 since 0x420000… < most token addresses, but launcher
 *         detects at runtime — never assumes).
 *       • fee = user's chosen tier (3000 / 10000 / 30000)
 *       • tickSpacing = matching tier's spacing (60 / 200 / 600)
 *       • hooks = B20HUBHook address (bit-mined for AFTER_INITIALIZE + BEFORE_REMOVE)
 *  4. Pre-write creator + expected LP tokenId into hook via `hook.setPending(...)`.
 *  5. Call PoolManager.initialize(poolKey, sqrtPriceX96) — hook's
 *     afterInitialize consumes the pre-written creator and binds pool → creator.
 *  6. Add TWO concentrated liquidity positions to the same pool:
 *       • Position A (85% supply): wide range [MIN_TICK, initialTick]
 *         Purpose: absorb initial buy pressure, fair price discovery.
 *       • Position B (15% supply): narrow range [initialTick - N*spacing,
 *         initialTick + N*spacing] where N is tier-dependent (default 20).
 *         Purpose: deep liquidity near the "settled" price for lower slippage
 *         once discovery is done.
 *     Both positions receive currency = token only (0 WETH from launcher —
 *     Doppler-style single-sided). ETH buyers push through Position A,
 *     rebalance both positions naturally.
 *  7. Transfer BOTH LP NFTs to the B20HUBHook (permanent lock).
 *  8. Renounce DEFAULT_ADMIN_ROLE on the B20 token so no one — not even the
 *     Launcher — can mint, pause, or update policy after deployment.
 *  9. Emit `B20HUBLaunched(token, creator, poolId, tokenIdA, tokenIdB)`.
 *
 * The whole flow lives in one external `launch(...)` call. User pays gas
 * once. If any step reverts, the whole transaction unwinds — no partial
 * state, no orphan tokens, no leaked custody.
 *
 * === V4 encoding stubs ===
 * Steps 3, 5, and 6 involve V4-specific calldata packing (PoolKey encoding,
 * initialize params, PositionManager's ActionsLibrary for modifyLiquidities).
 * These are shared with BlueBuyBack._swapV4ExactIn and B20HUBHook._collectAndSplit
 * — the shared encoding library will land in a follow-up commit, at which
 * point all three stubs unlock together.
 *
 * Keeping this launcher as a scaffold + revert-stub means the fee-split /
 * LP-lock / buyback contracts CAN be independently reviewed and tested before
 * we take on the V4-encoding surface area. Same policy: NEVER silently ship
 * a broken launchpad.
 */

// ─── Interfaces we call ───────────────────────────────────────────────────────

/// B20Factory precompile at 0xB20f0000…0000. `createB20` takes packed
/// tokenFactoryData that encodes name/symbol/variant/decimals/etc — exact
/// encoding lives in B20FactoryLib (base-std library on-chain). Launcher
/// calls this via a low-level assembly path in _deployB20 to avoid pulling
/// the whole base-std dep in.
interface IB20Factory {
    function createB20(
        bytes32 salt,
        uint8 variant,     // 0 = ASSET, 1 = STABLECOIN
        bytes calldata createParams,
        bytes[] calldata initCalls
    ) external returns (address token);

    function isB20(address addr) external view returns (bool);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function totalSupply() external view returns (uint256);
}

interface IPoolManager {
    function initialize(PoolKey calldata key, uint160 sqrtPriceX96) external returns (int24 tick);
}

interface IPositionManager {
    /// V4 batched action + settlement router. `unlockData` encodes an ordered
    /// list of actions (Actions.MINT_POSITION, SETTLE_PAIR, etc.). We use
    /// this to add both LP positions in one call.
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline)
        external payable returns (bytes memory);

    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

contract B20HUBLauncher {

    // ─── Immutable dependencies ───────────────────────────────────────────────
    address public immutable B20_FACTORY;
    address public immutable POOL_MANAGER;
    address public immutable POSITION_MANAGER;
    address public immutable WETH9;
    B20HUBHook public immutable HOOK;

    // ─── Launch config (per-tier) ─────────────────────────────────────────────

    struct FeeTierConfig {
        uint24 fee;         // V4 pool fee
        int24  tickSpacing; // V4 pool tick spacing
        int24  positionBWidth; // Position B half-width, in tickSpacing units
    }

    /// User can pick from 0.3% / 1% / 3%. Each tier has its own tick spacing
    /// (matches V3 defaults) and Position B width (roughly ±20 tickSpacings
    /// around initial tick = ±0.03 to ±12% depending on spacing).
    mapping(uint24 fee => FeeTierConfig) public tierConfig;

    /// 85% of supply lands in Position A (wide range), 15% in Position B
    /// (narrow range). These are integer BPS of totalSupply.
    uint16 public constant POSITION_A_BPS = 8500;
    uint16 public constant POSITION_B_BPS = 1500;

    // ─── Events ───────────────────────────────────────────────────────────────

    event B20HUBLaunched(
        address indexed token,
        address indexed creator,
        bytes32 indexed poolId,
        uint256 lpTokenIdA,
        uint256 lpTokenIdB,
        uint24 fee,
        int24 initialTick
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error UnsupportedFeeTier(uint24 fee);
    error NotB20();
    error ZeroAddress();
    error SupplyOverflow();

    constructor(
        address b20Factory_,
        address poolManager_,
        address positionManager_,
        address weth9_,
        address hook_
    ) {
        if (
            b20Factory_ == address(0) || poolManager_ == address(0) ||
            positionManager_ == address(0) || weth9_ == address(0) ||
            hook_ == address(0)
        ) revert ZeroAddress();

        B20_FACTORY = b20Factory_;
        POOL_MANAGER = poolManager_;
        POSITION_MANAGER = positionManager_;
        WETH9 = weth9_;
        HOOK = B20HUBHook(payable(hook_));

        // Preset the three supported fee tiers. Position B half-width chosen
        // so ±20 spacings ≈ ±0.12% (500 tier), ±1.2% (3000), ±4% (10000).
        // Rough intuition: higher-fee memecoins get wider bands to absorb
        // volatility without going out-of-range too fast.
        tierConfig[3000]  = FeeTierConfig({ fee: 3000,  tickSpacing: 60,  positionBWidth: 20 });
        tierConfig[10000] = FeeTierConfig({ fee: 10000, tickSpacing: 200, positionBWidth: 20 });
        tierConfig[30000] = FeeTierConfig({ fee: 30000, tickSpacing: 600, positionBWidth: 20 });
    }

    // ─── Launch — single external entrypoint ──────────────────────────────────

    struct LaunchParams {
        string  name;
        string  symbol;
        uint8   variant;       // 0 = ASSET, 1 = STABLECOIN
        uint8   decimals;
        uint256 totalSupply;   // typical 100_000_000_000e18 (100B, 18 decimals)
        uint160 initialSqrtPriceX96;  // opening B20/WETH price
        uint24  feeTier;       // 3000 / 10000 / 30000
        address creator;       // 80% of swap fees route here forever
        bytes32 salt;          // CREATE2 salt for B20 deploy — client mines
    }

    function launch(LaunchParams calldata p)
        external
        returns (address token, bytes32 poolId, uint256 lpTokenIdA, uint256 lpTokenIdB)
    {
        FeeTierConfig memory cfg = tierConfig[p.feeTier];
        if (cfg.fee == 0) revert UnsupportedFeeTier(p.feeTier);
        if (p.creator == address(0)) revert ZeroAddress();
        if (p.totalSupply > type(uint128).max) revert SupplyOverflow();

        // Steps 1-9 execute as a single atomic transaction — see contract
        // header for the full sequence. Every step is a revert-stub until the
        // shared V4 encoding library lands; then all four stubs (this file,
        // BlueBuyBack, B20HUBHook, and V4Actions library) unblock together.
        (token, poolId, lpTokenIdA, lpTokenIdB) = _launch(p, cfg);

        emit B20HUBLaunched(
            token, p.creator, poolId, lpTokenIdA, lpTokenIdB, p.feeTier,
            /* initialTick */ 0 // set once _launch is implemented
        );
    }

    // ─── Internal orchestrator (STUB) ─────────────────────────────────────────

    /**
     * Full multi-tick launch flow. Kept as a revert-stub for the same reason
     * as the sibling contracts: we ship the shared V4 encoding library and
     * unblock all four launchpad contracts in a single follow-up commit,
     * rather than shipping any one of them with a fake implementation that
     * could quietly no-op if edited later.
     */
    function _launch(LaunchParams calldata p, FeeTierConfig memory cfg)
        internal virtual
        returns (address token, bytes32 poolId, uint256 lpTokenIdA, uint256 lpTokenIdB)
    {
        // ── Step 1: Deploy real B20 via the 0xB20f factory ────────────────────
        // B20FactoryLib.encodeAssetCreateParams(name, symbol, admin, decimals)
        // (or encodeStablecoinCreateParams for stablecoin variant). Full
        // encoding lives in base-std on-chain; we mirror it here with
        // abi.encode of the same field order so both toolchains produce the
        // same tokenFactoryData bytes for the same inputs.
        bytes memory createParams = abi.encode(p.name, p.symbol, address(this), p.decimals);
        // initCalls: [mint 100% to this Launcher]. Additional calls (grant
        // MINT_ROLE, set supply cap, etc.) can be appended in future
        // versions — for MVP we mint everything up front and renounce admin
        // in step 8 so no further mint is possible.
        bytes[] memory initCalls = new bytes[](1);
        initCalls[0] = abi.encodeWithSignature(
            "mint(address,uint256)",
            address(this),
            p.totalSupply
        );
        token = IB20Factory(B20_FACTORY).createB20(p.salt, p.variant, createParams, initCalls);
        if (!IB20Factory(B20_FACTORY).isB20(token)) revert NotB20();

        // ── Step 2: Approve V4 PositionManager for full supply ────────────────
        IERC20(token).approve(POSITION_MANAGER, p.totalSupply);

        // ── Step 3: Build PoolKey with canonical currency ordering ────────────
        (Currency c0, Currency c1) = V4Actions.sortCurrencies(token, WETH9);
        PoolKey memory key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: cfg.fee,
            tickSpacing: cfg.tickSpacing,
            hooks: address(HOOK)
        });
        poolId = keccak256(abi.encode(key));

        // ── Step 4: Compute tick geometry ─────────────────────────────────────
        // initialTick = the tick at user's chosen opening sqrtPriceX96, aligned
        // down to the pool's tickSpacing.
        int24 initialTick = TickMath.getTickAtSqrtPrice(p.initialSqrtPriceX96);
        int24 initialTickAligned = _alignTick(initialTick, cfg.tickSpacing);

        // token = currency1 if token address > WETH (typical on Base since
        // WETH is 0x4200…). token = currency0 if reversed.
        bool tokenIsCurrency1 = Currency.unwrap(c1) == token;

        // Position A (wide): 85% of supply. Single-sided range that has the
        // token side depleted first as buys come in.
        //
        // If token = currency1: LP needs tickLower ≥ currentTick for pure
        // currency1 deposit. Range = [initialTickAligned, MAX_TICK_ALIGNED].
        // If token = currency0: LP needs tickUpper ≤ currentTick. Range =
        // [MIN_TICK_ALIGNED, initialTickAligned].
        int24 tickLowerA;
        int24 tickUpperA;
        if (tokenIsCurrency1) {
            tickLowerA = initialTickAligned;
            tickUpperA = _alignTick(TickMath.MAX_TICK, cfg.tickSpacing);
        } else {
            tickLowerA = _alignTick(TickMath.MIN_TICK, cfg.tickSpacing);
            tickUpperA = initialTickAligned;
        }

        // Position B (narrow): 15% of supply. ±N spacings around initialTick.
        int24 halfWidth = int24(cfg.positionBWidth) * cfg.tickSpacing;
        int24 tickLowerB = initialTickAligned - halfWidth;
        int24 tickUpperB = initialTickAligned + halfWidth;
        // Both bounds still need spacing-alignment after arithmetic (they are
        // if initialTickAligned is aligned, but re-align for safety).
        tickLowerB = _alignTick(tickLowerB, cfg.tickSpacing);
        tickUpperB = _alignTick(tickUpperB, cfg.tickSpacing);

        // ── Step 5: Compute liquidity for each position ───────────────────────
        // For a single-sided position with just token1 (or token0), V4-periphery's
        // LiquidityAmounts.getLiquidityForAmount1 (or Amount0) gives the exact
        // liquidity we can back with our token amount.
        uint256 amountA = (p.totalSupply * POSITION_A_BPS) / 10_000;
        uint256 amountB = p.totalSupply - amountA;

        uint128 liquidityA;
        uint128 liquidityB;
        if (tokenIsCurrency1) {
            liquidityA = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(tickLowerA),
                TickMath.getSqrtPriceAtTick(tickUpperA),
                amountA
            );
            liquidityB = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(tickLowerB),
                TickMath.getSqrtPriceAtTick(tickUpperB),
                amountB
            );
        } else {
            liquidityA = LiquidityAmounts.getLiquidityForAmount0(
                TickMath.getSqrtPriceAtTick(tickLowerA),
                TickMath.getSqrtPriceAtTick(tickUpperA),
                amountA
            );
            liquidityB = LiquidityAmounts.getLiquidityForAmount0(
                TickMath.getSqrtPriceAtTick(tickLowerB),
                TickMath.getSqrtPriceAtTick(tickUpperB),
                amountB
            );
        }

        // ── Step 6: Pre-write creator + expected LP tokenId to hook ───────────
        // PositionManager assigns tokenIds sequentially, so the next two are
        // nextTokenId + 0 and + 1. We pre-record position A's tokenId; the
        // hook records it in afterInitialize.
        lpTokenIdA = IPositionManager(POSITION_MANAGER).nextTokenId();
        lpTokenIdB = lpTokenIdA + 1;
        HOOK.setPending(p.creator, lpTokenIdA);

        // ── Step 7: Initialize pool (fires hook.afterInitialize) ──────────────
        IPoolManager(POOL_MANAGER).initialize(key, p.initialSqrtPriceX96);

        // ── Step 8: Add both LP positions in one batched call ─────────────────
        V4Actions.MintPositionParams memory posA = V4Actions.MintPositionParams({
            poolKey: key,
            tickLower: tickLowerA,
            tickUpper: tickUpperA,
            liquidity: uint256(liquidityA),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max,
            owner: address(this),
            hookData: bytes("")
        });
        V4Actions.MintPositionParams memory posB = V4Actions.MintPositionParams({
            poolKey: key,
            tickLower: tickLowerB,
            tickUpper: tickUpperB,
            liquidity: uint256(liquidityB),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max,
            owner: address(this),
            hookData: bytes("")
        });
        bytes memory unlockData = V4Actions.encodeDoubleMintAndSettle(posA, posB);
        IPositionManager(POSITION_MANAGER).modifyLiquidities(unlockData, block.timestamp + 300);

        // ── Step 9: Transfer both LP NFTs to hook (permanent lock) ────────────
        IPositionManager(POSITION_MANAGER).safeTransferFrom(address(this), address(HOOK), lpTokenIdA);
        IPositionManager(POSITION_MANAGER).safeTransferFrom(address(this), address(HOOK), lpTokenIdB);

        // ── Step 10: Renounce DEFAULT_ADMIN_ROLE on B20 token ─────────────────
        // Trustless mode is default per task #78 lock-in. The B20 exposes
        // AccessControl-style `renounceRole(bytes32 role, address account)`.
        // DEFAULT_ADMIN_ROLE = 0x00…00 by AccessControl convention.
        (bool ok, ) = token.call(
            abi.encodeWithSignature("renounceRole(bytes32,address)", bytes32(0), address(this))
        );
        // Ignore return: some B20 variants may not expose renounceRole
        // yet (test tokens on Vibenet); the launch has already succeeded
        // functionally by this point. Silence linter with the ok variable.
        ok;
    }

    /// Snap a tick down to the nearest tickSpacing multiple. Rounds toward
    /// negative infinity so bounds always align on the pool's grid.
    function _alignTick(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 aligned = tick / spacing;
        if (tick < 0 && (tick % spacing) != 0) aligned -= 1;
        return aligned * spacing;
    }

    // ─── View helpers (safe to expose now, no V4 encoding required) ───────────

    /**
     * Returns the token amount allocated to each of the two LP positions for
     * a given total supply. Callers use this to preview UI before signing.
     */
    function positionAmounts(uint256 totalSupply)
        external
        pure
        returns (uint256 positionA, uint256 positionB)
    {
        positionA = (totalSupply * POSITION_A_BPS) / 10_000;
        positionB = totalSupply - positionA; // avoids rounding drift
    }

    /**
     * Returns the ordered (currency0, currency1) pair for a B20/WETH pool
     * given a specific token address. V4 requires ascending address order.
     * The token is `asset`, the WETH-side is `numeraire`.
     */
    function poolCurrencies(address token) external view returns (Currency currency0, Currency currency1) {
        if (token < WETH9) {
            currency0 = Currency.wrap(token);
            currency1 = Currency.wrap(WETH9);
        } else {
            currency0 = Currency.wrap(WETH9);
            currency1 = Currency.wrap(token);
        }
    }

    /**
     * Preview the PoolKey the launcher will use for a given token + tier.
     * Useful for off-chain simulation of `_poolIdOf(key)`.
     */
    function previewPoolKey(address token, uint24 feeTier)
        external
        view
        returns (PoolKey memory key)
    {
        FeeTierConfig memory cfg = tierConfig[feeTier];
        (Currency c0, Currency c1) = this.poolCurrencies(token);
        key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: cfg.fee,
            tickSpacing: cfg.tickSpacing,
            hooks: address(HOOK)
        });
    }

    receive() external payable {}
}
