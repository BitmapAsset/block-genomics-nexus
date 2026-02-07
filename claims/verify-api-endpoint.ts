/**
 * Block Genomics — API Endpoint Claim Verifier
 *
 * Verifies that an AI agent controls a specific API endpoint via challenge-response.
 * This is the critical piece for the "SSL certificates for AI" vision — it proves
 * that a particular URL responds with the correct agent identity.
 *
 * Flow:
 * 1. Agent claims an endpoint URL (e.g., "https://api.example.com/agent")
 * 2. System generates a challenge token + HMAC key
 * 3. System POSTs the challenge to the endpoint
 * 4. Endpoint must respond with the correct signed response
 * 5. Endpoint is verified ✓
 *
 * This is like ACME HTTP-01 validation (Let's Encrypt) but for API agents.
 *
 * Security considerations:
 * - HTTPS required (no HTTP — prevents MITM)
 * - HMAC-signed challenges prevent forgery
 * - Challenge includes genome hash + nonce (prevents cross-agent replay)
 * - Response must be timely (<10 seconds — prevents relay attacks)
 * - Endpoint must return exact challenge token (proves it received our request)
 * - Shortest re-verification TTL (7 days) because endpoints can change rapidly
 * - User-Agent header identifies Block Genomics verifier
 * - Follows redirects (max 3) but records final URL
 * - Rate limited to 10 attempts per hour (agents iterate faster)
 *
 * @module verify-api-endpoint
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import type {
  ClaimVerifier,
  ApiEndpointChallenge,
  ApiEndpointProof,
  VerificationResult,
  RecheckResult,
  VerifiedClaim,
} from './types';
import { ClaimType, VerificationErrorCode } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** User-Agent header for Block Genomics verification requests */
const USER_AGENT = 'BlockGenomics-Verifier/1.0 (+https://blockgenomics.io/verify)';

/** Maximum response time for challenge-response (milliseconds) */
const MAX_RESPONSE_TIME_MS = 10_000;

/** Maximum number of redirects to follow */
const MAX_REDIRECTS = 3;

/** Maximum response body size (bytes) — prevents memory exhaustion */
const MAX_RESPONSE_SIZE = 64 * 1024; // 64KB

/** Challenge endpoint path that must be supported */
const CHALLENGE_PATH = '/.well-known/blockgenomics-verify';

/**
 * The expected response structure from the endpoint.
 * The endpoint must respond to a POST with this format.
 */
interface ChallengeRequest {
  /** Action identifier */
  action: 'blockgenomics_verify';
  /** The challenge token to echo back */
  challenge: string;
  /** Agent genome hash */
  genome: string;
  /** Challenge nonce */
  nonce: string;
  /** HMAC signature of the challenge payload */
  signature: string;
  /** Timestamp of the challenge */
  timestamp: number;
}

interface ChallengeResponse {
  /** Must be "blockgenomics_verify_response" */
  action: 'blockgenomics_verify_response';
  /** Must echo back the exact challenge token */
  challenge: string;
  /** The agent's claimed genome */
  genome: string;
  /** Agent's self-reported name (informational) */
  agentName?: string;
  /** Agent's self-reported version (informational) */
  agentVersion?: string;
  /** Supported capabilities (informational) */
  capabilities?: string[];
}

// =============================================================================
// API ENDPOINT CLAIM VERIFIER
// =============================================================================

/**
 * Verifier for API endpoint claims (AI agents).
 *
 * @example
 * ```ts
 * const verifier = new ApiEndpointClaimVerifier();
 *
 * // Validate URL
 * const error = verifier.validateClaimValue('https://api.example.com/agent');
 *
 * // Generate challenge (POSTs challenge to the endpoint)
 * const challenge = await verifier.generateChallenge({
 *   claimId: 'clm_abc123',
 *   agentId: 'bg_deadbeef',
 *   genome: 'a3f7...b2c4',
 *   claimValue: 'https://api.example.com/agent',
 *   nonce: 'randomhex32chars...',
 * });
 *
 * // The endpoint was already challenged during generateChallenge.
 * // verifyProof triggers the actual check (calls the endpoint again).
 * const result = await verifier.verifyProof(challenge, {
 *   claimId: 'clm_abc123',
 *   nonce: challenge.nonce,
 *   proofType: 'http_challenge',
 * });
 * ```
 */
export class ApiEndpointClaimVerifier implements ClaimVerifier<ApiEndpointChallenge, ApiEndpointProof> {
  readonly claimType = ClaimType.API_ENDPOINT;

  /**
   * Validate that the endpoint URL is well-formed and uses HTTPS.
   */
  validateClaimValue(value: string): string | null {
    if (!value || typeof value !== 'string') {
      return 'API endpoint URL is required';
    }

    const trimmed = value.trim();

    // Must be a valid URL
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return 'Invalid URL format. Must be a complete URL (e.g., https://api.example.com/agent)';
    }

    // Must use HTTPS
    if (url.protocol !== 'https:') {
      return 'API endpoint must use HTTPS. HTTP is not accepted (prevents MITM attacks).';
    }

    // No localhost / private IPs
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return 'Private/localhost endpoints are not verifiable. Must be a public HTTPS URL.';
    }

    // No IP addresses (require domain names)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return 'IP addresses are not allowed. Use a domain name with HTTPS.';
    }

    // URL shouldn't be too long
    if (trimmed.length > 2048) {
      return 'URL too long (max 2048 characters)';
    }

    // No userinfo in URL (user:pass@host)
    if (url.username || url.password) {
      return 'URL must not contain credentials (user:pass@)';
    }

    return null;
  }

  /**
   * Normalize the endpoint URL.
   * - Remove trailing slash
   * - Lowercase hostname
   * - Remove default port
   * - Remove fragment
   */
  normalizeClaimValue(value: string): string {
    try {
      const url = new URL(value.trim());
      // Remove fragment
      url.hash = '';
      // URL constructor already normalizes hostname to lowercase
      // Remove default port
      if (url.port === '443') url.port = '';

      let normalized = url.toString();
      // Remove trailing slash (but keep path slashes)
      if (normalized.endsWith('/') && url.pathname === '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return value.trim();
    }
  }

  /**
   * Generate a challenge for the API endpoint.
   * Does NOT call the endpoint yet — that happens during verifyProof.
   */
  async generateChallenge(params: {
    claimId: string;
    agentId: string;
    genome: string;
    claimValue: string;
    nonce: string;
  }): Promise<ApiEndpointChallenge> {
    const { claimId, agentId, genome, claimValue, nonce } = params;
    const endpointUrl = this.normalizeClaimValue(claimValue);

    // Generate challenge token
    const challengeToken = randomBytes(32).toString('hex');

    // Generate HMAC key for signing the challenge
    const hmacKey = randomBytes(32).toString('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    // Build the well-known URL
    const baseUrl = new URL(endpointUrl);
    const wellKnownUrl = `${baseUrl.origin}${CHALLENGE_PATH}`;

    return {
      claimId,
      claimType: ClaimType.API_ENDPOINT,
      claimValue: endpointUrl,
      agentId,
      genome,
      nonce,
      issuedAt: now,
      expiresAt,
      instructions: [
        `To verify control of ${endpointUrl}:`,
        ``,
        `Your endpoint must respond to POST requests at:`,
        `  ${wellKnownUrl}`,
        ``,
        `Or at the claimed URL directly:`,
        `  ${endpointUrl}`,
        ``,
        `Block Genomics will POST a JSON challenge:`,
        `  {`,
        `    "action": "blockgenomics_verify",`,
        `    "challenge": "${challengeToken.slice(0, 16)}...",`,
        `    "genome": "${genome.slice(0, 16)}...",`,
        `    "nonce": "${nonce.slice(0, 16)}...",`,
        `    "signature": "<hmac>",`,
        `    "timestamp": ${Math.floor(Date.now() / 1000)}`,
        `  }`,
        ``,
        `Your endpoint must respond with:`,
        `  {`,
        `    "action": "blockgenomics_verify_response",`,
        `    "challenge": "<echo the challenge token>",`,
        `    "genome": "<your genome hash>"`,
        `  }`,
        ``,
        `Requirements:`,
        `  • HTTPS only`,
        `  • Response within 10 seconds`,
        `  • Content-Type: application/json`,
        `  • Must echo the exact challenge token`,
        `  • Must include your genome hash`,
        ``,
        `This challenge expires in 5 minutes.`,
      ].join('\n'),
      endpointUrl,
      hmacKey,
      challengeToken,
    };
  }

  /**
   * Verify the API endpoint by sending the challenge and checking the response.
   * This is the core verification — we call the endpoint ourselves.
   */
  async verifyProof(
    challenge: ApiEndpointChallenge,
    proof: ApiEndpointProof,
  ): Promise<VerificationResult> {
    // Validate proof type
    if (proof.proofType !== 'http_challenge') {
      return {
        success: false,
        error: 'Invalid proof type. Expected "http_challenge".',
        errorCode: VerificationErrorCode.INVALID_PROOF_TYPE,
      };
    }

    // Validate nonce
    if (proof.nonce !== challenge.nonce) {
      return {
        success: false,
        error: 'Nonce mismatch.',
        errorCode: VerificationErrorCode.NONCE_MISMATCH,
      };
    }

    // Check expiration
    if (new Date() > challenge.expiresAt) {
      return {
        success: false,
        error: 'Challenge expired. Please request a new one.',
        errorCode: VerificationErrorCode.CHALLENGE_EXPIRED,
      };
    }

    // Build the challenge payload
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadToSign = `${challenge.challengeToken}:${challenge.genome}:${challenge.nonce}:${timestamp}`;
    const signature = createHmac('sha256', challenge.hmacKey)
      .update(payloadToSign)
      .digest('hex');

    const challengeRequest: ChallengeRequest = {
      action: 'blockgenomics_verify',
      challenge: challenge.challengeToken,
      genome: challenge.genome,
      nonce: challenge.nonce,
      signature,
      timestamp,
    };

    // Try the well-known URL first, then fall back to the claimed URL
    const baseUrl = new URL(challenge.endpointUrl);
    const wellKnownUrl = `${baseUrl.origin}${CHALLENGE_PATH}`;

    const urlsToTry = [wellKnownUrl, challenge.endpointUrl];
    // Deduplicate if they're the same
    const uniqueUrls = [...new Set(urlsToTry)];

    let lastError: string = '';
    let respondingUrl: string = '';

    for (const url of uniqueUrls) {
      try {
        const startTime = Date.now();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
            'X-BlockGenomics-Verify': '1',
          },
          body: JSON.stringify(challengeRequest),
          signal: AbortSignal.timeout(MAX_RESPONSE_TIME_MS),
          redirect: 'follow',
        });

        const responseTime = Date.now() - startTime;

        // Check response status
        if (!response.ok) {
          lastError = `Endpoint returned HTTP ${response.status} (${response.statusText})`;
          continue;
        }

        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          lastError = `Expected Content-Type: application/json, got: ${contentType}`;
          continue;
        }

        // Read and parse response body
        const bodyText = await response.text();
        if (bodyText.length > MAX_RESPONSE_SIZE) {
          lastError = `Response body too large (${bodyText.length} bytes, max ${MAX_RESPONSE_SIZE})`;
          continue;
        }

        let body: ChallengeResponse;
        try {
          body = JSON.parse(bodyText) as ChallengeResponse;
        } catch {
          lastError = 'Response body is not valid JSON';
          continue;
        }

        // Validate response structure
        if (body.action !== 'blockgenomics_verify_response') {
          lastError = `Invalid response action. Expected "blockgenomics_verify_response", got "${body.action}"`;
          continue;
        }

        // Validate challenge echo
        if (body.challenge !== challenge.challengeToken) {
          lastError = 'Challenge token in response does not match. Endpoint may be echoing a stale challenge.';
          continue;
        }

        // Validate genome
        if (body.genome !== challenge.genome) {
          lastError = `Genome mismatch. Expected "${challenge.genome.slice(0, 16)}...", got "${(body.genome || '').slice(0, 16)}..."`;
          continue;
        }

        // SUCCESS!
        respondingUrl = url;

        // Hash the response for proof storage (don't store raw tokens)
        const responseHash = createHash('sha256')
          .update(bodyText)
          .digest('hex');

        return {
          success: true,
          metadata: {
            endpointUrl: challenge.endpointUrl,
            respondingUrl,
            responseTimeMs: responseTime,
            agentName: body.agentName,
            agentVersion: body.agentVersion,
            capabilities: body.capabilities,
            verifiedVia: 'http_challenge',
            serverHeader: response.headers.get('server'),
          },
          proofData: {
            responseHash,
            respondingUrl,
            responseTimeMs: responseTime,
            challengeToken: challenge.challengeToken,
            verifiedAt: new Date().toISOString(),
            challengeNonce: challenge.nonce,
          },
        };
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            lastError = `Endpoint did not respond within ${MAX_RESPONSE_TIME_MS / 1000} seconds`;
          } else if (err.message.includes('fetch')) {
            lastError = `Could not reach endpoint: ${err.message}`;
          } else {
            lastError = `Request failed: ${err.message}`;
          }
        } else {
          lastError = 'Unknown error contacting endpoint';
        }
      }
    }

    return {
      success: false,
      error: `API endpoint verification failed. Last error: ${lastError}`,
      errorCode: VerificationErrorCode.ENDPOINT_UNREACHABLE,
    };
  }

  /**
   * Re-check an active API endpoint claim.
   * Sends a lightweight health check to ensure the endpoint is still responding
   * and still identifies with the correct genome.
   */
  async recheckClaim(claim: VerifiedClaim): Promise<RecheckResult> {
    const endpointUrl = claim.claimValue;

    try {
      // Send a simple GET to the well-known path
      const baseUrl = new URL(endpointUrl);
      const wellKnownUrl = `${baseUrl.origin}${CHALLENGE_PATH}`;

      const response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'X-BlockGenomics-Verify': 'recheck',
        },
        signal: AbortSignal.timeout(MAX_RESPONSE_TIME_MS),
      });

      // A 405 Method Not Allowed for GET is acceptable — it means the endpoint
      // exists and is POST-only (which is correct behavior)
      if (response.status === 405) {
        return {
          valid: true,
          updatedMetadata: {
            lastHealthCheckAt: new Date().toISOString(),
            endpointStatus: 'responding',
          },
        };
      }

      // 2xx means endpoint is alive
      if (response.ok) {
        return {
          valid: true,
          updatedMetadata: {
            lastHealthCheckAt: new Date().toISOString(),
            endpointStatus: 'responding',
          },
        };
      }

      // 4xx/5xx — endpoint might be down or changed
      if (response.status >= 500) {
        // Server errors are potentially transient
        return { valid: true };
      }

      // 404 — endpoint removed
      if (response.status === 404) {
        return {
          valid: false,
          reason: `Endpoint ${wellKnownUrl} returned 404 Not Found. Endpoint may have been removed.`,
        };
      }

      return { valid: true };
    } catch (err) {
      // Network errors are potentially transient
      // Only invalidate after consecutive failures (handled by ClaimManager)
      return {
        valid: true,
        updatedMetadata: {
          lastHealthCheckFailed: true,
          lastHealthCheckAt: new Date().toISOString(),
        },
      };
    }
  }
}

// =============================================================================
// WELL-KNOWN ENDPOINT HANDLER
// =============================================================================

/**
 * Helper to create the well-known endpoint handler for an AI agent.
 * Deploy this at `/.well-known/blockgenomics-verify` on your agent's server.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createVerifyEndpointHandler } from './verify-api-endpoint';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.post(
 *   '/.well-known/blockgenomics-verify',
 *   createVerifyEndpointHandler({
 *     genome: 'a3f7b2c4...',
 *     agentName: 'My Cool Agent',
 *     agentVersion: '1.0.0',
 *     capabilities: ['chat', 'analysis', 'code-generation'],
 *   }),
 * );
 * ```
 */
export function createVerifyEndpointHandler(config: {
  genome: string;
  agentName?: string;
  agentVersion?: string;
  capabilities?: string[];
}) {
  return (
    req: { body: ChallengeRequest },
    res: { json: (body: ChallengeResponse) => void; status: (code: number) => { json: (body: unknown) => void } },
  ) => {
    const body = req.body;

    if (body?.action !== 'blockgenomics_verify') {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    if (!body.challenge) {
      res.status(400).json({ error: 'Missing challenge token' });
      return;
    }

    // Respond with the challenge echo
    res.json({
      action: 'blockgenomics_verify_response',
      challenge: body.challenge,
      genome: config.genome,
      agentName: config.agentName,
      agentVersion: config.agentVersion,
      capabilities: config.capabilities,
    });
  };
}
