/**
 * A request that carries no signature is told how to get one.
 *
 * Six answers to a request without `signature` / `message` used to name the
 * missing fields only. Each now appends the same pointer the other signed
 * routes give: get a nonce from POST /api/v1/challenge for the route's
 * purpose, then sign the canonical message for its action. The status codes
 * and the existing text stay as they were.
 *
 * Real routes; mocked seams: DB (in memory), the ownership gate, events.
 */

jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
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

jest.mock('@/lib/ownership-gate', () => ({
  requireLiveBlockOwner: async () => ({ ok: false, status: 403, code: 'ownership_lost', reason: 'not held by this wallet' }),
  gateDenialResponse: (gate: { status: number; reason?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: gate.reason }, { status: gate.status });
  },
}));
jest.mock('@/lib/block-event-emitters', () => ({
  emitGuardianRegistered: jest.fn(async () => undefined),
  emitGuardianTransition: jest.fn(async () => undefined),
}));
jest.mock('@/lib/agent-events', () => ({ emitAgentEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/escalation-notify', () => ({ notifyEscalation: jest.fn(async () => undefined) }));
jest.mock('@/lib/api-rate-limit', () => ({ enforceRateLimit: async () => ({ response: null, headers: {} }) }));
jest.mock('@/lib/activity', () => ({ logActivity: () => undefined, logProfileView: () => undefined }));
jest.mock('@/lib/ownership-sync', () => ({
  wipeGuardianMemories: async () => ({ wiped: 0 }),
  verifyBlockOwnership: async () => ({ match: false, onChainOwnerAddress: null, inscriptionId: null }),
  processOwnershipTransfer: async () => ({}),
  holderMayTriggerTransfer: () => true,
}));

import prisma from '@/lib/prisma';
import { signedActionHelp } from '@/lib/signed-action';
import { PATCH as GUARDIAN_PATCH } from '@/app/api/v1/guardian/[id]/route';
import { POST as MONITOR_POST, DELETE as MONITOR_DELETE } from '@/app/api/v1/guardian/monitor/route';
import { POST as VPS_HEALTH } from '@/app/api/v1/vps/[linkId]/health/route';
import { POST as LISTING } from '@/app/api/v1/delegations/listings/route';
import { POST as PURCHASE } from '@/app/api/v1/delegations/purchase/route';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const BLOCK = 840000;
const WALLET = 'bc1qwallet00000000000000000000000000000000';

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

function request(path: string, body: Record<string, unknown>) {
  const url = new URL('http://localhost' + path);
  return {
    json: async () => JSON.parse(JSON.stringify(body)),
    url: url.toString(),
    nextUrl: url,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as any;
}

interface UnsignedCase {
  name: string;
  handler: (req: any, ctx?: any) => Promise<any>;
  ctx?: () => unknown;
  path: string;
  body: Record<string, unknown>;
  status: number;
  /** The text the route answered with before; kept, the pointer follows it. */
  text: string;
  action: string;
  purpose: string;
}

const CASES: UnsignedCase[] = [
  {
    name: 'POST /api/v1/delegations/listings', handler: LISTING, path: '/api/v1/delegations/listings',
    body: { walletAddress: WALLET, blockHeight: BLOCK, tier: 2, price30d: 1000, price365d: 10000 },
    status: 400, text: 'Auth required', action: 'delegation.list', purpose: 'delegation',
  },
  {
    name: 'POST /api/v1/delegations/purchase', handler: PURCHASE, path: '/api/v1/delegations/purchase',
    body: { walletAddress: WALLET, listingId: 'dl1', durationDays: 30, txId: 'tx1' },
    status: 400, text: 'Auth required', action: 'delegation.purchase', purpose: 'delegation',
  },
  {
    name: 'POST /api/v1/vps/[linkId]/health', handler: VPS_HEALTH, ctx: () => params({ linkId: 'l1' }),
    path: '/api/v1/vps/l1/health', body: { ownerAddress: WALLET },
    status: 401, text: 'Authentication required', action: 'vps.health', purpose: 'vps',
  },
  {
    name: 'POST /api/v1/guardian/monitor', handler: MONITOR_POST, path: '/api/v1/guardian/monitor',
    body: { guardianId: 'g1', ownerAddress: WALLET },
    status: 400, text: 'Missing required fields: guardianId, ownerAddress, signature, message',
    action: 'guardian.monitor.mint', purpose: 'guardian',
  },
  {
    name: 'DELETE /api/v1/guardian/monitor', handler: MONITOR_DELETE, path: '/api/v1/guardian/monitor',
    body: { guardianId: 'g1', ownerAddress: WALLET },
    status: 400, text: 'Missing required fields: guardianId, ownerAddress, signature, message',
    action: 'guardian.monitor.revoke', purpose: 'guardian',
  },
  {
    name: 'PATCH /api/v1/guardian/[id]', handler: GUARDIAN_PATCH, ctx: () => params({ id: 'g1' }),
    path: '/api/v1/guardian/g1', body: { ownerAddress: WALLET, name: 'Renamed' },
    status: 401, text: 'Authentication required (ownerAddress, signature, message)',
    action: 'guardian.update', purpose: 'guardian',
  },
];

beforeEach(() => {
  db.__reset();
  db.__rows('guardianAgent').push({
    id: 'g1', blockHeight: BLOCK, ownerAddress: WALLET, name: 'Warden', status: 'active', soulMd: 'soul',
    monitorTokenHash: null, totalMessages: 0, createdAt: new Date(),
  });
  db.__rows('vPSLink').push({
    id: 'l1', blockHeight: BLOCK, walletAddress: WALLET, serverUrl: 'https://server.example',
    connectionType: 'https', status: 'linked', lastHealthCheck: null, createdAt: new Date(),
  });
  db.__rows('delegationListing').push({
    id: 'dl1', blockHeight: BLOCK, ownerAddress: WALLET, active: true, spotsTotal: -1, spotsUsed: 0, price30d: 1, price365d: 2,
  });
});

describe.each(CASES)('$name without a signature', (c) => {
  it('answers with the same status and points at the challenge for its action and purpose', async () => {
    const res = await c.handler(request(c.path, c.body), c.ctx?.());
    expect(res.status).toBe(c.status);
    const json = await res.json();
    expect(json.error).toBe(`${c.text}. ${signedActionHelp({ action: c.action, purpose: c.purpose })}`);
  });

  it('changes nothing', async () => {
    const before = JSON.stringify({
      g: db.__rows('guardianAgent'), v: db.__rows('vPSLink'), d: db.__rows('delegationListing'),
    });
    await c.handler(request(c.path, { ...c.body, message: 'hello' }), c.ctx?.());
    expect(JSON.stringify({
      g: db.__rows('guardianAgent'), v: db.__rows('vPSLink'), d: db.__rows('delegationListing'),
    })).toBe(before);
  });
});
