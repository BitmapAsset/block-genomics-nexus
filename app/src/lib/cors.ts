/**
 * CORS for `/api/*`, decided in one place (the middleware) per path and method.
 *
 * Public reads (the unauthenticated GETs documented in /openapi.json) answer
 * `Access-Control-Allow-Origin: *` without credentials, so third-party browser
 * apps can read them. `*` never carries cookies, and the API authenticates by
 * header (Authorization / X-API-Key), so nothing ambient leaks. Every other
 * request, including writes to a path that also has a public GET, keeps the
 * pinned origin with credentials, as before.
 *
 * Both values are constants (never the reflected Origin), so a shared cache
 * can store a response without a `Vary: Origin`.
 */

export const PINNED_ORIGIN = process.env.CORS_ORIGIN || 'https://blockgenomics.io';

const EXPOSE = 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-BG-Tier, Retry-After';
const ALLOW_HEADERS = 'Content-Type, Authorization, X-API-Key';

/** Unauthenticated GET endpoints. Keep in step with the public GETs in /openapi.json. */
export const PUBLIC_READ_PATHS: readonly RegExp[] = [
  /^\/api\/v1\/stats$/,
  /^\/api\/v1\/search$/,
  /^\/api\/v1\/blocks\/\d+(\/(summary|market|parcels))?$/,
  /^\/api\/v1\/ownership\/(\d+|verify)$/,
  /^\/api\/v1\/world(\/terrain)?$/,
  /^\/api\/v1\/users\/by-wallet\/[^/]+$/,
  /^\/api\/v1\/profiles\/by-wallet\/[^/]+$/,
  /^\/api\/v1\/profiles\/by-block\/\d+$/,
  /^\/api\/v1\/agents\/block\/\d+$/,
  /^\/api\/v1\/experiences(\/[^/]+)?$/,
];

const READ_METHODS = new Set(['GET', 'HEAD']);

export function isPublicReadPath(pathname: string): boolean {
  return PUBLIC_READ_PATHS.some((re) => re.test(pathname));
}

/**
 * The CORS headers for one API request. For a preflight (`OPTIONS`) the method
 * that matters is the one the browser is asking about.
 */
export function corsHeadersFor(
  pathname: string,
  method: string,
  requestedMethod?: string | null,
): Record<string, string> {
  const m = (method === 'OPTIONS' ? requestedMethod || '' : method).toUpperCase();
  const preflightVary: Record<string, string> = method === 'OPTIONS' ? { Vary: 'Access-Control-Request-Method' } : {};

  if (READ_METHODS.has(m) && isPublicReadPath(pathname)) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Expose-Headers': EXPOSE,
      ...preflightVary,
    };
  }
  return {
    'Access-Control-Allow-Origin': PINNED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Expose-Headers': EXPOSE,
    'Access-Control-Allow-Credentials': 'true',
    ...preflightVary,
  };
}
