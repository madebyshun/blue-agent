import type { Metadata } from "next";
import "./globals.css";
import LeftSidebar    from "./_components/LeftSidebar";
import TopBar        from "./_components/TopBar";
import SearchPalette from "./_components/SearchPalette";

export const metadata: Metadata = {
  title: "Blue Hub — API Marketplace for Base Builders & AI Agents",
  description:
    "30+ pay-per-call AI APIs for Base builders and AI agents. USDC settlement on Base, MCP-ready, no signup required. List your API on Blue Hub, earn 80% revenue share. Developer portal by Blue Agent.",
  keywords: ["Blue Hub", "Base", "API marketplace", "MCP", "AI agents", "x402", "USDC", "Blue Agent", "$BLUEAGENT"],
  openGraph: {
    title: "Blue Hub — API Marketplace for Base",
    description: "Pay-per-call APIs for Base builders and AI agents. Built by Blue Agent.",
    type: "website",
    url: "https://api.blueagent.dev",
  },
  twitter: {
    card: "summary_large_image",
    site: "@blueagent_",
    title: "Blue Hub — API Marketplace for Base",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#050508] text-white antialiased">
        <div className="flex min-h-screen">
          <LeftSidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <TopBar />
            <main className="flex-1">{children}</main>
          </div>
        </div>
        <SearchPalette />
      </body>
    </html>
  );
}
