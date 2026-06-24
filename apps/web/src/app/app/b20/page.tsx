import type { Metadata } from "next";
import AppShell from "../AppShell";
import B20Client from "./B20Client";

export const metadata: Metadata = {
  title: "B20 Scanner — BlueAgent",
  description: "Real on-chain B20 token inspector. Paste a Base token address to see live state: pause status, policy gating, supply cap, and trust verdict. Zero LLM.",
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const address = sp.address ?? "";
  const network = sp.network === "sepolia" ? "sepolia" : "mainnet";

  return (
    <AppShell>
      <B20Client initialAddress={address} initialNetwork={network} />
    </AppShell>
  );
}
