import { readFileSync } from 'fs';
import { join } from 'path';
import { canonicalManifest, computeManifestHash } from '@/lib/experience-protocol';

// The canonical manifest form decides which bytes get hashed, and that hash is
// what the owner's BIP-322 signature commits to. If the app and the SDK
// canonicalize differently by even one character, a client signs hash A, the
// server computes hash B, and every signed registration fails — or worse, a
// stored record stops re-verifying later. These two files are the source of
// truth; this test fails the moment they drift.

const APP_FILE = join(__dirname, '../../src/lib/experience-protocol.ts');
const SDK_FILE = join(__dirname, '../../../sdk/agent-connect/src/experience-manifest.ts');

const BEGIN = '// ===== BEGIN SHARED MANIFEST CANON';
const END = '// ===== END SHARED MANIFEST CANON =====';

function extractSharedCanon(source: string): string {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start === -1 || end === -1) throw new Error('SHARED MANIFEST CANON markers not found');
  return source.slice(start, end + END.length);
}

describe('experience manifest canon app <-> SDK parity', () => {
  it('shared canon is byte-for-byte identical across app and SDK', () => {
    const appCanon = extractSharedCanon(readFileSync(APP_FILE, 'utf8'));
    const sdkCanon = extractSharedCanon(readFileSync(SDK_FILE, 'utf8'));
    expect(sdkCanon).toBe(appCanon);
  });

  it('golden vector: the canonical hash is byte-stable', async () => {
    // Frozen input → frozen hash. If this value ever changes, every previously
    // signed manifest stops verifying, so the change must be a deliberate
    // manifestVersion bump and not an accidental edit to the canonicalizer.
    const hash = await computeManifestHash({
      blockHeight: 840000,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      version: '1.0.0',
    });
    // canonical form:
    // {"blockHeight":840000,"entryUrl":"https://plaza.example.com","experienceType":"web",
    //  "healthUrl":"https://plaza.example.com","manifestVersion":1,"name":"Pixel Plaza",
    //  "transport":"https","version":"1.0.0"}
    expect(hash).toBe('911cc0cb67122963dd4cb3edcb9e72697eed61c1d326266a3c29d82c47575c83');
  });

  it('omitted healthUrl canonicalizes to entryUrl, so a stored row re-hashes identically', () => {
    const fromRequest = canonicalManifest({
      blockHeight: 840000,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      version: '1.0.0',
    });
    // What the server actually persists: healthUrl defaulted to entryUrl.
    const fromStoredRow = canonicalManifest({
      blockHeight: 840000,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      healthUrl: 'https://plaza.example.com',
      version: '1.0.0',
    });
    expect(fromStoredRow).toEqual(fromRequest);
  });

  it('omitted and explicitly-null optionals hash the same', async () => {
    const omitted = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
    });
    const nulled = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
      description: null,
      parcelIndex: null,
      contentRating: null,
      contentHash: null,
      capabilities: [],
      clientRequirements: null,
    });
    expect(nulled).toBe(omitted);
  });

  it('clientRequirements hashes the same whether given as an object or the stored JSON string', async () => {
    const asObject = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
      clientRequirements: { platform: 'web', minVersion: '1.0' },
    });
    const asStoredString = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
      // Key order deliberately reversed — stableStringify sorts keys.
      clientRequirements: JSON.stringify({ minVersion: '1.0', platform: 'web' }),
    });
    expect(asStoredString).toBe(asObject);
  });

  it('capability ORDER is significant — it is operator-chosen presentation order', async () => {
    const a = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
      capabilities: ['voice', 'avatars'],
    });
    const b = await computeManifestHash({
      blockHeight: 1,
      name: 'A',
      experienceType: 'web',
      entryUrl: 'https://a.example.com',
      transport: 'https',
      version: '1',
      capabilities: ['avatars', 'voice'],
    });
    expect(b).not.toBe(a);
  });

  it('any change to a hashed field changes the hash', async () => {
    const base = {
      blockHeight: 840000,
      name: 'Pixel Plaza',
      experienceType: 'web',
      entryUrl: 'https://plaza.example.com',
      transport: 'https',
      version: '1.0.0',
    };
    const original = await computeManifestHash(base);
    for (const mutation of [
      { entryUrl: 'https://evil.example.com' },
      { name: 'Pixel Plazb' },
      { version: '1.0.1' },
      { blockHeight: 840001 },
      { contentHash: `sha256:${'0'.repeat(64)}` },
    ]) {
      expect(await computeManifestHash({ ...base, ...mutation })).not.toBe(original);
    }
  });
});
