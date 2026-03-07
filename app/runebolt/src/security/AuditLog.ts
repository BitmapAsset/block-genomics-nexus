import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuditEntry } from '../types';

/**
 * Tamper-evident local audit log using hash chains.
 * Each entry's hash includes the previous entry's hash.
 */
export class AuditLog {
  private readonly logPath: string;
  private lastHash: string = '0'.repeat(64);

  constructor(logPath: string) {
    this.logPath = logPath;
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.loadLastHash();
  }

  private loadLastHash(): void {
    if (!fs.existsSync(this.logPath)) return;
    const content = fs.readFileSync(this.logPath, 'utf-8').trim();
    if (!content) return;
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1];
    try {
      const entry = JSON.parse(lastLine) as AuditEntry;
      this.lastHash = entry.hash;
    } catch {
      // Corrupted log - start fresh chain from current state
    }
  }

  log(action: string, details: Record<string, unknown> = {}): AuditEntry {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      action,
      details: this.redactSensitive(details),
      previousHash: this.lastHash,
      hash: '',
    };

    // Compute hash of entry (excluding hash field itself)
    const hashInput = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      details: entry.details,
      previousHash: entry.previousHash,
    });
    entry.hash = crypto.createHash('sha256').update(hashInput).digest('hex');
    this.lastHash = entry.hash;

    // Append to file
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    });
    fs.appendFileSync(this.logPath, line + '\n');

    return entry;
  }

  verify(): { valid: boolean; entries: number; brokenAt?: number } {
    if (!fs.existsSync(this.logPath)) return { valid: true, entries: 0 };

    const content = fs.readFileSync(this.logPath, 'utf-8').trim();
    if (!content) return { valid: true, entries: 0 };

    const lines = content.split('\n');
    let previousHash = '0'.repeat(64);

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.previousHash !== previousHash) {
          return { valid: false, entries: lines.length, brokenAt: i };
        }
        const hashInput = JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          details: entry.details,
          previousHash: entry.previousHash,
        });
        const expectedHash = crypto.createHash('sha256').update(hashInput).digest('hex');
        if (entry.hash !== expectedHash) {
          return { valid: false, entries: lines.length, brokenAt: i };
        }
        previousHash = entry.hash;
      } catch {
        return { valid: false, entries: lines.length, brokenAt: i };
      }
    }

    return { valid: true, entries: lines.length };
  }

  private redactSensitive(details: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['privateKey', 'privkey', 'secret', 'password', 'mnemonic', 'seed', 'preimage'];
    const redacted = { ...details };
    for (const key of sensitiveKeys) {
      if (key in redacted) {
        redacted[key] = '[REDACTED]';
      }
    }
    return redacted;
  }
}
