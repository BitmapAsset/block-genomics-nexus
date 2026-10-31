/**
 * ISOLATED SIMULATION — Living Block event spine (wave L1) through the REAL
 * route handlers, with REAL BIP-322 signatures, against an in-memory Prisma
 * plus the in-memory `BlockEvent` store (`helpers/event-store.ts`).
 *
 * The acceptance line this file proves (spec §7, L1): a signed world write
 * yields exactly one event whose BIP-322 proof verifies with the offline script
 * (`scripts/verify-event-proof.ts`), with nothing private in it (§5.6). Around
 * it: the session path, PATCH / DELETE / batch, session/verify (= MCP
 * bg_verify_submit), auth/verify, guardian register + heartbeat, the public reads and the
 * key file, and the two switches (flag off, table missing).
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/prisma', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const { createEventStore } = require('../helpers/event-store');
  const client = createMemoryPrisma();
  const events = createEventStore();
  const memTx = client.$transaction;
  client.blockEvent = events.blockEvent;
  client.__events = events;
  // Interactive transactions get the event store's per-block lock
  // (`$executeRaw` = pg_advisory_xact_lock) on top of the memory tables.
  client.$transaction = async (arg: any) =>
    typeof arg === 'function' ? events.$transaction((etx: any) => arg({ ...client, $executeRaw: etx.$executeRaw })) : memTx(arg);
  return { __esModule: true, default: client, prisma: client };
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
});

jest.mock('@/lib/onchain/bitmap-ownership', () => ({
  verifyBlockOwnedBy: jest.fn(),
  verifyInscriptionOwnership: jest.fn(),
  scanWalletForBitmap: jest.fn(),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '@/lib/prisma';
import { verifyBlockOwnedBy } from '@/lib/onchain/bitmap-ownership';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage, hashBody } from '@/lib/action-message';
import { __resetBlockEventsState } from '@/lib/block-events';
import { verifyChain, type ChainRow } from '@/lib/block-event-core';
import { POST as worldPost } from '@/app/api/v1/world/route';
import { PATCH as worldPatch, DELETE as worldDelete } from '@/app/api/v1/world/[id]/route';
import { POST as worldBatch } from '@/app/api/v1/world/batch/route';
import { POST as sessionStart } from '@/app/api/v1/session/start/route';
import { POST as sessionVerify } from '@/app/api/v1/session/verify/route';
import { POST as authVerify } from '@/app/api/v1/auth/verify/route';
import { POST as guardianPost } from '@/app/api/v1/guardian/route';
import { POST as heartbeatPost } from '@/app/api/v1/guardian/heartbeat/route';
import { GET as eventsGet } from '@/app/api/v1/blocks/[height]/events/route';
import { GET as proofGet } from '@/app/api/v1/blocks/[height]/events/[id]/proof/route';
import { GET as keysGet } from '@/app/.well-known/bg-event-keys.json/route';
import { run as verifyCli } from '../../scripts/verify-event-proof';
import { makeWallet, sign, freshNonce, challengeMessage, type SimWallet } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const chain = verifyBlockOwnedBy as jest.Mock;

const BLOCK = 840000;
const SEED = '5a'.repeat(32);
const FUTURE = () => Date.now() + 5 * 60 * 1000;

/** What must never reach an event (spec §5.6), planted in bodies and headers. */
const PRIVATE = {
  chatText: 'PRIVATE-chat-line-7f3a',
  ip: '203.0.113.77',
  userAgent: 'PRIVATE-UA/9.9',
  soulMd: 'PRIVATE-soul-text-c1d2',
  personality: 'PRIVATE-personality-e5f6',
  visitorWallet: 'bc1qprivatevisitor00000000000000000000000',
};
const privateHeaders = { 'x-forwarded-for': PRIVATE.ip, 'user-agent': PRIVATE.userAgent };

function req(body: any, headers: Record<string, string> = {}, url = 'http://test.local/api'): any {
  const lower = Object.fromEntries(Object.entries({ ...privateHeaders, ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return { json: async () => body, url, nextUrl: new URL(url), headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } };
}

const rows = (): any[] => db.__events.__rows;
const asChain = (list: any[]): ChainRow[] =>
  list.map((r) => ({
    id: r.id,
    block: r.block,
    seq: r.seq,
    kind: r.kind,
    actor: { type: r.actorType, id: r.actorId, handle: r.actorHandle },
    signer: { scheme: r.signerScheme, address: r.signerAddress },
    summary: r.summary,
    payloadHash: r.payloadHash,
    prev: r.prev,
    ts: r.ts.toISOString(),
    hash: r.hash,
  }));

function expectNothingPrivate(extra: string[] = []) {
  const stored = JSON.stringify(rows());
  for (const v of [...Object.values(PRIVATE), ...extra]) expect(stored).not.toContain(v);
}

async function nonceFor(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return nonce;
}

/** A wallet-path world write body, signed over the exact request like the browser does. */
async function signedBody(
  w: SimWallet,
  intent: Record<string, unknown>,
  binding: { action: string; method: string; path: string; blockHeight: number },
) {
  const body: Record<string, unknown> = { ...intent, ownerAddress: w.address };
  const message = buildActionMessage({
    ...binding,
    bodyHash: await hashBody(body),
    nonce: await nonceFor(w.address, 'world'),
    expiresAt: FUTURE(),
  });
  return { ...body, message, signature: sign(w.privKey, w.address, message) };
}

const writeTmp = (name: string, data: unknown) => {
  const p = path.join(os.tmpdir(), `bg90-${process.pid}-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
};

async function proofOf(id: string, block = BLOCK): Promise<any> {
  const res: any = await proofGet(req(null), { params: Promise.resolve({ height: String(block), id }) });
  expect(res.status).toBe(200);
  return res.body;
}

async function keysFile(): Promise<any> {
  return (keysGet() as Response).json();
}

let owner: SimWallet;

beforeEach(() => {
  db.__reset();
  rows().length = 0;
  __resetBlockEventsState();
  process.env.BG_EVENTS_ENABLED = 'true';
  process.env.BG_EVENT_SIGNING_KEY = SEED;
  owner = makeWallet('p2tr');
  chain.mockReset();
  chain.mockImplementation(async (wallet: string, height: number) =>
    wallet === owner.address && height === BLOCK ? { verified: true, inscriptionId: 'insc-840000i0' } : { verified: false, reason: 'not held' },
  );
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  delete process.env.BG_EVENTS_ENABLED;
  delete process.env.BG_EVENT_SIGNING_KEY;
});

// ── The L1 acceptance line ───────────────────────────────────────────────

describe('a signed world write', () => {
  it('yields exactly one build.placed whose BIP-322 proof verifies offline', async () => {
    const body = await signedBody(
      owner,
      { blockHeight: BLOCK, objectType: 'lantern', name: 'Harbour Light', posX: 1, chatText: PRIVATE.chatText, visitorAddress: PRIVATE.visitorWallet },
      { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK },
    );
    const res: any = await worldPost(req(body));
    expect(res.status).toBe(201);

    expect(rows()).toHaveLength(1);
    const e = rows()[0];
    expect(e).toMatchObject({
      block: BLOCK,
      seq: 1,
      kind: 'build.placed',
      actorType: 'owner',
      actorId: owner.address,
      signerScheme: 'bip322',
      signerAddress: owner.address,
      summary: 'Placed “Harbour Light”',
      proofMessage: body.message,
      proofSignature: body.signature,
    });
    expect(e.payload).toMatchObject({ op: 'create', via: 'wallet', objectId: res.body.object.id, objectType: 'lantern', name: 'Harbour Light' });

    // The offline script, fed only files: the proof and the pinned key file.
    const proof = await proofOf(e.id);
    const keys = await keysFile();
    const out = verifyCli([writeTmp('proof', proof), '--keys', writeTmp('keys', keys)]);
    expect(out.lines.join('\n')).toMatch(/^OK authenticated build\.placed block 840000 seq 1 \(bip322 /);
    expect(out.lines).toEqual(expect.arrayContaining(['  ok   signature', '  ok   payloadHash', '  ok   eventHash', '  ok   attestation']));
    expect(out.code).toBe(0);

    expectNothingPrivate();
  });

  it('the offline script rejects a proof whose message, signature or event was altered', async () => {
    const body = await signedBody(owner, { blockHeight: BLOCK, objectType: 'tree' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
    await worldPost(req(body));
    const proof = await proofOf(rows()[0].id);
    const keys = writeTmp('keys2', await keysFile());

    const swapped = { ...proof, message: proof.message.replace('Action: world.create', 'Action: world.delete') };
    expect(verifyCli([writeTmp('p-msg', swapped), '--keys', keys]).code).toBe(1);

    const other = makeWallet('p2tr');
    const forged = { ...proof, signature: sign(other.privKey, other.address, proof.message) };
    expect(verifyCli([writeTmp('p-sig', forged), '--keys', keys]).code).toBe(1);

    const edited = { ...proof, event: { ...proof.event, summary: 'Placed a castle' } };
    expect(verifyCli([writeTmp('p-evt', edited), '--keys', keys]).code).toBe(1);

    // A verifier that pinned no key still checks the BIP-322 half; the
    // attestation then fails closed rather than passing.
    const noKeys = verifyCli([writeTmp('p-ok', proof)]);
    expect(noKeys.lines).toEqual(expect.arrayContaining(['  ok   signature', '  FAIL attestation']));
  });

  it('a refused write emits nothing', async () => {
    const stranger = makeWallet('p2tr');
    const body = await signedBody(stranger, { blockHeight: BLOCK, objectType: 'tree' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
    const res: any = await worldPost(req(body));
    expect(res.status).toBe(403);
    expect(rows()).toHaveLength(0);
  });
});

describe('the other world writes', () => {
  async function placed(): Promise<string> {
    const body = await signedBody(owner, { blockHeight: BLOCK, objectType: 'tree', name: 'Oak' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
    const res: any = await worldPost(req(body));
    return res.body.object.id;
  }

  it('PATCH → build.changed and DELETE → build.removed, each with its own signed message, chained', async () => {
    const id = await placed();
    const patch = await signedBody(owner, { color: '#ff0000' }, { action: 'world.update', method: 'PATCH', path: `/api/v1/world/${id}`, blockHeight: BLOCK });
    expect(((await worldPatch(req(patch), { params: Promise.resolve({ id }) })) as any).status).toBe(200);
    const del = await signedBody(owner, {}, { action: 'world.delete', method: 'DELETE', path: `/api/v1/world/${id}`, blockHeight: BLOCK });
    expect(((await worldDelete(req(del), { params: Promise.resolve({ id }) })) as any).status).toBe(200);

    expect(rows().map((r) => [r.seq, r.kind, r.signerScheme])).toEqual([
      [1, 'build.placed', 'bip322'],
      [2, 'build.changed', 'bip322'],
      [3, 'build.removed', 'bip322'],
    ]);
    expect(rows()[1].proofMessage).toBe(patch.message);
    expect(rows()[2].proofMessage).toBe(del.message);
    expect(verifyChain(asChain(rows()))).toMatchObject({ ok: true, checked: 3 });
    for (const r of rows()) expect(verifyCli([writeTmp(`p${r.seq}`, await proofOf(r.id))]).lines).toContain('  ok   signature');
  });

  it('a mixed batch is ONE build.changed carrying the batch signature and per-op counts', async () => {
    const id = await placed();
    const body = await signedBody(
      owner,
      {
        blockHeight: BLOCK,
        operations: [
          { action: 'create', data: { objectType: 'lamp' } },
          { action: 'create', data: { objectType: 'bench' } },
          { action: 'update', id, data: { color: '#00ff00' } },
        ],
      },
      { action: 'world.batch', method: 'POST', path: '/api/v1/world/batch', blockHeight: BLOCK },
    );
    const res: any = await worldBatch(req(body));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toMatchObject({ kind: 'build.changed', summary: '3 objects changed', signerScheme: 'bip322', proofMessage: body.message });
    expect(rows()[1].payload).toMatchObject({ op: 'batch', counts: { create: 2, update: 1 } });
  });

  it('the session-token path is attributed to the session, system-signed, and the token is never stored', async () => {
    const started: any = await sessionStart(req({ walletAddress: owner.address }));
    const message = started.body.data.message;
    const verified: any = await sessionVerify(req({ walletAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message), blocks: [BLOCK] }));
    const token: string = verified.body.data.token;
    expect(token).toMatch(/^bg_vfy_/);
    rows().length = 0;
    __resetBlockEventsState();

    const res: any = await worldPost(req({ blockHeight: BLOCK, objectType: 'crate' }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(201);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'build.placed', actorType: 'owner-session', actorId: owner.address, signerScheme: 'ed25519' });
    expectNothingPrivate([token, token.slice(7)]);

    const proof = await proofOf(rows()[0].id);
    expect(verifyCli([writeTmp('p-sess', proof), '--keys', writeTmp('k-sess', await keysFile())]).code).toBe(0);
  });
});

// ── deed.verified from session/verify (MCP bg_verify_submit) ─────────────

describe('session/verify', () => {
  async function handshake(): Promise<any> {
    const started: any = await sessionStart(req({ walletAddress: owner.address }));
    const message = started.body.data.message;
    return sessionVerify(req({ walletAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message), blocks: [BLOCK] }));
  }

  it('emits deed.verified, system-signed (the challenge text names no block), once per holder per hour', async () => {
    const res: any = await handshake();
    expect(res.status).toBe(201);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'deed.verified', actorType: 'owner', signerScheme: 'ed25519', summary: 'Deed verified on Bitcoin' });
    expect(rows()[0].payload).toEqual({ holder: owner.address, inscriptionId: 'insc-840000i0', via: 'session' });
    expect(rows()[0].proofMessage).not.toContain('Nonce:');
    expectNothingPrivate([res.body.data.token]);
    const keys = await keysFile();
    const out = verifyCli([writeTmp('p-deed', await proofOf(rows()[0].id)), '--keys', writeTmp('keys-deed', keys)]);
    expect(out.lines).toContain('  ok   signature');
    expect(out.code).toBe(0);

    // Re-verifying minutes later adds nothing (dedupe under the block lock).
    expect(((await handshake()) as any).status).toBe(201);
    expect(rows()).toHaveLength(1);
  });
});

// ── deed.verified from auth/verify (the web /verify flow) ────────────────

describe('auth/verify', () => {
  // The deed and its live holder both come from verifyBlockOwnedBy (`chain`);
  // the body's `inscriptionId` is an old-client field the route ignores.
  async function verify(extra: Record<string, unknown> = {}): Promise<any> {
    const message = challengeMessage(await nonceFor(owner.address, 'auth'));
    return authVerify(
      req({ walletAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message), blockHeight: BLOCK, inscriptionId: 'insc-copy-of-840000i0', ...extra }),
    );
  }

  it('a live holder check emits one system-signed deed.verified', async () => {
    const res: any = await verify({ displayName: PRIVATE.chatText });
    expect(res.status).toBe(200);
    expect(res.body.data.holderCheck).toBe('live');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'deed.verified', actorType: 'owner', signerScheme: 'ed25519' });
    // The deed the gate checked, never the id the caller sent.
    expect(rows()[0].payload).toEqual({ holder: owner.address, inscriptionId: 'insc-840000i0', via: 'auth' });
    expectNothingPrivate();
    const out = verifyCli([writeTmp('p-auth', await proofOf(rows()[0].id)), '--keys', writeTmp('keys-auth', await keysFile())]);
    expect(out.code).toBe(0);
  });

  it('a failed holder check or an indexer outage emits nothing', async () => {
    chain.mockResolvedValueOnce({ verified: false, reason: 'not held' });
    expect(((await verify()) as any).status).toBe(403);
    chain.mockResolvedValueOnce({ verified: false, unavailable: true });
    expect(((await verify()) as any).status).toBe(503);
    expect(rows()).toHaveLength(0);
  });
});

// ── Guardian ─────────────────────────────────────────────────────────────

describe('guardian', () => {
  /** A guardian POST body signed over the exact request with a one-time 'guardian' nonce. */
  async function guardianBody(intent: Record<string, unknown>) {
    const body: Record<string, unknown> = { blockHeight: BLOCK, ownerAddress: owner.address, ...intent };
    const message = buildActionMessage({
      action: 'guardian.create', method: 'POST', path: '/api/v1/guardian', blockHeight: BLOCK,
      bodyHash: await hashBody(body), nonce: await nonceFor(owner.address, 'guardian'), expiresAt: FUTURE(),
    });
    return { ...body, message, signature: sign(owner.privKey, owner.address, message) };
  }

  it('register → guardian.registered, system-signed (the owner signature is never published)', async () => {
    const body = await guardianBody({ name: 'Satoshis Keeper', soulMd: PRIVATE.soulMd, personality: PRIVATE.personality });
    const res: any = await guardianPost(req(body));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'guardian.registered', signerScheme: 'ed25519', summary: 'Satoshis Keeper became this block’s guardian' });
    expectNothingPrivate([body.message as string, body.signature as string]);

    // Re-registering the same guardian with no state change adds nothing.
    await guardianPost(req(await guardianBody({ name: 'Satoshis Keeper' })));
    expect(rows()).toHaveLength(1);
  });

  it('re-register with a selfHosted flip → exactly one guardian.status per change (state read before the upsert)', async () => {
    const sent: string[] = [];
    const register = async (extra: Record<string, unknown>) => {
      const body = await guardianBody({ name: 'Satoshis Keeper', ...extra });
      sent.push(body.message as string, body.signature as string);
      return guardianPost(req(body)) as Promise<any>;
    };
    expect((await register({})).status).toBe(200);
    // Self-hosted with no heartbeat yet reads as offline.
    expect((await register({ selfHosted: true })).status).toBe(200);
    expect((await register({ selfHosted: true })).status).toBe(200);
    expect((await register({ selfHosted: false })).status).toBe(200);
    expect(rows().map((r) => [r.kind, r.payload.from ?? null, r.payload.to ?? null, r.signerScheme])).toEqual([
      ['guardian.registered', null, null, 'ed25519'],
      ['guardian.status', 'idle', 'offline', 'ed25519'],
      ['guardian.status', 'offline', 'idle', 'ed25519'],
    ]);
    expectNothingPrivate(sent);
  });

  it('heartbeat emits guardian.status only when it brings the guardian back, never per beat', async () => {
    await db.guardianAgent.create({
      data: { id: 'gdn_1', blockHeight: BLOCK, ownerAddress: owner.address, name: 'Keeper', status: 'active', selfHosted: true, lastHeartbeat: new Date(Date.now() - 60 * 60 * 1000), memoryMd: 'PRIVATE-memory-0a0b' },
    });
    const beat = async () => {
      const message = challengeMessage(await nonceFor(owner.address, 'guardian-heartbeat'));
      return heartbeatPost(req({ guardianId: 'gdn_1', ownerAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message) }));
    };
    expect(((await beat()) as any).status).toBe(200);
    expect(((await beat()) as any).status).toBe(200);
    expect(((await beat()) as any).status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'guardian.status', summary: 'Keeper is now idle', signerScheme: 'ed25519' });
    expect(rows()[0].payload).toEqual({ guardianId: 'gdn_1', from: 'offline', to: 'idle' });
    expectNothingPrivate(['PRIVATE-memory-0a0b']);
  });
});

// ── Public reads ─────────────────────────────────────────────────────────

describe('GET /api/v1/blocks/<h>/events', () => {
  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      const body = await signedBody(owner, { blockHeight: BLOCK, objectType: 'stone' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
      await worldPost(req(body));
    }
  }
  const get = (qs = '') => eventsGet(req(null, {}, `http://test.local/api/v1/blocks/${BLOCK}/events${qs}`), { params: Promise.resolve({ height: String(BLOCK) }) }) as Promise<any>;

  it('serves the newest page, gap-fills with after=, caches 5 s, and the page re-checks as a chain', async () => {
    await seed(5);
    const res = await get('?limit=3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=5');
    expect(res.body).toMatchObject({ format: 'bg-event/1', enabled: true, lastSeq: 5 });
    expect(res.body.events.map((e: any) => e.seq)).toEqual([3, 4, 5]);
    const fill = await get('?after=1&limit=2');
    expect(fill.body.events.map((e: any) => e.seq)).toEqual([2, 3]);
    expect(fill.body.hasMore).toBe(true);

    const all = await get('?after=0&limit=200');
    expect(verifyCli(['--chain', writeTmp('chain', all.body)]).lines[0]).toBe(`OK chain: 5 events, head ${all.body.events[4].hash}`);
    // A window needs the hash before it.
    expect(verifyCli(['--chain', writeTmp('chain3', res.body)]).code).toBe(1);
    expect(verifyCli(['--chain', writeTmp('chain3b', res.body), '--from-seq', '3', '--from-prev', all.body.events[1].hash]).code).toBe(0);
    // No proof body or private field leaks into the public listing.
    expect(JSON.stringify(res.body)).not.toMatch(/proofMessage|proofSignature|attestation/);
  });

  it('rejects junk parameters', async () => {
    for (const qs of ['?limit=0', '?limit=201', '?limit=abc', '?after=-1', '?after=1.5']) expect((await get(qs)).status).toBe(400);
    const bad: any = await eventsGet(req(null), { params: Promise.resolve({ height: 'abc' }) });
    expect(bad.status).toBe(400);
  });

  it('a proof id that is not a ULID, or from another block, is a 404', async () => {
    await seed(1);
    const id = rows()[0].id;
    expect(((await proofGet(req(null), { params: Promise.resolve({ height: String(BLOCK), id: 'nope' }) })) as any).status).toBe(404);
    expect(((await proofGet(req(null), { params: Promise.resolve({ height: '700000', id }) })) as any).status).toBe(404);
  });
});

describe('/.well-known/bg-event-keys.json', () => {
  it('is edge-cached 5 minutes with a 60 s stale window (not an hour), open to any origin', () => {
    const res = keysGet() as Response;
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300, stale-while-revalidate=60');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('publishes the public key only; with no key configured it lists none and no event is published', async () => {
    const withKey = await keysFile();
    expect(withKey.keys).toHaveLength(1);
    expect(JSON.stringify(withKey)).not.toContain(SEED);
    expect(JSON.stringify(withKey)).not.toContain(Buffer.from(SEED, 'hex').toString('base64'));

    delete process.env.BG_EVENT_SIGNING_KEY;
    __resetBlockEventsState();
    expect(await keysFile()).toEqual({ format: 'bg-event-keys/1', keys: [] });

    const started: any = await sessionStart(req({ walletAddress: owner.address }));
    const message = started.body.data.message;
    const verified: any = await sessionVerify(req({ walletAddress: owner.address, message, signature: sign(owner.privKey, owner.address, message), blocks: [BLOCK] }));
    rows().length = 0;
    const wrote: any = await worldPost(req({ blockHeight: BLOCK, objectType: 'crate' }, { authorization: `Bearer ${verified.body.data.token}` }));
    expect(wrote.status).toBeLessThan(300);
    expect(rows()).toHaveLength(0);
  });
});

// ── The two switches ─────────────────────────────────────────────────────

describe('switches', () => {
  it('flag off (the default): the write is unchanged and no event is stored; the GET says enabled:false', async () => {
    delete process.env.BG_EVENTS_ENABLED;
    const body = await signedBody(owner, { blockHeight: BLOCK, objectType: 'tree' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
    const res: any = await worldPost(req(body));
    expect(res.status).toBe(201);
    expect(rows()).toHaveLength(0);
    const page: any = await eventsGet(req(null, {}, `http://test.local/api/v1/blocks/${BLOCK}/events`), { params: Promise.resolve({ height: String(BLOCK) }) });
    expect(page.status).toBe(200);
    expect(page.body).toEqual({ format: 'bg-event/1', enabled: false, events: [] });
  });

  it('table missing (migration not applied): writes still succeed, nothing throws, GET says enabled:false', async () => {
    db.__events.__setMissing(true);
    try {
      const body = await signedBody(owner, { blockHeight: BLOCK, objectType: 'tree' }, { action: 'world.create', method: 'POST', path: '/api/v1/world', blockHeight: BLOCK });
      const res: any = await worldPost(req(body));
      expect(res.status).toBe(201);
      const page: any = await eventsGet(req(null, {}, `http://test.local/api/v1/blocks/${BLOCK}/events`), { params: Promise.resolve({ height: String(BLOCK) }) });
      expect(page.body).toEqual({ format: 'bg-event/1', enabled: false, events: [] });
      const proof: any = await proofGet(req(null), { params: Promise.resolve({ height: String(BLOCK), id: '01JB7Z8K2Q4X9M3T6V0R5N1C8D' }) });
      expect(proof.status).toBe(404);
      expect(proof.body.enabled).toBe(false);
    } finally {
      db.__events.__setMissing(false);
    }
  });
});
