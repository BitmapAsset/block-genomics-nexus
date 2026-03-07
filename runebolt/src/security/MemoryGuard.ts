import { CryptoUtils } from './CryptoUtils';

type CleanupFn = () => void;

/**
 * MemoryGuard tracks sensitive buffers and zeroes them after use.
 * Use withGuard() for scoped automatic cleanup.
 */
export class MemoryGuard {
  private readonly tracked: Buffer[] = [];
  private readonly cleanups: CleanupFn[] = [];

  track(buf: Buffer): Buffer {
    this.tracked.push(buf);
    return buf;
  }

  onCleanup(fn: CleanupFn): void {
    this.cleanups.push(fn);
  }

  dispose(): void {
    for (const buf of this.tracked) {
      CryptoUtils.zeroBuffer(buf);
    }
    this.tracked.length = 0;
    for (const fn of this.cleanups) {
      try { fn(); } catch { /* best effort */ }
    }
    this.cleanups.length = 0;
  }

  static async withGuard<T>(fn: (guard: MemoryGuard) => Promise<T>): Promise<T> {
    const guard = new MemoryGuard();
    try {
      return await fn(guard);
    } finally {
      guard.dispose();
    }
  }
}
