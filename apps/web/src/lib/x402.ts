import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm";

export const PAY_TO = (process.env.PAYMENT_WALLET ?? "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f") as `0x${string}`;
export const NETWORK = "eip155:8453" as const; // Base mainnet

let _server: ReturnType<typeof x402ResourceServer.prototype.register> | null = null;

export function getX402Server() {
  if (!_server) {
    const facilitator = new HTTPFacilitatorClient({ url: "https://facilitator.x402.org" });
    _server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
  }
  return _server;
}

export type PaymentOption = {
  scheme: "exact";
  price: string; // "$0.20"
  network: typeof NETWORK;
  payTo: `0x${string}`;
};
