// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { B20HUBHook, PoolKey, Currency, ModifyLiquidityParams } from "../B20HUBHook.sol";

/**
 * B20HUBHook unit tests — pure fee-split + LP-lock logic. No real V4
 * PoolManager or PositionManager needed; we `vm.prank` from the mocked
 * addresses and assert the hook's internal state / reverts.
 *
 * The V4-callback path (real PoolManager calling afterInitialize + fee
 * collection) is tested in the fork integration suite. Here we validate:
 *   • constructor guardrails
 *   • setPending → afterInitialize binding correctness
 *   • beforeRemoveLiquidity ALWAYS reverts
 *   • onERC721Received only accepts calls from POSITION_MANAGER
 *   • claimFees param validation (poolId ↔ key match)
 *   • constant fee-split math sums to exactly the input (no drift)
 */

// Mock ERC20 that reverts if _safeTransfer is called with insufficient balance.
contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract B20HUBHookUnitTest is Test {
    B20HUBHook internal hook;

    address internal poolManager;
    address internal positionManager;
    address internal buyback;
    address internal treasury;

    function setUp() public {
        poolManager     = makeAddr("poolManager");
        positionManager = makeAddr("positionManager");
        buyback         = makeAddr("buyback");
        treasury        = makeAddr("treasury");

        hook = new B20HUBHook(poolManager, positionManager, buyback, treasury);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public {
        assertEq(hook.POOL_MANAGER(),     poolManager);
        assertEq(hook.POSITION_MANAGER(), positionManager);
        assertEq(hook.BUYBACK(),          buyback);
        assertEq(hook.TREASURY(),         treasury);
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(B20HUBHook.ZeroAddress.selector);
        new B20HUBHook(address(0), positionManager, buyback, treasury);

        vm.expectRevert(B20HUBHook.ZeroAddress.selector);
        new B20HUBHook(poolManager, address(0), buyback, treasury);

        vm.expectRevert(B20HUBHook.ZeroAddress.selector);
        new B20HUBHook(poolManager, positionManager, address(0), treasury);

        vm.expectRevert(B20HUBHook.ZeroAddress.selector);
        new B20HUBHook(poolManager, positionManager, buyback, address(0));
    }

    function test_feeSplitConstants_sumTo10000() public {
        // Sanity: the three BPS constants must exactly sum to 10_000, otherwise
        // some tiny slice of every fee leaks or double-counts on integer division.
        uint16 total = hook.CREATOR_BPS() + hook.BUYBACK_BPS() + hook.TREASURY_BPS();
        assertEq(total, 10_000, "fee split BPS must sum to 10_000");
        assertEq(hook.CREATOR_BPS(),  8000);
        assertEq(hook.BUYBACK_BPS(),  1500);
        assertEq(hook.TREASURY_BPS(),  500);
    }

    // ─── setPending → afterInitialize binding ─────────────────────────────────

    function test_afterInitialize_bindsCreator() public {
        address creator = makeAddr("creator");
        uint256 tokenId = 42;
        PoolKey memory key = _dummyKey();
        bytes32 poolId = keccak256(abi.encode(key));

        // Anyone can call setPending — the values are consumed immediately by
        // afterInitialize in the same tx, so at worst a griefer wastes gas.
        hook.setPending(creator, tokenId);

        // afterInitialize must come from PoolManager.
        vm.prank(poolManager);
        bytes4 sel = hook.afterInitialize(address(0), key, 0, 0);
        assertEq(sel, hook.afterInitialize.selector);

        assertEq(hook.creatorOfPool(poolId),   creator);
        assertEq(hook.lpTokenIdOfPool(poolId), tokenId);
    }

    function test_afterInitialize_revertsWithoutPending() public {
        // Without setPending, _pendingCreator is address(0) → afterInitialize
        // hits the PoolNotBound guard. Prevents stray inits with our hook
        // from creating unowned pools.
        PoolKey memory key = _dummyKey();

        vm.prank(poolManager);
        vm.expectRevert(B20HUBHook.PoolNotBound.selector);
        hook.afterInitialize(address(0), key, 0, 0);
    }

    function test_afterInitialize_revertsIfNotPoolManager() public {
        hook.setPending(makeAddr("creator"), 42);
        PoolKey memory key = _dummyKey();

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(B20HUBHook.NotPoolManager.selector);
        hook.afterInitialize(address(0), key, 0, 0);
    }

    function test_afterInitialize_clearsPendingAfterConsume() public {
        // After binding one pool, _pendingCreator is cleared. A second
        // init call without a fresh setPending reverts PoolNotBound.
        address creator = makeAddr("creator");
        hook.setPending(creator, 1);
        PoolKey memory key1 = _dummyKey();

        vm.prank(poolManager);
        hook.afterInitialize(address(0), key1, 0, 0);

        // Now a second init with a different key hits the guard because
        // pending was cleared.
        PoolKey memory key2 = _dummyKey();
        key2.fee = 3000; // differ so poolId is different

        vm.prank(poolManager);
        vm.expectRevert(B20HUBHook.PoolNotBound.selector);
        hook.afterInitialize(address(0), key2, 0, 0);
    }

    // ─── beforeRemoveLiquidity ALWAYS reverts ─────────────────────────────────

    function test_beforeRemoveLiquidity_alwaysReverts() public {
        PoolKey memory key = _dummyKey();
        ModifyLiquidityParams memory p;

        vm.prank(poolManager);
        vm.expectRevert(B20HUBHook.LpRemovalForbidden.selector);
        hook.beforeRemoveLiquidity(makeAddr("someone"), key, p, "");
    }

    function test_beforeRemoveLiquidity_revertsIfNotPoolManager() public {
        PoolKey memory key = _dummyKey();
        ModifyLiquidityParams memory p;

        // Non-PoolManager gets NotPoolManager (guard runs first), NOT
        // LpRemovalForbidden — since a stranger shouldn't even reach that
        // codepath.
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(B20HUBHook.NotPoolManager.selector);
        hook.beforeRemoveLiquidity(makeAddr("someone"), key, p, "");
    }

    // ─── onERC721Received ─────────────────────────────────────────────────────

    function test_onERC721Received_acceptsFromPositionManager() public {
        vm.prank(positionManager);
        bytes4 sel = hook.onERC721Received(address(0), address(0), 1, "");
        // ERC721Receiver selector.
        assertEq(sel, bytes4(0x150b7a02));
    }

    function test_onERC721Received_rejectsFromStranger() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(B20HUBHook.NotPositionManager.selector);
        hook.onERC721Received(address(0), address(0), 1, "");
    }

    // ─── claimFees param validation ───────────────────────────────────────────

    function test_claimFees_revertsIfPoolNotBound() public {
        PoolKey memory key = _dummyKey();
        bytes32 poolId = keccak256(abi.encode(key));

        vm.expectRevert(B20HUBHook.PoolNotBound.selector);
        hook.claimFees(poolId, key);
    }

    function test_claimFees_revertsOnPoolIdKeyMismatch() public {
        // Bind pool A.
        address creator = makeAddr("creator");
        hook.setPending(creator, 1);
        PoolKey memory keyA = _dummyKey();
        bytes32 poolIdA = keccak256(abi.encode(keyA));

        vm.prank(poolManager);
        hook.afterInitialize(address(0), keyA, 0, 0);

        // Attempt claim with pool A's id but pool B's key — must revert
        // via the poolId ↔ key match check, not proceed to the collect
        // (which would drain the wrong pool's fees to the wrong creator).
        PoolKey memory keyB = _dummyKey();
        keyB.fee = 30000;

        vm.expectRevert(B20HUBHook.PoolNotBound.selector);
        hook.claimFees(poolIdA, keyB);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _dummyKey() internal view returns (PoolKey memory k) {
        k = PoolKey({
            currency0: Currency.wrap(address(0x1111)),
            currency1: Currency.wrap(address(0x2222)),
            fee: 10000,
            tickSpacing: int24(200),
            hooks: address(hook)
        });
    }
}
