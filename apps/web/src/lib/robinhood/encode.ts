// Robinhood Chain (EVM chainId 4663) has no native token-launch factory
// (unlike Base's B20 precompile) — deployment is a raw contract-creation
// transaction: `to: undefined`, `data: <bytecode + abi-encoded constructor
// args>`. The user's own connected wallet signs and broadcasts it; Blue
// Agent never holds keys or funds.
import { encodeDeployData } from "viem";
import artifact from "./RobinhoodToken.artifact.json";

const ABI = artifact.abi;
const BYTECODE = artifact.bytecode as `0x${string}`;

export interface RobinhoodDeployParams {
  name: string;
  symbol: string;
  decimals?: number;       // default 18
  initialSupply?: string;  // base units (wei-like string), default "0"
  owner: `0x${string}`;
}

/**
 * Build the raw contract-creation calldata for a plain ERC-20 deploy on
 * Robinhood Chain. Returns `{ data }` — caller sends a tx with
 * `to: undefined` (or omitted) and this `data` on chainId 4663.
 */
export function buildRobinhoodDeployData(params: RobinhoodDeployParams): {
  data: `0x${string}`;
  decimals: number;
  initialSupply: string;
} {
  const { name, symbol, owner } = params;
  if (!name || !symbol) throw new Error("name and symbol required");
  if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) throw new Error("invalid owner address");

  const decimals = params.decimals ?? 18;
  if (decimals < 0 || decimals > 18) throw new Error("decimals must be 0-18");

  const initialSupply = params.initialSupply ?? "0";
  let initialSupplyBig: bigint;
  try {
    initialSupplyBig = BigInt(initialSupply);
  } catch {
    throw new Error("initialSupply must be an integer base-unit string");
  }
  if (initialSupplyBig < 0n) throw new Error("initialSupply must be >= 0");

  const data = encodeDeployData({
    abi: ABI,
    bytecode: BYTECODE,
    args: [name, symbol, decimals, initialSupplyBig, owner],
  });

  return { data, decimals, initialSupply: initialSupplyBig.toString() };
}

export { ABI as ROBINHOOD_TOKEN_ABI, BYTECODE as ROBINHOOD_TOKEN_BYTECODE };
