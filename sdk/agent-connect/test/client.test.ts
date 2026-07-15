import { describe, it, expect } from 'vitest';
import {
  BlockGenomicsClient,
  BlockGenomicsError,
  makeSigner,
  type RegisteredAgent,
} from '../src/index.js';

// ─── test harness ──────────────────────────────────────────────────────────
// A recording fetch double. Each call is dispatched to `handler`, which returns
// the status + JSON body to serve. Calls are captured for assertions.

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
const errEnv = (error: string, status: number) => ({ status, body: { success: false, error } });

/** A signer whose signature is a deterministic, inspectable function of the message. */
const testSigner = (address = 'bc1ptestowneraddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') =>
  makeSigner(address, async (m: string) => `SIG(${m})`);

const AGENT_ID = 'clagent000000000000000000';

// ─── registration ───────────────────────────────────────────────────────────

describe('registerAgent', () => {
  it('requests an agent-register challenge, signs it, and posts the exact body', async () => {
    const { calls, fetchImpl } = harness((rec) => {
      if (rec.url.endsWith('/api/v1/challenge')) {
        return { body: env({ message: `Block Genomics verification: NONCE_${rec.body.purpose}`, nonce: 'NONCE' }) };
      }
      if (rec.url.endsWith('/api/v1/agents/register')) {
        const agent: RegisteredAgent = {
          id: AGENT_ID,
          walletAddress: rec.body.walletAddress,
          endpointUrl: rec.body.endpointUrl,
          blockHeight: rec.body.blockHeight,
          parcelIndex: rec.body.parcelIndex,
          tier: rec.body.tier,
          permissions: rec.body.permissions,
          status: 'active',
          createdAt: '2026-07-12T00:00:00.000Z',
          lastHeartbeat: '2026-07-12T00:00:00.000Z',
          apiKey: 'bg_agent_deadbeef',
          apiKeyWarning: 'store this now',
        };
        return { status: 201, body: env(agent) };
      }
      throw new Error(`unexpected ${rec.method} ${rec.url}`);
    });

    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    const reg = await bg.registerAgent({
      blockHeight: 840000,
      endpointUrl: 'https://agent.example/callback',
      tier: 1,
      permissions: ['READ_DMS', 'SEND_DMS'],
    });

    // challenge requested with the agent-register purpose
    const challengeCall = calls.find((c) => c.url.endsWith('/challenge'))!;
    expect(challengeCall.method).toBe('POST');
    expect(challengeCall.body).toEqual({ walletAddress: 'bc1powner', purpose: 'agent-register' });

    // register posts the signed challenge + all fields, parcelIndex defaulted to null
    const regCall = calls.find((c) => c.url.endsWith('/agents/register'))!;
    expect(regCall.method).toBe('POST');
    expect(regCall.body).toEqual({
      walletAddress: 'bc1powner',
      endpointUrl: 'https://agent.example/callback',
      blockHeight: 840000,
      parcelIndex: null,
      tier: 1,
      permissions: ['READ_DMS', 'SEND_DMS'],
      signature: 'SIG(Block Genomics verification: NONCE_agent-register)',
      challenge: 'Block Genomics verification: NONCE_agent-register',
    });

    expect(reg.id).toBe(AGENT_ID);
    expect(reg.apiKey).toBe('bg_agent_deadbeef');
  });

  it('forwards an explicit parcelIndex', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge')
        ? { body: env({ message: 'm', nonce: 'n' }) }
        : { status: 201, body: env({ id: AGENT_ID, apiKey: 'bg_agent_x', permissions: [] }) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });
    await bg.registerAgent({ blockHeight: 1, endpointUrl: 'https://a', tier: 2, permissions: ['FULL_AUTONOMY'], parcelIndex: 7 });
    const regCall = calls.find((c) => c.url.endsWith('/agents/register'))!;
    expect(regCall.body.parcelIndex).toBe(7);
  });

  it('throws (401) without a signer', async () => {
    const { fetchImpl } = harness(() => ({ body: env({}) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await expect(
      bg.registerAgent({ blockHeight: 1, endpointUrl: 'https://a', tier: 1, permissions: [] }),
    ).rejects.toMatchObject({ name: 'BlockGenomicsError', status: 401 });
  });
});

// ─── runtime routes (Bearer token, no signer) ────────────────────────────────

describe('runtime routes use the Bearer token, not the signer', () => {
  it('heartbeat POSTs with Authorization: Bearer <token> and no signer', async () => {
    const { calls, fetchImpl } = harness(() => ({
      body: env({ alive: true, lastHeartbeat: '2026-07-12T00:01:00.000Z' }),
    }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl }); // NO signer
    const r = await bg.heartbeat(AGENT_ID, 'bg_agent_tok');
    expect(r).toEqual({ alive: true, lastHeartbeat: '2026-07-12T00:01:00.000Z' });
    const call = calls[0];
    expect(call.method).toBe('POST');
    expect(call.url).toBe(`https://blockgenomics.io/api/v1/agents/${AGENT_ID}/heartbeat`);
    expect(call.headers.Authorization).toBe('Bearer bg_agent_tok');
  });

  it('getAgentEvents GETs with Bearer and builds the since+limit query', async () => {
    const { calls, fetchImpl } = harness(() => ({
      body: env([{ id: 'e1', agentId: AGENT_ID, type: 'heartbeat', payload: {}, timestamp: '2026-07-12T00:00:00.000Z' }]),
    }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const events = await bg.getAgentEvents(AGENT_ID, 'bg_agent_tok', { since: '2026-07-11T00:00:00.000Z', limit: 25 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('heartbeat');
    const call = calls[0];
    expect(call.method).toBe('GET');
    expect(call.headers.Authorization).toBe('Bearer bg_agent_tok');
    expect(call.url).toContain('since=2026-07-11T00%3A00%3A00.000Z');
    expect(call.url).toContain('limit=25');
  });

  it('getAgentEvents omits the query string when no cursor/limit given', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env([]) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await bg.getAgentEvents(AGENT_ID, 'tok');
    expect(calls[0].url).toBe(`https://blockgenomics.io/api/v1/agents/${AGENT_ID}/events`);
  });

  it('submitBrief POSTs with Bearer and defaults pendingPermissions to []', async () => {
    const { calls, fetchImpl } = harness((rec) => ({ status: 201, body: env({ id: 'b1', ...rec.body }) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await bg.submitBrief(AGENT_ID, 'tok', { period: 'daily', summary: 'all good', stats: { visitors: 3 } });
    const call = calls[0];
    expect(call.headers.Authorization).toBe('Bearer tok');
    expect(call.body).toEqual({ period: 'daily', summary: 'all good', stats: { visitors: 3 }, pendingPermissions: [] });
  });
});

// ─── token lifecycle (owner-wallet signature) ────────────────────────────────

describe('token lifecycle is owner-wallet authed', () => {
  it('rotateAgentToken signs an agent-token challenge and returns the new key', async () => {
    const { calls, fetchImpl } = harness((rec) => {
      if (rec.url.endsWith('/challenge')) return { body: env({ message: `M_${rec.body.purpose}`, nonce: 'n' }) };
      return { body: env({ agentId: AGENT_ID, apiKey: 'bg_agent_new', apiKeyCreatedAt: 'now', apiKeyWarning: 'w' }) };
    });
    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    const res = await bg.rotateAgentToken(AGENT_ID);
    expect(res.apiKey).toBe('bg_agent_new');

    expect(calls.find((c) => c.url.endsWith('/challenge'))!.body.purpose).toBe('agent-token');
    const tokenCall = calls.find((c) => c.url.endsWith(`/agents/${AGENT_ID}/token`))!;
    expect(tokenCall.method).toBe('POST');
    expect(tokenCall.body).toEqual({ walletAddress: 'bc1powner', signature: 'SIG(M_agent-token)', challenge: 'M_agent-token' });
  });

  it('revokeAgentToken DELETEs the token route', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge') ? { body: env({ message: 'm', nonce: 'n' }) } : { body: env({ agentId: AGENT_ID, tokenRevoked: true }) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });
    const res = await bg.revokeAgentToken(AGENT_ID);
    expect(res.tokenRevoked).toBe(true);
    expect(calls.find((c) => c.url.endsWith(`/agents/${AGENT_ID}/token`))!.method).toBe('DELETE');
  });

  it('rotateAgentToken throws (401) without a signer', async () => {
    const { fetchImpl } = harness(() => ({ body: env({}) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await expect(bg.rotateAgentToken(AGENT_ID)).rejects.toMatchObject({ status: 401 });
  });
});

// ─── management (agent-manage) ────────────────────────────────────────────────

describe('management routes', () => {
  it('updateAgent PATCHes only the provided fields with an agent-manage challenge', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge') ? { body: env({ message: `M_${rec.body.purpose}`, nonce: 'n' }) } : { body: env({ id: AGENT_ID, endpointUrl: rec.body.endpointUrl, permissions: [] }) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    await bg.updateAgent(AGENT_ID, { endpointUrl: 'https://new.example' });
    expect(calls.find((c) => c.url.endsWith('/challenge'))!.body.purpose).toBe('agent-manage');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    // permissions was NOT provided → must be absent from the body
    expect(patch.body).toEqual({
      walletAddress: 'bc1powner',
      signature: 'SIG(M_agent-manage)',
      challenge: 'M_agent-manage',
      endpointUrl: 'https://new.example',
    });
    expect('permissions' in patch.body).toBe(false);
  });

  it('revokeAgent DELETEs the agent with an agent-manage challenge', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge') ? { body: env({ message: 'm', nonce: 'n' }) } : { body: env({ revoked: true }) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });
    const res = await bg.revokeAgent(AGENT_ID);
    expect(res.revoked).toBe(true);
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.url).toBe(`https://blockgenomics.io/api/v1/agents/${AGENT_ID}`);
  });
});

// ─── public directory (no auth) ──────────────────────────────────────────────

describe('getBlockAgents', () => {
  it('GETs the public directory with no Authorization header', async () => {
    const { calls, fetchImpl } = harness(() => ({
      body: env([
        { blockHeight: 840000, parcelIndex: null, tier: 1, permissions: ['READ_DMS'], status: 'active', endpointUrl: 'https://a', owner: 'bc1powne…xxxxxx', createdAt: 'now', lastHeartbeat: null },
      ]),
    }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const agents = await bg.getBlockAgents(840000);
    expect(agents).toHaveLength(1);
    expect(agents[0].owner).toContain('…'); // truncated
    const call = calls[0];
    expect(call.method).toBe('GET');
    expect(call.headers.Authorization).toBeUndefined();
    expect(call.url).toBe('https://blockgenomics.io/api/v1/agents/block/840000');
  });
});

// ─── error propagation ───────────────────────────────────────────────────────

describe('error handling', () => {
  it('propagates a 401 error envelope as BlockGenomicsError with the HTTP status', async () => {
    const { fetchImpl } = harness(() => errEnv('Missing Authorization: Bearer <agent token>', 401));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await expect(bg.heartbeat(AGENT_ID, 'tok')).rejects.toMatchObject({
      name: 'BlockGenomicsError',
      status: 401,
      message: 'Missing Authorization: Bearer <agent token>',
    });
  });

  it('surfaces a 429 on token rotate', async () => {
    const { fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge') ? { body: env({ message: 'm', nonce: 'n' }) } : errEnv('Rate limit exceeded — slow down and retry shortly', 429),
    );
    const bg = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });
    await expect(bg.rotateAgentToken(AGENT_ID)).rejects.toMatchObject({ status: 429 });
  });

  it('exposes BlockGenomicsError for instanceof checks', async () => {
    const { fetchImpl } = harness(() => errEnv('nope', 403));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const e = await bg.getBlockAgents(1).catch((x) => x);
    expect(e).toBeInstanceOf(BlockGenomicsError);
  });
});

// ─── base URL handling ───────────────────────────────────────────────────────

describe('base URL', () => {
  it('honors a custom baseUrl and strips trailing slashes', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env([]) }));
    const bg = new BlockGenomicsClient({ baseUrl: 'https://staging.blockgenomics.io/', fetch: fetchImpl });
    await bg.getBlockAgents(1);
    expect(calls[0].url).toBe('https://staging.blockgenomics.io/api/v1/agents/block/1');
  });
});

// ─── experiences (self-hosted worlds) ────────────────────────────────────────

const MANIFEST = {
  blockHeight: 840128,
  name: 'My Minecraft Realm',
  description: 'A survival server on my block.',
  experienceType: 'minecraft' as const,
  entryUrl: 'wss://realm.example.com',
  transport: 'wss' as const,
  version: '1.0.0',
};

const experienceRecord = (over: Record<string, unknown> = {}) => ({
  id: 'exp_00000000000000000000000',
  walletAddress: 'bc1powner',
  status: 'pending',
  lastProbedAt: null,
  probeLatencyMs: null,
  soulJudged: true,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  ...MANIFEST,
  ...over,
});

describe('experiences.register', () => {
  it('signs an experience-register challenge and posts the manifest + auth envelope', async () => {
    const { calls, fetchImpl } = harness((rec) => {
      if (rec.url.endsWith('/challenge')) {
        return { body: env({ message: `M_${rec.body.purpose}`, nonce: 'n' }) };
      }
      return { status: 201, body: env(experienceRecord({ status: 'live' })) };
    });
    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    const exp = await bg.experiences.register(MANIFEST);

    expect(calls.find((c) => c.url.endsWith('/challenge'))!.body).toEqual({
      walletAddress: 'bc1powner',
      purpose: 'experience-register',
    });
    const post = calls.find((c) => c.url.endsWith('/api/v1/experiences'))!;
    expect(post.method).toBe('POST');
    expect(post.body).toEqual({
      ...MANIFEST,
      walletAddress: 'bc1powner',
      signature: 'SIG(M_experience-register)',
      challenge: 'M_experience-register',
    });
    expect(exp.id).toBe('exp_00000000000000000000000');
    expect(exp.status).toBe('live');
  });

  it('throws (401) without a signer', async () => {
    const { fetchImpl } = harness(() => ({ body: env({}) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await expect(bg.experiences.register(MANIFEST)).rejects.toMatchObject({ status: 401 });
  });

  it('surfaces a 422 constitution rejection as BlockGenomicsError', async () => {
    const { fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge')
        ? { body: env({ message: 'm', nonce: 'n' }) }
        : errEnv('Manifest text flagged by the constitution', 422),
    );
    const bg = new BlockGenomicsClient({ signer: testSigner(), fetch: fetchImpl });
    await expect(bg.experiences.register(MANIFEST)).rejects.toMatchObject({ status: 422 });
  });
});

describe('experiences reads (public, no signer)', () => {
  it('get GETs the experience by id with no Authorization header', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env(experienceRecord()) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const exp = await bg.experiences.get('exp_abc');
    expect(exp.name).toBe('My Minecraft Realm');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('https://blockgenomics.io/api/v1/experiences/exp_abc');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('list builds the block/type/status/limit/offset query and returns the page', async () => {
    const { calls, fetchImpl } = harness(() => ({
      body: env({ experiences: [experienceRecord()], total: 1, limit: 20, offset: 0 }),
    }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const page = await bg.experiences.list({ blockHeight: 840128, type: 'minecraft', status: 'live', limit: 20 });
    expect(page.total).toBe(1);
    expect(page.experiences).toHaveLength(1);
    const url = calls[0].url;
    expect(url).toContain('blockHeight=840128');
    expect(url).toContain('type=minecraft');
    expect(url).toContain('status=live');
    expect(url).toContain('limit=20');
  });

  it('list omits the query string entirely when no filters are given', async () => {
    const { calls, fetchImpl } = harness(() => ({ body: env({ experiences: [], total: 0, limit: 50, offset: 0 }) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await bg.experiences.list();
    expect(calls[0].url).toBe('https://blockgenomics.io/api/v1/experiences');
  });

  it('probe POSTs to the probe route with no signer', async () => {
    const { calls, fetchImpl } = harness(() => ({
      body: env(experienceRecord({ status: 'degraded', probeLatencyMs: 3200, lastProbedAt: '2026-07-15T00:05:00.000Z' })),
    }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    const exp = await bg.experiences.probe('exp_abc');
    expect(exp.status).toBe('degraded');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://blockgenomics.io/api/v1/experiences/exp_abc/probe');
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});

describe('experiences writes (owner-wallet signature)', () => {
  it('update signs an experience-manage challenge and PATCHes only the given fields', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge')
        ? { body: env({ message: `M_${rec.body.purpose}`, nonce: 'n' }) }
        : { body: env(experienceRecord({ version: '1.1.0' })) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    await bg.experiences.update('exp_abc', { version: '1.1.0' });
    expect(calls.find((c) => c.url.endsWith('/challenge'))!.body.purpose).toBe('experience-manage');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('https://blockgenomics.io/api/v1/experiences/exp_abc');
    expect(patch.body).toEqual({
      version: '1.1.0',
      walletAddress: 'bc1powner',
      signature: 'SIG(M_experience-manage)',
      challenge: 'M_experience-manage',
    });
  });

  it('remove signs an experience-manage challenge and DELETEs the experience', async () => {
    const { calls, fetchImpl } = harness((rec) =>
      rec.url.endsWith('/challenge')
        ? { body: env({ message: `M_${rec.body.purpose}`, nonce: 'n' }) }
        : { body: env({ id: 'exp_abc', removed: true }) },
    );
    const bg = new BlockGenomicsClient({ signer: testSigner('bc1powner'), fetch: fetchImpl });
    const res = await bg.experiences.remove('exp_abc');
    expect(res).toEqual({ id: 'exp_abc', removed: true });
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.url).toBe('https://blockgenomics.io/api/v1/experiences/exp_abc');
    expect(del.body).toEqual({
      walletAddress: 'bc1powner',
      signature: 'SIG(M_experience-manage)',
      challenge: 'M_experience-manage',
    });
  });

  it('update throws (401) without a signer', async () => {
    const { fetchImpl } = harness(() => ({ body: env({}) }));
    const bg = new BlockGenomicsClient({ fetch: fetchImpl });
    await expect(bg.experiences.update('exp_abc', { version: '2.0.0' })).rejects.toMatchObject({ status: 401 });
  });
});
