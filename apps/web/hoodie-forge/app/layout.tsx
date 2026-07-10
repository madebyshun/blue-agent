import type { Metadata } from "next";
import "./globals.css";

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

// Pre-hydration script: reads localStorage before paint so the correct theme
// is applied on the very first render (no flash from dark → light).
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('blue-forge-theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
