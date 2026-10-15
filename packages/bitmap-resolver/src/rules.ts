// The deed rule. LiveOCI alpha by bop (inscription 0c18b83c…c43ai0), verbatim:
//
//   1. the valid bitmap is the FIRST valid inscription, searching from the block
//      with the same number onward.
//   2. "valid" means the content is exactly "969123.bitmap". No spaces, no
//      hidden characters, nothing else.
//   3. Delegates are not allowed.
//   4. encoding (brotli/gzip) is not allowed. if contentEncoding tag is present
//      at all, invalid.
//   (and its code: the envelope must be complete, i.e. reach OP_ENDIF)
//
// Additions, each consistent with LiveOCI, made explicit here (the "+bg1"):
//   - any content type counts (840000's deed is text/plain, 208's is
//     text/plain;charset=utf-8);
//   - in-block order is Bitcoin reveal order: tx index, then input, then
//     envelope; never inscription number;
//   - charms (cursed, vindicated, ...) are recorded, never a reason to reject;
//   - a claim revealed below block N, or naming a block above the tip, is
//     reported with its own reason instead of being silently skipped.
//
// Any change to what this file accepts must bump RULE_ID: cached verdicts are
// keyed by it.

import { asciiBytes, equalBytes, latin1 } from './bytes.js';

export const RULE_ID = 'liveoci-alpha@0c18b83c+bg1';
export const LIVEOCI_MODULE_ID = '0c18b83ca6aa6f5653bb57dafb491ac786b7fa738b6c5190f4542d1d7f15c43ai0';

export type IgnoreReason =
  | 'not_first'
  | 'bare_number'
  | 'body_mismatch'
  | 'whitespace'
  | 'leading_zero'
  | 'content_encoding'
  | 'delegate'
  | 'incomplete'
  | 'inscribed_before_block'
  | 'future_block';

/**
 * Reasons a claim that passes the rules still cannot be called first without a
 * guess. A first claim carrying one makes the verdict `undetermined`.
 *
 * - `empty_content_encoding_tag`: tag 9 with an empty value. LiveOCI's comment
 *   says "present at all, invalid"; its code tests the decoded value, and an
 *   empty string passes.
 * - `unbound`: an unrecognized even tag makes ord leave the inscription unbound
 *   (no sat, no holder). Whether a later claim then wins is an open canon
 *   question.
 */
export type Caveat = 'empty_content_encoding_tag' | 'unbound';

export interface ClaimFacts {
  /** Envelope body bytes; null when the envelope has no body tag. */
  body: Uint8Array | null;
  complete: boolean;
  contentEncoding: Uint8Array | null;
  delegate: Uint8Array | null;
  unrecognizedEvenField?: boolean;
  revealHeight: number;
}

export type RuleCheck = { ok: true; caveats: Caveat[] } | { ok: false; reason: IgnoreReason };

export function expectedBody(n: number): Uint8Array {
  return asciiBytes(`${n}.bitmap`);
}

/**
 * Apply the rule to one claim for height `n`. `tipHeight`, when given, lets a
 * claim on a block that does not exist yet say so.
 */
export function checkClaim(facts: ClaimFacts, n: number, tipHeight?: number): RuleCheck {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('height must be a non-negative integer');

  // LiveOCI isValidBitmap order: body, complete, encoding, delegate.
  if (!facts.body || !equalBytes(facts.body, expectedBody(n))) {
    return { ok: false, reason: bodyReason(facts.body, n) };
  }
  if (facts.complete !== true) return { ok: false, reason: 'incomplete' };
  if (facts.contentEncoding !== null && facts.contentEncoding.length > 0) {
    return { ok: false, reason: 'content_encoding' };
  }
  // LiveOCI tests the parsed delegate for truthiness: any non-empty value
  // (a parseable id or not) is a delegate.
  if (facts.delegate !== null && facts.delegate.length > 0) return { ok: false, reason: 'delegate' };

  // Rule 1: the search starts at block n, so a reveal below it never counts.
  if (tipHeight !== undefined && n > tipHeight) return { ok: false, reason: 'future_block' };
  if (facts.revealHeight < n) return { ok: false, reason: 'inscribed_before_block' };

  const caveats: Caveat[] = [];
  if (facts.contentEncoding !== null) caveats.push('empty_content_encoding_tag');
  if (facts.unrecognizedEvenField) caveats.push('unbound');
  return { ok: true, caveats };
}

/** Why a body is not exactly `n.bitmap`. */
export function bodyReason(body: Uint8Array | null, n: number): IgnoreReason {
  if (!body || body.length === 0) return 'body_mismatch';
  const text = latin1(body);
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

/**
 * The height a body loosely names, or null. Used to collect "copies": bodies
 * that are a claim for some height, valid or not ("208", " 208.bitmap",
 * "0208.bitmap", "208.BITMAP" all name 208). Never used to accept a claim.
 */
export function claimedNumber(body: Uint8Array | null): number | null {
  if (!body || body.length === 0 || body.length > 64) return null;
  let s = latin1(body).trim().toLowerCase();
  if (s.endsWith('.bitmap')) s = s.slice(0, -'.bitmap'.length);
  if (!/^\d{1,10}$/.test(s)) return null;
  return Number(s);
}
