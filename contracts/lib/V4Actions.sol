// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { PoolKey, Currency } from "../B20HUBHook.sol";

/**
 * V4Actions — shared encoding library for Uniswap V4 periphery calls.
 *
 * V4 doesn't expose one-function-per-op APIs the way V3 did. Instead every
 * batched V4 caller (PositionManager.modifyLiquidities, UniversalRouter's
 * V4_SWAP command) takes a tightly-packed action stream:
 *
 *     abi.encode(bytes actions, bytes[] params)
 *
 * where `actions` is a byte array of action codes and `params[i]` is
 * abi.encode(...) of that action's arguments. This library builds those
 * blobs so B20HUBLauncher, B20HUBHook, and BlueBuyBack all use the SAME
 * encoding — misencoding an action byte or a param tuple silently produces
 * a call that reverts inside PoolManager with no useful error, which is
 * exactly the class of bug that's easy to ship if every caller rolls its
 * own encoder.
 *
 * === Action codes (v4-periphery/src/libraries/Actions.sol) ===
 * Copied verbatim from the audited Uniswap release. The full list is in
 * that file; we replicate only the ones we use, plus their exact byte
 * value, so a future auditor / reader can grep for the same constants.
 *
 * === UniversalRouter commands (Commands.sol) ===
 * V4_SWAP is one command (0x10); its input is itself an
 * (actions, params) blob, so the encoders here compose naturally.
 */
library V4Actions {
    // ─── Liquidity actions ────────────────────────────────────────────────────
    uint8 internal constant INCREASE_LIQUIDITY = 0x00;
    uint8 internal constant DECREASE_LIQUIDITY = 0x01;
    uint8 internal constant MINT_POSITION      = 0x02;
    uint8 internal constant BURN_POSITION      = 0x03;

    // ─── Swap actions ─────────────────────────────────────────────────────────
    uint8 internal constant SWAP_EXACT_IN_SINGLE  = 0x06;
    uint8 internal constant SWAP_EXACT_IN         = 0x07;
    uint8 internal constant SWAP_EXACT_OUT_SINGLE = 0x08;
    uint8 internal constant SWAP_EXACT_OUT        = 0x09;

    // ─── Settlement actions ───────────────────────────────────────────────────
    uint8 internal constant SETTLE       = 0x0b;
    uint8 internal constant SETTLE_ALL   = 0x0c;
    uint8 internal constant SETTLE_PAIR  = 0x0d;
    uint8 internal constant TAKE         = 0x0e;
    uint8 internal constant TAKE_ALL     = 0x0f;
    uint8 internal constant TAKE_PORTION = 0x10;
    uint8 internal constant TAKE_PAIR    = 0x11;
    uint8 internal constant CLOSE_CURRENCY = 0x12;
    uint8 internal constant CLEAR_OR_TAKE  = 0x14;

    // ─── Universal Router commands ────────────────────────────────────────────
    uint8 internal constant CMD_V4_SWAP = 0x10;

    // ─── Structs matching v4-periphery ────────────────────────────────────────

    /**
     * Params for a MINT_POSITION action, ABI-compatible with v4-periphery's
     * IPositionManager. Fields are in the exact order the encoder expects.
     */
    struct MintPositionParams {
        PoolKey poolKey;
        int24   tickLower;
        int24   tickUpper;
        uint256 liquidity;
        uint128 amount0Max;
        uint128 amount1Max;
        address owner;
        bytes   hookData;
    }

    /**
     * Params for a SWAP_EXACT_IN_SINGLE action.
     */
    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool    zeroForOne;     // swap direction: currency0 -> currency1
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes   hookData;
    }

    // ─── High-level encoders ──────────────────────────────────────────────────

    /**
     * Encode a full "mint one LP position + settle both currencies" batch for
     * PositionManager.modifyLiquidities.
     *
     * The action sequence is:
     *   MINT_POSITION  → burns liquidity math into the pool
     *   SETTLE_PAIR    → moves both currencies from msg.sender to PoolManager
     *
     * SETTLE_PAIR is essential: without it, PoolManager will revert on the
     * final "unlock" check because msg.sender never actually paid for the
     * liquidity minted. Getting this ordering wrong (SETTLE before MINT, or
     * SETTLE_ALL when currencies are known) is the #1 way to ship a broken
     * V4 liquidity call.
     */
    function encodeMintAndSettle(MintPositionParams memory p)
        internal
        pure
        returns (bytes memory unlockData)
    {
        bytes memory actions = new bytes(2);
        actions[0] = bytes1(MINT_POSITION);
        actions[1] = bytes1(SETTLE_PAIR);

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            p.poolKey,
            p.tickLower,
            p.tickUpper,
            p.liquidity,
            p.amount0Max,
            p.amount1Max,
            p.owner,
            p.hookData
        );
        params[1] = abi.encode(p.poolKey.currency0, p.poolKey.currency1);

        unlockData = abi.encode(actions, params);
    }

    /**
     * Encode a "mint TWO LP positions + settle once" batch for the
     * multi-tick launch flow in B20HUBLauncher. Both positions share the
     * same PoolKey (same B20/WETH pool), so we settle exactly once at the
     * end.
     */
    function encodeDoubleMintAndSettle(
        MintPositionParams memory posA,
        MintPositionParams memory posB
    ) internal pure returns (bytes memory unlockData) {
        require(
            _sameKey(posA.poolKey, posB.poolKey),
            "V4Actions: pool key mismatch between positions"
        );

        bytes memory actions = new bytes(3);
        actions[0] = bytes1(MINT_POSITION);
        actions[1] = bytes1(MINT_POSITION);
        actions[2] = bytes1(SETTLE_PAIR);

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            posA.poolKey, posA.tickLower, posA.tickUpper, posA.liquidity,
            posA.amount0Max, posA.amount1Max, posA.owner, posA.hookData
        );
        params[1] = abi.encode(
            posB.poolKey, posB.tickLower, posB.tickUpper, posB.liquidity,
            posB.amount0Max, posB.amount1Max, posB.owner, posB.hookData
        );
        params[2] = abi.encode(posA.poolKey.currency0, posA.poolKey.currency1);

        unlockData = abi.encode(actions, params);
    }

    /**
     * Encode a fee-only collection call — DECREASE_LIQUIDITY with delta=0
     * plus TAKE_PAIR. V4 uses the same modifyLiquidities entrypoint for
     * "just collect fees" as for real liquidity changes; the trick is
     * `liquidityDelta = 0` which is a no-op on liquidity but triggers a fee
     * snapshot into the caller's currency deltas, which TAKE_PAIR then
     * transfers out.
     *
     * Used by B20HUBHook._collectAndSplit to sweep accrued LP fees.
     */
    function encodeFeeCollection(
        PoolKey memory key,
        uint256 tokenId,
        address recipient
    ) internal pure returns (bytes memory unlockData) {
        bytes memory actions = new bytes(2);
        actions[0] = bytes1(DECREASE_LIQUIDITY);
        actions[1] = bytes1(TAKE_PAIR);

        bytes[] memory params = new bytes[](2);
        // DECREASE_LIQUIDITY params: (uint256 tokenId, uint256 liquidity,
        //   uint128 amount0Min, uint128 amount1Min, bytes hookData)
        params[0] = abi.encode(
            tokenId,
            uint256(0), // liquidity delta = 0 → collect-only
            uint128(0), // amount0Min — we accept 0 since it's fee-only
            uint128(0),
            bytes("")
        );
        // TAKE_PAIR params: (Currency c0, Currency c1, address recipient)
        params[1] = abi.encode(key.currency0, key.currency1, recipient);

        unlockData = abi.encode(actions, params);
    }

    /**
     * Encode a Universal Router V4 exact-input single-hop swap. This is
     * the outermost wrapping: Universal Router takes (commands, inputs),
     * where the input for CMD_V4_SWAP is itself an (actions, params) blob
     * for the V4 swap actions.
     *
     * Used by BlueBuyBack._swapV4ExactIn to convert accumulated fees into
     * $BLUEAGENT.
     */
    function encodeUniversalRouterSwapExactInSingle(ExactInputSingleParams memory p)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        // Inner V4 action sequence: swap, then settle input side, then take
        // output side.
        bytes memory innerActions = new bytes(3);
        innerActions[0] = bytes1(SWAP_EXACT_IN_SINGLE);
        innerActions[1] = bytes1(SETTLE_ALL); // pay input token
        innerActions[2] = bytes1(TAKE_ALL);   // pull output token

        bytes[] memory innerParams = new bytes[](3);
        innerParams[0] = abi.encode(p);
        // SETTLE_ALL: (Currency currency, uint256 maxAmount)
        Currency inCurrency = p.zeroForOne ? p.poolKey.currency0 : p.poolKey.currency1;
        Currency outCurrency = p.zeroForOne ? p.poolKey.currency1 : p.poolKey.currency0;
        innerParams[1] = abi.encode(inCurrency, uint256(p.amountIn));
        // TAKE_ALL: (Currency currency, uint256 minAmount)
        innerParams[2] = abi.encode(outCurrency, uint256(p.amountOutMinimum));

        bytes memory innerUnlockData = abi.encode(innerActions, innerParams);

        // Outer wrapping: 1 command (CMD_V4_SWAP), 1 input (the inner blob).
        commands = new bytes(1);
        commands[0] = bytes1(CMD_V4_SWAP);

        inputs = new bytes[](1);
        inputs[0] = innerUnlockData;
    }

    // ─── Currency + PoolKey helpers ───────────────────────────────────────────

    /**
     * Sort two currency addresses ascending, which V4 requires for a valid
     * PoolKey. Any V4 caller that gets this wrong will end up initializing a
     * completely different pool from the one they intended.
     */
    function sortCurrencies(address a, address b)
        internal
        pure
        returns (Currency currency0, Currency currency1)
    {
        if (a < b) {
            currency0 = Currency.wrap(a);
            currency1 = Currency.wrap(b);
        } else {
            currency0 = Currency.wrap(b);
            currency1 = Currency.wrap(a);
        }
    }

    /**
     * V4's canonical poolId. Same formula as B20HUBHook._poolIdOf — we keep
     * both because the hook needs it in a hot path and inlining beats
     * external library call, but every OTHER caller (launcher, tests,
     * off-chain script) should use this one for consistency.
     */
    function poolIdOf(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// Cheap equality check on two PoolKey structs. Not using keccak because
    /// PoolKey contains an `address hooks` field with 12 bytes of padding
    /// that could differ between struct literals produced by different code
    /// paths, whereas the individual field comparison is exact.
    function _sameKey(PoolKey memory a, PoolKey memory b) private pure returns (bool) {
        return
            Currency.unwrap(a.currency0) == Currency.unwrap(b.currency0) &&
            Currency.unwrap(a.currency1) == Currency.unwrap(b.currency1) &&
            a.fee == b.fee &&
            a.tickSpacing == b.tickSpacing &&
            a.hooks == b.hooks;
    }
}
