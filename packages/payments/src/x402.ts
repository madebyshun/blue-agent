// x402 helper utilities

export type X402Authorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type X402PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: X402Authorization;
    asset?: string;
    extra?: Record<string, unknown>;
  };
};

export function encodeX402Header(payment: X402PaymentPayload): string {
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

export function buildExactPayment(options: {
  payTo: string;
  maxAmountRequired: string;
  from?: string;
  validBefore?: string;
  nonce?: string;
  asset?: string;
  extra?: Record<string, unknown>;
}): X402PaymentPayload {
  const {
    payTo,
    maxAmountRequired,
    from = "",
    validBefore = "",
    nonce = "",
    asset,
    extra,
  } = options;

  return {
    x402Version: 1,
    scheme: "exact",
    network: "base-mainnet",
    payload: {
      signature: "",
      authorization: {
        from,
        to: payTo,
        value: maxAmountRequired,
        validAfter: "0",
        validBefore,
        nonce,
      },
      asset,
      extra,
    },
  };
}
