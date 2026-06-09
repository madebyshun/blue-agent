import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const SITE = "https://blueagent.dev";
const TITLE = "Blue Agent — AI agent layer on Base";
const DESCRIPTION =
  "50+ AI tools. 3-agent consensus (Blue × Aeon × MiroShark). Pay per use via x402 USDC on Base. Idea → build → audit → ship.";

// Farcaster v2 mini-app embed — what Base App reads when blueagent.dev is
// shared in a feed. Tap the button → launches /app/chat inside the wallet's
// in-app browser with the splash card while it loads.
const fcFrame = JSON.stringify({
  version: "next",
  imageUrl: `${SITE}/og-chat.png`,
  button: {
    title: "Open Blue Chat",
    action: {
      type: "launch_frame",
      name: "Blue Agent",
      url: `${SITE}/app/chat`,
      splashImageUrl: `${SITE}/splash.png`,
      splashBackgroundColor: "#4FC3F7",
    },
  },
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050508",
  // Prevent zoom-in on form focus inside Base App's in-app browser
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["Blue Agent", "Base", "Blue Hub", "AI tools", "x402", "founder console", "Base builders", "BLUEAGENT", "Farcaster", "Base App"],
  metadataBase: new URL(SITE),
  applicationName: "Blue Agent",
  appleWebApp: {
    title: "Blue Agent",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SITE,
    siteName: "Blue Agent",
    images: [{ url: "/og-chat.png", width: 1200, height: 630, alt: "Blue Agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@blueagent_",
    site: "@blueagent_",
    images: ["/og-chat.png"],
  },
  other: {
    "fc:frame": fcFrame,
    // Legacy fallback for Farcaster v1 clients that haven't migrated to v2
    "fc:frame:image": `${SITE}/og-chat.png`,
    "fc:frame:button:1": "Open Blue Chat",
    "fc:frame:button:1:action": "launch_frame",
    "fc:frame:button:1:target": `${SITE}/app/chat`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
