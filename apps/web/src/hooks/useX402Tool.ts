"use client";

/**
 * useX402Tool — browser-side x402 payment flow for Hub tools
 *
 * Flow:
 *   1. POST to x402Url with body (no payment header)
 *   2. On 402 → parse X-Payment-Required → sign EIP-3009 with wagmi
 *   3. Retry POST with X-PAYMENT header containing signed authorization
 *   4. Return result text
 */

import { useState, useCallback } from "react";
import { useWalletClient, useAccount } from "wagmi";
// x402/schemes used for preparePaymentHeader utility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exact } = require("x402/schemes") as { exact: { evm: { preparePaymentHeader: (from: string, version: number, req: unknown) => { payload: { authorization: Record<string, string>; signature?: string }; scheme: string; network: string; x402Version: number } } } };

export type X402Status =
  | "idle"
  | "calling"       // initial request
  | "signing"       // wallet signature pending
  | "paying"        // retrying with payment
  | "done"
  | "error";

export type X402ToolResult = {
  status: X402Status;
  result: string | null;
  error: string | null;
  run: (x402Url: string, body: Record<string, unknown>) => Promise<void>;
  reset: () => void;
};

export function useX402Tool(): X402ToolResult {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [status, setStatus]   = useState<X402Status>("idle");
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(async (
    x402Url: string,
    body: Record<string, unknown>,
  ) => {
    if (!walletClient || !address) {
      setError("Connect your wallet first");
      setStatus("error");
      return;
    }

    setStatus("calling");
    setResult(null);
    setError(null);

    try {
      // ── Step 1: initial request (no payment) ──────────────────────────────
      const res1 = await fetch(x402Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Success without payment (shouldn't happen for priced tools, but handle it)
      if (res1.ok) {
        const data = await res1.json() as Record<string, unknown>;
        setResult(typeof data === "string" ? data : JSON.stringify(data, null, 2));
        setStatus("done");
        return;
      }

      // ── Step 2: handle 402 ────────────────────────────────────────────────
      if (res1.status !== 402) {
        const errText = await res1.text();
        throw new Error(`Request failed (${res1.status}): ${errText.slice(0, 200)}`);
      }

      type PaymentRequired = {
        x402Version: number;
        accepts: Array<{
          scheme: string;
          network: string;
          maxAmountRequired: string;
          resource: string;
          description?: string;
          payTo: string;
          maxTimeoutSeconds: number;
          asset: string;
          extra?: Record<string, unknown>;
        }>;
        facilitator?: string;
      };

      let paymentRequired: PaymentRequired;

      // x402 v2: body IS the payment requirements (raw JSON).
      // Header (X-Payment-Required) is base64-encoded — parse body instead.
      try {
        const bodyData = await res1.json() as PaymentRequired;
        if (bodyData?.accepts?.length) {
          paymentRequired = bodyData;
        } else {
          // Fallback: decode base64 header
          const h = res1.headers.get("X-Payment-Required");
          if (!h) throw new Error("No payment requirements in 402 response");
          paymentRequired = JSON.parse(atob(h)) as PaymentRequired;
        }
      } catch (parseErr) {
        throw new Error(`Failed to parse payment requirements: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }

      const paymentReqs = paymentRequired.accepts;
      if (!paymentReqs?.length) {
        throw new Error("No payment requirements found in 402 response");
      }

      // Use the first (exact/evm) payment requirement
      const req = paymentReqs[0];

      // ── Step 3: sign EIP-3009 with wallet ─────────────────────────────────
      setStatus("signing");

      // Build payment using x402 library (requires viem WalletClient)
      const unsignedPayment = exact.evm.preparePaymentHeader(
        address,
        paymentRequired.x402Version,
        req,
      );

      // signTypedData via viem WalletClient (wagmi provides this)
      const signature = await walletClient.signTypedData({
        domain: {
          name: (req.extra?.name as string) ?? "USD Coin",
          version: (req.extra?.version as string) ?? "2",
          chainId: 8453,
          verifyingContract: req.asset as `0x${string}`,
        },
        types: {
          TransferWithAuthorization: [
            { name: "from",        type: "address" },
            { name: "to",         type: "address" },
            { name: "value",      type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore",type: "uint256" },
            { name: "nonce",      type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from:        unsignedPayment.payload.authorization.from as `0x${string}`,
          to:          unsignedPayment.payload.authorization.to as `0x${string}`,
          value:       BigInt(unsignedPayment.payload.authorization.value),
          validAfter:  BigInt(unsignedPayment.payload.authorization.validAfter),
          validBefore: BigInt(unsignedPayment.payload.authorization.validBefore),
          nonce:       unsignedPayment.payload.authorization.nonce as `0x${string}`,
        },
      });

      const signedPayment = {
        ...unsignedPayment,
        payload: { ...unsignedPayment.payload, signature },
      };

      // Encode as base64
      const paymentHeader = btoa(JSON.stringify(signedPayment));

      // ── Step 4: retry with payment ────────────────────────────────────────
      setStatus("paying");

      const res2 = await fetch(x402Url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": paymentHeader,
        },
        body: JSON.stringify(body),
      });

      if (!res2.ok) {
        const errText = await res2.text();
        throw new Error(`Payment rejected (${res2.status}): ${errText.slice(0, 200)}`);
      }

      const data2 = await res2.json() as Record<string, unknown>;
      setResult(typeof data2 === "string" ? data2 : JSON.stringify(data2, null, 2));
      setStatus("done");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // User rejected signature
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Signature cancelled");
      } else {
        setError(msg);
      }
      setStatus("error");
    }
  }, [walletClient, address]);

  return { status, result, error, run, reset };
}
