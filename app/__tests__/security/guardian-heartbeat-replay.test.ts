/**
 * SIMULATION — a captured guardian heartbeat must not keep working forever.
 *
 * `/api/v1/guardian/heartbeat` authenticated a self-hosted daemon with a
 * BIP-322 signature over a message the CALLER chose. Nothing in that message
 * had to be fresh, so the signature was a bearer token with no expiry: anyone
 * who saw one heartbeat — a proxy, a log, a shared host, the daemon's own
 * stdout — could resend it indefinitely.
 *
 * That is not a liveness lie only. The heartbeat sets `endpointVerified`, which
 * is what points visitors at `agentEndpoint`. A replayed heartbeat keeps a dead
 * or sold-off guardian looking live and verified, which is exactly what the
 * route's own ownership gate exists to prevent — the gate re-checked the deed
 * on every call while the credential proving the CALLER was there stayed valid
 * forever.
 *
 * Every other wallet-signed write in this protocol already answers this the
 * same way: a single-use nonce from the challenge store, consumed atomically
 * (`/api/v1/session/verify`, world writes, profile create). This drives the
 * REAL route over the REAL challenge store, so the replay is refused by the
 * same atomic consume those paths rely on, not by a check invented here.
 */

const OWNER = 'bc1powner0000000000000000000000000000000000';
const STRANGER = 'bc1pstranger00000000000000000000000000000000';
const BLOCK = 840000;

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

// Signature verification has its own suite. Every signature here is valid, so a
// denial can only come from the freshness check under test.
jest.mock('@/lib/api-helpers', () => ({
  verifyWalletSignature: () => true,
}));

// The deed gate has its own suite; the owner always owns the block, so a denial
// can never be an ownership denial.
jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async (wallet: string) =>
    wallet === OWNER ? { ok: true } : { ok: false, status: 403, code: 'ownership_lost' },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  gateDenialResponse: (gate: { status: number; code?: string }) =>
    require('next/server').NextResponse.json(
      { success: false, error: 'denied', code: gate.code },
      { status: gate.status }
    ),
}));

import prisma from '@/lib/prisma';
import { issueChallenge } from '@/lib/challenges';
import { POST as HEARTBEAT } from '@/app/api/v1/guardian/heartbeat/route';

/** The literal a daemon must send. Pinned here because it is a wire contract. */
const GUARDIAN_HEARTBEAT_PURPOSE = 'guardian-heartbeat';

function req(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

/** A daemon's heartbeat: fetch a nonce, sign the message it appears in, send. */
async function freshHeartbeat(wallet = OWNER) {
  const nonce = `nonce_${Math.random().toString(16).slice(2)}`;
  await issueChallenge(nonce, { address: wallet, purpose: GUARDIAN_HEARTBEAT_PURPOSE });
  return {
    guardianId: 'grd_1',
    ownerAddress: wallet,
    signature: 'sig',
    message: `Block Genomics verification: ${nonce}`,
  };
}

beforeEach(async () => {
  await (prisma as never as { $reset?: () => void }).$reset?.();
  await prisma.guardianAgent.deleteMany({});
  await prisma.challenge.deleteMany({});
  await prisma.guardianAgent.create({
    data: {
      id: 'grd_1',
      blockHeight: BLOCK,
      ownerAddress: OWNER,
      name: 'Sentinel',
      selfHosted: true,
      soulMd: 'soul',
      status: 'active',
      endpointVerified: false,
    },
  });
});

describe('guardian heartbeat refuses a replayed credential', () => {
  it('a genuine heartbeat is accepted and marks the endpoint verified', async () => {
    const res = await HEARTBEAT(req(await freshHeartbeat()));
    const body = (await res.json()) as { success?: boolean };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const g = await prisma.guardianAgent.findUnique({ where: { id: 'grd_1' } });
    expect(g?.endpointVerified).toBe(true);
  });

  it('THE BUG: the same captured heartbeat replays', async () => {
    const captured = await freshHeartbeat();

    const first = await HEARTBEAT(req(captured));
    expect(first.status).toBe(200);

    // Byte-identical resend, as any observer of the first could make.
    const replay = await HEARTBEAT(req(captured));
    const body = (await replay.json()) as { success?: boolean; error?: string };

    expect(replay.status).toBe(401);
    expect(body.success).not.toBe(true);
  });

  it('a replay cannot revive a guardian whose verification was cleared', async () => {
    const captured = await freshHeartbeat();
    await HEARTBEAT(req(captured));

    // The daemon dies; the endpoint stops answering and is un-verified.
    await prisma.guardianAgent.update({
      where: { id: 'grd_1' },
      data: { endpointVerified: false },
    });

    await HEARTBEAT(req(captured));

    const g = await prisma.guardianAgent.findUnique({ where: { id: 'grd_1' } });
    expect(g?.endpointVerified).toBe(false);
  });

  it('a heartbeat with no challenge at all is refused', async () => {
    const res = await HEARTBEAT(
      req({ guardianId: 'grd_1', ownerAddress: OWNER, signature: 'sig', message: 'just trust me' })
    );

    expect(res.status).toBe(401);
  });

  it("a nonce issued to one wallet cannot be spent by another", async () => {
    const nonce = 'nonce_for_owner';
    await issueChallenge(nonce, { address: OWNER, purpose: GUARDIAN_HEARTBEAT_PURPOSE });

    const res = await HEARTBEAT(
      req({
        guardianId: 'grd_1',
        ownerAddress: STRANGER,
        signature: 'sig',
        message: `Block Genomics verification: ${nonce}`,
      })
    );

    expect(res.status).not.toBe(200);
    // The nonce is still unspent — a stranger's attempt must not burn it.
    const still = await prisma.challenge.findFirst({ where: { challenge: nonce } });
    expect(still?.consumedAt ?? null).toBeNull();
  });

  it('a nonce minted for another purpose is not a heartbeat credential', async () => {
    const nonce = 'nonce_for_session';
    await issueChallenge(nonce, { address: OWNER, purpose: 'session' });

    const res = await HEARTBEAT(
      req({
        guardianId: 'grd_1',
        ownerAddress: OWNER,
        signature: 'sig',
        message: `Block Genomics verification: ${nonce}`,
      })
    );

    expect(res.status).toBe(401);
  });
});
