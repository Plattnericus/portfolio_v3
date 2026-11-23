import type { MetadataRoute } from "next";
import { getPortfolio, siteUrl } from "@/lib/portfolio";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getPortfolio();
  const lastModified = data.profile.lastPush ? new Date(data.profile.lastPush) : undefined;
  return [
    {
      url: `${siteUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      images: data.projects.map((p) => `${siteUrl}${p.poster}`),
    },
    { url: `${siteUrl}/sunshine`, changeFrequency: "yearly", priority: 0.4 },
  ];
}
