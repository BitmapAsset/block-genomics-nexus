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
const mockEmitAgentEvent = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: (...a: unknown[]) => mockEmitAgentEvent(...a) }));
// Only the LLM guardian cases below reach these; the model answer is fixed.
const mockCheckGuardianRateLimit = jest.fn<Promise<boolean>, unknown[]>(async () => true);
jest.mock('@/lib/llm-proxy', () => ({
  callLLM: async () => 'A fixed guardian reply.',
  checkGuardianRateLimit: (...a: unknown[]) => mockCheckGuardianRateLimit(...a),
}));

import prisma from '@/lib/prisma';
import { POST as CHAT } from '@/app/api/v1/guardian/chat/route';
import { notifyEscalation } from '@/lib/escalation-notify';
import { encryptApiKey } from '@/lib/key-encryption';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const GUARDIAN_NAME = 'Owner Set Name 5b2';
const VISITOR_TEXT = 'Please read https://example.net/x and reply 9f3';
const VISITOR_HANDLE = 'Visitor Handle 4d1';
const VISITOR_ADDR = 'bc1pclaimed0000000000000000000000000000000000000000000000000';

const windows = new Map<string, { start: number; count: number }>();
// Keys forced to a fixed count (a limit already reached), and every key hit.
const forcedCounts = new Map<string, number>();
const limiterHits: string[] = [];
function installCounter() {
  windows.clear();
  forcedCounts.clear();
  limiterHits.length = 0;
  db.$queryRaw = async (_s: TemplateStringsArray, key: string, windowStart: Date) => {
    limiterHits.push(key);
    const forced = forcedCounts.get(key);
    if (forced !== undefined) return [{ count: forced }];
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
// The in-memory client stores `{ increment: 1 }` as it is, so the message
// counter is read from the increments the route asks for.
let counted = 0;
const realGuardianUpdate = db.guardianAgent.update;
db.guardianAgent.update = async (args: any) => {
  counted += args?.data?.totalMessages?.increment ?? 0;
  return realGuardianUpdate(args);
};
const messageCount = () => counted;
const dmReceived = () => mockEmitAgentEvent.mock.calls.filter((c) => c[1] === 'dm_received').length;

beforeEach(async () => {
  db.__reset();
  installCounter();
  mockEmitAgentEvent.mockClear();
  mockCheckGuardianRateLimit.mockReset();
  mockCheckGuardianRateLimit.mockImplementation(async () => true);
  counted = 0;
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

  it('a forward refused for the hourly limit is neither counted nor announced to the owner\'s agents', async () => {
    for (let i = 0; i < 20; i++) await CHAT(req('198.51.100.1'));
    expect(messageCount()).toBe(20);
    expect(dmReceived()).toBe(20);
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many messages forwarded from this address. Please try again later.');
    expect(res.headers.get('Retry-After')).toEqual(expect.any(String));
    expect(messageCount()).toBe(20);
    expect(dmReceived()).toBe(20);
  });

  it('an auto-response answer is never subject to the forward limit', async () => {
    await db.guardianAgent.update({
      where: { id: 'grd_a' },
      data: { autoResponses: JSON.stringify([{ trigger: 'opening hours', response: 'Open all day.' }]) },
    });
    for (let i = 0; i < 25; i++) {
      const r: any = await CHAT(req('198.51.100.1', { message: 'What are your opening hours?' }));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ response: 'Open all day.', source: 'auto-response' });
    }
    expect(messageCount()).toBe(25);
    expect(dmReceived()).toBe(25);
  });

  it('an LLM guardian answer is never subject to the forward limit', async () => {
    process.env.GUARDIAN_ENCRYPTION_KEY = 'a'.repeat(64);
    await db.guardianAgent.update({
      where: { id: 'grd_a' },
      data: { llmApiKey: encryptApiKey('sk-' + 'x'.repeat(20)), llmProvider: 'anthropic', llmModel: 'test-model' },
    });
    for (let i = 0; i < 25; i++) {
      const r: any = await CHAT(req('198.51.100.1'));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ response: 'A fixed guardian reply.', source: 'llm' });
    }
    expect(messageCount()).toBe(25);
    expect(events().length).toBe(0);
  });

  it('another IP is still served', async () => {
    for (let i = 0; i < 21; i++) await CHAT(req('198.51.100.1'));
    const res: any = await CHAT(req('198.51.100.2'));
    expect(res.status).toBe(200);
  });
});

describe('an AI guardian over its hourly limit', () => {
  const llmReservations = () => limiterHits.filter((k) => k === 'guardian-llm:grd_a').length;
  async function giveGuardianAnLlm() {
    process.env.GUARDIAN_ENCRYPTION_KEY = 'a'.repeat(64);
    await db.guardianAgent.update({
      where: { id: 'grd_a' },
      data: { llmApiKey: encryptApiKey('sk-' + 'x'.repeat(20)), llmProvider: 'anthropic', llmModel: 'test-model' },
    });
  }

  it('a message refused by the guardian limit is neither counted nor announced', async () => {
    await giveGuardianAnLlm();
    mockCheckGuardianRateLimit.mockImplementation(async () => false);
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Rate limit exceeded — max 60 messages/hour for this guardian. Please try again later.');
    expect(messageCount()).toBe(0);
    expect(dmReceived()).toBe(0);
    expect(mockCheckGuardianRateLimit).toHaveBeenCalledTimes(1);
    expect(llmReservations()).toBe(0);
  });

  it('a message refused by the hourly AI budget is neither counted nor announced', async () => {
    await giveGuardianAnLlm();
    forcedCounts.set('guardian-llm:grd_a', 61);
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Rate limit exceeded — max 60 messages/hour for this guardian. Please try again later.');
    expect(messageCount()).toBe(0);
    expect(dmReceived()).toBe(0);
    expect(mockCheckGuardianRateLimit).toHaveBeenCalledTimes(1);
    expect(llmReservations()).toBe(1);
  });

  it('within the limit the AI answers, and each check runs exactly once', async () => {
    await giveGuardianAnLlm();
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ response: 'A fixed guardian reply.', source: 'llm' });
    expect(messageCount()).toBe(1);
    expect(dmReceived()).toBe(1);
    expect(mockCheckGuardianRateLimit).toHaveBeenCalledTimes(1);
    expect(llmReservations()).toBe(1);
  });

  it('an auto-response match on an AI guardian runs neither check', async () => {
    await giveGuardianAnLlm();
    await db.guardianAgent.update({
      where: { id: 'grd_a' },
      data: { autoResponses: JSON.stringify([{ trigger: 'opening hours', response: 'Open all day.' }]) },
    });
    const res: any = await CHAT(req('198.51.100.1', { message: 'What are your opening hours?' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ response: 'Open all day.', source: 'auto-response' });
    expect(mockCheckGuardianRateLimit).not.toHaveBeenCalled();
    expect(llmReservations()).toBe(0);
  });

  it('an auto-response that cannot be stored falls through to the AI, which checks its limit once', async () => {
    await giveGuardianAnLlm();
    await db.guardianAgent.update({
      where: { id: 'grd_a' },
      data: { autoResponses: JSON.stringify([{ trigger: 'opening hours', response: 'Open all day.' }]) },
    });
    const realCreate = db.guardianConversation.create;
    let failOnce = true;
    db.guardianConversation.create = async (args: any) => {
      if (failOnce) { failOnce = false; throw new Error('store failed'); }
      return realCreate(args);
    };
    try {
      const res: any = await CHAT(req('198.51.100.1', { message: 'What are your opening hours?' }));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ response: 'A fixed guardian reply.', source: 'llm' });
      expect(mockCheckGuardianRateLimit).toHaveBeenCalledTimes(1);
      expect(llmReservations()).toBe(1);
    } finally {
      db.guardianConversation.create = realCreate;
    }
  });

  it('a forward guardian runs neither AI check and forwards as before', async () => {
    const res: any = await CHAT(req('198.51.100.1'));
    expect(res.status).toBe(200);
    expect(messageCount()).toBe(1);
    expect(events().length).toBe(1);
    expect(mockCheckGuardianRateLimit).not.toHaveBeenCalled();
    expect(llmReservations()).toBe(0);
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
