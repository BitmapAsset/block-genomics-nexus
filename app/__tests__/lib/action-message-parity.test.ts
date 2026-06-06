import { readFileSync } from 'fs';
import { join } from 'path';
import { buildActionMessage, type ActionBinding } from '@/lib/action-message';

// The signing surface (buildActionMessage / hashBody / stableStringify / sha256Hex)
// MUST be byte-identical between the app and the agent SDK. Any divergence changes
// the bytes the wallet signs and silently breaks BIP-322 verification across the
// two packages. These two files are the single source of truth; this test fails
// the moment they drift.

const APP_FILE = join(__dirname, '../../src/lib/action-message.ts');
const SDK_FILE = join(__dirname, '../../../sdk/agent-connect/src/action-message.ts');

const BEGIN = '// ===== BEGIN SHARED SIGNING CORE';
const END = '// ===== END SHARED SIGNING CORE =====';

function extractSharedCore(source: string): string {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error('SHARED SIGNING CORE markers not found');
  }
  // Include from the BEGIN marker through the END marker line.
  return source.slice(start, end + END.length);
}

describe('action-message app <-> SDK parity', () => {
  it('shared signing core is byte-for-byte identical across app and SDK', () => {
    const appCore = extractSharedCore(readFileSync(APP_FILE, 'utf8'));
    const sdkCore = extractSharedCore(readFileSync(SDK_FILE, 'utf8'));
    expect(sdkCore).toBe(appCore);
  });

  it('golden vector: buildActionMessage output is byte-stable', () => {
    const binding: ActionBinding = {
      action: 'world.create',
      method: 'POST',
      path: '/api/v1/world',
      blockHeight: 840000,
      bodyHash: 'a'.repeat(64),
      nonce: 'nonce-123',
      expiresAt: 1_900_000_000_000,
    };
    const expected =
      'Block Genomics Authorization v1\n' +
      'Action: world.create\n' +
      'Method: POST\n' +
      'Path: /api/v1/world\n' +
      'Block: 840000\n' +
      `Body: ${'a'.repeat(64)}\n` +
      'Nonce: nonce-123\n' +
      'Expires: 1900000000000';
    expect(buildActionMessage(binding)).toBe(expected);
  });
});
