import type { Metadata } from "next";
import "./globals.css";

// ── Blue Forge — layout ───────────────────────────────────────────
// Đặt ở: app/layout.tsx (đè lên file có sẵn)

export const metadata: Metadata = {
  title: "Blue Forge — Hood up. Stay based.",
  description:
    "Drop your pfp, get the hoodie. Same face, same style, ~10 seconds. A Blue Image experiment by BlueAgent.",
  openGraph: {
    title: "Blue Forge — Hood up. Stay based.",
    description:
      "Drop your pfp, get the hoodie. A Blue Image experiment by BlueAgent.",
    siteName: "Blue Forge",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Forge — Hood up. Stay based.",
    description:
      "Drop your pfp, get the hoodie. A Blue Image experiment by BlueAgent.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
