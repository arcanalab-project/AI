import type { NextConfig } from "next";

const internal = process.env.API_INTERNAL_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${internal}/api/:path*` }];
  },
};

export default nextConfig;
