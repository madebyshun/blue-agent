// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test, console } from "forge-std/Test.sol";
import { BlueBuyBack } from "../BlueBuyBack.sol";
import { PoolKey, Currency } from "../B20HUBHook.sol";

/**
 * BlueBuyBack fork tests — validates the UniversalRouter V4 swap encoding
 * against the REAL live BLUE/WETH pool at 0x3245fb…08c8d on Base mainnet.
 *
 * Why fork tests here specifically: BlueBuyBack._swapV4ExactIn produces a
 * (commands, inputs) blob that gets passed to Universal Router. If ANY of
 * the byte-level packing is wrong — action ordering, PoolKey field
 * encoding, currency direction, uint128 vs uint256 — Universal Router
 * reverts inside its own lock/unlock cycle with no useful error. Unit
 * tests can't catch this class of bug because they use mocks; only a real
 * V4 pool exercises the encoding all the way through.
 *
 * Run with:
 *   forge test --match-contract BlueBuyBackForkTest \
 *              --fork-url $BASE_RPC \
 *              -vvv
 *
 * If BASE_RPC isn't set, the test suite skips itself automatically so
 * regular `forge test` runs (unit-only) don't fail on missing infra.
 *
 * Uses `deal()` cheatcode to fund the buyback with WETH, then calls
 * distribute() and asserts BLUE landed in the right places (keeper +
 * payoutRecipient).
 */

interface IWETH9 {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

contract BlueBuyBackForkTest is Test {
    // Real Base mainnet addresses (verified in lib/b20hub/constants.ts).
    address constant BLUE     = 0xF895783B2931c919955E18B5e3343e7C7c456bA3;
    address constant WETH9    = 0x4200000000000000000000000000000000000006;
    address constant ROUTER   = 0x6fF5693b99212Da76ad316178A184AB56D299b43;
    address constant PERMIT2  = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    BlueBuyBack internal buyback;
    address     internal recipient;

    function setUp() public {
        // Skip the whole suite if no fork URL configured — this lets
        // regular unit `forge test` runs finish cleanly.
        try vm.envString("BASE_RPC") returns (string memory) {
            // ok, has env
        } catch {
            vm.skip(true);
        }

        recipient = makeAddr("payoutRecipient");
        buyback = new BlueBuyBack(
            BLUE, WETH9, ROUTER, PERMIT2, recipient,
            1e15 // threshold: 0.001 WETH
        );

        // BLUE/WETH V4 pool key — DISCOVERED via Base mainnet Initialize
        // event lookup at block 43,350,950 (tx 0x26514d…8725):
        //   fee         = 0x800000 (DYNAMIC_FEE_FLAG — hook sets fee per swap)
        //   tickSpacing = 200
        //   hooks       = 0xbB7784A4d481184283Ed89619A3e3ed143e1Adc0 (Doppler-style,
        //                 launched via Bankr / Whetstone Airlock most likely)
        // Because the pool has a custom hook, our buyback swap goes THROUGH
        // that hook's beforeSwap/afterSwap — whatever fee the hook decides
        // applies. This is fine for buybacks (we accept whatever slippage
        // the pool has at swap time; keeper reward covers gas).
        (Currency c0, Currency c1) = _sortCurrencies(WETH9, BLUE);
        PoolKey memory realKey = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 0x800000, // dynamic fee flag
            tickSpacing: int24(200),
            hooks: 0xbB7784A4d481184283Ed89619A3e3ed143e1Adc0
        });
        buyback.setBluePoolKey(realKey);

        // One-time approval so the router can pull WETH from us via Permit2.
        buyback.setupPermit2Approvals();
    }

    function _sortCurrencies(address a, address b) internal pure returns (Currency c0, Currency c1) {
        if (a < b) { c0 = Currency.wrap(a); c1 = Currency.wrap(b); }
        else       { c0 = Currency.wrap(b); c1 = Currency.wrap(a); }
    }

    // ─── Real swap round-trip ─────────────────────────────────────────────────

    function test_fork_distributeSwapsWethForBlue() public {
        // Fund buyback with 0.01 WETH via deal() — bypasses actual bridging.
        // deal() writes storage slot directly so it's much faster than a real
        // deposit + transfer chain.
        uint256 wethAmount = 0.01 ether;
        deal(WETH9, address(buyback), wethAmount);
        assertEq(IWETH9(WETH9).balanceOf(address(buyback)), wethAmount);

        uint256 blueBefore = IERC20(BLUE).balanceOf(recipient);
        uint256 keeperBlueBefore = IERC20(BLUE).balanceOf(address(this));

        // Distribute — this executes the V4 swap end-to-end.
        //   minBlueOut = 0 for the test (we're proving the encoding works,
        //   not enforcing slippage). Real UI passes a computed floor.
        //   deadline = now + 5 min.
        uint256 amountOut = _distribute(0, block.timestamp + 300);

        // BLUE landed at recipient + a keeper reward at msg.sender.
        uint256 blueAfter        = IERC20(BLUE).balanceOf(recipient);
        uint256 keeperBlueAfter  = IERC20(BLUE).balanceOf(address(this));

        uint256 keeperReward = keeperBlueAfter - keeperBlueBefore;
        uint256 recipientGot = blueAfter - blueBefore;

        // The event says amountOut was 100% of what came out of the swap.
        // Recipient + keeper split MUST equal amountOut exactly, no drift.
        assertEq(
            recipientGot + keeperReward,
            amountOut,
            "recipient + keeper reward must equal total BLUE bought"
        );

        // Keeper reward is 0.1% (10 bps) of the buyback. Assert within 1 wei
        // of the exact split (integer division rounding).
        uint256 expectedKeeper = (amountOut * 10) / 10_000;
        assertApproxEqAbs(keeperReward, expectedKeeper, 1, "keeper reward = 0.1% of amountOut");

        // WETH is drained.
        assertEq(IWETH9(WETH9).balanceOf(address(buyback)), 0, "WETH fully swept");

        console.log("Swapped %s WETH for %s BLUE", wethAmount, amountOut);
        console.log("Keeper reward: %s BLUE", keeperReward);
        console.log("Recipient got: %s BLUE", recipientGot);
    }

    function test_fork_distributeRespectsSlippageFloor() public {
        deal(WETH9, address(buyback), 0.01 ether);

        // Set minBlueOut absurdly high — buyback must revert.
        uint256 unrealisticMin = 1e30; // 1M BLUE for 0.01 WETH — impossible

        vm.expectRevert(); // could be from router OR our post-check
        _distribute(unrealisticMin, block.timestamp + 300);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    function _distribute(uint256 minOut, uint256 deadline) internal returns (uint256 amountOut) {
        (amountOut, ) = buyback.distribute(minOut, deadline);
    }
}
