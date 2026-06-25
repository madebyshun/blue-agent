import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  parseUnits,
  keccak256,
  stringToHex,
  hexToString,
  type Hex,
} from "viem";

// OFFICIAL từ base-std StdPrecompiles.sol — KHÔNG dùng 0x4200...b20
export const B20_FACTORY = "0xB20f000000000000000000000000000000000000" as const;
const MINT_ROLE = keccak256(stringToHex("MINT_ROLE"));

const FACTORY_ABI = [{
  type: "function", name: "createB20", stateMutability: "payable",
  inputs: [
    { name: "variant",   type: "uint8"    },
    { name: "salt",      type: "bytes32"  },
    { name: "params",    type: "bytes"    },
    { name: "initCalls", type: "bytes[]"  },
  ],
  outputs: [{ name: "token", type: "address" }],
}] as const;

const GRANT_ROLE_ABI = [{
  type: "function", name: "grantRole",
  inputs: [
    { name: "role",    type: "bytes32" },
    { name: "account", type: "address" },
  ],
  outputs: [],
}] as const;

const SUPPLY_CAP_ABI = [{
  type: "function", name: "updateSupplyCap",
  inputs: [{ name: "newSupplyCap", type: "uint256" }],
  outputs: [],
}] as const;

export interface B20BuildInput {
  name: string;
  symbol: string;
  variant?: "asset" | "stablecoin";
  decimals?: number;
  supply_cap?: string;
  currency_code?: string;
  admin: string;
}

export function buildB20Calldata(input: B20BuildInput): {
  data: `0x${string}`;
  factory: typeof B20_FACTORY;
  salt: `0x${string}`;
  variantEnum: number;
  decimals: number;
} {
  const { name, symbol, variant = "asset", admin } = input;
  const isAsset  = variant === "asset";
  const dec      = isAsset ? (input.decimals ?? 18) : 6;

  // params encode — asset has decimals (uint8), stablecoin has currency (string)
  const params: `0x${string}` = isAsset
    ? encodeAbiParameters(
        parseAbiParameters("(uint8 version, string name, string symbol, address initialAdmin, uint8 decimals)"),
        [{ version: 1, name, symbol, initialAdmin: admin as `0x${string}`, decimals: dec }],
      )
    : encodeAbiParameters(
        parseAbiParameters("(uint8 version, string name, string symbol, address initialAdmin, string currency)"),
        [{ version: 1, name, symbol, initialAdmin: admin as `0x${string}`, currency: input.currency_code || "USD" }],
      );

  // initCalls[0] = grantRole(MINT_ROLE, admin)
  const initCalls: `0x${string}`[] = [
    encodeFunctionData({
      abi: GRANT_ROLE_ABI,
      functionName: "grantRole",
      args: [MINT_ROLE, admin as `0x${string}`],
    }),
  ];

  // initCalls[1] = updateSupplyCap (optional)
  if (input.supply_cap && String(input.supply_cap).trim()) {
    const capWei = parseUnits(String(input.supply_cap).trim(), dec);
    initCalls.push(
      encodeFunctionData({
        abi: SUPPLY_CAP_ABI,
        functionName: "updateSupplyCap",
        args: [capWei],
      }),
    );
  }

  const salt       = keccak256(stringToHex(`${symbol.toLowerCase()}-${admin}-${Date.now()}`));
  const variantEnum = isAsset ? 0 : 1; // ASSET=0, STABLECOIN=1

  const data = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: "createB20",
    args: [variantEnum, salt, params, initCalls],
  });

  return { data, factory: B20_FACTORY, salt, variantEnum, decimals: dec };
}

// ─── B20 payment primitive — transferWithMemo + Memo event ──────────────────
// Verified against Base's "Accept B20 payments" standard:
//   function transferWithMemo(address to, uint256 amount, bytes32 memo)
//   event    Memo(address indexed caller, bytes32 indexed memo)
// The memo is a bytes32 — an order id packed via stringToHex(id, { size: 32 }).
// A merchant matches the indexed `memo` topic back to the order to reconcile.

export const TRANSFER_WITH_MEMO_ABI = [{
  type: "function", name: "transferWithMemo", stateMutability: "nonpayable",
  inputs: [
    { name: "to",     type: "address" },
    { name: "amount", type: "uint256" },
    { name: "memo",   type: "bytes32" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

export const MEMO_EVENT_ABI = [{
  type: "event", name: "Memo",
  inputs: [
    { name: "caller", type: "address", indexed: true },
    { name: "memo",   type: "bytes32", indexed: true },
  ],
}] as const;

/** Order id → bytes32 memo (right-padded). Order ids are ≤32 bytes by design. */
export function orderMemo(orderId: string): Hex {
  return stringToHex(orderId, { size: 32 });
}

/** bytes32 memo → order id (strips the trailing zero padding). "" if undecodable. */
export function memoToOrderId(memo: Hex): string {
  try { return hexToString(memo, { size: 32 }); } catch { return ""; }
}

/** Encode transferWithMemo calldata. `amount` is human units; decimals defaults
 *  to 6 (B20 USDC is a fixed-6-decimal stablecoin). `memo` is the order id. */
export function encodeTransferWithMemo(opts: {
  to: string;
  amount: string | number;
  decimals?: number;
  memo: string;
}): Hex {
  const dec = opts.decimals ?? 6;
  return encodeFunctionData({
    abi: TRANSFER_WITH_MEMO_ABI,
    functionName: "transferWithMemo",
    args: [opts.to as `0x${string}`, parseUnits(String(opts.amount), dec), orderMemo(opts.memo)],
  });
}
