// ─── x402 v2 Types ────────────────────────────────────────────────────────────

export interface X402PaymentRequired {
  x402Version:  number;
  accepts:      PaymentOption[];
  error?:       string;
}

export interface PaymentOption {
  scheme:             "exact";
  network:            string;           // "eip155:8453"
  /** v2: raw units e.g. "250000" */
  amount?:            string;
  /** v1 name for the same thing */
  maxAmountRequired?: string;
  maxTimeoutSeconds?: number;
  asset:              string;           // USDC contract address
  payTo:              string;           // recipient address
  extra?:             Record<string, unknown>;
}

export interface X402Authorization {
  from:         string;
  to:           string;
  value:        string;
  validAfter:   string;
  validBefore:  string;
  nonce:        string;
}

export interface X402Payment {
  x402Version:  number;
  scheme:       "exact";
  network:      string;
  payload: {
    signature:     string;
    authorization: X402Authorization;
  };
}

// ─── SDK Config ───────────────────────────────────────────────────────────────

export interface X402ClientConfig {
  /** EVM private key (hex, with or without 0x prefix) */
  privateKey: `0x${string}`;
  /** Base RPC URL — defaults to https://mainnet.base.org */
  rpcUrl?: string;
  /** Extra seconds added to validBefore (default: 300) */
  ttl?: number;
  /** Refuse, before signing, any 402 above this many USDC atomic units (6 decimals). Unset = no cap. */
  maxPerCallAtomic?: bigint;
}

export interface CallOptions {
  /** Request body (will be JSON.stringify'd) */
  body?: Record<string, unknown>;
  /** HTTP method; default POST. Use GET for a GET-only x402 route. */
  method?: "GET" | "POST";
  /** Extra headers */
  headers?: Record<string, string>;
}

export interface CallResult<T = unknown> {
  data:        T;
  toolId:      string;
  pricePaid:   string;   // human readable e.g. "$0.25"
  amountPaid:  string;   // raw USDC units e.g. "250000"
  txSettled?:  string;   // settlement tx hash if returned
}

// ─── Pricing manifest (/.well-known/pricing) ──────────────────────────────────

export interface PricingRoute {
  path:              string;
  endpoint:          string;
  manifest:          string;
  name:              string;
  description:       string;
  category:          string;
  scheme:            string;
  network:           string;
  asset:             string;
  payTo:             string;
  maxAmountRequired: string;
  priceUSD:          string | null;
}

export interface PricingManifest {
  version:     number;
  description: string;
  network:     string;
  asset:       string;
  payTo:       string;
  catalog:     string;
  updated:     string;
  routes:      PricingRoute[];
}
