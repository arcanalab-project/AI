import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb", "mongodb-memory-server"],
};

export default nextConfig;
