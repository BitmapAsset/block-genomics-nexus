/**
 * Unit tests for experience-protocol: zod manifest validation, the synchronous
 * SSRF URL/IP guards, and probe-status mapping. Pure functions — no DB, no net.
 */

import {
  experienceManifestSchema,
  experienceManifestPatchSchema,
  assertSafePublicUrl,
  isPrivateIp,
  mapProbeStatus,
} from '@/lib/experience-protocol';

const baseManifest = {
  blockHeight: 840000,
  name: 'Pixel Plaza',
  experienceType: 'web' as const,
  entryUrl: 'https://plaza.example.com',
  transport: 'https' as const,
  version: '1.0.0',
};

describe('experienceManifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const r = experienceManifestSchema.safeParse(baseManifest);
    expect(r.success).toBe(true);
  });

  it('accepts a full manifest and strips unknown keys (walletAddress/signature)', () => {
    const r = experienceManifestSchema.safeParse({
      ...baseManifest,
      parcelIndex: 3,
      description: 'A cozy hangout',
      healthUrl: 'https://plaza.example.com/health',
      transport: 'wss',
      entryUrl: 'wss://plaza.example.com/socket',
      clientRequirements: { platform: 'web', minVersion: '1.0', downloadUrl: 'https://dl.example.com/app' },
      capabilities: ['voice', 'avatars'],
      contentRating: 'everyone',
      walletAddress: 'bc1pxyz',
      signature: 'sig',
      challenge: 'msg',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty('walletAddress');
      expect(r.data).not.toHaveProperty('signature');
    }
  });

  it('rejects an out-of-range name (>64) and empty name', () => {
    expect(experienceManifestSchema.safeParse({ ...baseManifest, name: 'x'.repeat(65) }).success).toBe(false);
    expect(experienceManifestSchema.safeParse({ ...baseManifest, name: '' }).success).toBe(false);
  });

  it('rejects an unknown experienceType and transport', () => {
    expect(experienceManifestSchema.safeParse({ ...baseManifest, experienceType: 'roblox' }).success).toBe(false);
    expect(experienceManifestSchema.safeParse({ ...baseManifest, transport: 'ftp' }).success).toBe(false);
  });

  it('rejects >16 capabilities', () => {
    const capabilities = Array.from({ length: 17 }, (_, i) => `cap${i}`);
    expect(experienceManifestSchema.safeParse({ ...baseManifest, capabilities }).success).toBe(false);
  });

  it('rejects a plain http entryUrl (no TLS)', () => {
    expect(experienceManifestSchema.safeParse({ ...baseManifest, entryUrl: 'http://plaza.example.com' }).success).toBe(false);
  });

  it('rejects an entryUrl pointing at a private IP / localhost', () => {
    expect(experienceManifestSchema.safeParse({ ...baseManifest, entryUrl: 'https://127.0.0.1' }).success).toBe(false);
    expect(experienceManifestSchema.safeParse({ ...baseManifest, entryUrl: 'https://localhost' }).success).toBe(false);
    expect(experienceManifestSchema.safeParse({ ...baseManifest, entryUrl: 'https://10.0.0.5:8080' }).success).toBe(false);
  });

  it('patch schema requires at least one field and forbids blockHeight', () => {
    expect(experienceManifestPatchSchema.safeParse({}).success).toBe(false);
    expect(experienceManifestPatchSchema.safeParse({ name: 'New Name' }).success).toBe(true);
    // blockHeight is omitted from the patch schema — it is stripped, not honored.
    const r = experienceManifestPatchSchema.safeParse({ blockHeight: 5, name: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty('blockHeight');
  });
});

describe('assertSafePublicUrl', () => {
  it.each([
    ['https://world.example.com', true],
    ['wss://world.example.com/socket', true],
    ['https://a.b.c.example.io:8443/path', true],
    ['http://world.example.com', false],           // no TLS
    ['ws://world.example.com', false],             // no TLS
    ['ftp://world.example.com', false],            // wrong scheme
    ['https://user:pass@world.example.com', false],// embedded creds
    ['https://localhost', false],
    ['https://foo.localhost', false],
    ['https://printer.local', false],              // mDNS
    ['https://127.0.0.1', false],
    ['https://0.0.0.0', false],
    ['https://10.1.2.3', false],
    ['https://192.168.1.1', false],
    ['https://172.16.9.9', false],
    ['https://169.254.169.254', false],            // cloud metadata (link-local)
    ['https://100.64.0.1', false],                 // CGNAT
    ['https://[::1]', false],                       // IPv6 loopback
    ['https://[fd00::1]', false],                   // IPv6 unique-local
    ['https://[fe80::1]', false],                   // IPv6 link-local
    ['https://2130706433', false],                  // decimal-encoded 127.0.0.1
    ['https://0x7f000001', false],                  // hex-encoded 127.0.0.1
    ['not a url', false],
  ])('%s → ok=%s', (url, expected) => {
    expect(assertSafePublicUrl(url).ok).toBe(expected);
  });
});

describe('isPrivateIp', () => {
  it('flags private/reserved v4 and v6, allows public', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // public v6
  });
});

describe('mapProbeStatus', () => {
  it('maps latency bands and 5xx correctly', () => {
    expect(mapProbeStatus({ reachable: true, latencyMs: 150, httpStatus: 200 })).toBe('live');
    expect(mapProbeStatus({ reachable: true, latencyMs: 3000, httpStatus: 200 })).toBe('degraded');
    expect(mapProbeStatus({ reachable: true, latencyMs: 100, httpStatus: 503 })).toBe('degraded');
    expect(mapProbeStatus({ reachable: false, latencyMs: 0 })).toBe('unreachable');
  });
});
