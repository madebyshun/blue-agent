/**
 * EIP-3009 USDC TransferWithAuthorization signer
 * Used to sign x402 payment headers for Blue Hub tool calls
 */
import { createWalletClient, http, keccak256, toBytes, toHex } from "viem";
import { privateKeyToAccount }                                   from "viem/accounts";
import { base }                                                  from "viem/chains";
import type { X402Authorization, X402Payment, PaymentOption }    from "./types";

// USDC on Base — EIP-712 domain
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const USDC_DOMAIN = {
  name:              "USD Coin",
  version:           "2",
  chainId:           8453,
  verifyingContract: USDC_ADDRESS,
} as const;

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

export function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function signTransferWithAuthorization(
  privateKey: `0x${string}`,
  from:        string,
  to:          string,
  value:       string,
  validBefore: string,
  nonce:       string,
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const client  = createWalletClient({
    account,
    chain:     base,
    transport: http("https://mainnet.base.org"),
  });

  const signature = await client.signTypedData({
    domain:      USDC_DOMAIN,
    types:       TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from:        from        as `0x${string}`,
      to:          to          as `0x${string}`,
      value:       BigInt(value),
      validAfter:  BigInt(0),
      validBefore: BigInt(validBefore),
      nonce:       nonce as `0x${string}`,
    },
  });

  return signature;
}

export async function buildPaymentHeader(
  privateKey:  `0x${string}`,
  option:      PaymentOption,
  ttl          = 300,
): Promise<string> {
  const account     = privateKeyToAccount(privateKey);
  const from        = account.address;
  const nonce       = randomNonce();
  const validBefore = String(Math.floor(Date.now() / 1000) + ttl);

  const signature = await signTransferWithAuthorization(
    privateKey,
    from,
    option.payTo,
    option.maxAmountRequired,
    validBefore,
    nonce,
  );

  const authorization: X402Authorization = {
    from,
    to:          option.payTo,
    value:       option.maxAmountRequired,
    validAfter:  "0",
    validBefore,
    nonce,
  };

  const payment: X402Payment = {
    x402Version: 2,
    scheme:      "exact",
    network:     option.network,
    payload: { signature, authorization },
  };

  return Buffer.from(JSON.stringify(payment)).toString("base64");
}
