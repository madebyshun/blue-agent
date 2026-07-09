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

    /// Hook permission mask: bits 12 (AFTER_INITIALIZE) + 9 (BEFORE_REMOVE_LIQUIDITY).
    uint160 constant HOOK_ADDRESS_MASK   = 0x3fff;
    uint160 constant HOOK_ADDRESS_TARGET = 0x1200;

    /**
     * Entry point — deploys the whole stack in one call, mines the CREATE2
     * salt in-EVM so the operator doesn't have to run the offchain miner
     * first. Typical run finishes < 8 seconds on a modern machine.
     *
     * Order:
     *   1. Deploy BlueBuyBack (regular new — nonce-based address)
     *   2. Mine hook salt using BuyBack's real address as constructor arg
     *   3. Deploy hook via CREATE2 at the mined address
     *   4. Deploy Launcher
     *   5. setBluePoolKey (unless SKIP_BLUE_POOL_KEY=1)
     *   6. setupPermit2Approvals
     */
    function run() external returns (
        address buybackAddr,
        address hookAddr,
        address launcherAddr
    ) {
        Config memory cfg = _readConfig();

        vm.startBroadcast();

        // ── Step 1: BlueBuyBack (regular deploy, nonce-based address) ─────────
        BlueBuyBack buyback = new BlueBuyBack(
            cfg.blue,
            cfg.weth9,
            cfg.universalRouter,
            cfg.permit2,
            cfg.treasury, // payoutRecipient
            cfg.buybackThreshold
        );
        console.log("BlueBuyBack:      ", address(buyback));

        // ── Step 2: mine hook CREATE2 salt with the real BuyBack address ──────
        // Building initCodeHash exactly matches how CREATE2 hashes at deploy
        // time — creationCode ++ abi.encoded constructor args, keccak the
        // whole thing.
        bytes memory initCode = abi.encodePacked(
            type(B20HUBHook).creationCode,
            abi.encode(cfg.poolManager, cfg.positionManager, address(buyback), cfg.treasury)
        );
        bytes32 initCodeHash = keccak256(initCode);
        bytes32 salt = _mineHookSalt(initCodeHash);
        console.log("Hook salt (mined in-EVM):");
        console.logBytes32(salt);

        // ── Step 3: Deploy B20HUBHook via CREATE2 at the mined address ────────
        B20HUBHook hook = new B20HUBHook{ salt: salt }(
            cfg.poolManager,
            cfg.positionManager,
            address(buyback),
            cfg.treasury
        );
        console.log("B20HUBHook:       ", address(hook));

        // Guardrail: verify the deployed hook address actually has the required
        // permission bits. Should always pass since we just mined it, but a
        // belt-and-suspenders check catches any accidental drift in mining logic.
        require(
            (uint160(address(hook)) & HOOK_ADDRESS_MASK) == HOOK_ADDRESS_TARGET,
            "DeployB20HUB: hook address bits mismatch - mining logic bug"
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
     * Iterate CREATE2 salts starting from 0 until one produces a hook
     * address whose low 14 bits equal HOOK_ADDRESS_TARGET (0x1200 =
     * AFTER_INITIALIZE_FLAG + BEFORE_REMOVE_LIQUIDITY_FLAG).
     *
     * Expected iterations: 2^14 / 2 ≈ 8,192 on average. Each iteration is
     * one CREATE2 address computation (keccak of 85 bytes), fast enough to
     * finish in < 8 s inside forge script even on stock hardware.
     */
    function _mineHookSalt(bytes32 initCodeHash) internal pure returns (bytes32) {
        // CREATE2 address = keccak256(0xff ++ deployer ++ salt ++ initCodeHash)[12:32].
        //
        // When forge script executes `new Foo{salt: s}(...)` during a broadcast,
        // it does NOT use CREATE2 from the script contract itself — it proxies
        // the deployment through Foundry's default deterministic CREATE2
        // Deployer at 0x4e59b44847b379578588920cA78FbF26c0B4956C (the Arachnid
        // proxy). So the CREATE2 hash preimage uses that proxy's address, not
        // msg.sender and not address(this). Mirror that exactly here.
        address deployer = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        for (uint256 i = 0; i < 1_000_000; i++) {
            bytes32 salt = bytes32(i);
            address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xff),
                deployer,
                salt,
                initCodeHash
            )))));
            if ((uint160(predicted) & HOOK_ADDRESS_MASK) == HOOK_ADDRESS_TARGET) {
                return salt;
            }
        }
        revert("DeployB20HUB: no salt found in 1M tries");
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
