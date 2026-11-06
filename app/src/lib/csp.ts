/**
 * The report-only content security policy pages send, with a per-request
 * nonce. The middleware is its only writer; the enforced
 * Content-Security-Policy stays in next.config.ts / vercel.json until the
 * enforce phase.
 *
 * Runs on the Edge runtime (middleware), so it uses Web Crypto and `btoa`
 * only.
 */

/** Same list as the enforced policy's connect-src (a test compares them). */
const CONNECT_SRC =
  "'self' https://mempool.space https://blockchain.info https://ordinals.com wss://*.supabase.co https://*.supabase.co";

/** The three stream players lib/stream-embed.ts builds (a test derives them from it). */
const FRAME_SRC = 'https://www.youtube.com https://player.twitch.tv https://player.kick.com';

/** 128 random bits, base64: a fresh value for every response. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * `'strict-dynamic'` lets the nonced framework scripts load their chunks;
 * browsers that support nonces ignore `'self'` in script-src then. Styles keep
 * `'unsafe-inline'` (React style props). `next dev` needs `'unsafe-eval'` for
 * its overlay; a production build never gets it.
 */
export function buildReportOnlyPolicy(nonce: string): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (process.env.NODE_ENV === 'development') scriptSrc.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${CONNECT_SRC}`,
    `frame-src ${FRAME_SRC}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
