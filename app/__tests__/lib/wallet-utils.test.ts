// sats-connect is ESM-only and pulls in browser deps; mock the two enum exports
// wallet-utils actually uses so the module loads under the node test environment.
jest.mock('sats-connect', () => ({
  AddressPurpose: { Ordinals: 'ordinals', Payment: 'payment' },
  MessageSigningProtocols: { ECDSA: 'ECDSA', BIP322: 'BIP322' },
}));

import {
  connectXverse,
  refreshXverseAddress,
  signWithWallet,
  connectLeather,
} from '@/lib/wallet-utils';

const ORDINALS = 'bc1pordinalsaddrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const PAYMENT = 'bc1qpaymentaddrxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function setWindow(win: Record<string, unknown>) {
  (global as unknown as { window?: unknown }).window = win;
}

afterEach(() => {
  (global as unknown as { window?: unknown }).window = undefined;
  jest.clearAllMocks();
});

describe('Xverse address resolution (canonical = ordinals/taproot)', () => {
  it('connectXverse prefers the ordinals address over payment', async () => {
    const request = jest.fn().mockResolvedValue({
      result: {
        addresses: [
          { address: PAYMENT, purpose: 'payment' },
          { address: ORDINALS, purpose: 'ordinals' },
        ],
      },
    });
    setWindow({ BitcoinProvider: { request } });

    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(request).toHaveBeenCalledWith(
      'getAddresses',
      expect.objectContaining({ purposes: ['ordinals', 'payment'] }),
    );
  });

  it('connectXverse handles a sats-connect status-wrapped response', async () => {
    const request = jest.fn().mockResolvedValue({
      status: 'success',
      result: { addresses: [{ address: ORDINALS, purpose: 'ordinals' }] },
    });
    setWindow({ BitcoinProvider: { request } });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
  });

  it('refreshXverseAddress returns the SAME canonical ordinals address as connect', async () => {
    const request = jest.fn().mockResolvedValue({
      result: {
        addresses: [
          { address: PAYMENT, purpose: 'payment' },
          { address: ORDINALS, purpose: 'ordinals' },
        ],
      },
    });
    setWindow({ BitcoinProvider: { request } });

    // The poll must never flip the stored identity to the payment address.
    await expect(refreshXverseAddress()).resolves.toBe(ORDINALS);
  });

  it('refreshXverseAddress returns null (ignored) on provider error', async () => {
    const request = jest.fn().mockRejectedValue(new Error('locked'));
    setWindow({ BitcoinProvider: { request } });
    await expect(refreshXverseAddress()).resolves.toBeNull();
  });
});

describe('signWithWallet', () => {
  it('Unisat signs with the bip322-simple protocol', async () => {
    const signMessage = jest.fn().mockResolvedValue('unisat-sig');
    setWindow({ unisat: { signMessage } });

    await expect(signWithWallet('unisat', 'hello')).resolves.toBe('unisat-sig');
    expect(signMessage).toHaveBeenCalledWith('hello', 'bip322-simple');
  });

  it('Xverse signs the connected address with BIP322 and returns the signature', async () => {
    const request = jest.fn().mockResolvedValue({ result: { signature: 'xverse-sig' } });
    setWindow({ BitcoinProvider: { request } });

    await expect(signWithWallet('xverse', 'msg', ORDINALS)).resolves.toBe('xverse-sig');
    expect(request).toHaveBeenCalledWith(
      'signMessage',
      { address: ORDINALS, message: 'msg', protocol: 'BIP322' },
    );
  });

  it('Xverse throws if no address is supplied (no silent address switch)', async () => {
    setWindow({ BitcoinProvider: { request: jest.fn() } });
    await expect(signWithWallet('xverse', 'msg')).rejects.toThrow(/requires an address/);
  });

  it('Xverse surfaces a provider error response as a thrown error', async () => {
    const request = jest.fn().mockResolvedValue({ status: 'error', error: { message: 'user denied' } });
    setWindow({ BitcoinProvider: { request } });
    await expect(signWithWallet('xverse', 'msg', ORDINALS)).rejects.toThrow('user denied');
  });

  it('Leather uses p2tr when signing for a taproot (bc1p) address', async () => {
    const request = jest.fn().mockResolvedValue({ result: { signature: 'leather-tr' } });
    setWindow({ LeatherProvider: { request } });

    await expect(signWithWallet('leather', 'msg', ORDINALS)).resolves.toBe('leather-tr');
    expect(request).toHaveBeenCalledWith('signMessage', { message: 'msg', paymentType: 'p2tr' });
  });

  it('Leather uses p2wpkh for a native-segwit (bc1q) address', async () => {
    const request = jest.fn().mockResolvedValue({ result: { signature: 'leather-wpkh' } });
    setWindow({ LeatherProvider: { request } });

    await expect(signWithWallet('leather', 'msg', PAYMENT)).resolves.toBe('leather-wpkh');
    expect(request).toHaveBeenCalledWith('signMessage', { message: 'msg', paymentType: 'p2wpkh' });
  });
});

describe('connectLeather', () => {
  it('prefers the taproot (p2tr) address', async () => {
    const request = jest.fn().mockResolvedValue({
      result: {
        addresses: [
          { address: PAYMENT, type: 'p2wpkh' },
          { address: ORDINALS, type: 'p2tr' },
        ],
      },
    });
    setWindow({ LeatherProvider: { request } });

    await expect(connectLeather()).resolves.toBe(ORDINALS);
  });
});
