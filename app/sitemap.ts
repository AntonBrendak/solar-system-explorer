import type { MetadataRoute } from "next";
import { siteOrigin } from "./_lib/site-origin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const languages = { ru: `${origin}/`, en: `${origin}/?lang=en` };
  return Object.values(languages).map((url) => ({
    url,
    changeFrequency: "monthly",
    priority: 1,
    alternates: { languages },
  }));
}
