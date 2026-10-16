import { describe, expect, it } from 'vitest';
import { latin1 } from '../src/bytes.js';
import { parseTx } from '../src/parse/block.js';
import { parseEnvelopes, tapscriptOf, tokenize } from '../src/parse/envelope.js';
import { bodyReason, checkClaim, claimedNumber, RULE_ID, type ClaimFacts } from '../src/rules.js';
import { ascii, cat, envelope, push, readVector, scriptPathWitness, segwitTx, tapscript, txidOf } from './helpers.js';

const envs = (...witnesses: Uint8Array[][]) => parseEnvelopes(parseTx(segwitTx(witnesses)));

describe('envelope parser (ord semantics)', () => {
  it('reads content type and body, numbers the inscription <txid>i0', () => {
    const tx = segwitTx([scriptPathWitness(tapscript(envelope({ contentType: 'text/plain', body: '208.bitmap' })))]);
    const [e] = parseEnvelopes(parseTx(tx));
    expect(e.id).toBe(`${txidOf(tx)}i0`);
    expect(e.complete).toBe(true);
    expect(latin1(e.contentType!)).toBe('text/plain');
    expect(latin1(e.body!)).toBe('208.bitmap');
    expect(e.contentEncoding).toBeNull();
    expect(e.delegate).toBeNull();
  });

  it('numbers envelopes across inputs in input order; an incomplete one gets no id and no number', () => {
    const tx = segwitTx([
      scriptPathWitness(tapscript(envelope({ body: 'a' }), envelope({ body: 'b' }))),
      scriptPathWitness(tapscript(envelope({ body: 'c', endif: false }))),
      scriptPathWitness(tapscript(envelope({ body: 'd' }))),
    ]);
    const list = parseEnvelopes(parseTx(tx));
    expect(list.map((e) => [latin1(e.body!), e.index, e.input, e.offset, e.complete])).toEqual([
      ['a', 0, 0, 0, true],
      ['b', 1, 0, 1, true],
      ['c', null, 1, 0, false],
      ['d', 2, 2, 0, true],
    ]);
    expect(list[2].id).toBeNull();
  });

  it('a non-push opcode inside the envelope means no inscription (ord), and parsing continues after it', () => {
    const bad = cat(Uint8Array.of(0x00, 0x63), push(ascii('ord')), Uint8Array.of(0x00), push(ascii('1.bitmap')), Uint8Array.of(0x75 /* OP_DROP */, 0x68));
    const list = envs(scriptPathWitness(tapscript(bad, envelope({ body: '2.bitmap' }))));
    expect(list.map((e) => latin1(e.body!))).toEqual(['2.bitmap']);
    expect(list[0].index).toBe(0);
  });

  it('a truncated push anywhere drops every envelope of that input (ord)', () => {
    const script = cat(tapscript(envelope({ body: '3.bitmap' })), Uint8Array.of(0x4c, 0x10, 0x01));
    expect(tokenize(script)).toBeNull();
    expect(envs(scriptPathWitness(script))).toEqual([]);
  });

  it('reads the tapscript under a taproot annex', () => {
    const script = tapscript(envelope({ body: '4.bitmap' }));
    const w = [...scriptPathWitness(script), Uint8Array.of(0x50, 1, 2)];
    expect(tapscriptOf(w)).toBe(w[1]);
    expect(envs(w).map((e) => latin1(e.body!))).toEqual(['4.bitmap']);
    expect(tapscriptOf([Uint8Array.of(1)])).toBeNull();
  });

  it('pushnum data, duplicate fields, odd leftovers and unknown even tags are flagged like ord', () => {
    const script = tapscript(
      cat(
        Uint8Array.of(0x00, 0x63),
        push(ascii('ord')),
        Uint8Array.of(0x51), // OP_1 as the content-type key (pushnum)
        push(ascii('text/plain')),
        push(Uint8Array.of(1)),
        push(ascii('text/html')), // duplicate content type: first wins
        push(Uint8Array.of(22)),
        push(ascii('x')), // unrecognized even tag
        Uint8Array.of(0x00),
        push(ascii('5.bitmap')),
        Uint8Array.of(0x68),
      ),
    );
    const [e] = envs(scriptPathWitness(script));
    expect(e.pushnum).toBe(true);
    expect(e.duplicateField).toBe(true);
    expect(latin1(e.contentType!)).toBe('text/plain');
    expect(e.unrecognizedEvenField).toBe(true);
    expect(latin1(e.body!)).toBe('5.bitmap');
  });

  it('parses the real 969788 claim from its reveal tx', () => {
    const t = readVector('tail-969788.json');
    const tx = parseTx(Uint8Array.from(Buffer.from(t.reveal.hex, 'hex')));
    const list = parseEnvelopes(tx);
    const claim = list.find((e) => e.id === t.expected.canonicalId)!;
    expect(claim).toBeTruthy();
    expect(latin1(claim.body!)).toBe('969788.bitmap');
    expect(latin1(claim.contentType!)).toBe('text/plain');
    expect(claim.input).toBe(t.expected.canonical.vin);
  });

  it('parses the real 208 reveal (recorded /r/tx) to body "208.bitmap"', () => {
    const v = readVector('heights/208.json');
    const id: string = v.expected.canonicalId;
    const txid = id.slice(0, 64);
    const hex = JSON.parse(v.http[`https://ordinals.com/r/tx/${txid}`].body);
    const e = parseEnvelopes(parseTx(Uint8Array.from(Buffer.from(hex, 'hex')))).find((x) => x.id === id)!;
    expect(latin1(e.body!)).toBe('208.bitmap');
    expect(latin1(e.contentType!)).toBe('text/plain;charset=utf-8');
  });
});

describe(`rules ${RULE_ID}`, () => {
  const facts = (over: Partial<ClaimFacts> = {}): ClaimFacts => ({
    body: ascii('208.bitmap'),
    complete: true,
    contentEncoding: null,
    delegate: null,
    revealHeight: 794257,
    ...over,
  });

  it('accepts exactly "208.bitmap"', () => {
    expect(checkClaim(facts(), 208)).toEqual({ ok: true, caveats: [] });
  });

  it.each([
    ['208', 'bare_number'],
    ['208.bitmap\n', 'whitespace'],
    [' 208.bitmap', 'whitespace'],
    ['0208.bitmap', 'leading_zero'],
    ['208.BITMAP', 'body_mismatch'],
    ['209.bitmap', 'body_mismatch'],
    ['208.bitmap​', 'body_mismatch'],
    ['', 'body_mismatch'],
  ])('rejects body %j as %s', (body, reason) => {
    expect(checkClaim(facts({ body: new TextEncoder().encode(body) }), 208)).toEqual({ ok: false, reason });
  });

  it('rejects a missing body, a delegate, an encoding tag and a missing OP_ENDIF', () => {
    expect(checkClaim(facts({ body: null }), 208)).toEqual({ ok: false, reason: 'body_mismatch' });
    expect(checkClaim(facts({ delegate: new Uint8Array(32) }), 208)).toEqual({ ok: false, reason: 'delegate' });
    // Encoding tag present even though the decoded bytes would match: still invalid.
    expect(checkClaim(facts({ contentEncoding: ascii('br') }), 208)).toEqual({ ok: false, reason: 'content_encoding' });
    expect(checkClaim(facts({ complete: false }), 208)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('rejects a reveal below block n, and a claim on a block above the tip', () => {
    expect(checkClaim(facts({ body: ascii('900000.bitmap'), revealHeight: 899999 }), 900000)).toEqual({
      ok: false,
      reason: 'inscribed_before_block',
    });
    expect(checkClaim(facts({ body: ascii('900000.bitmap'), revealHeight: 900000 }), 900000)).toEqual({ ok: true, caveats: [] });
    expect(checkClaim(facts({ body: ascii('999999.bitmap'), revealHeight: 971000 }), 999999, 971000)).toEqual({
      ok: false,
      reason: 'future_block',
    });
  });

  it('flags ambiguity instead of guessing: empty encoding tag, unbound inscription', () => {
    expect(checkClaim(facts({ contentEncoding: new Uint8Array(0) }), 208)).toEqual({ ok: true, caveats: ['empty_content_encoding_tag'] });
    expect(checkClaim(facts({ unrecognizedEvenField: true }), 208)).toEqual({ ok: true, caveats: ['unbound'] });
    expect(checkClaim(facts({ delegate: new Uint8Array(0) }), 208)).toEqual({ ok: true, caveats: [] });
    // A lone UTF-8 BOM decodes to '' in LiveOCI's lenient toText: its code lets
    // the claim through, so we flag it rather than reject it (review #8).
    expect(checkClaim(facts({ contentEncoding: Uint8Array.of(0xef, 0xbb, 0xbf) }), 208)).toEqual({ ok: true, caveats: ['empty_content_encoding_tag'] });
    expect(checkClaim(facts({ contentEncoding: Uint8Array.of(0xef, 0xbb, 0xbf, 0x62, 0x72) }), 208)).toEqual({ ok: false, reason: 'content_encoding' });
  });

  it('collects copies loosely but never accepts through that path', () => {
    for (const s of ['208', ' 208.bitmap', '0208.bitmap', '208.BITMAP', '208.bitmap\n']) expect(claimedNumber(ascii(s))).toBe(208);
    for (const s of ['hello', '208.bitmapx', '-208', '20 8.bitmap', '']) expect(claimedNumber(ascii(s))).toBeNull();
    expect(bodyReason(ascii('00.bitmap'), 0)).toBe('leading_zero');
    expect(bodyReason(ascii('0.bitmap'), 0)).toBe('body_mismatch'); // not called for valid bodies; exact match is checkClaim's job
  });
});
