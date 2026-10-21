import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings", "/processing", "/upload", "/library", "/collections", "/assets"],
      },
    ],
    sitemap: "https://bastion-app.com/sitemap.xml",
  };
}
