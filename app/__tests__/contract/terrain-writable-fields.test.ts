/**
 * Contract guard: every field `POST /api/v1/world/terrain` accepts must be a
 * real `BlockTerrain` column, and must be the same set the spec advertises.
 *
 * The allowlist carried `surfaceType`, which is a column on nothing. Prisma
 * validates arguments against the generated model, so the upsert threw
 * `PrismaClientValidationError: Unknown argument 'surfaceType'` and the route's
 * catch turned it into a 500 -- verified against a real postgres:16 database
 * before this suite was written. An agent following the published field list
 * got a server error for a documented request.
 *
 * The three assertions below are deliberately sourced from three different
 * files, because the bug was those files disagreeing:
 *   1. allowlist  ⊆ prisma/schema.prisma   -- the write cannot fail at runtime
 *   2. allowlist  = openapi TerrainUpdateRequest -- callers are told the truth
 *   3. the route ignores anything else rather than forwarding it to Prisma
 *
 * A mocked Prisma cannot catch this class on its own: a permissive `jest.fn()`
 * accepts any key. So the fake here rejects unknown keys the way the real
 * client does, with the column set parsed from schema.prisma rather than
 * hardcoded -- if a column is added or renamed, the fake follows.
 */

import fs from 'fs';
import path from 'path';
import { TERRAIN_WRITABLE_FIELDS } from '@/lib/world-terrain-fields';

const APP_ROOT = process.cwd();

/** Column names of a model as declared in schema.prisma. */
function prismaModelColumns(model: string): string[] {
  const schema = fs.readFileSync(path.join(APP_ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const block = new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!block) throw new Error(`model ${model} not found in schema.prisma`);

  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0]);
}

const TERRAIN_COLUMNS = prismaModelColumns('BlockTerrain');

describe('terrain allowlist ↔ prisma schema', () => {
  it('parses the model it is asserting against', () => {
    // Guards the regex above: a silently-empty column list would make the
    // subset assertion below vacuous rather than failing.
    expect(TERRAIN_COLUMNS).toEqual(expect.arrayContaining(['blockHeight', 'groundColor', 'groundTexture']));
  });

  it('accepts no field that is not a BlockTerrain column', () => {
    const phantom = TERRAIN_WRITABLE_FIELDS.filter((f) => !TERRAIN_COLUMNS.includes(f));

    // `surfaceType` failed here. The nearest real column is `groundTexture`.
    expect(phantom).toEqual([]);
  });
});

describe('terrain allowlist ↔ openapi.json', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public', 'openapi.json'), 'utf8')) as {
    components: { schemas: Record<string, { required?: string[]; properties: Record<string, unknown> }> };
  };

  it('advertises exactly the settings it will persist', () => {
    const req = spec.components.schemas.TerrainUpdateRequest;
    // Everything in the request body that is not routing or authorization.
    const documented = Object.keys(req.properties).filter((p) => !(req.required ?? []).includes(p));

    expect(documented.sort()).toEqual([...TERRAIN_WRITABLE_FIELDS].sort());
  });
});

describe('POST /api/v1/world/terrain against a Prisma that validates its arguments', () => {
  const upsertCalls: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];

  beforeEach(() => {
    upsertCalls.length = 0;
    jest.clearAllMocks();
  });

  jest.mock('next/server', () => {
    class NextResponse {
      constructor(
        public body: unknown,
        public init?: { status?: number }
      ) {}
      get status() {
        return this.init?.status ?? 200;
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

  jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
      blockTerrain: {
        upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          // Mirrors PrismaClientValidationError: the real client rejects any
          // argument that is not a column, before it touches the database.
          for (const key of [...Object.keys(args.create), ...Object.keys(args.update)]) {
            if (!TERRAIN_COLUMNS.includes(key)) {
              throw new Error(`Unknown argument \`${key}\`. Available options are marked with ?.`);
            }
          }
          upsertCalls.push(args);
          return { blockHeight: args.create.blockHeight, ...args.update };
        },
      },
    },
  }));

  jest.mock('@/lib/api-rate-limit', () => ({
    enforceRateLimit: async () => ({ response: null, headers: {} }),
    WORLD_WRITE_LIMIT: 60,
  }));
  jest.mock('@/lib/api-helpers', () => ({ verifyWalletSignature: () => true }));
  jest.mock('@/lib/challenges', () => ({ consumeChallenge: async () => true }));
  jest.mock('@/lib/action-message', () => ({
    verifyActionBinding: () => ({ ok: true, nonce: 'nonce_1' }),
    hashBody: async () => 'bodyhash',
  }));
  jest.mock('@/lib/block-write-auth', () => ({ requireSignedBlockOwner: async () => ({ ok: true }) }));
  jest.mock('@/lib/ownership-gate', () => ({ gateDenialResponse: () => ({ status: 403 }) }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { POST } = require('@/app/api/v1/world/terrain/route');

  const WALLET = 'bc1powner00000000000000000000000000000000000';
  const BLOCK = 840000;

  const post = (extra: Record<string, unknown>) =>
    POST({
      json: async () => ({ blockHeight: BLOCK, ownerAddress: WALLET, signature: 'sig', message: 'msg', ...extra }),
      headers: { get: () => null },
    } as never);

  it('persists a documented setting', async () => {
    const res = await post({ groundColor: '#123456' });

    expect(res.status).toBe(200);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].update).toEqual({ groundColor: '#123456' });
  });

  it('does not 500 on a body carrying a field the model does not have', async () => {
    // The exact request that failed: `surfaceType` was allowlisted, so it was
    // copied into the upsert and Prisma rejected the whole write.
    const res = await post({ groundColor: '#123456', surfaceType: 'basalt' });

    expect(res.status).toBe(200);
  });

  it('drops the unknown field instead of forwarding it to Prisma', async () => {
    await post({ groundColor: '#123456', surfaceType: 'basalt' });

    expect(upsertCalls[0].update).not.toHaveProperty('surfaceType');
    expect(upsertCalls[0].create).not.toHaveProperty('surfaceType');
  });

  it('still ignores an unrelated field, which is what the spec promises', async () => {
    const res = await post({ groundColor: '#123456', ownerAddressOverride: 'bc1qattacker', id: 'forged' });

    expect(res.status).toBe(200);
    expect(upsertCalls[0].update).toEqual({ groundColor: '#123456' });
  });
});
