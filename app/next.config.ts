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

  // `/marketplace` now names the advisory third-party venue lane, so the
  // parcel-rental page moved to `/rentals`. Links to the old path are already
  // published, so it stays a permanent redirect rather than a 404.
  redirects: async () => [
    {
      source: "/marketplace",
      destination: "/rentals",
      permanent: true,
    },
  ],

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

  // Next.js applies EVERY matching entry below, and where two entries set the
  // same key the last match wins — over an earlier entry and over a
  // Cache-Control the route handler set on its own response. Each path class
  // therefore gets its Cache-Control from exactly one entry, and the catch-all
  // page rule explicitly excludes the classes that own theirs.
  headers: async () => [
    {
      source: "/api/:path*",
      headers: corsHeaders,
    },
    {
      // Safe default for API responses: never let a shared cache store them.
      // API bodies are per-caller and frequently authorization-scoped.
      //
      // The excluded subtrees are the routes that deliberately set their own
      // Cache-Control — the badge and thumbnail images want to be cached (they
      // compute a value per tier/epoch), and the sandbox routes send a stronger
      // `private, no-store`. A value here would replace theirs.
      source: "/api/((?!v1/badge/|v1/block-thumbnail/|v1/bitmap-image/|v1/sandbox/).*)",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store",
        },
      ],
    },
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
    {
      // HTML pages and other dynamic responses — revalidate frequently.
      //
      // The excluded prefixes each set their own Cache-Control below or in
      // code. Without the exclusion this rule matched every path in the app,
      // which is what made the immutable rule for hashed build output dead and
      // republished `no-store` API responses as `public, s-maxage=60`.
      source: "/((?!api/|_next/static/|og/|mcp$|sw\\.js$).*)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        },
      ],
    },
    {
      // Content-hashed build output: the filename changes whenever the bytes
      // do, so a year-long immutable cache can never pin a client to old code.
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      // Service worker — must not be cached, or clients stay pinned to an old
      // app shell until the cache expires.
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
      // Block share cards: a satori re-render per minute is wasted work, and
      // unfurlers refetch these on every repost.
      source: "/og/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      ],
    },
    {
      // Remote MCP endpoint: a shared cache must never replay one client's
      // tool output — including token-authorized output — to the next caller.
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
