import type { NextConfig } from "next";

const internal = process.env.API_INTERNAL_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["pdfjs-dist"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "bastion-app.com", "www.bastion-app.com"],
  experimental: {
    // Rewrites clone the request body and stop at 10MB unless this is raised.
    // The API accepts MAX_UPLOAD_MB (1024). The extra room is the multipart envelope.
    middlewareClientMaxBodySize: 1100 * 1024 * 1024,
    // The dev proxy otherwise gives the API 30s to answer. Storage of a large
    // video happens before that response, so the default returns 500.
    proxyTimeout: 15 * 60 * 1000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${internal}/api/:path*` }];
  },
};

export default nextConfig;
