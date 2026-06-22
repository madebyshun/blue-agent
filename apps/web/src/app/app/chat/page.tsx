import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Blue Chat — BlueAgent",
  description: "Build anything on Base. AI chat, launch tokens, deploy B20, audit contracts, live Base intelligence.",
  openGraph: {
    title: "Blue Chat — Build anything on Base",
    description: "AI chat, launch tokens, deploy B20, audit contracts, live Base intelligence.",
    url: "https://blueagent.dev/app/chat",
    siteName: "BlueAgent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Chat — Build anything on Base",
    description: "AI chat, launch tokens, deploy B20, audit contracts, live Base intelligence.",
  },
};

export default function Page() {
  return <ChatClient />;
}
