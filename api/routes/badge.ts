/**
 * Block Genomics — GET /api/v1/badge/:id
 *
 * Returns a dynamically generated SVG verification badge for an agent.
 * Designed to be embedded via `<img>` tags — responses are `image/svg+xml`
 * with aggressive cache headers.
 *
 * URL variants:
 * - `/api/v1/badge/bg_a3f7...`      → dark theme (default)
 * - `/api/v1/badge/bg_a3f7...?theme=light`
 *
 * @module routes/badge
 */

import { NextRequest, NextResponse } from "next/server";
import { validateString } from "../middleware/validate";
import { checkRateLimit, RateLimitError } from "../middleware/rate-limit";
import { db } from "../../database/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<number, { bg: string; border: string; text: string; label: string }> = {
  1: { bg: "#1a1508", border: "#f7931a", text: "#f7931a", label: "Block Owner" },
  2: { bg: "#121218", border: "#94a3b8", text: "#94a3b8", label: "TX Anchor" },
  3: { bg: "#1a1410", border: "#cd7f32", text: "#cd7f32", label: "Delegated" },
};

const LIGHT_TIER_STYLES: Record<number, { bg: string; border: string; text: string; label: string }> = {
  1: { bg: "#fffbeb", border: "#f7931a", text: "#92400e", label: "Block Owner" },
  2: { bg: "#f8fafc", border: "#64748b", text: "#334155", label: "TX Anchor" },
  3: { bg: "#fef3c7", border: "#cd7f32", text: "#78350f", label: "Delegated" },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/badge/:id`
 *
 * Generates an SVG badge for the given agent.
 *
 * Query params:
 * - `theme` — `"dark"` (default) or `"light"`
 *
 * Returns `Content-Type: image/svg+xml` with caching.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // --- Rate limit ---
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    checkRateLimit(`badge:${ip}`, { maxRequests: 60, windowMs: 60_000 });

    const { id } = await params;
    // Strip `.svg` suffix if present
    const agentId = validateString(id.replace(/\.svg$/i, ""), "id", 1, 64);
    const theme = request.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";

    // --- Fetch agent ---
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        blockHeight: true,
        genome: true,
        tier: true,
        trustScore: true,
        verified: true,
      },
    });

    if (!agent) {
      return new NextResponse(notFoundSvg(agentId), {
        status: 404,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    if (!agent.verified) {
      return new NextResponse(unverifiedSvg(agent.name, agent.blockHeight), {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const svg = generateBadgeSvg(agent, theme);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new NextResponse(errorSvg("Rate limited"), {
        status: 429,
        headers: { "Content-Type": "image/svg+xml" },
      });
    }
    console.error("[badge] Error:", err);
    return new NextResponse(errorSvg("Error"), {
      status: 500,
      headers: { "Content-Type": "image/svg+xml" },
    });
  }
}

// ---------------------------------------------------------------------------
// SVG generators
// ---------------------------------------------------------------------------

/**
 * Generate the main verification badge SVG.
 *
 * Matches the PoC `generateBadgeSVG` style with enhancements:
 * - Genome colour accents derived from genome hex
 * - Tier-specific styling
 * - Trust score meter
 */
function generateBadgeSvg(
  agent: {
    blockHeight: number;
    genome: string;
    tier: number;
    trustScore: number;
    name: string;
  },
  theme: "dark" | "light",
): string {
  const styles = theme === "light" ? LIGHT_TIER_STYLES : TIER_STYLES;
  const t = styles[agent.tier] ?? styles[1];
  const genomeColor = `#${agent.genome.slice(0, 6)}`;

  const bgEnd = theme === "light" ? "#ffffff" : "#0c0c14";
  const subtextColor = theme === "light" ? "#6b7280" : "#71717a";
  const meterBg = theme === "light" ? "#e5e7eb" : "#27272a";

  const blockFormatted = agent.blockHeight.toLocaleString("en-US");
  const trustPct = Math.min(agent.trustScore, 100);
  const meterWidth = Math.round((trustPct / 100) * 100);

  // Escape XML
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="72" viewBox="0 0 320 72">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
    <linearGradient id="meter" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.border}"/>
      <stop offset="100%" stop-color="${genomeColor}"/>
    </linearGradient>
  </defs>
  <!-- Card -->
  <rect width="320" height="72" rx="12" fill="url(#bg)" stroke="${t.border}" stroke-width="1" stroke-opacity="0.4"/>
  <!-- Icon -->
  <text x="16" y="38" font-size="22">🧬</text>
  <!-- Title -->
  <text x="44" y="20" font-family="system-ui,-apple-system,sans-serif" font-size="12" font-weight="700" fill="${t.text}">
    ✓ Verified · Block #${blockFormatted}
  </text>
  <!-- Agent name -->
  <text x="44" y="34" font-family="system-ui,-apple-system,sans-serif" font-size="10" fill="${subtextColor}">
    ${esc(agent.name)} · ${t.label} (Tier ${agent.tier})
  </text>
  <!-- Genome -->
  <text x="44" y="48" font-family="ui-monospace,monospace" font-size="9" fill="${subtextColor}">
    Genome: ${agent.genome.slice(0, 16)}…
  </text>
  <!-- Trust meter background -->
  <rect x="44" y="54" width="100" height="6" rx="3" fill="${meterBg}"/>
  <!-- Trust meter fill -->
  <rect x="44" y="54" width="${meterWidth}" height="6" rx="3" fill="url(#meter)"/>
  <!-- Trust label -->
  <text x="150" y="60" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="${t.text}">
    Trust: ${agent.trustScore}/100
  </text>
  <!-- Powered by -->
  <text x="264" y="66" font-family="system-ui,-apple-system,sans-serif" font-size="7" fill="${subtextColor}" opacity="0.6">
    blockgenomics.io
  </text>
</svg>`;
}

/** SVG for agent not found. */
function notFoundSvg(id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="56" viewBox="0 0 320 56">
  <rect width="320" height="56" rx="12" fill="#1c1917" stroke="#ef4444" stroke-width="1" stroke-opacity="0.4"/>
  <text x="20" y="24" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#ef4444">✗ Agent Not Found</text>
  <text x="20" y="40" font-family="monospace" font-size="9" fill="#71717a">${id.slice(0, 32)}</text>
</svg>`;
}

/** SVG for unverified agent. */
function unverifiedSvg(name: string, blockHeight: number): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="56" viewBox="0 0 320 56">
  <rect width="320" height="56" rx="12" fill="#1c1917" stroke="#eab308" stroke-width="1" stroke-opacity="0.4"/>
  <text x="20" y="24" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#eab308">⏳ Pending Verification</text>
  <text x="20" y="40" font-family="system-ui,sans-serif" font-size="9" fill="#71717a">${esc(name)} · Block #${blockHeight.toLocaleString("en-US")}</text>
</svg>`;
}

/** SVG for error states. */
function errorSvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="40" viewBox="0 0 320 40">
  <rect width="320" height="40" rx="8" fill="#1c1917" stroke="#71717a" stroke-width="1" stroke-opacity="0.3"/>
  <text x="20" y="25" font-family="system-ui,sans-serif" font-size="11" fill="#71717a">${msg}</text>
</svg>`;
}
