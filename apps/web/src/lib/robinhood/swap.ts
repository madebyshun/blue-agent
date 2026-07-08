// Robinhood Chain (chainId 4663) swap support via a custom, minimal
// RobinhoodSwapRouter (see contracts/RobinhoodSwapRouter.sol for the full
// rationale + security model comment).
//
// WHY A CUSTOM ROUTER: Robinhood Chain mainnet has no single authenticated
// Uniswap deployment — Blockscout verification lets anyone submit a source
// file under any contract name, so name-searching turns up 4+ different
// contracts all self-named "UniversalRouter" plus dozens of oddly-named
// "*Router" contracts, none carrying any official confirmation. Instead,
// this router only trusts:
//   - FACTORY: the one UniswapV3Factory whose deployed source (pulled from
//     Blockscout) is byte-for-byte identical to the genuine, unmodified
//     Uniswap V3 core `UniswapV3Factory.sol`.
//   - WETH9: independently confirmed by reading `token0()` directly on
//     4 separate live, real-volume pools via eth_call against
//     rpc.mainnet.chain.robinhood.com — all 4 point at the same factory
//     above and share this same token0. Cross-checked against Blockscout's
//     token API: 16,941 holders, live exchange_rate ~$1770 (matching ETH).
// Neither address is a guess — both were verified against live on-chain
// state, not just a Blockscout name search (which is spoofable).
import { encodeDeployData, encodeFunctionData } from "viem";
import artifact from "./RobinhoodSwapRouter.artifact.json";

const ABI = artifact.abi;
const BYTECODE = artifact.bytecode as `0x${string}`;

export const ROBINHOOD_MAINNET_VERIFIED_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as const;
export const ROBINHOOD_MAINNET_VERIFIED_WETH9 = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const;

/**
 * Robinhood Chain testnet (46630) has NO equivalent Uniswap V3 deployment as
 * of this writing (confirmed: a Blockscout search for "UniswapV3Factory" on
 * explorer.testnet.chain.robinhood.com returns zero results — only
 * unrelated "LivoGraduator" V2/V4 bonding-curve launchpad contracts exist
 * there). So there is currently NO way to test this router end-to-end
 * against a real pool on testnet. Do not fill this in with a guess.
 */
export const ROBINHOOD_TESTNET_VERIFIED_FACTORY: `0x${string}` | null = null;
export const ROBINHOOD_TESTNET_VERIFIED_WETH9: `0x${string}` | null = null;

/**
 * The RobinhoodSwapRouter contract address once deployed on mainnet.
 * Intentionally left null until an actual deployment transaction has been
 * broadcast and independently verified on Blockscout — never fill this in
 * speculatively.
 */
export const ROBINHOOD_SWAP_ROUTER_ADDRESS: `0x${string}` | null = null;

/** Build the raw contract-creation calldata to deploy RobinhoodSwapRouter. */
export function buildRouterDeployData(factory: `0x${string}`, weth9: `0x${string}`): `0x${string}` {
  return encodeDeployData({ abi: ABI, bytecode: BYTECODE, args: [factory, weth9] });
}

export interface SwapParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number; // e.g. 500, 3000, 10000 (Uniswap V3 fee tiers, in hundredths of a bip)
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: `0x${string}`;
  deadline: bigint; // unix seconds
}

/** ERC20 -> ERC20 (or ERC20 -> WETH) exact-input swap. Requires prior `approve`. */
export function buildSwapExactInputSingleData(p: SwapParams): `0x${string}` {
  return encodeFunctionData({
    abi: ABI,
    functionName: "swapExactInputSingle",
    args: [p.tokenIn, p.tokenOut, p.fee, p.amountIn, p.amountOutMinimum, p.recipient, p.deadline],
  });
}

/** Native ETH -> ERC20 exact-input swap ("buy"). Send `amountIn` as tx value. */
export function buildSwapExactInputSingleETHData(p: Omit<SwapParams, "tokenIn" | "amountIn">): `0x${string}` {
  return encodeFunctionData({
    abi: ABI,
    functionName: "swapExactInputSingleETH",
    args: [p.tokenOut, p.fee, p.amountOutMinimum, p.recipient, p.deadline],
  });
}

/** ERC20 -> native ETH exact-input swap ("sell"). Requires prior `approve`. */
export function buildSwapExactInputSingleForETHData(p: Omit<SwapParams, "tokenOut">): `0x${string}` {
  return encodeFunctionData({
    abi: ABI,
    functionName: "swapExactInputSingleForETH",
    args: [p.tokenIn, p.fee, p.amountIn, p.amountOutMinimum, p.recipient, p.deadline],
  });
}

/** Standard ERC-20 `approve(spender, amount)` calldata — needed before any ERC20-input swap. */
export function buildErc20ApproveData(spender: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [spender, amount],
  });
}

export { ABI as ROBINHOOD_SWAP_ROUTER_ABI, BYTECODE as ROBINHOOD_SWAP_ROUTER_BYTECODE };
