/**
 * Block Genomics — CORS Configuration
 *
 * Provides consistent CORS headers for all API responses.
 * Configurable via environment variables.
 *
 * @module middleware/cors
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Allowed origins. Defaults to `*` in development.
 *
 * In production, set `CORS_ALLOWED_ORIGINS` to a comma-separated list:
 * ```
 * CORS_ALLOWED_ORIGINS=https://blockgenomics.io,https://verify.blockgenomics.io
 * ```
 */
const ALLOWED_ORIGINS: string[] = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : ["*"];

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-Request-ID",
  "Accept",
].join(", ");

const EXPOSED_HEADERS = [
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "X-Request-ID",
].join(", ");

const MAX_AGE = "86400"; // 24 hours — preflight cache

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate CORS headers for a given origin.
 *
 * If the requesting origin is in the allow-list (or `*` is configured),
 * it's reflected back. Otherwise the header is omitted (browser blocks).
 *
 * @param requestOrigin - The value of the `Origin` request header.
 * @returns A plain object suitable for `NextResponse` headers.
 */
export function corsHeaders(
  requestOrigin?: string | null,
): Record<string, string> {
  let origin = "";

  if (ALLOWED_ORIGINS.includes("*")) {
    origin = "*";
  } else if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    origin = requestOrigin;
  } else if (ALLOWED_ORIGINS.length > 0) {
    // Default to first allowed origin if none matches
    // (client will be blocked by browser, but header is present)
    origin = ALLOWED_ORIGINS[0];
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": MAX_AGE,
  };
}

/**
 * Handle an `OPTIONS` preflight request.
 *
 * Usage in Next.js route:
 * ```ts
 * export { handlePreflight as OPTIONS } from '../middleware/cors';
 * ```
 */
export function handlePreflight(request: Request): Response {
  const origin = request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
