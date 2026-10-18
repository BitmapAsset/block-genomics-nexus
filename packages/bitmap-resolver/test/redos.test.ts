import { describe, expect, it } from 'vitest';
import { bodyReason, claimedNumber } from '../src/rules.js';
import { ascii } from './helpers.js';

/**
 * Body bytes are on-chain data: anyone who can pay for an inscription chooses
 * them, up to the size of a block. Classifying a hostile body must stay linear
 * (CodeQL js/polynomial-redos #1: `/^0+(\d+)\.bitmap$/` took ~6 s on 40 KB of
 * zeros and grew quadratically from there).
 */

/** The pre-fix classifier, kept as the oracle for short inputs (where its cost is irrelevant). */
function bodyReasonOracle(body: Uint8Array | null, n: number): string {
  if (!body || body.length === 0) return 'body_mismatch';
  let text = '';
  for (let i = 0; i < body.length; i++) text += String.fromCharCode(body[i]);
  const number = String(n);
  if (text === number) return 'bare_number';
  const trimmed = text.trim();
  if (trimmed !== text) {
    if (trimmed === `${number}.bitmap`) return 'whitespace';
    if (trimmed === number) return 'bare_number';
  }
  const lead = /^0+(\d+)\.bitmap$/.exec(text);
  if (lead && Number(text.slice(0, -'.bitmap'.length)) === n) return 'leading_zero';
  return 'body_mismatch';
}

/** Deterministic PRNG so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ALPHABET = ['0', '0', '0', '1', '2', '8', '9', '.', 'bitmap', '.bitmap', ' ', '\n', 'B', ':', ' '];

describe('bodyReason on hostile bodies', () => {
  it('agrees with the pre-fix classifier on 20,000 random short bodies', () => {
    const next = rng(0x5eed);
    for (let i = 0; i < 20_000; i++) {
      let s = '';
      const parts = Math.floor(next() * 12);
      for (let p = 0; p < parts; p++) s += ALPHABET[Math.floor(next() * ALPHABET.length)];
      const body = ascii(s);
      for (const n of [0, 8, 208, 2080, 820000]) {
        expect(bodyReason(body, n), `${JSON.stringify(s)} @ ${n}`).toBe(bodyReasonOracle(body, n));
      }
    }
  });

  it.each([
    ['400 KB of zeros', '0'.repeat(400_000)],
    ['400 KB of zeros then ".bitma"', '0'.repeat(400_000) + '.bitma'],
    ['400 KB of zeros then a non-digit then ".bitmap"', '0'.repeat(400_000) + 'x.bitmap'],
    ['"0" then 200,000 "00" then "!"', '0' + '00'.repeat(200_000) + '!'],
  ])('rejects %s in linear time', (_label, s) => {
    const body = ascii(s);
    const started = performance.now();
    expect(bodyReason(body, 208)).toBe('body_mismatch');
    expect(claimedNumber(body)).toBeNull();
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('still recognises a long leading-zero copy, in linear time', () => {
    const body = ascii('0'.repeat(400_000) + '208.bitmap');
    const started = performance.now();
    expect(bodyReason(body, 208)).toBe('leading_zero');
    expect(performance.now() - started).toBeLessThan(250);
  });
});
