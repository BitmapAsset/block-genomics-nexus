import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  basePath: '/runebolt',
  assetPrefix: '/runebolt',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
