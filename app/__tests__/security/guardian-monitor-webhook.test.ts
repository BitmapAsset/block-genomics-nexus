/**
 * The monitor webhook URL is an owner-supplied outbound destination: it is
 * checked like the guardian LLM / agent endpoints (https only, public host,
 * every DNS answer public) when it is stored, checked again before a send,
 * and the send does not follow redirects.
 *
 * Real pair route, real monitor tokens, real URL checks; mocked seams: DB (in
 * memory), DNS (`hostResolvesPublic`), the outbound HTTP (`fetch`).
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse };
});

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

// DNS: one public name, one name that answers with a private address.
jest.mock('@/lib/experience-probe', () => ({
  hostResolvesPublic: async (host: string) => host === 'hooks.example.com',
}));

import prisma from '@/lib/prisma';
import { generateMonitorToken } from '@/lib/monitor-tokens';
import { POST as PAIR } from '@/app/api/v1/guardian/monitor/pair/route';
import { pushActivity } from '@/lib/guardian-notify';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const OWNER = 'bc1powner000000000000000000000000000000000000000000000000000';
let token: string;

function pairReq(webhookUrl: unknown, bearer = token) {
  return {
    json: async () => ({ guardianId: 'grd_a', walletAddress: OWNER, webhookUrl }),
    headers: new Headers({ authorization: `Bearer ${bearer}` }),
  } as any;
}
const stored = async () => (await db.guardianAgent.findUnique({ where: { id: 'grd_a' } })).monitorWebhookUrl;

const realFetch = global.fetch;
let fetchSpy: jest.Mock;

beforeEach(async () => {
  db.__reset();
  await db.guardianAgent.create({ data: { id: 'grd_a', blockHeight: 840000, ownerAddress: OWNER, name: 'g', soulMd: 's', status: 'active' } });
  token = await generateMonitorToken('grd_a', OWNER);
  fetchSpy = jest.fn(async () => new Response('{}', { status: 200 }));
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

describe('POST /api/v1/guardian/monitor/pair checks the webhook URL before storing it', () => {
  it.each([
    'http://hooks.example.com/bg',
    'https://127.0.0.1/hook',
    'https://10.1.2.3/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://[fe80::1]/hook',
    'https://localhost/hook',
    'https://internal.example.com/hook',
    'ftp://hooks.example.com/bg',
  ])('%s: 400, nothing stored', async (url) => {
    const res: any = await PAIR(pairReq(url));
    expect(res.status).toBe(400);
    expect(await stored()).toBeFalsy();
  });

  it('an https URL on a public host: 200, stored', async () => {
    const res: any = await PAIR(pairReq('https://hooks.example.com/bg'));
    expect(res.status).toBe(200);
    expect(await stored()).toBe('https://hooks.example.com/bg');
  });

  it('no webhook URL: pairing still works', async () => {
    const res: any = await PAIR(pairReq(undefined));
    expect(res.status).toBe(200);
    expect(await stored()).toBeNull();
  });
});

describe('pushActivity sends only to a checked URL, without following redirects', () => {
  const push = () => pushActivity({ type: 'summary', guardianId: 'grd_a', blockHeight: 840000, message: 'm', priority: 'low' });

  it('a public https webhook is called with redirect: error', async () => {
    await db.guardianAgent.update({ where: { id: 'grd_a' }, data: { monitorWebhookUrl: 'https://hooks.example.com/bg', monitorPairedAt: new Date() } });
    expect(await push()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0] as any[])[1].redirect).toBe('error');
  });

  it('a stored private or plain-http URL is never fetched', async () => {
    for (const url of ['http://hooks.example.com/bg', 'https://169.254.169.254/x', 'https://internal.example.com/x']) {
      await db.guardianAgent.update({ where: { id: 'grd_a' }, data: { monitorWebhookUrl: url, monitorPairedAt: new Date() } });
      expect(await push()).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
