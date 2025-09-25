import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip lint and type errors in Vercel builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
