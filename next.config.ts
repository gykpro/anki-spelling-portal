import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads for PDF/images
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
