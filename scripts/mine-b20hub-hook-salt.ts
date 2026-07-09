#!/usr/bin/env tsx
/**
 * Mine a CREATE2 salt so that B20HUBHook deploys at an address whose lowest
 * 14 bits equal 0x1200 (bits 12 + 9 set, all others zero). V4's PoolManager
 * checks the hook contract's own address to decide which callbacks to invoke:
 *
 *   AFTER_INITIALIZE_FLAG       = 1 << 12  →  0x1000
 *   BEFORE_REMOVE_LIQUIDITY_FLAG = 1 << 9  →  0x0200
 *   combined mask                            0x1200
 *
 * Only those two callbacks are implemented by B20HUBHook. Extra bits in the
 * hook address would tell PoolManager to invoke callbacks we don't have,
 * reverting every swap/init on the pool. Missing bits would skip our fee
 * split / LP-lock enforcement. Exact-match is the only correct answer.
 *
 * === What this script does ===
 *   1. Reads the compiled B20HUBHook bytecode from contracts/out.
 *   2. Encodes constructor args (poolManager, positionManager, buyback, treasury).
 *   3. Iterates salts starting from 0 and increments until CREATE2 with that
 *      salt + our initCode yields an address with (addr & 0x3fff) == 0x1200.
 *   4. Prints the found salt + address so it can be used with:
 *
 *        forge script script/DeployB20HUB.s.sol --sig 'run(bytes32)' <salt>
 *
 * On average it takes about 8192 iterations (2^13, since 14 bits with a
 * target 14-bit pattern is a 1-in-16384 hit but we accept any address where
 * the LOW 14 bits equal 0x1200 — so 2^14 = 16384 tries expected). Run time
 * ≈ a few seconds in Node.
 *
 * === Deployer address ===
 * CREATE2 uses the DEPLOYER address in the address derivation. Pass yours
 * via env DEPLOYER=0x... (default: 0x4e59b44847b379578588920cA78FbF26c0B4956C
 * — the canonical singleton "Create2Deployer" from OpenZeppelin, deployed
 * to that address on every EVM chain).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  keccak256,
  concat,
  type Hex,
} from "viem";

// ─── Config (from CLI / env) ─────────────────────────────────────────────────

const DEPLOYER =
  (process.env.DEPLOYER as `0x${string}`) ??
  "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // canonical Create2Deployer

// Constructor args — pass via env or CLI, else use placeholder addresses so
// the script still runs for salt-space testing. Real deployment MUST pass
// the real production addresses.
const POOL_MANAGER =
  (process.env.POOL_MANAGER as `0x${string}`) ??
  "0x498581Ff718922c3f8e6A244956aF099B2652b2b"; // Base mainnet
const POSITION_MANAGER =
  (process.env.POSITION_MANAGER as `0x${string}`) ??
  "0x7C5f5A4bBd8fD63184577525326123B519429bDc"; // Base mainnet
const BUYBACK =
  (process.env.BUYBACK as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000"; // placeholder
const TREASURY =
  (process.env.TREASURY as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000"; // placeholder

// Required address mask + target: (address & 0x3FFF) must equal 0x1200
const HOOK_MASK = 0x3fffn;
const HOOK_TARGET = 0x1200n; // AFTER_INITIALIZE (1<<12) + BEFORE_REMOVE_LIQUIDITY (1<<9)

// Max salts to try before giving up. 2^24 = ~16M — comfortably more than the
// expected 16K hits, so the script effectively always finds a salt.
const MAX_TRIES = 1 << 24;

// ─── Load compiled bytecode ──────────────────────────────────────────────────

interface ForgeArtifact {
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex };
}

function loadCreationCode(): Hex {
  // Foundry output layout: contracts/out/<Contract>.sol/<Contract>.json
  const path = resolve(
    __dirname,
    "..",
    "contracts",
    "out",
    "B20HUBHook.sol",
    "B20HUBHook.json",
  );
  const artifact = JSON.parse(readFileSync(path, "utf8")) as ForgeArtifact;
  const code = artifact.bytecode?.object;
  if (!code || code === "0x") {
    throw new Error(
      `Empty bytecode at ${path}. Run 'forge build' first to compile B20HUBHook.`,
    );
  }
  return code;
}

// ─── Mining loop ─────────────────────────────────────────────────────────────

async function main() {
  const creationCode = loadCreationCode();
  // Normalize checksums so raw hex or partial-case inputs still work.
  const poolManager = getAddress(POOL_MANAGER);
  const positionManager = getAddress(POSITION_MANAGER);
  const buyback = getAddress(BUYBACK);
  const treasury = getAddress(TREASURY);
  const deployer = getAddress(DEPLOYER);

  const encodedArgs = encodeAbiParameters(
    [
      { name: "poolManager", type: "address" },
      { name: "positionManager", type: "address" },
      { name: "buyback", type: "address" },
      { name: "treasury", type: "address" },
    ],
    [poolManager, positionManager, buyback, treasury],
  );
  const initCode = concat([creationCode, encodedArgs]);
  const initCodeHash = keccak256(initCode);

  console.log(`Deployer:         ${deployer}`);
  console.log(`PoolManager:      ${poolManager}`);
  console.log(`PositionManager:  ${positionManager}`);
  console.log(`Buyback:          ${buyback}`);
  console.log(`Treasury:         ${treasury}`);
  console.log(`InitCode hash:    ${initCodeHash}`);
  console.log(`Target mask:      0x3FFF → 0x1200`);
  console.log(`Mining...`);

  const started = Date.now();
  let tried = 0;

  for (let i = 0; i < MAX_TRIES; i++) {
    // Salt is a 32-byte value — pack `i` into the low 8 bytes.
    const saltHex = ("0x" +
      i.toString(16).padStart(64, "0")) as `0x${string}`;
    const addr = getContractAddress({
      opcode: "CREATE2",
      from: deployer,
      bytecodeHash: initCodeHash,
      salt: saltHex,
    });

    // Check low 14 bits.
    const lowBits = BigInt(addr) & HOOK_MASK;
    tried++;
    if (lowBits === HOOK_TARGET) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(2);
      console.log(``);
      console.log(`✓ Found salt after ${tried} tries in ${elapsed}s`);
      console.log(`  Salt:    ${saltHex}`);
      console.log(`  Address: ${addr}`);
      console.log(``);
      console.log(`Deploy with:`);
      console.log(
        `  forge script script/DeployB20HUB.s.sol \\`,
      );
      console.log(`    --sig 'run(bytes32)' ${saltHex} \\`);
      console.log(`    --rpc-url $BASE_RPC \\`);
      console.log(`    --broadcast --verify`);
      return;
    }

    if (tried % 100_000 === 0) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ...tried ${tried.toLocaleString()} salts (${elapsed}s)`);
    }
  }

  throw new Error(
    `Exhausted ${MAX_TRIES} salts without finding a match — something is wrong with the mask or constructor args.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
