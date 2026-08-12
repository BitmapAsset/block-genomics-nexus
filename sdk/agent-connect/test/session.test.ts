// Verified sessions: the SDK half of "an open connection is not an open
// capability". These paths are auth-critical — a bug here either locks out a
// legitimate owner or, worse, lets an unverified caller through — so each one
// asserts on the exact wire traffic rather than just the return value.

import { describe, it, expect } from 'vitest';
import { BlockGenomicsClient, BlockGenomicsError, makeSigner } from '../src/index.js';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

function harness(handler: (rec: Recorded) => { status?: number; body: unknown }) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: any, init: any = {}) => {
    const rec: Recorded = {
      url: String(url),
      method: (init.method ?? 'GET').toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(rec);
    const { status = 200, body } = handler(rec);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const env = (data: unknown) => ({ success: true, data });

const ADDRESS = 'bc1ptestowneraddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const testSigner = (address = ADDRESS) => makeSigner(address, async (m: string) => `SIG(${m})`);

const CHALLENGE = {
  message: 'Block Genomics verification: deadbeef',
  nonce: 'deadbeef',
  expiresAt: '2026-01-01T00:00:00.000Z',
  walletAddress: ADDRESS,
  next: { sign: 's', then: 't', steps: [], maxBlocks: 25, sessionTtlSeconds: 86400 },
};

const TOKEN = 'bg_vfy_' + 'a'.repeat(64);

/** Serves the two-step handshake; anything else 404s so strays are visible. */
function handshake(overrides: { verify?: { status?: number; body: unknown } } = {}) {
  return harness((rec) => {
    if (rec.url.endsWith('/api/v1/session/start')) return { body: env(CHALLENGE) };
    if (rec.url.endsWith('/api/v1/session/verify')) {
      return (
        overrides.verify ?? {
          status: 201,
          body: env({
            token: TOKEN,
            tokenPrefix: TOKEN.slice(0, 15),
            walletAddress: ADDRESS,
            verifiedBlocks: [840000],
            rejected: [],
            expiresAt: '2026-01-02T00:00:00.000Z',
            usage: 'Bearer',
            note: 're-checked at action time',
          }),
        }
      );
    }
    return { status: 404, body: { success: false, error: 'unexpected ' + rec.url } };
  });
}

describe('verifySession — the ownership handshake', () => {
  it('signs the exact challenge message and claims the requested blocks', async () => {
    const { calls, fetchImpl } = handshake();
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    const session = await client.verifySession({ blocks: [840000], label: 'agent-1' });

    expect(calls[0].url).toContain('/api/v1/session/start');
    expect(calls[0].body).toEqual({ walletAddress: ADDRESS });

    expect(calls[1].url).toContain('/api/v1/session/verify');
    expect(calls[1].body).toMatchObject({
      walletAddress: ADDRESS,
      message: CHALLENGE.message,
      // The signature must cover the server's message verbatim — signing anything
      // else is the classic way a handshake silently stops proving anything.
      signature: `SIG(${CHALLENGE.message})`,
      blocks: [840000],
      label: 'agent-1',
    });
    expect(session.verifiedBlocks).toEqual([840000]);
  });

  it('stores the minted token and presents it as a Bearer on gated calls', async () => {
    const { calls, fetchImpl } = harness((rec) => {
      if (rec.url.endsWith('/api/v1/session/start')) return { body: env(CHALLENGE) };
      if (rec.url.endsWith('/api/v1/session/verify')) {
        return {
          status: 201,
          body: env({
            token: TOKEN,
            tokenPrefix: TOKEN.slice(0, 15),
            walletAddress: ADDRESS,
            verifiedBlocks: [840000],
            rejected: [],
            expiresAt: 'x',
            usage: '',
            note: '',
          }),
        };
      }
      return { body: env({ walletAddress: ADDRESS, verifiedBlocks: [840000], canWrite: true }) };
    });
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    await client.verifySession({ blocks: [840000] });
    expect(client.sessionToken).toBe(TOKEN);

    await client.getSession();
    expect(calls[2].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('mints a read-scoped session when no blocks are claimed', async () => {
    const { calls, fetchImpl } = handshake({
      verify: {
        status: 201,
        body: env({
          token: TOKEN,
          tokenPrefix: TOKEN.slice(0, 15),
          walletAddress: ADDRESS,
          verifiedBlocks: [],
          rejected: [],
          expiresAt: 'x',
          usage: '',
          note: '',
        }),
      },
    });
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    const session = await client.verifySession();

    expect(calls[1].body.blocks).toEqual([]);
    expect(session.verifiedBlocks).toEqual([]);
  });

  it('surfaces blocks that failed their on-chain check instead of dropping them', async () => {
    const { fetchImpl } = handshake({
      verify: {
        status: 201,
        body: env({
          token: TOKEN,
          tokenPrefix: TOKEN.slice(0, 15),
          walletAddress: ADDRESS,
          verifiedBlocks: [840000],
          rejected: [{ blockHeight: 840001, reason: 'not held by this wallet', retryable: false }],
          expiresAt: 'x',
          usage: '',
          note: '',
        }),
      },
    });
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    const session = await client.verifySession({ blocks: [840000, 840001] });

    expect(session.verifiedBlocks).toEqual([840000]);
    expect(session.rejected).toEqual([
      { blockHeight: 840001, reason: 'not held by this wallet', retryable: false },
    ]);
  });

  it('does not store a token when verification is rejected', async () => {
    const { fetchImpl } = handshake({
      verify: {
        status: 403,
        body: { success: false, error: 'No claimed block could be verified as owned by this wallet' },
      },
    });
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    await expect(client.verifySession({ blocks: [840000] })).rejects.toThrow(BlockGenomicsError);
    expect(client.sessionToken).toBeUndefined();
  });

  it('requires a signer — the SDK never fabricates an identity', async () => {
    const { calls, fetchImpl } = handshake();
    const client = new BlockGenomicsClient({ fetch: fetchImpl });

    await expect(client.verifySession({ blocks: [840000] })).rejects.toThrow(/requires a signer/);
    expect(calls).toHaveLength(0);
  });
});

describe('gated calls without a session', () => {
  const cases: Array<[string, (c: BlockGenomicsClient) => Promise<unknown>]> = [
    ['getSession', (c) => c.getSession()],
    ['claimUsername', (c) => c.claimUsername('satoshi')],
    ['revokeSession', (c) => c.revokeSession()],
  ];

  for (const [name, call] of cases) {
    it(`${name} refuses locally and never hits the network`, async () => {
      const { calls, fetchImpl } = harness(() => ({ body: env({}) }));
      const client = new BlockGenomicsClient({ fetch: fetchImpl });

      await expect(call(client)).rejects.toThrow(/requires a verified session/);
      expect(calls).toHaveLength(0);
    });
  }
});

describe('username claiming', () => {
  it('sends the session Bearer when claiming', async () => {
    const { calls, fetchImpl } = harness(() => ({
      status: 201,
      body: env({ handle: 'satoshi', walletAddress: ADDRESS, displayName: null }),
    }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    const claimed = await client.claimUsername('satoshi');

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/api/v1/session/username');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toEqual({ handle: 'satoshi' });
    expect(claimed.handle).toBe('satoshi');
  });

  it('checks availability publicly, with no credential attached', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env({ handle: 'satoshi', available: true }) }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    const res = await client.checkUsername('satoshi');

    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(res.available).toBe(true);
  });

  it('propagates a taken handle as an error rather than a silent success', async () => {
    const { fetchImpl } = harness(() => ({
      status: 409,
      body: { success: false, error: 'Handle already taken' },
    }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    await expect(client.claimUsername('satoshi')).rejects.toThrow('Handle already taken');
  });
});

describe('session lifecycle', () => {
  it('revoke clears the local token so the client cannot keep presenting it', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env({ revoked: true }) }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    const res = await client.revokeSession();

    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(res.revoked).toBe(true);
    expect(client.sessionToken).toBeUndefined();
  });

  it('clears the local token even when the revoke call fails', async () => {
    const { fetchImpl } = harness(() => ({ status: 500, body: { success: false, error: 'boom' } }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    await expect(client.revokeSession()).rejects.toThrow('boom');
    // Leaving a token attached after an attempted revoke would keep sending a
    // credential the caller believes is gone.
    expect(client.sessionToken).toBeUndefined();
  });

  it('setSessionToken attaches and detaches a credential', () => {
    const { fetchImpl } = harness(() => ({ body: env({}) }));
    const client = new BlockGenomicsClient({ fetch: fetchImpl });

    expect(client.sessionToken).toBeUndefined();
    client.setSessionToken(TOKEN);
    expect(client.sessionToken).toBe(TOKEN);
    client.setSessionToken(undefined);
    expect(client.sessionToken).toBeUndefined();
  });
});

describe('world writes choose the credential the client actually holds', () => {
  it('uses the session Bearer and skips per-action signing', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env({ object: { id: 'o1' } }) }));
    const client = new BlockGenomicsClient({
      sessionToken: TOKEN,
      signer: testSigner(),
      fetch: fetchImpl,
    });

    await client.createObject({ blockHeight: 840000, objectType: 'cube' });

    // One call: no challenge round-trip, because the server re-checks ownership
    // on-chain at action time instead of trusting a signature over a nonce.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/v1/world');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toMatchObject({ blockHeight: 840000, objectType: 'cube' });
    expect(calls[0].body.signature).toBeUndefined();
  });

  it('falls back to the action-bound signature path with no session', async () => {
    const { calls, fetchImpl } = harness((rec) => {
      if (rec.url.endsWith('/api/v1/challenge')) {
        return { body: env({ message: 'm', nonce: 'n' }) };
      }
      return { body: env({ object: { id: 'o1' } }) };
    });
    const client = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });

    await client.createObject({ blockHeight: 840000, objectType: 'cube' });

    expect(calls[0].url).toContain('/api/v1/challenge');
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(calls[1].body.signature).toBeDefined();
  });

  it('sends the Bearer on object update and delete too', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env({ object: { id: 'o1' } }) }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    await client.updateObject('o1', 840000, { color: '#fff' });
    await client.deleteObject('o1', 840000);

    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('lets a session-only agent build without a signer at all', async () => {
    const { fetchImpl } = harness(() => ({ body: env({ object: { id: 'o1' } }) }));
    const client = new BlockGenomicsClient({ sessionToken: TOKEN, fetch: fetchImpl });

    await expect(
      client.createObject({ blockHeight: 840000, objectType: 'cube' }),
    ).resolves.toBeDefined();
  });
});
