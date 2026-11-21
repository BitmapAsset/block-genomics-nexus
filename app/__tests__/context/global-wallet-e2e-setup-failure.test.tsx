/**
 * @jest-environment jsdom
 */

/**
 * e2eSetup loads the encryption code and the key registration code together,
 * before it asks the wallet for the derivation signature, so nothing is loaded
 * between deriving the keypair and registering it. When the setup fails after
 * the keypair was derived (the registration throws, for example), the keypair
 * is wiped at once: a failed setup never leaves a derived keypair in memory.
 *
 * The tests in this file run in order: the first one needs the registration
 * module's first load to fail (a failed load is not cached, so later tests load
 * it normally).
 */
const mockWipe = jest.fn();
const mockRegister = jest.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
const mockSign = jest.fn(async () => 'wallet-signature');
const mockEncrypt = jest.fn(async () => ({ ciphertext: 'c', nonce: 'n', senderPubKey: 'p', version: 1 }));
const flags = globalThis as unknown as { __registerLoadFails?: boolean };

jest.mock('@/lib/e2e-crypto', () => ({
  deriveEncryptionKeypair: () => ({ secretKey: new Uint8Array(32).fill(7), publicKey: new Uint8Array(33).fill(2) }),
  exportPublicKey: () => '02'.padEnd(66, 'a'),
  encryptMessage: (...a: unknown[]) => mockEncrypt(...(a as [])),
  decryptMessage: jest.fn(async () => ({ text: 'plain', verified: true })),
  wipeKeypair: (...a: unknown[]) => mockWipe(...a),
  getDerivationMessage: () => 'derive-encryption-key',
  isValidPublicKey: () => true,
}));
jest.mock('@/lib/e2e-register', () => {
  if ((globalThis as unknown as { __registerLoadFails?: boolean }).__registerLoadFails) {
    throw new Error('Loading chunk failed');
  }
  return { registerEncryptionKey: (...a: unknown[]) => mockRegister(...(a as [])) };
});
jest.mock('@/lib/wallet-utils', () => ({
  detectWallets: () => ({ unisat: false, xverse: false, leather: false, magiceden: false, okx: false }),
  connectWalletByType: jest.fn(async () => 'bc1psetupfailure0000000000000000000000000000000000000000000000'),
  refreshXverseAddress: jest.fn(async () => null),
  signWithWallet: (...a: unknown[]) => mockSign(...(a as [])),
  getSavedSession: () => null,
  saveSession: jest.fn(),
  clearSession: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { GlobalWalletProvider, useGlobalWallet } from '@/context/GlobalWalletContext';

const wrapper = ({ children }: { children: ReactNode }) => <GlobalWalletProvider>{children}</GlobalWalletProvider>;

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { encryptionPubKey: '03'.padEnd(66, 'b') } }) })) as unknown as typeof fetch;

async function connected() {
  const hook = renderHook(() => useGlobalWallet(), { wrapper });
  await act(async () => { await hook.result.current.connect('unisat'); });
  return hook;
}

async function setup(hook: Awaited<ReturnType<typeof connected>>) {
  let ok: boolean | undefined;
  await act(async () => { ok = await hook.result.current.e2eSetup(); });
  return ok;
}

/** True when the provider still holds a keypair: e2eEncrypt only encrypts with one. */
async function holdsKeypair(hook: Awaited<ReturnType<typeof connected>>) {
  mockEncrypt.mockClear();
  let enc: unknown = null;
  await act(async () => { enc = await hook.result.current.e2eEncrypt('hi', 'bc1qrecipient'); });
  return enc !== null && mockEncrypt.mock.calls.length === 1;
}

beforeEach(() => {
  mockWipe.mockClear();
  mockRegister.mockClear();
  mockSign.mockClear();
  flags.__registerLoadFails = false;
});

describe('e2eSetup when it cannot finish', () => {
  it('a registration module that fails to load stops the setup before the signature prompt', async () => {
    flags.__registerLoadFails = true;
    const hook = await connected();
    expect(await setup(hook)).toBe(false);
    expect(mockSign).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(hook.result.current.e2eReady).toBe(false);
    expect(hook.result.current.e2eError).toMatch(/Loading chunk failed/);
    expect(await holdsKeypair(hook)).toBe(false);
  });

  it('a registration that throws wipes the derived keypair and leaves e2e not ready', async () => {
    mockRegister.mockRejectedValueOnce(new Error('network down'));
    const hook = await connected();
    expect(await setup(hook)).toBe(false);
    expect(mockSign).toHaveBeenCalledWith('unisat', 'derive-encryption-key', expect.any(String));
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(mockWipe).toHaveBeenCalledWith(expect.objectContaining({ secretKey: expect.any(Uint8Array) }));
    expect(hook.result.current.e2eReady).toBe(false);
    expect(hook.result.current.e2eError).toMatch(/network down/);
    expect(await holdsKeypair(hook)).toBe(false);
  });

  it('a refused registration is reported as before and keeps the local keypair', async () => {
    mockRegister.mockResolvedValueOnce({ ok: false, error: 'refused' });
    const hook = await connected();
    expect(await setup(hook)).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
    expect(hook.result.current.e2eReady).toBe(true);
    expect(hook.result.current.e2eError).toBe('Encryption key not registered: refused');
    expect(await holdsKeypair(hook)).toBe(true);
  });

  it('a setup that succeeds holds the keypair until a disconnect wipes it', async () => {
    const hook = await connected();
    expect(await setup(hook)).toBe(true);
    expect(hook.result.current.e2eReady).toBe(true);
    expect(await holdsKeypair(hook)).toBe(true);
    act(() => { hook.result.current.disconnect(); });
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(await holdsKeypair(hook)).toBe(false);
  });
});
