/**
 * In-memory rate limiter for wallet unlock attempts.
 * Prevents brute-force attacks on the wallet password.
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; firstAttempt: number; lockedUntil: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, lockoutDurationMs: number = 300_000, windowMs: number = 600_000) {
    this.maxAttempts = maxAttempts;
    this.lockoutDurationMs = lockoutDurationMs;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry) return true;
    if (entry.lockedUntil > now) return false;
    if (now - entry.firstAttempt > this.windowMs) {
      this.attempts.delete(key);
      return true;
    }
    return entry.count < this.maxAttempts;
  }

  recordAttempt(key: string, success: boolean): void {
    const now = Date.now();
    if (success) {
      this.attempts.delete(key);
      return;
    }
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttempt > this.windowMs) {
      const newEntry = { count: 1, firstAttempt: now, lockedUntil: 0 };
      if (newEntry.count >= this.maxAttempts) {
        newEntry.lockedUntil = now + this.lockoutDurationMs;
      }
      this.attempts.set(key, newEntry);
      return;
    }
    entry.count++;
    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutDurationMs;
    }
  }

  getRemainingLockout(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    const remaining = entry.lockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
