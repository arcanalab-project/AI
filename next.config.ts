import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  serverExternalPackages: ["mongodb", "mongodb-memory-server"],
};

if (staticExport) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
}
if (basePath) {
  nextConfig.basePath = basePath;
}

export default nextConfig;
