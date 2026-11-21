/**
 * The wallet helpers load sats-connect only when a Magic Eden connect or sign
 * needs it, so the library is not part of every page's first load. The four
 * sats-connect constants the helpers used are plain strings now; their values
 * are the ones sats-connect 4.2.1 publishes (@sats-connect/core 0.10.0):
 *   AddressPurpose.Ordinals = 'ordinals', AddressPurpose.Payment = 'payment',
 *   BitcoinNetworkType.Mainnet = 'Mainnet', MessageSigningProtocols.BIP322 = 'BIP322'.
 * The mock below exports no constants at all, so every value asserted here
 * comes from wallet-utils itself.
 */
jest.mock('sats-connect', () => {
  const g = globalThis as unknown as { __satsLoads?: number };
  g.__satsLoads = (g.__satsLoads || 0) + 1;
  return { getAddress: jest.fn(), signMessage: jest.fn() };
});

import { readFileSync } from 'fs';
import path from 'path';

type Utils = typeof import('@/lib/wallet-utils');
const loads = () => (globalThis as unknown as { __satsLoads?: number }).__satsLoads || 0;
const ORDINALS = 'bc1plazyordinals000000000000000000000000000000000000000000000';
const PAYMENT = 'bc1qlazypayment0000000000000000000000000';

function setWindow(extra: Record<string, unknown>) {
  (global as unknown as { window: unknown }).window = { ...extra };
}

let utils: Utils;
beforeAll(async () => {
  utils = await import('@/lib/wallet-utils');
});

describe('sats-connect loads on first use', () => {
  it('is not loaded when the wallet helpers are imported', () => {
    expect(utils.detectWallets).toBeInstanceOf(Function);
    expect(loads()).toBe(0);
  });

  it('wallet-utils has no static value import of sats-connect', () => {
    const src = readFileSync(path.join(__dirname, '../../src/lib/wallet-utils.ts'), 'utf8');
    const staticImports = src.match(/^import\s+(?!type\b)[^;]*?from\s+['"]sats-connect['"]/gm) || [];
    expect(staticImports).toEqual([]);
    expect(src).toMatch(/import\(\s*['"]sats-connect['"]\s*\)/);
  });

  it('preloadWalletLibrary starts the import', async () => {
    await utils.preloadWalletLibrary();
    expect(loads()).toBe(1);
  });
});

describe('the constants are tied to the sats-connect types', () => {
  // tsc checks each `satisfies`: a library upgrade that changes one of these
  // values fails the type check instead of sending an old string.
  const src = readFileSync(path.join(__dirname, '../../src/lib/wallet-utils.ts'), 'utf8');
  const typeImport = /^import\s+type\s+\{([^}]*)\}\s+from\s+['"]sats-connect['"]/m.exec(src)?.[1] ?? '';

  it.each(['AddressPurpose', 'BitcoinNetworkType', 'MessageSigningProtocols'])('imports %s from sats-connect as a type only', (name) => {
    expect(typeImport).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it.each([
    ['ADDRESS_PURPOSE_ORDINALS', 'ordinals', 'AddressPurpose.Ordinals'],
    ['ADDRESS_PURPOSE_PAYMENT', 'payment', 'AddressPurpose.Payment'],
    ['NETWORK_MAINNET', 'Mainnet', 'BitcoinNetworkType.Mainnet'],
    ['SIGNING_PROTOCOL_BIP322', 'BIP322', 'MessageSigningProtocols.BIP322'],
  ])('%s is %s and satisfies `${%s}`', (name, value, member) => {
    const re = new RegExp(`const ${name}(: string)? = '${value}' satisfies \`\\$\\{${member.replace('.', '\\.')}\\}\`;`);
    expect(src).toMatch(re);
  });
});

describe('the constants keep sats-connect values', () => {
  afterEach(() => { delete (global as unknown as { window?: unknown }).window; });

  it('Magic Eden connect asks for ordinals + payment on Mainnet through the lazy library', async () => {
    const sats = jest.requireMock('sats-connect') as { getAddress: jest.Mock };
    setWindow({ magicEden: { bitcoin: { isMagicEden: true } } });
    sats.getAddress.mockImplementation(async (opts: { payload: unknown; onFinish: (r: unknown) => void }) => {
      opts.onFinish({ addresses: [{ address: PAYMENT, purpose: 'payment' }, { address: ORDINALS, purpose: 'ordinals' }] });
    });
    await expect(utils.connectMagicEden()).resolves.toBe(ORDINALS);
    expect(sats.getAddress).toHaveBeenCalledTimes(1);
    const payload = sats.getAddress.mock.calls[0][0].payload;
    expect(payload.purposes).toEqual(['ordinals', 'payment']);
    expect(payload.network).toEqual({ type: 'Mainnet' });
  });

  it('Magic Eden sign uses BIP322 on Mainnet through the lazy library', async () => {
    const sats = jest.requireMock('sats-connect') as { signMessage: jest.Mock };
    setWindow({ magicEden: { bitcoin: { isMagicEden: true } } });
    sats.signMessage.mockImplementation(async (opts: { onFinish: (s: string) => void }) => opts.onFinish('me-sig'));
    await expect(utils.signWithWallet('magiceden', 'msg', ORDINALS)).resolves.toBe('me-sig');
    const payload = sats.signMessage.mock.calls[0][0].payload;
    expect(payload).toEqual({ network: { type: 'Mainnet' }, address: ORDINALS, message: 'msg', protocol: 'BIP322' });
  });

  it('Xverse connect asks the provider for ordinals + payment', async () => {
    const request = jest.fn(async () => ({ result: [{ address: ORDINALS, purpose: 'ordinals' }] }));
    setWindow({ BitcoinProvider: { request } });
    await expect(utils.connectXverse()).resolves.toBe(ORDINALS);
    expect(request).toHaveBeenCalledWith('getAddresses', expect.objectContaining({ purposes: ['ordinals', 'payment'] }));
  });

  it('Xverse refresh asks for ordinals + payment', async () => {
    const request = jest.fn(async () => ({ result: { addresses: [{ address: ORDINALS, purpose: 'ordinals' }] } }));
    setWindow({ BitcoinProvider: { request } });
    await expect(utils.refreshXverseAddress()).resolves.toBe(ORDINALS);
    expect(request).toHaveBeenCalledWith('getAddresses', { purposes: ['ordinals', 'payment'] });
  });

  it('Xverse sign uses BIP322', async () => {
    const request = jest.fn(async () => ({ result: { signature: 'xv-sig' } }));
    setWindow({ BitcoinProvider: { request } });
    await expect(utils.signWithWallet('xverse', 'msg', ORDINALS)).resolves.toBe('xv-sig');
    expect(request).toHaveBeenCalledWith('signMessage', { address: ORDINALS, message: 'msg', protocol: 'BIP322' });
  });

  it('picks the ordinals address by its purpose string', async () => {
    const request = jest.fn(async () => ({ result: [{ address: PAYMENT, purpose: 'payment' }, { address: ORDINALS, purpose: 'ordinals' }] }));
    setWindow({ BitcoinProvider: { request } });
    await expect(utils.connectXverse()).resolves.toBe(ORDINALS);
  });
});
