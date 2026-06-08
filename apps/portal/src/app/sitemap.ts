import type { MetadataRoute } from "next";
import { APIS } from "./marketplace/_data";
import { POSTS } from "./blog/_data";

const BASE = "https://api.blueagent.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // ── Static marketing + product pages ────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,            lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/marketplace`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/agents`,      lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/x402`,        lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/submit`,      lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/dashboard`,   lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/staking`,     lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/blog`,        lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/docs`,        lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/signin`,      lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${BASE}/signup`,      lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${BASE}/terms`,       lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/privacy`,     lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  // ── Docs sub-pages ──────────────────────────────────────────────────────
  const docsRoutes: MetadataRoute.Sitemap = [
    "/docs/quickstart",
    "/docs/mcp",
    "/docs/concepts",
    "/docs/x402",
    "/docs/rest-api",
    "/docs/mcp-protocol",
    "/docs/builders/submit",
    "/docs/builders/dashboard",
  ].map(p => ({ url: `${BASE}${p}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 }));

  // ── Each live API gets a SEO-able detail page ───────────────────────────
  const apiRoutes: MetadataRoute.Sitemap = APIS
    .filter(a => a.status === "live")
    .map(a => ({
      url:            `${BASE}/marketplace/${a.id}`,
      lastModified:   new Date(a.releasedAt),
      changeFrequency:"weekly" as const,
      priority:       a.featured ? 0.8 : 0.6,
    }));

  // ── Provider profiles ──────────────────────────────────────────────────
  const providerRoutes: MetadataRoute.Sitemap = ["blue-agent", "aeon", "miroshark"].map(h => ({
    url:            `${BASE}/providers/${h}`,
    lastModified:   now,
    changeFrequency:"weekly" as const,
    priority:       0.6,
  }));

  // ── Blog posts ──────────────────────────────────────────────────────────
  const blogRoutes: MetadataRoute.Sitemap = POSTS.map(p => ({
    url:            `${BASE}/blog/${p.slug}`,
    lastModified:   new Date(p.date),
    changeFrequency:"yearly" as const,
    priority:       0.5,
  }));

  return [...staticRoutes, ...docsRoutes, ...apiRoutes, ...providerRoutes, ...blogRoutes];
}
