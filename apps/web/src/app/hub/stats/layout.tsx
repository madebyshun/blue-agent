import type { Metadata } from "next";

// Unlisted: accessible by direct URL but excluded from search engines and
// AI/agent crawlers. Not linked from the site.
export const metadata: Metadata = {
  title: "Stats · Blue Hub",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
