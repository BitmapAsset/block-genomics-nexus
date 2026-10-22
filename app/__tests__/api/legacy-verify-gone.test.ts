/**
 * QA 2026-10-22 #26: the legacy `/api/v1/verify` answered 200
 * `success:true, data:null` to anything, so a client posting a signed
 * challenge there believed it had verified. The route is retired: 410 Gone
 * with a pointer to the live endpoint.
 */

jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));
jest.mock('next/server', () => {
  class NextResponse {
    constructor(
      public body: any, // eslint-disable-line @typescript-eslint/no-explicit-any
      public status: number,
      public headers: Record<string, string>,
    ) {}
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init?.status ?? 200, init?.headers ?? {});
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import { GET, POST } from '@/app/api/v1/verify/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = { headers: { get: () => null }, json: async () => ({ junk: true }) } as any;

it.each([
  ['POST', POST],
  ['GET', GET],
])('%s answers 410 Gone and points at /api/v1/auth/verify', async (_m, handler) => {
  const res: any = await (handler as any)(req);
  expect(res.status).toBe(410);
  expect(res.body.success).toBe(false);
  expect(res.body.code).toBe('gone');
  expect(JSON.stringify(res.body)).toContain('/api/v1/auth/verify');
  expect(res.headers['Cache-Control']).toBe('no-store');
});
