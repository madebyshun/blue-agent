import type { Metadata } from "next";
import BankClient from "./BankClient";

export const metadata: Metadata = {
  title: "Blue Bank — BlueAgent",
  description: "Non-custodial Base neobank. Yield, send, swap on Base.",
};

export default function Page() {
  return <BankClient />;
}
