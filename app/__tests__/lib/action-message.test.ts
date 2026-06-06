import {
  stableStringify,
  sha256Hex,
  hashBody,
  buildActionMessage,
  parseActionMessage,
  verifyActionBinding,
  type ActionBinding,
} from '@/lib/action-message';

const baseBinding: ActionBinding = {
  action: 'world.create',
  method: 'POST',
  path: '/api/v1/world',
  blockHeight: 840000,
  bodyHash: 'a'.repeat(64),
  nonce: 'nonce-123',
  expiresAt: 1_900_000_000_000,
};

describe('stableStringify', () => {
  it('sorts object keys deterministically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('drops undefined-valued keys (mirrors JSON.stringify)', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('handles nested objects and arrays', () => {
    expect(stableStringify({ z: [3, 2, 1], a: { y: 1, x: 2 } })).toBe(
      '{"a":{"x":2,"y":1},"z":[3,2,1]}'
    );
  });

  it('coerces undefined array entries to null', () => {
    expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
  });
});

describe('sha256Hex', () => {
  it('produces a stable 64-char hex digest', async () => {
    const h = await sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Known SHA-256 of "hello"
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('hashBody', () => {
  it('is independent of key order', async () => {
    const h1 = await hashBody({ a: 1, b: 2 });
    const h2 = await hashBody({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('ignores the auth envelope fields (signature, message)', async () => {
    const intentOnly = await hashBody({ a: 1, b: 2 });
    const withAuth = await hashBody({ a: 1, b: 2, signature: 'sig', message: 'msg' });
    expect(withAuth).toBe(intentOnly);
  });

  it('survives a JSON.stringify -> JSON.parse round trip (client -> server)', async () => {
    const body = { posX: 0, posY: 1, name: 'cube', extra: undefined };
    const clientHash = await hashBody(body);
    const serverHash = await hashBody(JSON.parse(JSON.stringify(body)));
    expect(serverHash).toBe(clientHash);
  });

  it('changes when intent changes', async () => {
    const h1 = await hashBody({ posX: 0 });
    const h2 = await hashBody({ posX: 1 });
    expect(h1).not.toBe(h2);
  });
});

describe('buildActionMessage / parseActionMessage round trip', () => {
  it('parses back to the original binding', () => {
    const msg = buildActionMessage(baseBinding);
    const parsed = parseActionMessage(msg);
    expect(parsed).toEqual(baseBinding);
  });

  it('uppercases the method in the canonical string', () => {
    const msg = buildActionMessage({ ...baseBinding, method: 'post' });
    expect(msg).toContain('Method: POST');
  });

  it('starts with the versioned header', () => {
    const msg = buildActionMessage(baseBinding);
    expect(msg.split('\n')[0]).toBe('Block Genomics Authorization v1');
  });

  it('returns null for a wrong header', () => {
    expect(parseActionMessage('Not An Auth Message\nAction: x')).toBeNull();
  });

  it('returns null for a missing field', () => {
    const msg = buildActionMessage(baseBinding).replace('Nonce: nonce-123\n', '');
    expect(parseActionMessage(msg)).toBeNull();
  });

  it('returns null for non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(parseActionMessage(null)).toBeNull();
  });
});

describe('verifyActionBinding', () => {
  const now = 1_800_000_000_000; // before baseBinding.expiresAt
  const expected = {
    action: 'world.create',
    method: 'POST',
    path: '/api/v1/world',
    blockHeight: 840000,
    bodyHash: 'a'.repeat(64),
  };

  it('accepts a matching, unexpired binding', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, expected, now);
    expect(res.ok).toBe(true);
    expect(res.nonce).toBe('nonce-123');
  });

  it('rejects an action mismatch (semantic substitution)', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, { ...expected, action: 'world.delete' }, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/action/i);
  });

  it('is case-insensitive on method', () => {
    const msg = buildActionMessage({ ...baseBinding, method: 'post' });
    expect(verifyActionBinding(msg, { ...expected, method: 'post' }, now).ok).toBe(true);
  });

  it('rejects a method mismatch', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, { ...expected, method: 'DELETE' }, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/method/i);
  });

  it('rejects a path mismatch (substitution attack)', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, { ...expected, path: '/api/v1/world/other' }, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/path/i);
  });

  it('rejects a block mismatch', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, { ...expected, blockHeight: 999999 }, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/block/i);
  });

  it('rejects a body mismatch (tampered payload)', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, { ...expected, bodyHash: 'b'.repeat(64) }, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/body/i);
  });

  it('rejects an expired authorization', () => {
    const msg = buildActionMessage(baseBinding);
    const res = verifyActionBinding(msg, expected, baseBinding.expiresAt + 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/expired/i);
  });

  it('rejects a malformed message', () => {
    const res = verifyActionBinding('garbage', expected, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/malformed/i);
  });

  it('end-to-end: hashBody feeds a binding the server accepts', async () => {
    const body = { posX: 5, name: 'tree', signature: 'sig', message: 'envelope' };
    const bodyHash = await hashBody(body);
    const binding: ActionBinding = { ...baseBinding, bodyHash };
    const msg = buildActionMessage(binding);
    // Server recomputes hash from the parsed request body (auth fields ignored).
    const serverHash = await hashBody(JSON.parse(JSON.stringify(body)));
    const res = verifyActionBinding(msg, { ...expected, bodyHash: serverHash }, now);
    expect(res.ok).toBe(true);
  });
});
