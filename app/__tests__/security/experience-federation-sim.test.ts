/**
 * ISOLATED SIMULATION — signed-manifest federation for self-hosted experiences.
 *
 * Exercises the REAL route handlers with REAL BIP-322 signatures against an
 * in-memory Prisma, so the whole trust chain runs for real:
 *   deed (live on-chain owner check) → BIP-322 signature → signed manifest hash.
 *
 * The point of these tests is adversarial: it is easy to write an integrity
 * feature that stores a signature and never checks it. So most of what follows
 * asserts REJECTION — a signature bound to a different manifest, a replayed
 * authorization, one re-pointed at another route, one from a former owner, one
 * that expired — plus the detection of a manifest altered after the fact.
 */

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

jest.mock('@/lib/onchain/ord', () => ({
  getInscriptionOwner: jest.fn(async () => null),
  getStatus: jest.fn(async () => ({ height: 800_000 })),
  getAddressInscriptions: jest.fn(async () => null),
}));

jest.mock('@/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMemoryPrisma } = require('../helpers/memory-prisma');
  const client = createMemoryPrisma();
  return { __esModule: true, default: client, prisma: client };
});

const mockProbe = jest.fn(async () => ({ status: 'live', reachable: true, latencyMs: 120, httpStatus: 200 }));
jest.mock('@/lib/experience-probe', () => ({
  __esModule: true,
  probeExperienceUrl: (...a: unknown[]) => mockProbe(...(a as [])),
  hostResolvesPublic: jest.fn(async () => true),
}));

const mockJudge = jest.fn(async () => ({
  violated: false,
  ruleIndex: null as number | null,
  reasoning: 'clean',
  brainStatus: 'online',
}));
jest.mock('@/lib/experience-judge', () => ({
  __esModule: true,
  judgeExperienceManifest: (...a: unknown[]) => mockJudge(...(a as [])),
}));

const mockFetchRemote = jest.fn();
jest.mock('@/lib/experience-manifest-fetch', () => ({
  __esModule: true,
  fetchRemoteManifest: (...a: unknown[]) => mockFetchRemote(...(a as [])),
  wellKnownManifestUrl: (entry: string) => `${new URL(entry.replace(/^wss:/, 'https:')).origin}/.well-known/nexus-experience.json`,
}));

import prisma from '@/lib/prisma';
import * as ord from '@/lib/onchain/ord';
import { issueChallenge } from '@/lib/challenges';
import { buildActionMessage } from '@/lib/action-message';
import { computeManifestHash } from '@/lib/experience-protocol';
import { POST as registerPOST } from '@/app/api/v1/experiences/route';
import { PATCH as patchById, DELETE as deleteById } from '@/app/api/v1/experiences/[id]/route';
import { GET as verifyGET } from '@/app/api/v1/experiences/[id]/verify/route';
import { makeWallet, sign, freshNonce, challengeMessage, type SimWallet } from '../helpers/wallet-sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const getOwner = ord.getInscriptionOwner as jest.Mock;
const onChain = (address: string) => ({ address, satpoint: `${address}:0` });

const req = (body: any, url = 'http://test.local/') =>
  ({ json: async () => body, url, nextUrl: new URL(url), headers: { get: () => null } } as any);
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

const BASE_MANIFEST = {
  name: 'Pixel Plaza',
  experienceType: 'web',
  entryUrl: 'https://plaza.example.com',
  transport: 'https',
  version: '1.0.0',
};

const FUTURE = () => Date.now() + 5 * 60 * 1000;

/** Issue a real challenge row and return its raw nonce. */
async function issueNonce(address: string, purpose: string): Promise<string> {
  const nonce = freshNonce();
  await issueChallenge(nonce, { address, purpose });
  return nonce;
}

/** Build the signed body for a manifest registration. */
async function signedRegisterBody(
  wallet: SimWallet,
  blockHeight: number,
  manifest: Record<string, unknown> = {},
  opts: { bindHash?: string; path?: string; action?: string; method?: string; expiresAt?: number; nonce?: string } = {},
) {
  const full = { blockHeight, ...BASE_MANIFEST, ...manifest };
  const nonce = opts.nonce ?? (await issueNonce(wallet.address, 'experience-register'));
  const message = buildActionMessage({
    action: opts.action ?? 'experience.register',
    method: opts.method ?? 'POST',
    path: opts.path ?? '/api/v1/experiences',
    blockHeight,
    bodyHash: opts.bindHash ?? (await computeManifestHash(full as any)),
    nonce,
    expiresAt: opts.expiresAt ?? FUTURE(),
  });
  return { body: { ...full, walletAddress: wallet.address, signature: sign(wallet.privKey, wallet.address, message), message }, message, nonce };
}

/** Legacy bare-challenge registration body. */
async function legacyRegisterBody(wallet: SimWallet, blockHeight: number) {
  const nonce = await issueNonce(wallet.address, 'experience-register');
  const challenge = challengeMessage(nonce);
  return {
    ...BASE_MANIFEST,
    blockHeight,
    walletAddress: wallet.address,
    signature: sign(wallet.privKey, wallet.address, challenge),
    challenge,
  };
}

async function ownedBlock(height: number): Promise<SimWallet> {
  const owner = makeWallet('p2tr');
  await db.block.create({ data: { height, ownerAddress: owner.address, inscriptionId: `insc-${height}` } });
  getOwner.mockResolvedValue(onChain(owner.address));
  return owner;
}

beforeEach(() => {
  db.__reset();
  getOwner.mockReset();
  getOwner.mockResolvedValue(null);
  mockProbe.mockClear();
  mockProbe.mockResolvedValue({ status: 'live', reachable: true, latencyMs: 120, httpStatus: 200 });
  mockJudge.mockClear();
  mockJudge.mockResolvedValue({ violated: false, ruleIndex: null, reasoning: 'clean', brainStatus: 'online' });
  mockFetchRemote.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('signed manifest registration', () => {
  it('accepts an owner-signed manifest and stores the full integrity triple', async () => {
    const owner = await ownedBlock(4001);
    const { body, message } = await signedRegisterBody(owner, 4001);

    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(201);
    expect(res.body.data.signed).toBe(true);
    expect(res.body.data.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.manifestSignature).toBe(body.signature);
    expect(res.body.data.manifestMessage).toBe(message);
    expect(res.body.data.manifestVersion).toBe(1);

    // The stored hash is the one the signature commits to.
    expect(message).toContain(`Body: ${res.body.data.manifestHash}`);
  });

  it('the legacy bare-challenge flow still works, but is explicitly NOT tamper-evident', async () => {
    const owner = await ownedBlock(4002);
    const res: any = await registerPOST(req(await legacyRegisterBody(owner, 4002)));
    expect(res.status).toBe(201);
    expect(res.body.data.signed).toBe(false);
    expect(res.body.data.manifestSignature).toBeNull();
    // A hash is still recorded, so later alteration of the row is detectable
    // even though nobody attested to it.
    expect(res.body.data.manifestHash).toMatch(/^[0-9a-f]{64}$/);

    const verify: any = await verifyGET(req({}, 'http://test.local/'), withId(res.body.data.id));
    expect(verify.body.data.verified).toBe(false);
    expect(verify.body.data.manifestHashMatches).toBe(true);
    expect(verify.body.data.issues.join(' ')).toContain('unsigned');
  });

  it('REJECTS a signature bound to a DIFFERENT manifest than the one submitted', async () => {
    const owner = await ownedBlock(4003);
    // Sign the hash of a benign manifest...
    const decoyHash = await computeManifestHash({ blockHeight: 4003, ...BASE_MANIFEST } as any);
    // ...then submit a manifest pointing somewhere else entirely.
    const { body } = await signedRegisterBody(
      owner,
      4003,
      { entryUrl: 'https://attacker.example.com' },
      { bindHash: decoyHash },
    );

    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/binding mismatch/i);
    expect(await db.experience.count({})).toBe(0);
  });

  it('REJECTS a replayed signed authorization (nonce is single-use)', async () => {
    const owner = await ownedBlock(4004);
    const { body } = await signedRegisterBody(owner, 4004);

    expect((await registerPOST(req(body))).status).toBe(201);
    const replay: any = await registerPOST(req(body));
    expect(replay.status).toBe(401);
    expect(replay.body.error).toMatch(/already-used|expired|invalid/i);
    expect(await db.experience.count({})).toBe(1);
  });

  it('REJECTS an authorization re-pointed at a different action', async () => {
    const owner = await ownedBlock(4005);
    const { body } = await signedRegisterBody(owner, 4005, {}, { action: 'experience.remove' });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/action binding/i);
  });

  it('REJECTS an authorization signed for a different path', async () => {
    const owner = await ownedBlock(4006);
    const { body } = await signedRegisterBody(owner, 4006, {}, { path: '/api/v1/world' });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/path binding/i);
  });

  it('REJECTS an expired authorization', async () => {
    const owner = await ownedBlock(4007);
    const { body } = await signedRegisterBody(owner, 4007, {}, { expiresAt: Date.now() - 1000 });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('REJECTS a signature from a wallet that does not own the block on-chain (403)', async () => {
    const owner = makeWallet('p2tr');
    const attacker = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 4008, ownerAddress: owner.address, inscriptionId: 'insc-4008' } });
    getOwner.mockResolvedValue(onChain(owner.address));

    const { body } = await signedRegisterBody(attacker, 4008);
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(403);
    expect(await db.experience.count({})).toBe(0);
  });

  it('REJECTS a forged signature (wrong key over a valid message)', async () => {
    const owner = await ownedBlock(4009);
    const impostor = makeWallet('p2wpkh');
    const { body, message } = await signedRegisterBody(owner, 4009);
    body.signature = sign(impostor.privKey, impostor.address, message);

    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });
});

describe('manifest schema versioning + content hash', () => {
  it('rejects an unsupported manifestVersion', async () => {
    const owner = await ownedBlock(4101);
    const { body } = await signedRegisterBody(owner, 4101, { manifestVersion: 99 });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/manifestVersion/);
  });

  it('rejects a malformed contentHash', async () => {
    const owner = await ownedBlock(4102);
    const { body } = await signedRegisterBody(owner, 4102, { contentHash: 'md5:whatever' });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contentHash/);
  });

  it('stores a well-formed contentHash and folds it into the signed hash', async () => {
    const owner = await ownedBlock(4103);
    const contentHash = `sha256:${'a'.repeat(64)}`;
    const { body } = await signedRegisterBody(owner, 4103, { contentHash });
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(201);
    expect(res.body.data.contentHash).toBe(contentHash);

    // Changing only the contentHash must change the manifest hash — otherwise the
    // signature would not actually be committing to it.
    const withOther = await computeManifestHash({
      blockHeight: 4103,
      ...BASE_MANIFEST,
      contentHash: `sha256:${'b'.repeat(64)}`,
    } as any);
    expect(withOther).not.toBe(res.body.data.manifestHash);
  });
});

describe('GET /api/v1/experiences/[id]/verify — tamper detection', () => {
  async function registerSigned(height: number) {
    const owner = await ownedBlock(height);
    const { body } = await signedRegisterBody(owner, height);
    const res: any = await registerPOST(req(body));
    expect(res.status).toBe(201);
    return { owner, id: res.body.data.id as string, hash: res.body.data.manifestHash as string };
  }

  it('reports a clean, fully-verified record', async () => {
    const { id } = await registerSigned(4201);
    const res: any = await verifyGET(req({}, 'http://test.local/'), withId(id));
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.signed).toBe(true);
    expect(res.body.data.manifestHashMatches).toBe(true);
    expect(res.body.data.signatureValid).toBe(true);
    expect(res.body.data.signatureCoversManifest).toBe(true);
    expect(res.body.data.issues).toEqual([]);
  });

  it('DETECTS a manifest altered in the database after signing', async () => {
    const { id } = await registerSigned(4202);
    // Simulate a compromised registry silently re-pointing the experience.
    await db.experience.update({ where: { id }, data: { entryUrl: 'https://attacker.example.com' } });

    const res: any = await verifyGET(req({}, 'http://test.local/'), withId(id));
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.manifestHashMatches).toBe(false);
    expect(res.body.data.signatureCoversManifest).toBe(false);
    expect(res.body.data.issues.join(' ')).toMatch(/altered|different manifest/i);
  });

  it('DETECTS a stored hash rewritten to match a tampered manifest (the signature still disagrees)', async () => {
    const { id } = await registerSigned(4203);
    const tamperedEntry = 'https://attacker.example.com';
    const consistentHash = await computeManifestHash({
      blockHeight: 4203,
      ...BASE_MANIFEST,
      entryUrl: tamperedEntry,
      healthUrl: tamperedEntry,
    } as any);
    // The attacker updates BOTH the manifest and the stored hash so they agree.
    await db.experience.update({
      where: { id },
      data: { entryUrl: tamperedEntry, healthUrl: tamperedEntry, manifestHash: consistentHash },
    });

    const res: any = await verifyGET(req({}, 'http://test.local/'), withId(id));
    // Hash-vs-manifest now agrees...
    expect(res.body.data.manifestHashMatches).toBe(true);
    // ...but the OWNER'S SIGNATURE still commits to the original manifest.
    expect(res.body.data.signatureCoversManifest).toBe(false);
    expect(res.body.data.verified).toBe(false);
  });

  it('remote=1 reports agreement when the host publishes the same manifest', async () => {
    const { id } = await registerSigned(4204);
    mockFetchRemote.mockResolvedValue({
      ok: true,
      url: 'https://plaza.example.com/.well-known/nexus-experience.json',
      bytes: 200,
      document: { blockHeight: 4204, ...BASE_MANIFEST },
    });

    const res: any = await verifyGET(req({}, 'http://test.local/?remote=1'), withId(id));
    expect(res.body.data.remote.checked).toBe(true);
    expect(res.body.data.remote.reachable).toBe(true);
    expect(res.body.data.remote.matchesRegistry).toBe(true);
    expect(res.body.data.remote.blockHeightMatches).toBe(true);
  });

  it('remote=1 reports drift when the host publishes something else', async () => {
    const { id } = await registerSigned(4205);
    mockFetchRemote.mockResolvedValue({
      ok: true,
      url: 'https://plaza.example.com/.well-known/nexus-experience.json',
      bytes: 200,
      document: { blockHeight: 4205, ...BASE_MANIFEST, version: '9.9.9' },
    });

    const res: any = await verifyGET(req({}, 'http://test.local/?remote=1'), withId(id));
    expect(res.body.data.remote.matchesRegistry).toBe(false);
    // Registry integrity is unaffected — the host drifting is not our tampering.
    expect(res.body.data.verified).toBe(true);
  });

  it('remote=1 surfaces an SSRF-blocked or unreachable host as a reason, not a crash', async () => {
    const { id } = await registerSigned(4206);
    mockFetchRemote.mockResolvedValue({ ok: false, reason: 'host resolves to a private address' });

    const res: any = await verifyGET(req({}, 'http://test.local/?remote=1'), withId(id));
    expect(res.body.data.remote.reachable).toBe(false);
    expect(res.body.data.remote.reason).toMatch(/private address/);
    expect(res.body.data.verified).toBe(true);
  });

  it('does not touch the network unless remote=1 is asked for', async () => {
    const { id } = await registerSigned(4207);
    await verifyGET(req({}, 'http://test.local/'), withId(id));
    expect(mockFetchRemote).not.toHaveBeenCalled();
  });
});

describe('signed update + remove', () => {
  async function registerSigned(height: number) {
    const owner = await ownedBlock(height);
    const { body } = await signedRegisterBody(owner, height);
    const res: any = await registerPOST(req(body));
    return { owner, id: res.body.data.id as string, hash: res.body.data.manifestHash as string };
  }

  it('a signed update re-anchors the hash to the RESULTING manifest', async () => {
    const { owner, id } = await registerSigned(4301);
    const merged = { blockHeight: 4301, ...BASE_MANIFEST, version: '2.0.0' };
    const nonce = await issueNonce(owner.address, 'experience-manage');
    const message = buildActionMessage({
      action: 'experience.update',
      method: 'PATCH',
      path: `/api/v1/experiences/${id}`,
      blockHeight: 4301,
      bodyHash: await computeManifestHash(merged as any),
      nonce,
      expiresAt: FUTURE(),
    });
    const res: any = await patchById(
      req({ version: '2.0.0', walletAddress: owner.address, signature: sign(owner.privKey, owner.address, message), message }),
      withId(id),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe('2.0.0');
    expect(res.body.data.signed).toBe(true);

    const verify: any = await verifyGET(req({}, 'http://test.local/'), withId(id));
    expect(verify.body.data.verified).toBe(true);
  });

  it('REJECTS an update whose signature commits to a manifest the patch does not produce', async () => {
    const { owner, id } = await registerSigned(4302);
    const nonce = await issueNonce(owner.address, 'experience-manage');
    const message = buildActionMessage({
      action: 'experience.update',
      method: 'PATCH',
      path: `/api/v1/experiences/${id}`,
      blockHeight: 4302,
      // Signs version 2.0.0 ...
      bodyHash: await computeManifestHash({ blockHeight: 4302, ...BASE_MANIFEST, version: '2.0.0' } as any),
      nonce,
      expiresAt: FUTURE(),
    });
    // ... but actually patches to 3.0.0.
    const res: any = await patchById(
      req({ version: '3.0.0', walletAddress: owner.address, signature: sign(owner.privKey, owner.address, message), message }),
      withId(id),
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/binding mismatch/i);
  });

  it('an UNSIGNED (legacy) update clears a previous signature rather than leaving it stale', async () => {
    const { owner, id } = await registerSigned(4303);
    const nonce = await issueNonce(owner.address, 'experience-manage');
    const challenge = challengeMessage(nonce);
    const res: any = await patchById(
      req({
        version: '2.0.0',
        walletAddress: owner.address,
        signature: sign(owner.privKey, owner.address, challenge),
        challenge,
      }),
      withId(id),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.signed).toBe(false);
    expect(res.body.data.manifestSignature).toBeNull();

    // Crucially, the OLD signature is not still sitting there appearing to
    // attest to the new manifest.
    const verify: any = await verifyGET(req({}, 'http://test.local/'), withId(id));
    expect(verify.body.data.signed).toBe(false);
    expect(verify.body.data.manifestHashMatches).toBe(true);
  });

  it('a signed remove must bind the manifest being removed', async () => {
    const { owner, id, hash } = await registerSigned(4304);
    const nonce = await issueNonce(owner.address, 'experience-manage');
    const wrong = buildActionMessage({
      action: 'experience.remove',
      method: 'DELETE',
      path: `/api/v1/experiences/${id}`,
      blockHeight: 4304,
      bodyHash: 'f'.repeat(64),
      nonce,
      expiresAt: FUTURE(),
    });
    const denied: any = await deleteById(
      req({ walletAddress: owner.address, signature: sign(owner.privKey, owner.address, wrong), message: wrong }),
      withId(id),
    );
    expect(denied.status).toBe(401);
    expect(await db.experience.count({})).toBe(1);

    const nonce2 = await issueNonce(owner.address, 'experience-manage');
    const right = buildActionMessage({
      action: 'experience.remove',
      method: 'DELETE',
      path: `/api/v1/experiences/${id}`,
      blockHeight: 4304,
      bodyHash: hash,
      nonce: nonce2,
      expiresAt: FUTURE(),
    });
    const ok: any = await deleteById(
      req({ walletAddress: owner.address, signature: sign(owner.privKey, owner.address, right), message: right }),
      withId(id),
    );
    expect(ok.status).toBe(200);
    expect(await db.experience.count({})).toBe(0);
  });
});

describe('ownership follows the deed on transfer', () => {
  it('after transfer the FORMER owner cannot update, and the NEW owner can register', async () => {
    const seller = makeWallet('p2tr');
    const buyer = makeWallet('p2wpkh');
    await db.block.create({ data: { height: 4401, ownerAddress: seller.address, inscriptionId: 'insc-4401' } });

    // The seller's experience is seeded directly rather than registered through
    // the route, because ownership-sync memoizes the on-chain owner per
    // inscription for 5 minutes — registering first would warm that cache with
    // the seller and mask the very transfer this test is about.
    const seeded = await db.experience.create({
      data: {
        walletAddress: seller.address,
        blockHeight: 4401,
        ...BASE_MANIFEST,
        healthUrl: BASE_MANIFEST.entryUrl,
        manifestVersion: 1,
        status: 'live',
        soulJudged: true,
      },
    });
    const id = seeded.id;

    // The bitmap moves on-chain. The DB snapshot deliberately still names the
    // seller — this is exactly the sale→sync lag window.
    getOwner.mockResolvedValue(onChain(buyer.address));

    const nonce = await issueNonce(seller.address, 'experience-manage');
    const message = buildActionMessage({
      action: 'experience.update',
      method: 'PATCH',
      path: `/api/v1/experiences/${id}`,
      blockHeight: 4401,
      bodyHash: await computeManifestHash({ blockHeight: 4401, ...BASE_MANIFEST, version: '6.6.6' } as any),
      nonce,
      expiresAt: FUTURE(),
    });
    const denied: any = await patchById(
      req({ version: '6.6.6', walletAddress: seller.address, signature: sign(seller.privKey, seller.address, message), message }),
      withId(id),
    );
    expect(denied.status).toBe(403);

    // The buyer, who now holds the deed, can attach their own experience.
    const buyerReg = await signedRegisterBody(buyer, 4401, { name: 'New Owner World' });
    const allowed: any = await registerPOST(req(buyerReg.body));
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.walletAddress).toBe(buyer.address);
  });
});
