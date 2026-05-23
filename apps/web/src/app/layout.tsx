import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Blue Agent — AI founder console for Base builders",
  description:
    "34 AI tools. 3-agent consensus. Pay per use via x402 USDC on Base. Blue Hub, Blue Market, and the AI-native console for Base builders.",
  keywords: ["Blue Agent", "Base", "Blue Hub", "AI tools", "x402", "founder console", "Base builders", "BLUEAGENT"],
  metadataBase: new URL("https://blueagent.dev"),
  openGraph: {
    title: "Blue Agent — AI founder console for Base builders",
    description: "34 AI tools. 3-agent consensus (Blue × Aeon × MiroShark). Pay per use via x402 USDC on Base.",
    type: "website",
    url: "https://blueagent.dev",
    siteName: "Blue Agent",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Agent — AI founder console for Base builders",
    description: "34 AI tools. 3-agent consensus. Pay per use via x402 USDC on Base.",
    creator: "@blueagent_",
    site: "@blueagent_",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
