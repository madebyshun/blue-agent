import { injected, coinbaseWallet } from "wagmi/connectors";

/**
 * Returns the best available connector:
 * - injected() if a browser wallet extension is detected
 * - coinbaseWallet() as fallback (works via QR code / mobile app)
 */
export function bestConnector() {
  if (typeof window !== "undefined" && window.ethereum) {
    return injected({ shimDisconnect: true });
  }
  return coinbaseWallet({ appName: "Blue Agent", preference: "all" });
}
