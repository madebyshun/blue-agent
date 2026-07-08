import type { Metadata } from "next";
import RobinhoodRouterClient from "./RobinhoodRouterClient";

export const metadata: Metadata = {
  title: "Robinhood Router Deploy — BlueAgent (internal)",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RobinhoodRouterClient />;
}
