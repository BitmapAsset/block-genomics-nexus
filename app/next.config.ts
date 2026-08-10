import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
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

// Restrict CORS to our own domain
// In development, override via CORS_ORIGIN env var
const allowedOrigins = process.env.CORS_ORIGIN || 'https://blockgenomics.io';

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

  // ── Performance optimizations ──
  compress: true,
  
  // Aggressive code splitting
  experimental: {
    optimizePackageImports: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@supabase/supabase-js',
      'qrcode',
      'framer-motion',
      'lucide-react',
    ],
  },

  // Webpack optimizations
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Tree-shake Three.js — only import what we use
      config.resolve.alias = {
        ...config.resolve.alias,
        'three/examples': false,
      };
    }
    return config;
  },

  headers: async () => [
    {
      source: "/api/:path*",
      headers: corsHeaders,
    },
    {
      // Service worker — must not be cached
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        ...securityHeaders,
        // Cache static assets aggressively
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      // HTML pages — revalidate frequently
      source: "/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      ],
    },
    {
      // Remote MCP endpoint. Ordered after the blanket rules so its Cache-Control
      // wins: the `/:path*` s-maxage above would otherwise let the CDN replay one
      // client's tool output — including token-authorized output — to the next
      // caller.
      source: "/mcp",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store",
        },
      ],
    },
  ],
};

export default nextConfig;
