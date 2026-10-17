/**
 * The block heartbeat probes a BYOK guardian with its real key (bg58; bg48 Q-17).
 *
 * `GuardianAgent.llmApiKey` holds AES ciphertext. The probe sent that
 * ciphertext as the bearer token, so every BYOK guardian got a 401, was marked
 * offline, and was paused on the next block. Anthropic additionally takes
 * `x-api-key`, never a Bearer token.
 */

const updates: Array<{ id: string; status: string }> = [];
let guardians: Array<Record<string, unknown>> = [];

jest.mock('@/lib/prisma', () => {
  const client = {
    systemState: { findUnique: async () => null, upsert: async () => ({}) },
    guardianAgent: {
      findMany: async () => guardians,
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        updates.push({ id: where.id, status: data.status });
        return {};
      },
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('@/lib/key-encryption', () => ({
  decryptApiKey: (enc: string) => {
    if (!enc.startsWith('enc:')) throw new Error('Invalid encrypted key format');
    return enc.slice(4);
  },
}));

jest.mock('@/lib/ssrf-fetch', () => ({ assertSafeOutboundUrl: async () => ({ ok: true }) }));

import { executeBlockHeartbeat } from '@/lib/bitcoin-heartbeat';

const seen: Array<{ url: string; headers: Record<string, string> }> = [];

beforeEach(() => {
  updates.length = 0;
  seen.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  globalThis.fetch = (async (url: string, init: { headers?: Record<string, string> } = {}) => {
    if (String(url).includes('/blocks/tip/height')) return { ok: true, text: async () => '900000' };
    seen.push({ url: String(url), headers: init.headers ?? {} });
    const h = init.headers ?? {};
    const ok = h.Authorization === 'Bearer sk-openai' || h['x-api-key'] === 'sk-ant';
    return { ok, status: ok ? 200 : 401, text: async () => '' };
  }) as unknown as typeof fetch;
});

it('decrypts the key and authenticates per provider, so healthy guardians stay active', async () => {
  guardians = [
    { id: 'g-openai', name: 'A', llmProvider: 'openai', llmModel: 'gpt-x', llmApiKey: 'enc:sk-openai', llmEndpoint: null, selfHosted: false, agentEndpoint: null },
    { id: 'g-ant', name: 'B', llmProvider: 'anthropic', llmModel: 'claude-x', llmApiKey: 'enc:sk-ant', llmEndpoint: null, selfHosted: false, agentEndpoint: null },
  ];
  await executeBlockHeartbeat(true);
  expect(seen.find((s) => s.url.includes('openai'))?.headers.Authorization).toBe('Bearer sk-openai');
  expect(seen.find((s) => s.url.includes('anthropic'))?.headers['x-api-key']).toBe('sk-ant');
  expect(updates).toEqual([
    { id: 'g-openai', status: 'active' },
    { id: 'g-ant', status: 'active' },
  ]);
});

it('an undecryptable key is degraded (still active), never probed or paused', async () => {
  guardians = [
    { id: 'g-bad', name: 'C', llmProvider: 'openai', llmModel: 'gpt-x', llmApiKey: 'plaintext-legacy', llmEndpoint: null, selfHosted: false, agentEndpoint: null },
  ];
  await executeBlockHeartbeat(true);
  expect(seen).toHaveLength(0);
  expect(updates).toEqual([{ id: 'g-bad', status: 'active' }]);
});
