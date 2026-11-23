import type { MetadataRoute } from "next";
import { person, site } from "@/lib/portfolio";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: site.title,
    short_name: person.name,
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    categories: ["portfolio", "technology", "developer"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
