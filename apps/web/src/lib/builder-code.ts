// ERC-8021 Builder Code calldata attribution helpers for Base (8453 / 84532).
// Appends DATA_SUFFIX to unsigned swap calldata (EOA / API prepare paths).
// Smart Wallets using EIP-5792 wallet_sendCalls pass DATA_SUFFIX via
// capabilities instead (see ToolCards.tsx).
import { concat, encodeFunctionData, isHex, type Abi, type Address, type Hex } from "viem";
import { Attribution } from "ox/erc8021";
import { BUILDER_CODE, DATA_SUFFIX } from "../constants/builderCode";

const BASE_CHAIN_IDS = new Set([8453, 84532]);

export function getBuilderDataSuffix(codes?: string[]): Hex {
  if (!codes?.length || (codes.length === 1 && codes[0] === BUILDER_CODE)) {
    return DATA_SUFFIX as Hex;
  }
  return Attribution.toDataSuffix({ codes }) as Hex;
}

/**
 * Append ERC-8021 Builder Code suffix to transaction calldata on Base.
 * - Leaves non-Base chains (e.g. Robinhood Chain 4663) untouched.
 * - Leaves empty ("0x") or non-hex calldata untouched.
 * - Idempotent: does not append twice if the suffix is already present.
 */
export function appendBuilderCode(
  calldata: Hex,
  options?: { chainId?: number; codes?: string[] },
): Hex {
  if (options?.chainId !== undefined && !BASE_CHAIN_IDS.has(options.chainId)) {
    return calldata;
  }
  if (!isHex(calldata) || calldata === "0x") {
    return calldata;
  }

  const suffix = getBuilderDataSuffix(options?.codes);
  const rawSuffix = suffix.slice(2).toLowerCase();

  if (calldata.toLowerCase().endsWith(rawSuffix)) {
    return calldata;
  }

  return concat([calldata, suffix]);
}

export function buildAttributedSwapTx<const TAbi extends Abi | readonly unknown[]>(params: {
  router: Address;
  abi: TAbi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  chainId: number;
  codes?: string[];
}): { to: Address; data: Hex; value: string; chainId: number } {
  const rawData = encodeFunctionData({
    abi: params.abi as Abi,
    functionName: params.functionName,
    args: params.args,
  });

  return {
    to: params.router,
    data: appendBuilderCode(rawData, { chainId: params.chainId, codes: params.codes }),
    value: (params.value ?? 0n).toString(),
    chainId: params.chainId,
  };
}
