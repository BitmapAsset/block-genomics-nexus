/**
 * §10 — the experience WRITE routes are rate limited.
 *
 * `GET /api/v1/experiences` carried a limit; POST / PATCH / DELETE did not.
 * That gap matters more on this surface than on a read: an experience write
 * costs a live indexer call for the ownership gate AND an outbound probe to an
 * owner-supplied host, so an unlimited caller could use the registry as a
 * request amplifier aimed at a third party of their choosing.
 *
 * What is asserted here is the wiring, not the counting — the fixed-window
 * arithmetic has its own suite. Specifically: every write route charges a
 * bucket, and a 429 short-circuits BEFORE any signature check, indexer call, or
 * database write.
 */

const enforceRateLimit = jest.fn(async () => ({
  response: null as unknown,
  headers: { 'X-RateLimit-Limit': '20' },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: { set: () => {}, get: () => null },
    }),
  },
}));

jest.mock('@/lib/api-rate-limit', () => ({
  enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...(a as [])),
  EXPERIENCE_WRITE_LIMIT: 20,
  EXPERIENCE_VERIFY_LIMIT: 30,
  PUBLIC_READ_LIMIT: 120,
}));

const mockExperienceCreate = jest.fn();
const mockExperienceUpdate = jest.fn();
const mockExperienceDelete = jest.fn();
const mockExperienceFindUnique = jest.fn(async () => null);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    experience: {
      create: (...a: unknown[]) => mockExperienceCreate(...a),
      update: (...a: unknown[]) => mockExperienceUpdate(...a),
      delete: (...a: unknown[]) => mockExperienceDelete(...a),
      findUnique: (...a: unknown[]) => mockExperienceFindUnique(...(a as [])),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
  },
}));

const mockOwnerGate = jest.fn(async () => ({ ok: true, signed: true }));
jest.mock('@/lib/experience-ownership', () => ({
  __esModule: true,
  authorizeExperienceWrite: (...a: unknown[]) => mockOwnerGate(...(a as [])),
}));

import { POST as registerPOST } from '@/app/api/v1/experiences/route';
import { PATCH as patchById, DELETE as deleteById } from '@/app/api/v1/experiences/[id]/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = (body: any) =>
  ({ json: async () => body, url: 'http://test.local/', nextUrl: new URL('http://test.local/'), headers: { get: () => null } } as any);
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

const LIMITED = {
  response: { body: { success: false, code: 'rate_limited' }, status: 429 },
  headers: {},
};

const VALID_BODY = {
  walletAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  blockHeight: 840000,
  name: 'Plaza',
  experienceType: 'web',
  entryUrl: 'https://plaza.example.com',
  transport: 'https',
  version: '1.0.0',
  signature: 'sig',
  message: 'msg',
};

beforeEach(() => {
  enforceRateLimit.mockReset();
  enforceRateLimit.mockResolvedValue({ response: null, headers: { 'X-RateLimit-Limit': '20' } });
  mockExperienceCreate.mockReset();
  mockExperienceUpdate.mockReset();
  mockExperienceDelete.mockReset();
  mockOwnerGate.mockClear();
  mockExperienceFindUnique.mockReset();
  mockExperienceFindUnique.mockResolvedValue(null as any);
});

describe('every experience write route charges a rate-limit bucket', () => {
  it('POST /api/v1/experiences', async () => {
    mockExperienceCreate.mockResolvedValue({ id: 'e1', capabilities: [] });
    mockExperienceFindUnique.mockResolvedValue({ id: 'e1', capabilities: [] } as any);
    await registerPOST(req(VALID_BODY));
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: 'v1-experiences-write', limit: 20 }),
    );
  });

  it('PATCH /api/v1/experiences/[id]', async () => {
    mockExperienceFindUnique.mockResolvedValue({
      id: 'e1', walletAddress: VALID_BODY.walletAddress, blockHeight: 840000, capabilities: [],
      name: 'Plaza', experienceType: 'web', entryUrl: 'https://plaza.example.com', transport: 'https',
      version: '1.0.0', manifestVersion: 1,
    } as any);
    mockExperienceUpdate.mockResolvedValue({ id: 'e1', capabilities: [] });
    await patchById(req({ ...VALID_BODY, version: '2.0.0' }), withId('e1'));
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: 'v1-experiences-write', limit: 20 }),
    );
  });

  it('DELETE /api/v1/experiences/[id]', async () => {
    mockExperienceFindUnique.mockResolvedValue({
      id: 'e1', walletAddress: VALID_BODY.walletAddress, blockHeight: 840000, capabilities: [],
      name: 'Plaza', experienceType: 'web', entryUrl: 'https://plaza.example.com', transport: 'https',
      version: '1.0.0', manifestVersion: 1, manifestHash: 'a'.repeat(64),
    } as any);
    mockExperienceDelete.mockResolvedValue({ id: 'e1' });
    await deleteById(req(VALID_BODY), withId('e1'));
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: 'v1-experiences-write', limit: 20 }),
    );
  });
});

describe('a 429 short-circuits before any auth or database work', () => {
  it('POST returns the limiter response and never reaches the ownership gate', async () => {
    enforceRateLimit.mockResolvedValue(LIMITED as never);
    const res: any = await registerPOST(req(VALID_BODY));
    expect(res.status).toBe(429);
    expect(mockOwnerGate).not.toHaveBeenCalled();
    expect(mockExperienceCreate).not.toHaveBeenCalled();
  });

  it('PATCH returns the limiter response and never reads the record', async () => {
    enforceRateLimit.mockResolvedValue(LIMITED as never);
    const res: any = await patchById(req(VALID_BODY), withId('e1'));
    expect(res.status).toBe(429);
    expect(mockOwnerGate).not.toHaveBeenCalled();
    expect(mockExperienceFindUnique).not.toHaveBeenCalled();
    expect(mockExperienceUpdate).not.toHaveBeenCalled();
  });

  it('DELETE returns the limiter response and never deletes', async () => {
    enforceRateLimit.mockResolvedValue(LIMITED as never);
    const res: any = await deleteById(req(VALID_BODY), withId('e1'));
    expect(res.status).toBe(429);
    expect(mockOwnerGate).not.toHaveBeenCalled();
    expect(mockExperienceDelete).not.toHaveBeenCalled();
  });
});
