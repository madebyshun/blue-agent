// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { B20HUBLauncher } from "../B20HUBLauncher.sol";
import { B20HUBHook, PoolKey, Currency } from "../B20HUBHook.sol";

/**
 * B20HUBLauncher unit tests — pure view + config validation. No real V4
 * PoolManager, no B20Factory, no PositionManager needed.
 *
 * The full _launch flow (calls to B20 factory + V4 initialize + double
 * modifyLiquidities + LP NFT transfer + admin renounce) is covered by
 * B20HUBLauncher.fork.t.sol against Base mainnet fork.
 *
 * Here we lock in:
 *   • Constructor + zero-address guardrails
 *   • Fee-tier config table populated for 3000 / 10000 / 30000 with the
 *     correct tick spacings (matches V3 defaults so V4 pool init succeeds
 *     against the audited tickSpacing invariants)
 *   • positionAmounts view: 85/15 split, no rounding drift
 *   • poolCurrencies view: correct address-ascending ordering
 *   • previewPoolKey view: complete PoolKey construction
 */
contract B20HUBLauncherUnitTest is Test {
    B20HUBLauncher internal launcher;
    B20HUBHook     internal hook;

    address internal b20Factory;
    address internal poolManager;
    address internal positionManager;
    address internal permit2;
    address internal weth9;

    function setUp() public {
        b20Factory      = makeAddr("b20Factory");
        poolManager     = makeAddr("poolManager");
        positionManager = makeAddr("positionManager");
        permit2         = makeAddr("permit2");
        weth9           = makeAddr("weth9");

        hook = new B20HUBHook(
            poolManager,
            positionManager,
            makeAddr("buyback"),
            makeAddr("treasury")
        );

        launcher = new B20HUBLauncher(
            b20Factory,
            poolManager,
            positionManager,
            permit2,
            weth9,
            address(hook)
        );
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public {
        assertEq(launcher.B20_FACTORY(),      b20Factory);
        assertEq(launcher.POOL_MANAGER(),     poolManager);
        assertEq(launcher.POSITION_MANAGER(), positionManager);
        assertEq(launcher.WETH9(),            weth9);
        assertEq(address(launcher.HOOK()),    address(hook));
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(B20HUBLauncher.ZeroAddress.selector);
        new B20HUBLauncher(address(0), poolManager, positionManager, permit2, weth9, address(hook));

        vm.expectRevert(B20HUBLauncher.ZeroAddress.selector);
        new B20HUBLauncher(b20Factory, address(0), positionManager, permit2, weth9, address(hook));

        vm.expectRevert(B20HUBLauncher.ZeroAddress.selector);
        new B20HUBLauncher(b20Factory, poolManager, address(0), permit2, weth9, address(hook));

        vm.expectRevert(B20HUBLauncher.ZeroAddress.selector);
        new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, address(0), address(hook));

        vm.expectRevert(B20HUBLauncher.ZeroAddress.selector);
        new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, weth9, address(0));
    }

    // ─── Fee-tier config ──────────────────────────────────────────────────────

    function test_tierConfig_3000_setCorrectly() public {
        (uint24 fee, int24 spacing, int24 width) = launcher.tierConfig(3000);
        assertEq(fee, 3000);
        assertEq(spacing, int24(60));
        assertEq(width, int24(20));
    }

    function test_tierConfig_10000_setCorrectly() public {
        (uint24 fee, int24 spacing, int24 width) = launcher.tierConfig(10000);
        assertEq(fee, 10000);
        assertEq(spacing, int24(200));
        assertEq(width, int24(20));
    }

    function test_tierConfig_30000_setCorrectly() public {
        (uint24 fee, int24 spacing, int24 width) = launcher.tierConfig(30000);
        assertEq(fee, 30000);
        assertEq(spacing, int24(600));
        assertEq(width, int24(20));
    }

    function test_tierConfig_unsupportedTierReturnsZero() public {
        (uint24 fee, , ) = launcher.tierConfig(500);
        // Unset entry → default struct → fee == 0. _launch uses this to
        // detect + revert UnsupportedFeeTier before doing any work.
        assertEq(fee, 0);
    }

    // ─── positionAmounts view ─────────────────────────────────────────────────

    function test_positionAmounts_85_15_split() public {
        (uint256 a, uint256 b) = launcher.positionAmounts(100_000_000_000e18);
        // Position A: 85 000 000 000e18
        assertEq(a, 85_000_000_000e18, "Position A should be 85% of supply");
        // Position B: 15 000 000 000e18
        assertEq(b, 15_000_000_000e18, "Position B should be 15% of supply");
        // Sum must equal the input EXACTLY (no rounding drift).
        assertEq(a + b, 100_000_000_000e18);
    }

    function test_positionAmounts_absorbsRoundingRemainder() public {
        // Use a supply that doesn't divide evenly by 10_000 to prove the
        // rounding-drift-safety: A = floor(total * 8500 / 10000),
        // B = total - A. Result: B may end up 1 wei larger than the exact
        // 15%, but the sum is always exactly the input.
        uint256 supply = 10_000_000_000e18 + 7; // + 7 wei so 8500/10000 loses precision
        (uint256 a, uint256 b) = launcher.positionAmounts(supply);
        assertEq(a + b, supply, "sum must equal input exactly");
    }

    function test_positionAmounts_zeroSupply() public {
        (uint256 a, uint256 b) = launcher.positionAmounts(0);
        assertEq(a, 0);
        assertEq(b, 0);
    }

    // ─── poolCurrencies view ──────────────────────────────────────────────────

    function test_poolCurrencies_wethIsCurrency0WhenSmaller() public {
        // WETH address < token address → WETH = currency0.
        address token = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;
        address low   = 0x0100000000000000000000000000000000000000;
        launcher = new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, low, address(hook));

        (Currency c0, Currency c1) = launcher.poolCurrencies(token);
        assertEq(Currency.unwrap(c0), low,    "currency0 should be lower address");
        assertEq(Currency.unwrap(c1), token,  "currency1 should be higher address");
    }

    function test_poolCurrencies_tokenIsCurrency0WhenSmaller() public {
        // Token address < WETH address → token = currency0.
        address token = 0x0100000000000000000000000000000000000000;
        address hi    = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;
        launcher = new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, hi, address(hook));

        (Currency c0, Currency c1) = launcher.poolCurrencies(token);
        assertEq(Currency.unwrap(c0), token, "currency0 should be lower address");
        assertEq(Currency.unwrap(c1), hi,    "currency1 should be higher address");
    }

    function test_poolCurrencies_realBaseWeth() public {
        // Real Base WETH is 0x4200… which is < almost every deployed token.
        // Our production launcher will be built against this, so verify the
        // ordering matches expectations.
        address baseWeth = 0x4200000000000000000000000000000000000006;
        address token    = 0xF895783B2931c919955E18B5e3343e7C7c456bA3; // $BLUEAGENT
        launcher = new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, baseWeth, address(hook));

        (Currency c0, Currency c1) = launcher.poolCurrencies(token);
        assertEq(Currency.unwrap(c0), baseWeth, "WETH < BLUE, so WETH = currency0");
        assertEq(Currency.unwrap(c1), token,    "BLUE > WETH, so BLUE = currency1");
    }

    // ─── previewPoolKey view ──────────────────────────────────────────────────

    function test_previewPoolKey_returnsExpectedShape() public {
        address token = 0xF895783B2931c919955E18B5e3343e7C7c456bA3;
        address baseWeth = 0x4200000000000000000000000000000000000006;
        launcher = new B20HUBLauncher(b20Factory, poolManager, positionManager, permit2, baseWeth, address(hook));

        PoolKey memory key = launcher.previewPoolKey(token, 10000);
        assertEq(Currency.unwrap(key.currency0), baseWeth);
        assertEq(Currency.unwrap(key.currency1), token);
        assertEq(uint256(key.fee), 10000);
        assertEq(int256(key.tickSpacing), int256(200));
        assertEq(key.hooks, address(hook));
    }

    function test_previewPoolKey_unsupportedTierReturnsEmpty() public {
        // For an unsupported tier the tierConfig lookup returns fee=0 +
        // tickSpacing=0. The view doesn't revert; it returns an
        // obviously-invalid key. Real _launch reverts UnsupportedFeeTier
        // BEFORE reaching this preview path.
        PoolKey memory key = launcher.previewPoolKey(makeAddr("token"), 500);
        assertEq(uint256(key.fee), 0);
        assertEq(int256(key.tickSpacing), 0);
    }
}
