/**
 * Guardian chat conversations stay with their guardian and their visitor, and
 * every outbound LLM call is paid for by the guardian it is billed to.
 *
 *   - A conversation id resolves only under the guardian being chatted with;
 *     any other id is 404 `conversation_not_found`: nothing appended, no LLM
 *     call, no new conversation started.
 *   - New conversation ids are 256-bit random values (the id is the visitor's
 *     capability to continue the chat).
 *   - The stored visitor address is the verified signer or null, never the
 *     unsigned body field; a conversation stored with a verified address takes
 *     appends only from that signer.
 *   - One unit of the guardian's hourly LLM budget is reserved before every
 *     outbound call (the reply and the second build pass).
 *
 * Real route; mocked seams: DB (in memory, with an atomic counter for the
 * durable limiter), the LLM, key decryption, the signature check (its own
 * suite is signed-action-routes), the live ownership check, notifications.
 */

let chainOwner: Record<number, string> = {};

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

jest.mock('@/lib/key-encryption', () => ({ decryptApiKey: () => 'sk-test' }));
// The message-count limiter is the older of the two budgets; it is held open
// here so a refusal can only come from the reservation this suite is about.
jest.mock('@/lib/llm-proxy', () => ({ callLLM: jest.fn(async () => 'Hello from the guardian.'), checkGuardianRateLimit: async () => true }));
jest.mock('@/lib/escalation-notify', () => ({ notifyEscalation: async () => undefined }));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: async () => undefined }));
// A signature counts when it is `ok:<address>`; the binding itself is tested in signed-action-routes.
jest.mock('@/lib/signed-action', () => ({
  verifySignedAction: async (address: string, _m: string, signature: string) =>
    signature === `ok:${address}` ? { ok: true } : { ok: false, status: 401, error: 'Invalid signature' },
}));
jest.mock('@/lib/block-write-auth', () => ({
  requireSignedBlockOwner: async (wallet: string, height: number) =>
    chainOwner[height] === wallet ? { ok: true, status: 200 } : { ok: false, status: 403, code: 'ownership_lost' },
}));

import prisma from '@/lib/prisma';
import { callLLM } from '@/lib/llm-proxy';
import { POST as CHAT } from '@/app/api/v1/guardian/chat/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const llm = callLLM as jest.Mock;

const BLOCK_A = 840000;
const BLOCK_B = 840001;
const OWNER_A = 'bc1powner0000000000000000000000000000000000000000000000000a';
const VISITOR = 'bc1pvisitor000000000000000000000000000000000000000000000000';

/** The durable limiter's atomic upsert, in memory: key -> (window, count). */
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
const used = (key: string) => windows.get(key)?.count ?? 0;

function req(body: Record<string, unknown>, ip = '203.0.113.7') {
  return {
    json: async () => JSON.parse(JSON.stringify(body)),
    headers: new Headers({ 'content-type': 'application/json', 'x-forwarded-for': ip }),
  } as any;
}
const chatA = (extra: Record<string, unknown> = {}) => CHAT(req({ blockHeight: String(BLOCK_A), message: 'hello there', ...extra })) as Promise<any>;

const convB = async () => db.guardianConversation.findUnique({ where: { id: 'conv_b' } });

beforeEach(async () => {
  db.__reset();
  installCounter();
  llm.mockReset();
  llm.mockImplementation(async () => 'Hello from the guardian.');
  chainOwner = { [BLOCK_A]: OWNER_A };
  for (const [id, height] of [['grd_a', BLOCK_A], ['grd_b', BLOCK_B]] as const) {
    await db.guardianAgent.create({
      data: {
        id, blockHeight: height, ownerAddress: id === 'grd_a' ? OWNER_A : 'bc1pownerb', name: id, soulMd: 's', status: 'active',
        llmProvider: 'openai', llmModel: 'gpt-x', llmApiKey: 'enc', totalMessages: 0,
      },
    });
  }
  await db.guardianConversation.create({
    data: { id: 'conv_b', guardianId: 'grd_b', visitorAddress: null, visitorHandle: 'b-visitor', messages: JSON.stringify([{ role: 'user', content: 'b history', ts: Date.now() }]) },
  });
});

describe('a conversation id resolves only under its own guardian', () => {
  it("guardian B's conversation sent to guardian A: 404, nothing appended, no LLM call", async () => {
    const before = (await convB()).messages;
    const res = await chatA({ conversationId: 'conv_b' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('conversation_not_found');
    expect(llm).not.toHaveBeenCalled();
    expect((await convB()).messages).toBe(before);
    expect(db.__rows('guardianConversation').filter((c: any) => c.guardianId === 'grd_a')).toHaveLength(0);
  });

  it('an unknown conversation id: 404, no new conversation started', async () => {
    const res = await chatA({ conversationId: 'no-such-conversation' });
    expect(res.status).toBe(404);
    expect(llm).not.toHaveBeenCalled();
    expect(db.__rows('guardianConversation')).toHaveLength(1);
  });

  it('its own conversation continues, with its history', async () => {
    const first = await chatA();
    expect(first.status).toBe(200);
    const id = first.body.conversationId;
    const second = await chatA({ conversationId: id, message: 'and again' });
    expect(second.status).toBe(200);
    expect(second.body.conversationId).toBe(id);
    const history = llm.mock.calls[1][0].messages.map((m: any) => m.content);
    expect(history).toContain('hello there');
    expect(history).toContain('and again');
  });
});

describe('new conversations', () => {
  it('get a 256-bit random id (>= 43 base64url chars)', async () => {
    const a = await chatA();
    const b = await chatA();
    for (const r of [a, b]) {
      expect(r.status).toBe(200);
      expect(r.body.conversationId).toMatch(/^[A-Za-z0-9_-]{43,}$/);
      expect(db.__rows('guardianConversation').some((c: any) => c.id === r.body.conversationId)).toBe(true);
    }
    expect(a.body.conversationId).not.toBe(b.body.conversationId);
  });

  it('store a null visitor address for an unsigned visitor who claims one', async () => {
    const res = await chatA({ visitorAddress: VISITOR, visitorHandle: 'claims' });
    const conv = db.__rows('guardianConversation').find((c: any) => c.id === res.body.conversationId);
    expect(conv.visitorAddress).toBeNull();
  });

  it('store the verified signer, and then take appends only from that signer', async () => {
    const start = await chatA({ visitorAddress: VISITOR, guardianId: 'grd_a', signature: `ok:${VISITOR}`, signedMessage: 'm1' });
    const id = start.body.conversationId;
    const conv = db.__rows('guardianConversation').find((c: any) => c.id === id);
    expect(conv.visitorAddress).toBe(VISITOR);
    const turns = JSON.parse(conv.messages).length;

    llm.mockClear();
    const unsigned = await chatA({ conversationId: id, visitorAddress: VISITOR, message: 'unsigned' });
    expect(unsigned.status).toBe(404);
    expect(llm).not.toHaveBeenCalled();
    const otherSigner = await chatA({ conversationId: id, visitorAddress: OWNER_A, guardianId: 'grd_a', signature: `ok:${OWNER_A}`, signedMessage: 'm2' });
    expect(otherSigner.status).toBe(404);
    expect(JSON.parse(db.__rows('guardianConversation').find((c: any) => c.id === id).messages)).toHaveLength(turns);

    const same = await chatA({ conversationId: id, visitorAddress: VISITOR, guardianId: 'grd_a', signature: `ok:${VISITOR}`, signedMessage: 'm3', message: 'signed again' });
    expect(same.status).toBe(200);
  });
});

describe("the guardian's LLM budget is reserved before every outbound call", () => {
  it('61 requests over fresh and foreign conversation ids: at most 60 outbound calls', async () => {
    let fresh = 0;
    let last: any;
    for (let i = 0; i < 71; i++) {
      if (i % 7 === 3) {
        await chatA({ conversationId: 'conv_b' });
      } else {
        last = await chatA();
        fresh++;
      }
    }
    expect(fresh).toBe(61);
    expect(llm.mock.calls.length).toBe(60);
    expect(last.status).toBe(429);
    expect(used('guardian-llm:grd_b')).toBe(0);
    expect(JSON.parse((await convB()).messages)).toHaveLength(1);
  });

  it('the second build pass reserves too: each outbound call is one unit', async () => {
    llm.mockImplementation(async () => 'Sure.');
    const owner = { visitorAddress: OWNER_A, guardianId: 'grd_a', signature: `ok:${OWNER_A}`, signedMessage: 'm', message: 'build a park' };
    const res = await chatA(owner);
    expect(res.status).toBe(200);
    expect(llm.mock.calls.length).toBe(2);
    expect(used('guardian-llm:grd_a')).toBe(2);
  });

  it('with one unit left, the build request makes one call and stops', async () => {
    for (let i = 0; i < 59; i++) await chatA();
    llm.mockClear();
    llm.mockImplementation(async () => 'Sure.');
    const res = await chatA({ visitorAddress: OWNER_A, guardianId: 'grd_a', signature: `ok:${OWNER_A}`, signedMessage: 'm', message: 'build a park' });
    expect(res.status).toBe(200);
    expect(llm.mock.calls.length).toBe(1);
    const after = await chatA();
    expect(after.status).toBe(429);
    expect(llm.mock.calls.length).toBe(1);
  });
});
