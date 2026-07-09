// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { BlueBuyBack }     from "../contracts/BlueBuyBack.sol";
import { B20HUBHook, PoolKey, Currency } from "../contracts/B20HUBHook.sol";
import { B20HUBLauncher }  from "../contracts/B20HUBLauncher.sol";

/**
 * DeployB20HUB — orchestrated deployment of the B20HUB launchpad stack.
 *
 * === What this script does, in order ===
 *   1. Reads config from env vars (chain-specific).
 *   2. Deploys BlueBuyBack — configured with real BLUE/WETH V4 pool key
 *      built inside the constructor.
 *   3. Deploys B20HUBHook using CREATE2 with a caller-supplied salt (mined
 *      offchain via scripts/mine-b20hub-hook-salt.ts so the deployed address
 *      has bits 12 + 9 set for AFTER_INITIALIZE + BEFORE_REMOVE_LIQUIDITY,
 *      matching the exact hook callbacks the contract implements).
 *   4. Deploys B20HUBLauncher with the hook + factory + V4 addresses.
 *   5. Calls buyback.setupPermit2Approvals() so the buyback can spend WETH
 *      through UniversalRouter on the first distribute().
 *
 * All three contracts land in ONE forge script invocation. Roll-back
 * semantics: if any step reverts, the whole broadcast is dropped and no
 * partial deployment lands on chain. Perfect for CI dry-runs and mainnet.
 *
 * === Usage ===
 *
 *   # 1. Mine the hook CREATE2 salt (see scripts/mine-b20hub-hook-salt.ts)
 *   export DEPLOYER=0xYourDeployerEOA
 *   export POOL_MANAGER=0x498581Ff718922c3f8e6A244956aF099B2652b2b
 *   export POSITION_MANAGER=0x7C5f5A4bBd8fD63184577525326123B519429bDc
 *   export BUYBACK=0x...      # deploy this FIRST if using nonce prediction,
 *                               # otherwise use a placeholder + redo salt
 *                               # once you know BlueBuyBack's real address
 *   export TREASURY=0x...     # BlueAgent multisig
 *   npx tsx scripts/mine-b20hub-hook-salt.ts
 *   # copy the printed salt
 *
 *   # 2. Deploy against Base Sepolia (recommended first pass)
 *   forge script script/DeployB20HUB.s.sol \
 *     --sig 'run(bytes32)' <salt> \
 *     --rpc-url $BASE_SEPOLIA_RPC \
 *     --private-key $DEPLOYER_KEY \
 *     --broadcast --verify
 *
 *   # 3. If Sepolia deploy + smoke test pass, repeat for Base mainnet:
 *   forge script script/DeployB20HUB.s.sol \
 *     --sig 'run(bytes32)' <salt> \
 *     --rpc-url $BASE_RPC \
 *     --private-key $DEPLOYER_KEY \
 *     --broadcast --verify
 */
contract DeployB20HUB is Script {
    // ─── Base mainnet defaults (verified — see lib/b20hub/constants.ts) ───────
    // Chain-specific overrides via env vars; script picks env if set else these.
    address constant DEFAULT_B20_FACTORY      = 0xB20f000000000000000000000000000000000000;
    address constant DEFAULT_POOL_MANAGER     = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant DEFAULT_POSITION_MANAGER = 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    address constant DEFAULT_UNIVERSAL_ROUTER = 0x6fF5693b99212Da76ad316178A184AB56D299b43;
    address constant DEFAULT_PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant DEFAULT_WETH9            = 0x4200000000000000000000000000000000000006;
    address constant DEFAULT_BLUE             = 0xF895783B2931c919955E18B5e3343e7C7c456bA3;

    // Buyback threshold: 0.001 WETH (~ $3 at present prices). Below this, the
    // permissionless keeper distribute() reverts to avoid wasting gas on
    // dust-sized swaps. Owner can retune post-deploy.
    uint256 constant DEFAULT_BUYBACK_THRESHOLD = 1e15;

    // ─── BLUE/WETH V4 pool key on Base mainnet ───────────────────────────────
    // Discovered via Initialize event lookup at block 43,350,950
    // (tx 0x26514d…8725). Set into BlueBuyBack via setBluePoolKey after
    // construction. See contracts/test/BlueBuyBack.fork.t.sol for the exact
    // provenance + a passing round-trip test that validates this key works.
    //
    // Base Sepolia has no equivalent BLUE/WETH pool yet. On Sepolia this
    // step gets skipped (via env flag) and BlueBuyBack.distribute() reverts
    // on the pool-not-set guard until we deploy a Sepolia BLUE analogue.
    uint24  constant BLUE_POOL_FEE          = 0x800000; // DYNAMIC_FEE_FLAG
    int24   constant BLUE_POOL_TICK_SPACING = 200;
    address constant BLUE_POOL_HOOKS        = 0xbB7784A4d481184283Ed89619A3e3ed143e1Adc0;

    struct Config {
        address b20Factory;
        address poolManager;
        address positionManager;
        address universalRouter;
        address permit2;
        address weth9;
        address blue;
        address treasury;
        uint256 buybackThreshold;
    }

    /**
     * Entry point. `salt` is a 32-byte CREATE2 salt, mined offchain so the
     * resulting B20HUBHook address has bit 12 (AFTER_INITIALIZE) and bit 9
     * (BEFORE_REMOVE_LIQUIDITY) set. Deployer must be the same address that
     * ran the salt miner (miner takes DEPLOYER as input).
     */
    function run(bytes32 salt) external returns (
        address buybackAddr,
        address hookAddr,
        address launcherAddr
    ) {
        Config memory cfg = _readConfig();

        vm.startBroadcast();

        // ── Step 1: BlueBuyBack ───────────────────────────────────────────────
        // Payout recipient is the treasury for MVP. When the stake-side
        // distributor ships, we deploy a fresh BlueBuyBack pointing there —
        // the current payoutRecipient is immutable by design.
        BlueBuyBack buyback = new BlueBuyBack(
            cfg.blue,
            cfg.weth9,
            cfg.universalRouter,
            cfg.permit2,
            cfg.treasury, // payoutRecipient
            cfg.buybackThreshold
        );
        console.log("BlueBuyBack:      ", address(buyback));

        // ── Step 2: B20HUBHook via CREATE2 with the mined salt ────────────────
        // Using `new` with { salt: ... } compiles to CREATE2 opcode; the
        // resulting address matches what the offchain miner computed as long
        // as (deployer, salt, initCodeHash) all match.
        B20HUBHook hook = new B20HUBHook{ salt: salt }(
            cfg.poolManager,
            cfg.positionManager,
            address(buyback), // 15% share routes here
            cfg.treasury      //  5% share routes here
        );
        console.log("B20HUBHook:       ", address(hook));

        // Guardrail: verify the deployed hook address actually has the two
        // required permission bits set. If the salt was mined against a
        // different initCodeHash (e.g. constructor args differ from what the
        // miner used), the deploy will land at a wrong-bit address and we'd
        // rather revert here than let a broken hook go live.
        uint160 addrBits = uint160(address(hook)) & 0x3fff;
        require(
            addrBits == 0x1200,
            "DeployB20HUB: hook address bits mismatch - re-mine salt with current constructor args"
        );

        // ── Step 3: B20HUBLauncher ────────────────────────────────────────────
        B20HUBLauncher launcher = new B20HUBLauncher(
            cfg.b20Factory,
            cfg.poolManager,
            cfg.positionManager,
            cfg.weth9,
            address(hook)
        );
        console.log("B20HUBLauncher:   ", address(launcher));

        // ── Step 4: BLUE/WETH pool key + Permit2 approvals ─────────────────────
        // On Base mainnet the BLUE/WETH V4 pool is live at poolId 0x3245fb…
        // and its exact key was discovered via Initialize log lookup. On any
        // other chain (Sepolia, etc.) the pool doesn't exist yet, so we skip
        // this step and the owner will call setBluePoolKey manually once a
        // pool is deployed. Skip flag comes from env SKIP_BLUE_POOL_KEY=1.
        bool skipBluePool = false;
        try vm.envBool("SKIP_BLUE_POOL_KEY") returns (bool v) { skipBluePool = v; } catch {}

        if (!skipBluePool) {
            PoolKey memory bluePool = _buildBluePoolKey(cfg.blue, cfg.weth9);
            buyback.setBluePoolKey(bluePool);
            console.log("BLUE/WETH pool key set");
        } else {
            console.log("BLUE/WETH pool key SKIPPED (SKIP_BLUE_POOL_KEY=1)");
            console.log("  -> owner must call setBluePoolKey before first distribute()");
        }

        buyback.setupPermit2Approvals();
        console.log("Permit2 approvals set for BlueBuyBack");

        vm.stopBroadcast();

        buybackAddr  = address(buyback);
        hookAddr     = address(hook);
        launcherAddr = address(launcher);

        console.log("");
        console.log("=== Deployment summary ===");
        console.log("BlueBuyBack     ", buybackAddr);
        console.log("B20HUBHook      ", hookAddr);
        console.log("B20HUBLauncher  ", launcherAddr);
        console.log("Treasury        ", cfg.treasury);
        console.log("");
        console.log("Next steps:");
        console.log("  1. Verify all 3 contracts on Basescan (forge --verify handles this)");
        console.log("  2. Update apps/web/src/lib/b20hub/constants.ts with these addresses");
        console.log("  3. Backend /api/b20hub/prepare wires launcher.launch() calldata");
        console.log("  4. Test one real launch with a tiny amount before wide release");
    }

    /**
     * Reads env-based config with fallback to Base mainnet defaults. Missing
     * env vars default to production addresses so the script "just works" on
     * mainnet; Sepolia deployment MUST override at least POOL_MANAGER +
     * POSITION_MANAGER + BLUE (B20 factory address is the same 0xB20f… on
     * both chains per Base protocol convention).
     */
    function _readConfig() internal view returns (Config memory cfg) {
        cfg.b20Factory       = _envOr("B20_FACTORY",      DEFAULT_B20_FACTORY);
        cfg.poolManager      = _envOr("POOL_MANAGER",     DEFAULT_POOL_MANAGER);
        cfg.positionManager  = _envOr("POSITION_MANAGER", DEFAULT_POSITION_MANAGER);
        cfg.universalRouter  = _envOr("UNIVERSAL_ROUTER", DEFAULT_UNIVERSAL_ROUTER);
        cfg.permit2          = _envOr("PERMIT2",          DEFAULT_PERMIT2);
        cfg.weth9            = _envOr("WETH9",            DEFAULT_WETH9);
        cfg.blue             = _envOr("BLUE",             DEFAULT_BLUE);
        cfg.treasury         = vm.envAddress("TREASURY"); // required — no default
        cfg.buybackThreshold = vm.envOr("BUYBACK_THRESHOLD", DEFAULT_BUYBACK_THRESHOLD);
    }

    function _envOr(string memory key, address fallbackAddr) internal view returns (address) {
        try vm.envAddress(key) returns (address v) {
            return v;
        } catch {
            return fallbackAddr;
        }
    }

    /**
     * Build the BLUE/WETH V4 pool key with canonical currency ordering.
     * V4 requires currency0 < currency1. On Base, WETH's 0x4200… is always
     * numerically less than BLUE's 0xf895…, so WETH is currency0 — but we
     * still sort dynamically for correctness on any chain.
     */
    function _buildBluePoolKey(address blue, address weth) internal pure returns (PoolKey memory key) {
        if (weth < blue) {
            key.currency0 = Currency.wrap(weth);
            key.currency1 = Currency.wrap(blue);
        } else {
            key.currency0 = Currency.wrap(blue);
            key.currency1 = Currency.wrap(weth);
        }
        key.fee         = BLUE_POOL_FEE;
        key.tickSpacing = BLUE_POOL_TICK_SPACING;
        key.hooks       = BLUE_POOL_HOOKS;
    }
}
