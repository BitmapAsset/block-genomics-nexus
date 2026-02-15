import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://mempool.space https://blockchain.info https://ordinals.com wss://*.supabase.co https://*.supabase.co; frame-ancestors 'none';",
  },
];

// Restrict CORS to our own domain (and localhost for dev)
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? 'https://blockgenomics.io'
  : 'http://localhost:3000';

const corsHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value: allowedOrigins,
  },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Authorization",
  },
  {
    key: "Access-Control-Allow-Credentials",
    value: "true",
  },
];

const nextConfig: NextConfig = {
  // Block Genomics — Bitcoin block verification platform
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  headers: async () => [
    {
      source: "/api/:path*",
      headers: corsHeaders,
    },
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
