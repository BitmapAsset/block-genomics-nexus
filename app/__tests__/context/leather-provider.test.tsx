/**
 * @jest-environment jsdom
 */

/**
 * Leather's provider API, as documented at leather.gitbook.io/developers
 * (checked 2026-10-18):
 *
 *   - The only entry point is `window.LeatherProvider.request(method, params)`.
 *     AuthContext probed for `requestAccounts()` / `getAddresses()` methods,
 *     which Leather does not have, so connecting Leather on /connect always
 *     failed with "Leather wallet API not supported".
 *   - `getAddresses` is a connection request, not a query: each call re-opens
 *     the approval prompt. GlobalWalletContext called it every 5 seconds to
 *     detect account switches, i.e. a prompt loop for every Leather session.
 */

// sats-connect ships ESM that ts-jest does not transform; wallet-utils only
// needs its enums here (same stub as wallet-utils.test.ts).
jest.mock('sats-connect', () => ({
  AddressPurpose: { Ordinals: 'ordinals', Payment: 'payment' },
  MessageSigningProtocols: { ECDSA: 'ECDSA', BIP322: 'BIP322' },
  BitcoinNetworkType: { Mainnet: 'Mainnet' },
  getAddress: jest.fn(),
  signMessage: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { AuthProvider, useAuth } from '@/context/AuthContext';

const TAPROOT = 'bc1pleathertaproot00000000000000000000000000000000000000000000';
const SEGWIT = 'bc1qleathersegwit000000000000000000000';

function installLeather() {
  const request = jest.fn(async (method: string) => {
    if (method === 'getAddresses') {
      return {
        result: {
          addresses: [
            { type: 'p2wpkh', address: SEGWIT },
            { type: 'p2tr', address: TAPROOT },
          ],
        },
      };
    }
    throw new Error(`unexpected ${method}`);
  });
  (window as unknown as { LeatherProvider: unknown }).LeatherProvider = { request };
  return request;
}

afterEach(() => {
  delete (window as unknown as { LeatherProvider?: unknown }).LeatherProvider;
});

it('AuthContext connects Leather through request("getAddresses") and keeps the taproot address', async () => {
  const request = installLeather();
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => {
    await result.current.connect('leather');
  });

  expect(result.current.error).toBeNull();
  expect(request).toHaveBeenCalledWith('getAddresses');
  expect(result.current.walletAddress).toBe(TAPROOT);
  expect(result.current.walletType).toBe('leather');
});

it('GlobalWalletContext never polls Leather getAddresses', () => {
  const src = readFileSync(path.join(__dirname, '../../src/context/GlobalWalletContext.tsx'), 'utf8');
  const poll = src.slice(src.indexOf('setInterval('), src.indexOf('}, 5000);'));
  expect(poll.length).toBeGreaterThan(0);
  expect(poll).not.toContain('LeatherProvider');
  expect(poll).not.toContain('getAddresses');
});
