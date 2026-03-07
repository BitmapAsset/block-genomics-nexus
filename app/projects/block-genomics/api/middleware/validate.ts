/**
 * Block Genomics — Request Validation Helpers
 *
 * Pure functions that validate and sanitize input.
 * Each throws a `ValidationError` on failure (caught by route handlers).
 *
 * @module middleware/validate
 */

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown when input fails validation.
 * Route handlers catch this and return a 400 with consistent JSON.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ---------------------------------------------------------------------------
// String validators
// ---------------------------------------------------------------------------

/**
 * Validate and return a trimmed string within length bounds.
 *
 * @param value     - The raw input.
 * @param fieldName - Human-readable field name (for error messages).
 * @param minLen    - Minimum length (default 1).
 * @param maxLen    - Maximum length (default 256).
 * @returns The trimmed, validated string.
 * @throws {ValidationError}
 */
export function validateString(
  value: unknown,
  fieldName: string,
  minLen: number = 1,
  maxLen: number = 256,
): string {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`);
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLen) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLen} character(s)`,
    );
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(
      `${fieldName} must be at most ${maxLen} character(s)`,
    );
  }
  return trimmed;
}

/**
 * Validate a string matches a regex pattern.
 *
 * @param value     - The raw input.
 * @param fieldName - Field name.
 * @param pattern   - Regex to test against.
 * @param hint      - Human-readable description of expected format.
 * @returns The validated string.
 * @throws {ValidationError}
 */
export function validatePattern(
  value: unknown,
  fieldName: string,
  pattern: RegExp,
  hint: string,
): string {
  const str = validateString(value, fieldName);
  if (!pattern.test(str)) {
    throw new ValidationError(`${fieldName} must match: ${hint}`);
  }
  return str;
}

// ---------------------------------------------------------------------------
// Numeric validators
// ---------------------------------------------------------------------------

/**
 * Validate a block height (non-negative integer).
 *
 * @param value - The raw input.
 * @returns The validated block height.
 * @throws {ValidationError}
 */
export function validateBlockHeight(value: unknown): number {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || isNaN(num)) {
    throw new ValidationError("blockHeight must be a number");
  }
  if (!Number.isInteger(num) || num < 0) {
    throw new ValidationError("blockHeight must be a non-negative integer");
  }
  if (num > 10_000_000) {
    throw new ValidationError("blockHeight is unreasonably large");
  }
  return num;
}

/**
 * Validate an integer within bounds.
 *
 * @param value     - The raw input.
 * @param fieldName - Field name.
 * @param min       - Minimum value (inclusive).
 * @param max       - Maximum value (inclusive).
 * @returns The validated integer.
 * @throws {ValidationError}
 */
export function validateInt(
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
): number {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`);
  }
  if (!Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }
  if (num < min || num > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
  }
  return num;
}

// ---------------------------------------------------------------------------
// Specialised validators
// ---------------------------------------------------------------------------

/**
 * Validate a Bitcoin address (basic structural check).
 *
 * Does NOT perform full address validation (checksum, network prefix).
 * For production, integrate a library like `bitcoinjs-lib`.
 *
 * @param value - The raw input.
 * @returns The validated address string.
 * @throws {ValidationError}
 */
export function validateBitcoinAddress(value: unknown): string {
  const addr = validateString(value, "address", 20, 128);

  // Basic format: starts with 1, 3, bc1, or tb1, alphanumeric
  if (!/^(1|3|bc1|tb1)[a-zA-HJ-NP-Z0-9]{20,90}$/i.test(addr)) {
    throw new ValidationError(
      "Invalid Bitcoin address format (expected P2PKH, P2SH, or Bech32)",
    );
  }
  return addr;
}

/**
 * Validate a 64-char hex string (block hash, genome, etc.).
 *
 * @param value     - The raw input.
 * @param fieldName - Field name.
 * @returns The validated hex string (lowercase).
 * @throws {ValidationError}
 */
export function validateHex64(value: unknown, fieldName: string): string {
  const str = validateString(value, fieldName, 64, 64);
  if (!/^[0-9a-f]{64}$/i.test(str)) {
    throw new ValidationError(`${fieldName} must be a 64-character hex string`);
  }
  return str.toLowerCase();
}

/**
 * Validate an enum value.
 *
 * @param value     - The raw input.
 * @param fieldName - Field name.
 * @param allowed   - Array of allowed values.
 * @returns The validated value.
 * @throws {ValidationError}
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  const str = validateString(value, fieldName);
  if (!(allowed as readonly string[]).includes(str)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowed.join(", ")}`,
    );
  }
  return str as T;
}

/**
 * Validate an optional boolean.
 *
 * @param value     - The raw input.
 * @param fieldName - Field name.
 * @returns The validated boolean, or undefined if not provided.
 * @throws {ValidationError}
 */
export function validateOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean`);
  }
  return value;
}
