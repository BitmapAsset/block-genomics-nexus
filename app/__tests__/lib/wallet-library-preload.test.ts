/**
 * preloadWalletLibrary loads sats-connect once for the page and hands every
 * caller the same load. A load that fails (a chunk that did not arrive, for
 * example) is not kept: the next call loads again.
 *
 * The tests run in order: the first one needs the library's first load to fail
 * (a failed load is not cached, so the next call loads it normally).
 */
jest.mock('sats-connect', () => {
  const g = globalThis as unknown as { __satsAttempts?: number; __satsLoadFails?: boolean };
  g.__satsAttempts = (g.__satsAttempts || 0) + 1;
  if (g.__satsLoadFails) throw new Error('Loading chunk failed');
  return { getAddress: jest.fn(), signMessage: jest.fn() };
});

import { preloadWalletLibrary } from '@/lib/wallet-utils';

const g = globalThis as unknown as { __satsAttempts?: number; __satsLoadFails?: boolean };

describe('preloadWalletLibrary', () => {
  it('loads again after a failed load', async () => {
    g.__satsLoadFails = true;
    await expect(preloadWalletLibrary()).rejects.toThrow('Loading chunk failed');
    expect(g.__satsAttempts).toBe(1);
    g.__satsLoadFails = false;
    const lib = await preloadWalletLibrary();
    expect(typeof lib.getAddress).toBe('function');
    expect(g.__satsAttempts).toBe(2);
  });

  it('keeps one load across calls', async () => {
    const a = preloadWalletLibrary();
    const b = preloadWalletLibrary();
    expect(b).toBe(a);
    await a;
    expect(preloadWalletLibrary()).toBe(a);
    expect(g.__satsAttempts).toBe(2);
  });
});
