import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Blue Agent — Base-native founder console",
  description:
    "Blue Agent is the Base-native founder console for building, launching, and monetizing agents and apps with Bankr.",
  keywords: ["Blue Agent", "Base", "Bankr", "founder console", "AI agents", "x402", "Base builders"],
  openGraph: {
    title: "Blue Agent — Base-native founder console",
    description: "Build, audit, ship, launch, and monetize agents and apps on Base with Bankr.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Agent — Base-native founder console",
    description: "Build, audit, ship, launch, and monetize agents and apps on Base with Bankr.",
    creator: "@blocky_agent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔵</text></svg>"
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
