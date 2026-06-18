import type { Metadata } from "next";
import LaunchesClient from "./LaunchesClient";

export const metadata: Metadata = {
  title: "Launches — BlueAgent",
  description: "Fair token launches on Base via Bankr. 100% LP. No hidden allocation.",
};

export default function Page() {
  return <LaunchesClient />;
}
