/**
 * @jest-environment jsdom
 */

/**
 * The wallet provider sits in the root layout, so whatever it imports statically
 * is in every page's first load. The encryption code (e2e-crypto with @noble/*,
 * e2e-register) now loads inside the encryption functions that use it. What must
 * not change: connect and disconnect wipe the derived keypair in the same tick,
 * before anything else happens, and disconnect stays synchronous.
 */
const mockWipe = jest.fn();
const mockRegister = jest.fn(async () => ({ ok: true }));
const mockSign = jest.fn(async () => 'wallet-signature');
const mockConnectByType = jest.fn(async () => 'bc1plazyprovider00000000000000000000000000000000000000000000000');
// A function declaration, so it exists even if a mock factory runs while the imports are hoisted.
function mockBump(k: string) {
  const g = globalThis as unknown as Record<string, number>;
  g[k] = (g[k] || 0) + 1;
}
const loads = (k: string) => (globalThis as unknown as Record<string, number>)[k] || 0;

jest.mock('@/lib/e2e-crypto', () => {
  mockBump('__e2eCryptoLoads');
  return {
    deriveEncryptionKeypair: () => ({ secretKey: new Uint8Array(32).fill(7), publicKey: new Uint8Array(33).fill(2) }),
    exportPublicKey: () => '02'.padEnd(66, 'a'),
    encryptMessage: jest.fn(async () => ({ ciphertext: 'c', nonce: 'n', senderPubKey: 'p', version: 1 })),
    decryptMessage: jest.fn(async () => ({ text: 'plain', verified: true })),
    wipeKeypair: (...a: unknown[]) => mockWipe(...a),
    getDerivationMessage: () => 'derive-encryption-key',
    isValidPublicKey: () => true,
  };
});
jest.mock('@/lib/e2e-register', () => {
  mockBump('__e2eRegisterLoads');
  return { registerEncryptionKey: (...a: unknown[]) => mockRegister(...(a as [])) };
});
jest.mock('sats-connect', () => {
  mockBump('__satsLoads');
  return { getAddress: jest.fn(), signMessage: jest.fn() };
});
jest.mock('@/lib/wallet-utils', () => ({
  detectWallets: () => ({ unisat: false, xverse: false, leather: false, magiceden: false, okx: false }),
  connectWalletByType: (...a: unknown[]) => mockConnectByType(...(a as [])),
  refreshXverseAddress: jest.fn(async () => null),
  signWithWallet: (...a: unknown[]) => mockSign(...(a as [])),
  getSavedSession: () => null,
  saveSession: jest.fn(),
  clearSession: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { GlobalWalletProvider, useGlobalWallet } from '@/context/GlobalWalletContext';

const wrapper = ({ children }: { children: ReactNode }) => <GlobalWalletProvider>{children}</GlobalWalletProvider>;

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { encryptionPubKey: '03'.padEnd(66, 'b') } }) })) as unknown as typeof fetch;

async function connectedWithKeys() {
  const hook = renderHook(() => useGlobalWallet(), { wrapper });
  await act(async () => { await hook.result.current.connect('unisat'); });
  let ok = false;
  await act(async () => { ok = await hook.result.current.e2eSetup(); });
  expect(ok).toBe(true);
  expect(hook.result.current.e2eReady).toBe(true);
  return hook;
}

beforeEach(() => {
  mockWipe.mockClear();
  mockRegister.mockClear();
  mockSign.mockClear();
});

describe('encryption code loads on first use', () => {
  it('rendering the provider loads neither e2e-crypto, e2e-register nor sats-connect', () => {
    const before = [loads('__e2eCryptoLoads'), loads('__e2eRegisterLoads'), loads('__satsLoads')];
    renderHook(() => useGlobalWallet(), { wrapper });
    expect(before).toEqual([0, 0, 0]);
    expect([loads('__e2eCryptoLoads'), loads('__e2eRegisterLoads'), loads('__satsLoads')]).toEqual([0, 0, 0]);
  });

  it('e2eSetup loads them, signs the derivation message and registers the key', async () => {
    await connectedWithKeys();
    expect(loads('__e2eCryptoLoads')).toBe(1);
    expect(loads('__e2eRegisterLoads')).toBe(1);
    expect(mockSign).toHaveBeenCalledWith('unisat', 'derive-encryption-key', expect.any(String));
    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ encryptionPubKey: '02'.padEnd(66, 'a') }));
  });
});

describe('keypair wipe stays synchronous', () => {
  it('disconnect wipes the keypair in the same tick and clears it', async () => {
    const { result } = await connectedWithKeys();
    act(() => {
      result.current.disconnect();
      expect(mockWipe).toHaveBeenCalledTimes(1);
    });
    expect(result.current.e2eReady).toBe(false);
    expect(result.current.isConnected).toBe(false);
    let enc: unknown = 'x';
    await act(async () => { enc = await result.current.e2eEncrypt('hi', 'bc1qsomeone'); });
    expect(enc).toBeNull();
  });

  it('connect wipes the keypair before its first await and clears it', async () => {
    const { result } = await connectedWithKeys();
    await act(async () => {
      const p = result.current.connect('unisat');
      expect(mockWipe).toHaveBeenCalledTimes(1);
      await p;
    });
    expect(result.current.e2eReady).toBe(false);
    let dec: unknown = 'x';
    await act(async () => { dec = await result.current.e2eDecrypt({ ciphertext: 'c', nonce: 'n', senderPubKey: 'p' } as never); });
    expect(dec).toBeNull();
  });

  it('nothing to wipe before any key was derived', () => {
    const { result } = renderHook(() => useGlobalWallet(), { wrapper });
    act(() => { result.current.disconnect(); });
    expect(mockWipe).not.toHaveBeenCalled();
  });

  it('encrypts with the loaded module once keys exist', async () => {
    const { result } = await connectedWithKeys();
    let enc: unknown = null;
    await act(async () => { enc = await result.current.e2eEncrypt('hi', 'bc1qsomeone'); });
    expect(enc).toEqual(expect.objectContaining({ ciphertext: 'c' }));
  });

  it('a disconnect while e2eEncrypt waits for the module makes it return null', async () => {
    const { result } = await connectedWithKeys();
    const e2e = jest.requireMock('@/lib/e2e-crypto') as { encryptMessage: jest.Mock };
    e2e.encryptMessage.mockClear();
    let enc: unknown = 'x';
    await act(async () => {
      const p = result.current.e2eEncrypt('hi', 'bc1qsomeoneelse');
      result.current.disconnect();
      enc = await p;
    });
    expect(enc).toBeNull();
    expect(e2e.encryptMessage).not.toHaveBeenCalled();
  });

  it('a disconnect while e2eDecrypt waits for the module makes it return null', async () => {
    const { result } = await connectedWithKeys();
    const e2e = jest.requireMock('@/lib/e2e-crypto') as { decryptMessage: jest.Mock };
    e2e.decryptMessage.mockClear();
    let dec: unknown = 'x';
    await act(async () => {
      const p = result.current.e2eDecrypt({ ciphertext: 'c', nonce: 'n', senderPubKey: 'p' } as never);
      result.current.disconnect();
      dec = await p;
    });
    expect(dec).toBeNull();
    expect(e2e.decryptMessage).not.toHaveBeenCalled();
  });
});

describe('static imports of the wallet provider', () => {
  const src = readFileSync(path.join(__dirname, '../../src/context/GlobalWalletContext.tsx'), 'utf8');
  const valueImportsOf = (mod: RegExp) =>
    (src.match(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm) || []).filter((s) => mod.test(s));

  it('has no static value import of e2e-crypto, e2e-register, sats-connect or @noble/*', () => {
    expect(valueImportsOf(/['"](@\/lib\/e2e-crypto|@\/lib\/e2e-register|sats-connect|@noble\/[^'"]+)['"]/)).toEqual([]);
  });

  it('loads e2e-crypto and e2e-register with import()', () => {
    expect(src).toMatch(/import\(\s*["']@\/lib\/e2e-crypto["']\s*\)/);
    expect(src).toMatch(/import\(\s*["']@\/lib\/e2e-register["']\s*\)/);
  });

  it('keeps the 5 s poll shape the Leather suite reads', () => {
    expect(src.indexOf('setInterval(')).toBeGreaterThan(0);
    expect(src.indexOf('}, 5000);')).toBeGreaterThan(src.indexOf('setInterval('));
  });
});
