import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData, keccak256, toBytes } from "viem";
import { V4_FEE_TIERS } from "@/lib/b20hub/constants";

/**
 * B20HUB launch preparer — returns raw calldata for the deployed B20HUBLauncher
 * contract on Base. The user's connected wallet signs and broadcasts the tx;
 * we're strictly non-custodial (no private keys ever touched server-side).
 *
 * Client flow:
 *   1. Fill launch form (name, symbol, variant, fee tier, initial price)
 *   2. POST here → get { to, data, value: 0, chainId: 8453 }
 *   3. wagmi.sendTransactionAsync with that tx object
 *   4. On confirmation, launch complete: real B20 token deployed, V4 pool
 *      initialized with our hook attached, LP permanently locked, admin
 *      renounced. All atomic in one user signature.
 *
 * Launcher.launch(LaunchParams) ABI:
 *   struct LaunchParams {
 *     string  name;
 *     string  symbol;
 *     uint8   variant;              // 0 = ASSET, 1 = STABLECOIN
 *     uint8   decimals;
 *     uint256 totalSupply;          // whole tokens × 10^decimals
 *     uint160 initialSqrtPriceX96;  // opening price
 *     uint24  feeTier;              // 3000 / 10000 / 30000
 *     address creator;              // 80% of swap fees route here forever
 *     bytes32 salt;                 // CREATE2 salt for B20 deploy
 *   }
 */

// Deployed launcher address — filled in after real Sepolia + mainnet deploys.
// Until then this route reports a clear "not deployed yet" error so the UI
// can show a friendly banner rather than silently 500-ing.
const LAUNCHER_ADDRESSES: Record<number, `0x${string}` | null> = {
  // Re-wired for onchain diagnostic: simulating via cast call gave revert
  // selector 0x1a3e4af8 with no source attribution. Getting a real reverted
  // tx hash lets us `cast run <hash>` to see the full internal call trace
  // and identify which subcall (B20 factory / V4 PoolManager /
  // V4 PositionManager / hook) is the origin.
  // ⚠️ Signing WILL revert and burn ~$0.05 gas. Diagnostic only.
  8453:  "0x8eEe57660b086c31D0ECc98F48A122f829dDBa4b",
  84532: null,
};

const LAUNCH_ABI = [
  {
    type: "function",
    name: "launch",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name",                type: "string"  },
          { name: "symbol",              type: "string"  },
          { name: "variant",             type: "uint8"   },
          { name: "decimals",            type: "uint8"   },
          { name: "totalSupply",         type: "uint256" },
          { name: "initialSqrtPriceX96", type: "uint160" },
          { name: "feeTier",             type: "uint24"  },
          { name: "creator",             type: "address" },
          { name: "salt",                type: "bytes32" },
        ],
      },
    ],
    outputs: [
      { name: "token",         type: "address" },
      { name: "poolId",        type: "bytes32" },
      { name: "lpTokenIdA",    type: "uint256" },
      { name: "lpTokenIdB",    type: "uint256" },
    ],
  },
] as const;

type LaunchBody = {
  name?: string;
  symbol?: string;
  variant?: "asset" | "stablecoin" | number;
  decimals?: number;
  totalSupply?: string;         // whole-token count as string, e.g. "100000000000"
  initialSqrtPriceX96?: string; // uint160 as decimal or hex string
  feeTier?: keyof typeof V4_FEE_TIERS | number;
  creator?: string;
  chain?: "base" | "base-sepolia";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LaunchBody;

    // ── Validation ─────────────────────────────────────────────────────────
    const name = body.name?.trim();
    const symbol = body.symbol?.trim();
    const creator = body.creator?.trim();
    if (!name || !symbol) {
      return NextResponse.json(
        { error: "name and symbol required" },
        { status: 400 },
      );
    }
    if (name.length > 100 || symbol.length > 20) {
      return NextResponse.json(
        { error: "name ≤ 100 chars, symbol ≤ 20 chars" },
        { status: 400 },
      );
    }
    if (!creator || !/^0x[a-fA-F0-9]{40}$/.test(creator)) {
      return NextResponse.json(
        { error: "valid creator address required (0x…)" },
        { status: 400 },
      );
    }

    // Chain — Base mainnet default, Sepolia opt-in.
    const chainName = body.chain ?? "base";
    const chainId = chainName === "base-sepolia" ? 84532 : 8453;
    const launcherAddr = LAUNCHER_ADDRESSES[chainId];
    if (!launcherAddr) {
      return NextResponse.json(
        {
          error: `B20HUB launcher not deployed yet on ${
            chainId === 84532 ? "Base Sepolia" : "Base mainnet"
          }. Coming soon.`,
          notDeployed: true,
          chainId,
        },
        { status: 503 },
      );
    }

    // Variant: accept "asset" | "stablecoin" strings OR raw 0/1.
    const variant =
      body.variant === "stablecoin" || body.variant === 1 ? 1 : 0;

    // Decimals: B20 spec — ASSET can be 6-18, STABLECOIN fixed 6.
    const decimals =
      variant === 1 ? 6 : Math.min(18, Math.max(6, body.decimals ?? 18));

    // Total supply: whole tokens × 10^decimals. Default: 100B (matches B20HUB
    // task #78 lock-in for consistency with Bankr / CC0 supply norms).
    const supplyWholeStr = body.totalSupply?.trim() ?? "100000000000";
    let totalSupply: bigint;
    try {
      totalSupply = BigInt(supplyWholeStr) * BigInt(10) ** BigInt(decimals);
    } catch {
      return NextResponse.json(
        { error: "totalSupply must be a positive integer (whole tokens)" },
        { status: 400 },
      );
    }
    if (totalSupply <= 0n || totalSupply > BigInt(2) ** BigInt(128) - 1n) {
      return NextResponse.json(
        { error: "totalSupply out of range" },
        { status: 400 },
      );
    }

    // Fee tier: accept name ("MEDIUM") or raw uint24 (3000/10000/30000).
    let feeTier: number;
    if (typeof body.feeTier === "string" && body.feeTier in V4_FEE_TIERS) {
      feeTier = V4_FEE_TIERS[body.feeTier].fee;
    } else if (typeof body.feeTier === "number") {
      feeTier = body.feeTier;
    } else {
      feeTier = V4_FEE_TIERS.MEDIUM.fee; // 3000 = 0.3% default
    }
    if (![3000, 10000, 30000].includes(feeTier)) {
      return NextResponse.json(
        { error: "feeTier must be 3000, 10000, or 30000 (0.3% / 1% / 3%)" },
        { status: 400 },
      );
    }

    // initialSqrtPriceX96: user-supplied opening price in V4's sqrt(P) × 2^96
    // format. UI should compute this from a human-friendly "opening market
    // cap" input; here we just accept any positive uint160.
    if (!body.initialSqrtPriceX96) {
      return NextResponse.json(
        { error: "initialSqrtPriceX96 required — compute from opening price" },
        { status: 400 },
      );
    }
    let initialSqrtPriceX96: bigint;
    try {
      initialSqrtPriceX96 = BigInt(body.initialSqrtPriceX96);
    } catch {
      return NextResponse.json(
        { error: "initialSqrtPriceX96 must be a numeric string" },
        { status: 400 },
      );
    }
    if (
      initialSqrtPriceX96 <= 0n ||
      initialSqrtPriceX96 >= BigInt(2) ** BigInt(160)
    ) {
      return NextResponse.json(
        { error: "initialSqrtPriceX96 out of uint160 range" },
        { status: 400 },
      );
    }

    // CREATE2 salt: user-supplied or deterministic-from-(creator, name, symbol).
    // The salt influences the deployed B20 token address deterministically;
    // it's fine to reuse or randomize, no security implication.
    const salt = keccak256(
      toBytes(`${creator}:${name}:${symbol}:${Date.now()}`),
    );

    // ── Encode the launch call ─────────────────────────────────────────────
    const data = encodeFunctionData({
      abi: LAUNCH_ABI,
      functionName: "launch",
      args: [
        {
          name,
          symbol,
          variant,
          decimals,
          totalSupply,
          initialSqrtPriceX96,
          feeTier,
          creator: creator as `0x${string}`,
          salt,
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      chainId,
      tx: {
        to: launcherAddr,
        data,
        value: "0x0", // launch itself sends no ETH; creator seeds pool via factory mint
        chainId,
      },
      preview: {
        name,
        symbol,
        variant: variant === 1 ? "stablecoin" : "asset",
        decimals,
        totalSupplyWhole: supplyWholeStr,
        feeTier,
        feeTierLabel: `${(feeTier / 10000).toFixed(2)}%`,
        creator,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
