/**
 * The keeper grant text (bg-grant/1): the one text a block's holder signs to
 * connect one agent key to the block's guardian. The server builds it from
 * checked fields and accepts a submitted text only when it equals its own
 * rebuild, so these cases pin the text, the field rules and the clock.
 */

import crypto from 'crypto';
import {
  buildGrantMessage,
  parseGrantMessage,
  checkAgentName,
  checkAgentKey,
  checkWallet,
  checkClock,
  keyCheck,
  normalizeScopes,
  type GrantFields,
} from '@/lib/keeper-grant';
import { keyId } from '@/lib/block-event-core';

// A made-up string in the bech32 alphabet (42 characters), not a real address.
const W = 'bc1qgf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvd';

const keyOf = (byte: number) => 'ed25519:' + Buffer.alloc(32, byte).toString('base64url');

function groups(hex16: string): string {
  return [hex16.slice(0, 4), hex16.slice(4, 8), hex16.slice(8, 12), hex16.slice(12, 16)].join('-');
}

const FIELDS: GrantFields = {
  blockHeight: 612888,
  walletAddress: W,
  agentName: 'Helper',
  agentKey: keyOf(1),
  scopes: ['inbox'],
  validUntil: '2027-02-17T09:00:00.000Z',
  nonce: 'ab'.repeat(32),
  expiresAt: '2026-11-19T10:10:00.000Z',
};

const withLine = (text: string, index: number, line: string) => {
  const lines = text.split('\n');
  lines[index] = line;
  return lines.join('\n');
};

describe('bg-grant/1 text', () => {
  it('(1) is the twelve lines the wallet shows, line 1 naming the agent and its key check', () => {
    const kc = groups(crypto.createHash('sha256').update(Buffer.alloc(32, 1)).digest('hex').slice(0, 16));
    const expected = [
      `blockgenomics.io: connect agent "Helper" (key check ${kc}) to the guardian of block 612888`,
      'Version: bg-grant/1',
      'Block: 612888',
      `Wallet: ${W}`,
      'Agent: Helper',
      `Agent key: ${keyOf(1)}`,
      `Key check: ${kc}`,
      "Allows: read the guardian's messages",
      'Never: sign for you, move funds, change ownership, act on another block except as a visitor',
      'Valid until: 2027-02-17T09:00:00.000Z unless revoked or the block is sold',
      `Nonce: ${'ab'.repeat(32)}`,
      'Expires: 2026-11-19T10:10:00.000Z',
    ].join('\n');
    expect(buildGrantMessage(FIELDS)).toBe(expected);
    expect(/^[\x20-\x7e\n]*$/.test(expected)).toBe(true);
  });

  it('(2) parses back to the fields it was built from', () => {
    expect(parseGrantMessage(buildGrantMessage(FIELDS))).toEqual(FIELDS);
  });

  it('(3) agent names: no colon, quote, newline, control or non-ASCII character, 1 to 32 characters', () => {
    for (const bad of [
      '', 'a'.repeat(33), 'a:b', 'Hel"per', 'Allows: build', 'x\nAllows: all', ' Helper', 'Helper ', 'Hel  per',
      'Hélper', 'a‮b', '<script>',
    ]) {
      expect([bad, checkAgentName(bad)]).toEqual([bad, false]);
    }
    for (const good of ['Helper', 'Helper Number Two', 'my-agent_1.0', 'a'.repeat(32)]) {
      expect([good, checkAgentName(good)]).toEqual([good, true]);
    }
    expect(checkAgentName(42)).toBe(false);
  });

  it('(3w) wallets: mainnet only, bech32 in lower case only', () => {
    for (const bad of [W.toUpperCase(), 'tb1q' + W.slice(4), 'bc1qkeeperholder0000000000000000000000000']) {
      expect([bad, checkWallet(bad)]).toEqual([bad, false]);
    }
    for (const good of [W, '1' + '1'.repeat(25), '3' + 'z'.repeat(30)]) {
      expect([good, checkWallet(good)]).toEqual([good, true]);
    }
    expect(checkWallet(null)).toBe(false);
  });

  it('(4) agent keys: ed25519: and 43 base64url characters that are exactly 32 bytes', () => {
    const body = keyOf(1).slice('ed25519:'.length);
    for (const bad of [
      'ed25519:' + 'A'.repeat(42),
      'ed25519:' + 'A'.repeat(44),
      'ed25519:' + body.slice(0, 42) + '=',
      'ED25519:' + body,
      'ed25519:' + 'A'.repeat(42) + 'B',
    ]) {
      expect([bad, checkAgentKey(bad)]).toEqual([bad, false]);
    }
    expect(checkAgentKey(keyOf(1))).toBe(true);
    expect(checkAgentKey(undefined)).toBe(false);
  });

  it('(5) scopes: a non-empty list drawn from inbox, deduped', () => {
    expect(normalizeScopes(['inbox', 'inbox'])).toEqual(['inbox']);
    for (const bad of [[], ['speak'], ['build'], 'inbox', [1]]) {
      expect(normalizeScopes(bad)).toBeNull();
    }
  });

  it('(6) parseGrantMessage refuses anything that is not the twelve lines in order', () => {
    const text = buildGrantMessage(FIELDS);
    const lines = text.split('\n');
    const swapped = [...lines];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    for (const bad of [
      text + '\n',
      lines.join('\r\n'),
      swapped.join('\n'),
      text + '\nExtra: line',
      withLine(text, 1, 'Version: bg-grant/2'),
      withLine(text, 7, 'Allows: answer visitors as the guardian'),
      withLine(text, 10, 'Nonce: ' + 'a'.repeat(63)),
    ]) {
      expect(parseGrantMessage(bad)).toBeNull();
    }
    expect(parseGrantMessage(42)).toBeNull();
  });

  it('(6b) lines the parser does not judge still fail the rebuild comparison', () => {
    const text = buildGrantMessage(FIELDS);
    const kc1 = keyCheck(keyOf(1));
    const kc2 = keyCheck(keyOf(2));
    for (const changed of [
      withLine(text, 8, 'Never: nothing'),
      withLine(text, 0, `blockgenomics.io: connect agent "Helper" (key check ${kc1}) to the guardian of block 1`),
      withLine(text, 0, `blockgenomics.io: connect agent "Second" (key check ${kc1}) to the guardian of block 612888`),
      withLine(text, 6, `Key check: ${kc2}`),
      withLine(text, 9, `Valid until: ${FIELDS.validUntil} unless revoked`),
    ]) {
      const parsed = parseGrantMessage(changed);
      expect(parsed).not.toBeNull();
      expect(buildGrantMessage(parsed!)).not.toBe(changed);
    }
  });

  it('(7) keyCheck is the hex part of keyId in four groups', () => {
    const kc = keyCheck(keyOf(1));
    expect(kc).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    expect(kc).toBe(groups(crypto.createHash('sha256').update(Buffer.alloc(32, 1)).digest('hex').slice(0, 16)));
    expect(kc.replace(/-/g, '')).toBe(keyId(new Uint8Array(32).fill(1)).slice('bg-sys-'.length));
  });

  it('(8) checkClock: Expires first, then its upper bound, then the grant lifetime', () => {
    const now = Date.parse('2026-11-19T10:00:00.000Z');
    const iso = (ms: number) => new Date(ms).toISOString();
    const MIN = 60 * 1000;
    const DAY = 24 * 60 * MIN;
    const at = (validUntilMs: number, expiresMs: number): GrantFields => ({
      ...FIELDS,
      validUntil: iso(validUntilMs),
      expiresAt: iso(expiresMs),
    });
    expect(checkClock(at(now + 30 * MIN, now + 10 * MIN), now)).toBe('bad_valid_until');
    expect(checkClock(at(now + 367 * DAY, now + 10 * MIN), now)).toBe('bad_valid_until');
    expect(checkClock(at(now + 90 * DAY, now - 1000), now)).toBe('grant_text_expired');
    expect(checkClock(at(now + 90 * DAY, now + 20 * MIN), now)).toBe('bad_expires');
    expect(checkClock(at(now + 90 * DAY, now + 10 * MIN), now)).toBeNull();
  });
});
