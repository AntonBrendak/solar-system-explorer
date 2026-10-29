import type { MetadataRoute } from "next";
import { siteOrigin } from "./_lib/site-origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${origin}/sitemap.xml`,
  };
}
