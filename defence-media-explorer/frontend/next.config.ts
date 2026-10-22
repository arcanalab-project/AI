import type { NextConfig } from "next";

const internal = process.env.API_INTERNAL_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost", "bastion-app.com", "www.bastion-app.com"],
  experimental: {
    middlewareClientMaxBodySize: 1100 * 1024 * 1024,
    proxyTimeout: 15 * 60 * 1000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${internal}/api/:path*` }];
  },
};

export default nextConfig;
