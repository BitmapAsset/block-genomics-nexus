// connectXverse asks getAddresses first. Only when the wallet answers "Access denied" (a site it has not
// connected to yet) does it ask with wallet_connect, and only a wallet that does not know wallet_connect
// reaches the legacy connect(). The answers below are shaped as the Xverse desktop extension 2.12.1 gave
// them: JSON-RPC objects that resolve with { error }, not throws.
jest.mock('sats-connect', () => ({
  AddressPurpose: { Ordinals: 'ordinals', Payment: 'payment' },
  MessageSigningProtocols: { ECDSA: 'ECDSA', BIP322: 'BIP322' },
  BitcoinNetworkType: { Mainnet: 'Mainnet' },
  getAddress: jest.fn(),
  signMessage: jest.fn(),
}));

import { connectXverse } from '@/lib/wallet-utils';

const ORDINALS = 'bc1pordinalsaddrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const PAYMENT = 'bc1qpaymentaddrxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const ADDRS = [
  { address: PAYMENT, purpose: 'payment', addressType: 'p2wpkh' },
  { address: ORDINALS, purpose: 'ordinals', addressType: 'p2tr' },
];
const CONNECTED = { jsonrpc: '2.0', id: '1', result: { id: 'c1', walletType: 'software', addresses: ADDRS } };
const DENIED = { jsonrpc: '2.0', id: '2', error: { code: -32002, message: 'Access denied.' } };
const CLOSED = { jsonrpc: '2.0', id: '3', error: { code: -32000, message: 'User closed the wallet popup.' } };
const MESSAGE = 'Block Genomics needs your Bitcoin address for verification.';

/** A wallet whose request() answers per method; a method without an answer never settles, as Xverse does. */
function wallet(answers: Record<string, unknown>, withRequest = true) {
  const request = jest.fn((method: string) => {
    const a = answers[method];
    if (a === undefined) return new Promise<unknown>(() => {});
    return typeof a === 'function' ? (a as () => Promise<unknown>)() : Promise.resolve(a);
  });
  const connect = jest.fn(() => Promise.resolve({ addresses: ADDRS }));
  const provider = withRequest ? { request, connect } : { connect };
  (global as unknown as { window?: unknown }).window = { BitcoinProvider: provider };
  return { request, connect };
}
const calls = (m: jest.Mock): unknown[][] => m.mock.calls as unknown[][];
const methods = (m: jest.Mock): unknown[] => calls(m).map((c) => c[0]);
const rejects = (value: unknown) => () => Promise.reject(value);

/** What connectXverse threw, or the string 'returned' when it did not throw. */
async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return 'returned';
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (global as unknown as { window?: unknown }).window = undefined;
  jest.restoreAllMocks();
});

describe('connectXverse: a site the wallet has connected to', () => {
  it('(X1) getAddresses answers with the addresses: the ordinals address, no other call', async () => {
    const { request, connect } = wallet({ getAddresses: { result: { addresses: ADDRS } } });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(methods(request)).toEqual(['getAddresses']);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('connectXverse: a site the wallet has not connected to yet', () => {
  it('(X2) access denied as Xverse answers it: asks with wallet_connect (addresses and message), the ordinals address', async () => {
    const { request, connect } = wallet({ getAddresses: DENIED, wallet_connect: CONNECTED });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(methods(request)).toEqual(['getAddresses', 'wallet_connect']);
    expect(calls(request)[1][1]).toEqual({ addresses: ['ordinals', 'payment'], message: MESSAGE });
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['(X3) by its code alone, resolved', { error: { code: -32002, message: 'No.' } }],
    ['(X4) by its words alone, resolved', { error: { message: 'Access denied.' } }],
    ['(X5) thrown as an Error with the code', rejects(Object.assign(new Error('Access denied.'), { code: -32002 }))],
    ['(X6) thrown as a plain object with the code', rejects({ code: -32002, message: 'No.' })],
  ])('access denied %s: the same', async (_name, answer) => {
    const { request, connect } = wallet({ getAddresses: answer, wallet_connect: CONNECTED });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(methods(request)).toEqual(['getAddresses', 'wallet_connect']);
    expect(connect).not.toHaveBeenCalled();
  });

  it('(X7) the user closes or denies the connect window (-32000): an Error with the wallet\'s words, no legacy call', async () => {
    const { request, connect } = wallet({ getAddresses: DENIED, wallet_connect: CLOSED });
    const err = await thrownBy(connectXverse);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('User closed the wallet popup.');
    expect(methods(request)).toEqual(['getAddresses', 'wallet_connect']);
    expect(connect).not.toHaveBeenCalled();
  });

  it('(X8) wallet_connect rejects with an Error: that Error, no legacy call', async () => {
    const boom = new Error('Internal error');
    const { connect } = wallet({ getAddresses: DENIED, wallet_connect: rejects(boom) });
    expect(await thrownBy(connectXverse)).toBe(boom);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['(X9) rejects with a string', rejects('boom'), 'boom'],
    ['(X10) rejects with an object that has no message', rejects({ code: -32603 }), 'Xverse connection failed'],
    ['(X11) resolves an error with an empty message', { error: { code: -32603, message: '' } }, 'Xverse connection failed'],
  ])('wallet_connect %s: an Error, no legacy call', async (_name, answer, message) => {
    const { connect } = wallet({ getAddresses: DENIED, wallet_connect: answer });
    const err = await thrownBy(connectXverse);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(message);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['(X12a) code -32601 alone, resolved', { error: { code: -32601, message: 'No.' } }],
    ['(X12b) code -32001 alone, resolved', { error: { code: -32001, message: 'No.' } }],
    ['(X12c) the words "method not found" alone, resolved', { error: { message: 'Method not found' } }],
    ['(X12d) the words "not supported" alone, resolved', { error: { message: 'Method not supported' } }],
    ['(X12e) the words "unknown method", thrown', rejects(new Error('Unknown method wallet_connect'))],
    ['(X12f) code -32601 alone, thrown as a plain object', rejects({ code: -32601, message: 'No.' })],
    ['(X12g) the words "method not found", thrown as a string', rejects('method not found')],
  ])('a wallet that does not know wallet_connect (%s): the legacy connect, its ordinals address', async (_name, answer) => {
    const { request, connect } = wallet({ getAddresses: DENIED, wallet_connect: answer });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(methods(request)).toEqual(['getAddresses', 'wallet_connect']);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('(X13) connected with a payment address only: the payment address', async () => {
    wallet({ getAddresses: DENIED, wallet_connect: { result: { addresses: [ADDRS[0]] } } });
    await expect(connectXverse()).resolves.toBe(PAYMENT);
  });

  it('(X14) connected but no address at all: an Error, no legacy call', async () => {
    const { connect } = wallet({ getAddresses: DENIED, wallet_connect: { result: { addresses: [] } } });
    const err = await thrownBy(connectXverse);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Xverse returned no Bitcoin address');
    expect(connect).not.toHaveBeenCalled();
  });

  it('(X19) known limit: a wallet that never answers wallet_connect leaves the connect pending, no legacy call', async () => {
    const { request, connect } = wallet({ getAddresses: DENIED });
    const state = await Promise.race([
      connectXverse().then(() => 'settled', () => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    expect(state).toBe('pending');
    expect(methods(request)).toEqual(['getAddresses', 'wallet_connect']);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('connectXverse: every other answer goes on as before', () => {
  it.each([
    ['(X15) getAddresses throws another error', rejects(new Error('Internal error'))],
    ['(X16) getAddresses resolves another error', { error: { code: -32603, message: 'Internal error' } }],
  ])('%s: wallet_connect is not called, the legacy connect answers', async (_name, answer) => {
    const { request, connect } = wallet({ getAddresses: answer });
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(methods(request)).toEqual(['getAddresses']);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('(X17) getAddresses rejected by the user (thrown, "reject"): rethrown, nothing else called', async () => {
    const refused = new Error('User rejected the request.');
    const { request, connect } = wallet({ getAddresses: rejects(refused) });
    expect(await thrownBy(connectXverse)).toBe(refused);
    expect(methods(request)).toEqual(['getAddresses']);
    expect(connect).not.toHaveBeenCalled();
  });

  it('(X18) a provider without request(): the legacy connect answers', async () => {
    const { request, connect } = wallet({}, false);
    await expect(connectXverse()).resolves.toBe(ORDINALS);
    expect(request).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
