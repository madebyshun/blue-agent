import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/hub/stats", "/api/stats"] }],
    sitemap: "https://blueagent.dev/sitemap.xml",
    host: "https://blueagent.dev",
  };
}
