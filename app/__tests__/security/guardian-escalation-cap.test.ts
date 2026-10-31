/**
 * A guardian with no LLM forwards visitor messages to its owner. The forward
 * is capped and the notice is a fixed text:
 *
 *   - per IP: 20 forwards an hour; beyond that 429, no event row, no notice;
 *   - per guardian: 5 notices an hour; beyond that the event row is still
 *     stored (the owner reads it in the monitor), no mail or Telegram;
 *   - the notice names the block and says a message waits in the guardian
 *     monitor; it carries no visitor text, handle or address, no owner-set
 *     free text, and no URL taken from any input.
 *
 * Real route + real notify module; mocked seams: DB (in memory, with an atomic
 * counter for the durable limiter), the outbound HTTP (`fetch`), agent events.
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
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));

import prisma from '@/lib/prisma';
import { POST as CHAT } from '@/app/api/v1/guardian/chat/route';
import { notifyEscalation } from '@/lib/escalation-notify';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const GUARDIAN_NAME = 'Owner Set Name 5b2';
const VISITOR_TEXT = 'Please read https://example.net/x and reply 9f3';
const VISITOR_HANDLE = 'Visitor Handle 4d1';
const VISITOR_ADDR = 'bc1pclaimed0000000000000000000000000000000000000000000000000';

const windows = new Map<string, { start: number; count: number }>();
function installCounter() {
  windows.clear();
  db.$queryRaw = async (_s: TemplateStringsArray, key: string, windowStart: Date) => {
    const start = windowStart.getTime();
    const w = windows.get(key);
    const next = w && w.start === start ? { start, count: w.count + 1 } : { start, count: 1 };
    windows.set(key, next);
    return [{ count: next.count }];
  };
}

const sent: Array<{ url: string; body: string }> = [];
const realFetch = global.fetch;
const env = { ...process.env };

function req(ip: string, body: Record<string, unknown> = {}) {
  return {
    json: async () => ({ blockHeight: String(BLOCK), message: VISITOR_TEXT, visitorHandle: VISITOR_HANDLE, visitorAddress: VISITOR_ADDR, ...body }),
    headers: new Headers({ 'content-type': 'application/json', 'x-forwarded-for': ip }),
  } as any;
}
const events = () => db.__rows('guardianEvent').filter((e: any) => e.eventType === 'escalation');

beforeEach(async () => {
  db.__reset();
  installCounter();
  sent.length = 0;
  process.env.RESEND_API_KEY = 'test-resend-placeholder';
  process.env.BG_TELEGRAM_BOT_TOKEN = 'test-telegram-placeholder';
  global.fetch = jest.fn(async (url: any, init?: any) => {
    sent.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  // No LLM configured: every visitor message is forwarded to the owner.
  await db.guardianAgent.create({
    data: {
      id: 'grd_a', blockHeight: BLOCK, ownerAddress: 'bc1powner', name: GUARDIAN_NAME, soulMd: 's', status: 'active',
      escalateEmail: 'owner@example.com', escalateTelegram: '123456789', totalMessages: 0,
    },
  });
});

afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...env };
});

describe('per-IP cap on forwarded messages', () => {
  it('the 21st forward from one IP in an hour is 429, with no event row and no notice', async () => {
    for (let i = 0; i < 20; i++) {
      const ok: any = await CHAT(req('198.51.100.1'));
      expect(ok.status).toBe(200);
    }
    const rowsBefore = events().length;
    const sendsBefore = sent.length;
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(429);
    expect(events().length).toBe(rowsBefore);
    expect(sent.length).toBe(sendsBefore);
  });

  it('another IP is still served', async () => {
    for (let i = 0; i < 21; i++) await CHAT(req('198.51.100.1'));
    const res: any = await CHAT(req('198.51.100.2'));
    expect(res.status).toBe(200);
  });
});

describe('per-guardian cap on notices', () => {
  it('the 6th forward for one guardian in an hour stores the event row and sends nothing', async () => {
    for (let i = 0; i < 5; i++) {
      const r: any = await CHAT(req(`198.51.100.${10 + i}`));
      expect(r.status).toBe(200);
    }
    // Each of the first five reached both configured channels.
    expect(sent.filter((s) => s.url.includes('resend')).length).toBe(5);
    expect(sent.filter((s) => s.url.includes('telegram')).length).toBe(5);
    const sendsBefore = sent.length;
    const res: any = await CHAT(req('198.51.100.99'));
    expect(res.status).toBe(200);
    expect(events().length).toBe(6);
    expect(sent.length).toBe(sendsBefore);
  });
});

describe('the notice is a fixed text', () => {
  it('names the block and the monitor, and carries no caller or owner-set text', async () => {
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(200);
    expect(sent.length).toBe(2);
    for (const s of sent) {
      const body = s.body;
      expect(body).toContain(String(BLOCK));
      expect(body.toLowerCase()).toContain('monitor');
      for (const forbidden of [VISITOR_TEXT, 'example.net', '9f3', VISITOR_HANDLE, VISITOR_ADDR, GUARDIAN_NAME]) {
        expect(body).not.toContain(forbidden);
      }
    }
  });

  it('notifyEscalation itself takes no caller text', async () => {
    await (notifyEscalation as any)('grd_a', BLOCK, VISITOR_TEXT, VISITOR_HANDLE);
    expect(sent.length).toBe(2);
    for (const s of sent) {
      expect(s.body).not.toContain('9f3');
      expect(s.body).not.toContain(VISITOR_HANDLE);
      expect(s.body).not.toContain(GUARDIAN_NAME);
    }
  });

  it('the event row keeps the message for the monitor, with no unsigned address', async () => {
    await CHAT(req('198.51.100.1'));
    const data = JSON.parse(events()[0].data);
    expect(data.message).toBe(VISITOR_TEXT);
    expect(data.visitorAddress).toBeNull();
  });
});
