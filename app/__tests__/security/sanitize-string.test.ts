/**
 * `sanitizeString` output can never form an HTML tag (CodeQL #9).
 *
 * It guards chat text, handles, estate and parcel fields, and sandbox labels
 * before they are stored and served by the public API. The old single pass,
 * `.replace(/<[^>]*>/g, '')`, only removed `<…>` spans that had a closing `>`,
 * so an unclosed `<img src=x onerror=…` came back intact and became a live tag
 * as soon as any consumer appended markup after it.
 */

import { sanitizeString } from '@/lib/api-helpers';

/** What an HTML tokenizer would start a tag (or comment, or PI) on. */
const OPENS_A_TAG = /<[A-Za-z!/?]/;

describe('sanitizeString', () => {
  it.each([
    '<img src=x onerror=alert(1)//',
    '<svg/onload=alert(1)',
    'hello <script',
    '</script',
    '<!-- unterminated comment',
    '<?xml version="1.0"',
    '<<img src=x onerror=alert(1)',
    '<scr<script>ipt>alert(1)</script>',
    '<<script>script>alert(1)<</script>/script>',
    '<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)',
  ])('%j cannot open a tag after sanitizing', (input) => {
    const out = sanitizeString(input);
    expect(out).not.toMatch(OPENS_A_TAG);
    // Appending markup must not complete a tag either.
    expect(`${out}</div>`.replace(/<\/div>$/, '')).not.toMatch(OPENS_A_TAG);
  });

  it('keeps a lone < that HTML reads as text', () => {
    expect(sanitizeString('a < b')).toBe('a < b');
    expect(sanitizeString('I <3 bitmap')).toBe('I <3 bitmap');
    expect(sanitizeString('5 <= 6')).toBe('5 <= 6');
  });

  it('still strips every <…> span exactly as before', () => {
    // Same as the old regex pass, which also took `< b and c >` for a tag.
    expect(sanitizeString('a < b and c > d')).toBe('a  d');
    expect(sanitizeString('<b>bold</b> text')).toBe('bold text');
    expect(sanitizeString('<div><script>xss</script></div>')).toBe('xss');
    expect(sanitizeString('  padded  ')).toBe('padded');
    expect(sanitizeString('abcdef', 3)).toBe('abc');
  });

  it('stays linear on a hostile run of unclosed openers', () => {
    const started = performance.now();
    const out = sanitizeString('<a'.repeat(50_000), 100_000);
    expect(performance.now() - started).toBeLessThan(250);
    expect(out).toBe('a'.repeat(50_000));
  });
});
