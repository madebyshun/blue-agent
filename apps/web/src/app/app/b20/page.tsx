import type { Metadata } from "next";
import B20Client from "./B20Client";

const SITE = "https://blueagent.dev";
const TITLE = "B20 Token Hub — BlueAgent";
const DESCRIPTION =
  "Launch, inspect & manage Base Beryl (B20) tokens. Real on-chain scanner: pause status, policy gating, supply cap, roles, and full management. Zero LLM.";
const OG_IMAGE = `${SITE}/app/b20/opengraph-image`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/app/b20`,
    siteName: "BlueAgent",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "B20 Token Hub — BlueAgent" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@blueagent_",
    site: "@blueagent_",
    images: [OG_IMAGE],
  },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const address = sp.address ?? "";
  const network = sp.network === "sepolia" ? "sepolia" : "mainnet";

  return <B20Client initialAddress={address} initialNetwork={network} />;
}
