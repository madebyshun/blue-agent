import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://blueagent.dev/sitemap.xml",
    host: "https://blueagent.dev",
  };
}
