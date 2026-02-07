/**
 * Block Genomics — Email Claim Verifier
 *
 * Verifies ownership of an email address via challenge-response.
 * A 6-digit code is sent to the claimed email address.
 * The user must submit the code within 10 minutes.
 *
 * Security considerations:
 * - Codes are 6 digits (1M combinations), rate-limited to 5 attempts
 * - Code hash stored server-side, never logged in plaintext
 * - Disposable email domains blocked via configurable blocklist
 * - Challenge bound to agent genome + nonce (prevents replay)
 * - Re-verification every 90 days
 *
 * @module verify-email
 */

import { createHash, randomInt } from 'crypto';
import type {
  ClaimVerifier,
  EmailChallenge,
  EmailProof,
  VerificationResult,
  RecheckResult,
  VerifiedClaim,
} from './types';
import { ClaimType, VerificationErrorCode } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Disposable/temporary email domains to block */
const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.de', 'trashmail.com', 'trashmail.me', 'trashmail.net',
  'temp-mail.org', '10minutemail.com', 'minutemail.com', 'tempail.com',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'getairmail.com',
  'fakeinbox.com', 'tempinbox.com', 'discard.email', 'trash-mail.com',
]);

/**
 * Interface for sending emails.
 * Implement this with your preferred email provider (SendGrid, SES, SMTP, etc.)
 */
export interface EmailSender {
  /**
   * Send a verification email with the given code.
   * @param to - Recipient email address
   * @param code - 6-digit verification code
   * @param agentName - Name of the agent requesting verification
   * @param genome - The agent's genome hash (for email template)
   * @returns Promise that resolves when email is sent
   * @throws Error if email delivery fails
   */
  sendVerificationEmail(
    to: string,
    code: string,
    agentName: string,
    genome: string,
  ): Promise<void>;
}

// =============================================================================
// EMAIL CLAIM VERIFIER
// =============================================================================

/**
 * Verifier for email claims.
 *
 * Flow:
 * 1. Agent submits email address
 * 2. System generates 6-digit code, sends to email
 * 3. Agent submits code
 * 4. System compares code hash → verified
 *
 * @example
 * ```ts
 * const emailSender = new MyEmailSender(); // implements EmailSender
 * const verifier = new EmailClaimVerifier(emailSender);
 *
 * // Validate
 * const error = verifier.validateClaimValue('user@example.com');
 * if (error) throw new Error(error);
 *
 * // Generate challenge (sends email)
 * const challenge = await verifier.generateChallenge({
 *   claimId: 'clm_abc123',
 *   agentId: 'bg_deadbeef',
 *   genome: 'a3f7...b2c4',
 *   claimValue: 'user@example.com',
 *   nonce: 'randomhex32chars...',
 * });
 *
 * // User receives code via email, submits it
 * const result = await verifier.verifyProof(challenge, {
 *   claimId: 'clm_abc123',
 *   nonce: challenge.nonce,
 *   proofType: 'email_code',
 *   code: '482910',
 * });
 * ```
 */
export class EmailClaimVerifier implements ClaimVerifier<EmailChallenge, EmailProof> {
  readonly claimType = ClaimType.EMAIL;

  private emailSender: EmailSender;
  private blockedDomains: ReadonlySet<string>;

  constructor(
    emailSender: EmailSender,
    additionalBlockedDomains?: string[],
  ) {
    this.emailSender = emailSender;
    this.blockedDomains = additionalBlockedDomains
      ? new Set([...DISPOSABLE_EMAIL_DOMAINS, ...additionalBlockedDomains])
      : DISPOSABLE_EMAIL_DOMAINS;
  }

  /**
   * Validate that the email address is well-formed and not disposable.
   * @param value - Email address to validate
   * @returns null if valid, error message if invalid
   */
  validateClaimValue(value: string): string | null {
    if (!value || typeof value !== 'string') {
      return 'Email address is required';
    }

    const trimmed = value.trim().toLowerCase();

    // RFC 5322 simplified regex — good enough for practical validation
    const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
    if (!emailRegex.test(trimmed)) {
      return 'Invalid email address format';
    }

    // Check minimum length
    if (trimmed.length < 5) {
      return 'Email address too short';
    }

    // Check maximum length (RFC 5321)
    if (trimmed.length > 254) {
      return 'Email address too long (max 254 characters)';
    }

    // Extract domain
    const domain = trimmed.split('@')[1];
    if (!domain || domain.length < 3) {
      return 'Invalid email domain';
    }

    // Must have at least one dot in domain (a@localhost is not allowed)
    if (!domain.includes('.')) {
      return 'Email domain must have a TLD (e.g., .com, .io)';
    }

    // Check disposable domains
    if (this.blockedDomains.has(domain)) {
      return 'Disposable/temporary email addresses are not allowed';
    }

    return null;
  }

  /**
   * Normalize email for consistent storage and comparison.
   * - Lowercase everything
   * - Trim whitespace
   * - Remove dots from Gmail local part (Gmail ignores them)
   * - Remove +alias from local part
   */
  normalizeClaimValue(value: string): string {
    let normalized = value.trim().toLowerCase();

    const [localPart, domain] = normalized.split('@');
    if (!localPart || !domain) return normalized;

    // Remove +alias (user+tag@example.com → user@example.com)
    const withoutAlias = localPart.split('+')[0];

    // Gmail-specific: remove dots from local part
    // user.name@gmail.com and username@gmail.com are the same inbox
    const gmailDomains = ['gmail.com', 'googlemail.com'];
    if (gmailDomains.includes(domain)) {
      const withoutDots = withoutAlias.replace(/\./g, '');
      return `${withoutDots}@${domain}`;
    }

    return `${withoutAlias}@${domain}`;
  }

  /**
   * Generate a verification challenge.
   * Generates a 6-digit code, stores its hash, and sends the code via email.
   */
  async generateChallenge(params: {
    claimId: string;
    agentId: string;
    genome: string;
    claimValue: string;
    nonce: string;
  }): Promise<EmailChallenge> {
    const { claimId, agentId, genome, claimValue, nonce } = params;

    // Generate 6-digit code (100000-999999)
    const code = String(randomInt(100000, 999999));

    // Hash the code with the nonce to prevent tampering
    const codeHash = this.hashCode(code, nonce, genome);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    // Send the email
    try {
      await this.emailSender.sendVerificationEmail(
        claimValue,
        code,
        agentId,
        genome,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      throw new EmailDeliveryError(`Failed to send verification email: ${message}`);
    }

    return {
      claimId,
      claimType: ClaimType.EMAIL,
      claimValue,
      agentId,
      genome,
      nonce,
      issuedAt: now,
      expiresAt,
      instructions: `A 6-digit verification code has been sent to ${claimValue}. Enter the code within 10 minutes to verify ownership.`,
      code,      // NOT stored server-side — only sent in email
      codeHash,  // Stored server-side for comparison
    };
  }

  /**
   * Verify the submitted code against the challenge.
   */
  async verifyProof(
    challenge: EmailChallenge,
    proof: EmailProof,
  ): Promise<VerificationResult> {
    // Check proof type
    if (proof.proofType !== 'email_code') {
      return {
        success: false,
        error: 'Invalid proof type. Expected "email_code".',
        errorCode: VerificationErrorCode.INVALID_PROOF_TYPE,
      };
    }

    // Check nonce matches (prevents replay from a different challenge)
    if (proof.nonce !== challenge.nonce) {
      return {
        success: false,
        error: 'Nonce mismatch. This proof does not match the issued challenge.',
        errorCode: VerificationErrorCode.NONCE_MISMATCH,
      };
    }

    // Check challenge expiration
    if (new Date() > challenge.expiresAt) {
      return {
        success: false,
        error: 'Verification code has expired. Please request a new code.',
        errorCode: VerificationErrorCode.CHALLENGE_EXPIRED,
      };
    }

    // Validate code format
    if (!proof.code || !/^\d{6}$/.test(proof.code)) {
      return {
        success: false,
        error: 'Invalid code format. Must be a 6-digit number.',
        errorCode: VerificationErrorCode.PROOF_MISMATCH,
      };
    }

    // Hash the submitted code and compare
    const submittedHash = this.hashCode(proof.code, challenge.nonce, challenge.genome);

    if (submittedHash !== challenge.codeHash) {
      return {
        success: false,
        error: 'Incorrect verification code.',
        errorCode: VerificationErrorCode.PROOF_MISMATCH,
      };
    }

    // Extract email metadata
    const domain = challenge.claimValue.split('@')[1];
    const provider = this.identifyProvider(domain);

    return {
      success: true,
      metadata: {
        provider,
        domain,
        verifiedVia: 'email_code',
      },
      proofData: {
        codeHash: submittedHash,
        verifiedAt: new Date().toISOString(),
        challengeNonce: challenge.nonce,
      },
    };
  }

  /**
   * Re-check an active email claim.
   * For email, we can't actively re-verify without user interaction.
   * Instead, we check if the domain still resolves (MX records exist).
   */
  async recheckClaim(claim: VerifiedClaim): Promise<RecheckResult> {
    const domain = claim.claimValue.split('@')[1];
    if (!domain) {
      return { valid: false, reason: 'Invalid email format in stored claim' };
    }

    try {
      // Check if domain has MX records (basic liveness check)
      const { promises: dns } = await import('dns');
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, reason: `Domain ${domain} has no MX records` };
      }
      return { valid: true };
    } catch {
      // DNS resolution failure doesn't necessarily mean the email is invalid
      // Could be temporary network issue
      return {
        valid: true,
        updatedMetadata: { lastMxCheckFailed: true, lastMxCheckAt: new Date().toISOString() },
      };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Hash a verification code with nonce and genome for tamper-proof storage.
   * Uses SHA-256 with a domain separator to prevent cross-context attacks.
   */
  private hashCode(code: string, nonce: string, genome: string): string {
    return createHash('sha256')
      .update(`blockgenomics:email_verify:${genome}:${nonce}:${code}`)
      .digest('hex');
  }

  /**
   * Identify the email provider for metadata enrichment.
   */
  private identifyProvider(domain: string): string {
    const providers: Record<string, string> = {
      'gmail.com': 'Google',
      'googlemail.com': 'Google',
      'outlook.com': 'Microsoft',
      'hotmail.com': 'Microsoft',
      'live.com': 'Microsoft',
      'yahoo.com': 'Yahoo',
      'icloud.com': 'Apple',
      'me.com': 'Apple',
      'protonmail.com': 'Proton',
      'proton.me': 'Proton',
      'pm.me': 'Proton',
      'tutanota.com': 'Tuta',
      'tuta.io': 'Tuta',
    };
    return providers[domain] || 'Other';
  }
}

// =============================================================================
// ERRORS
// =============================================================================

/** Error thrown when email delivery fails */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

// =============================================================================
// EXAMPLE EMAIL SENDER (for development/testing)
// =============================================================================

/**
 * Console-based email sender for development.
 * Logs the verification code to stdout instead of sending an email.
 */
export class ConsoleEmailSender implements EmailSender {
  async sendVerificationEmail(
    to: string,
    code: string,
    agentName: string,
    genome: string,
  ): Promise<void> {
    console.log('═══════════════════════════════════════════════');
    console.log('📧 Block Genomics — Email Verification');
    console.log('═══════════════════════════════════════════════');
    console.log(`To:      ${to}`);
    console.log(`Agent:   ${agentName}`);
    console.log(`Genome:  ${genome.slice(0, 16)}…`);
    console.log(`Code:    ${code}`);
    console.log(`Expires: 10 minutes`);
    console.log('═══════════════════════════════════════════════');
  }
}

/**
 * SMTP-based email sender (production).
 * Uses nodemailer under the hood. Install: `npm install nodemailer`
 *
 * @example
 * ```ts
 * const sender = new SmtpEmailSender({
 *   host: 'smtp.sendgrid.net',
 *   port: 587,
 *   auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY! },
 *   from: 'verify@blockgenomics.io',
 * });
 * ```
 */
export class SmtpEmailSender implements EmailSender {
  private config: {
    host: string;
    port: number;
    auth: { user: string; pass: string };
    from: string;
    secure?: boolean;
  };

  constructor(config: {
    host: string;
    port: number;
    auth: { user: string; pass: string };
    from: string;
    secure?: boolean;
  }) {
    this.config = config;
  }

  async sendVerificationEmail(
    to: string,
    code: string,
    agentName: string,
    genome: string,
  ): Promise<void> {
    // Dynamic import to avoid requiring nodemailer if not used
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure ?? this.config.port === 465,
      auth: this.config.auth,
    });

    await transporter.sendMail({
      from: `"Block Genomics" <${this.config.from}>`,
      to,
      subject: `🧬 Your Block Genomics Verification Code: ${code}`,
      text: [
        'Block Genomics — Email Verification',
        '====================================',
        '',
        `Your verification code is: ${code}`,
        '',
        `This code expires in 10 minutes.`,
        '',
        `Agent: ${agentName}`,
        `Genome: ${genome.slice(0, 16)}…`,
        '',
        'If you did not request this verification, please ignore this email.',
        '',
        '— Block Genomics',
        'https://blockgenomics.io',
      ].join('\n'),
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0f; color: #e4e4e7; border: 1px solid #27272a; border-radius: 12px;">
          <h2 style="color: #00ff41; margin: 0 0 24px 0;">🧬 Block Genomics</h2>
          <p style="color: #a1a1aa; margin: 0 0 16px 0;">Email Verification</p>
          <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="color: #71717a; margin: 0 0 8px 0; font-size: 14px;">Your verification code:</p>
            <p style="font-size: 36px; font-weight: bold; color: #f7931a; letter-spacing: 8px; margin: 0;">${code}</p>
          </div>
          <p style="color: #71717a; font-size: 13px; margin: 16px 0;">
            Agent: <span style="color: #a1a1aa;">${agentName}</span><br>
            Genome: <span style="color: #a1a1aa;">${genome.slice(0, 16)}…</span><br>
            Expires in 10 minutes.
          </p>
          <p style="color: #52525b; font-size: 12px; margin: 24px 0 0 0;">
            If you didn't request this, ignore this email.
          </p>
        </div>
      `,
    });
  }
}
