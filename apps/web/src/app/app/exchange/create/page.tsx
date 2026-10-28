// /exchange/create — mint an ERC-8004 agent identity on Base 8453, or manage one you
// own. Non-custodial: the connected wallet signs every step; the registration
// file is embedded in the NFT (data: URI), so nobody hosts it.
import type { Metadata } from "next";
import CreateAgentClient from "./CreateAgentClient";

export const metadata: Metadata = {
  title: "Create an agent — Blue Agent",
  description: "Your agent as an ERC-8004 identity on Base. Free: you only pay gas.",
};

export default function CreateAgentPage() {
  return <CreateAgentClient />;
}
